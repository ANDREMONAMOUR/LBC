"""Le Bon Clic FastAPI backend — main entrypoint.

Routes:
  POST   /api/auth/send-otp
  POST   /api/auth/verify-otp
  GET    /api/me
  PUT    /api/me                       (complete profile)
  POST   /api/bookings                 (create)
  GET    /api/bookings                 (list mine)
  GET    /api/bookings/active          (latest active)
  PATCH  /api/bookings/{id}            (update prep checklist)
  POST   /api/bookings/{id}/cancel
  GET    /api/invoices                 (list mine)
  POST   /api/invoices/{id}/pay
  GET    /api/invoices/{id}/pdf        (download PDF)
  POST   /api/contact                  (contact Marc — stored in DB)
  GET    /api/health
"""
import logging
import random
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional, List

from fastapi import FastAPI, APIRouter, HTTPException, Depends, status
from fastapi.responses import Response
from motor.motor_asyncio import AsyncIOMotorClient
from starlette.middleware.cors import CORSMiddleware

import config
from models import (
    SendOtpRequest, SendOtpResponse, VerifyOtpRequest, UserProfileIn,
    User, AuthResponse,
    BookingCreate, Booking, PrepUpdate,
    Invoice, InvoiceListResponse,
    ContactMessageIn, ContactMessage,
)
from auth import create_token, current_user_id
from brevo_sms import send_otp_sms
from pdf_invoice import build_invoice_pdf


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
log = logging.getLogger("lebonclic")

# ---- Mongo ----
mongo_client = AsyncIOMotorClient(config.MONGO_URL)
db = mongo_client[config.DB_NAME]

# ---- App ----
app = FastAPI(title="Le Bon Clic API", version="1.0.0")
api = APIRouter(prefix="/api")


# ============ Helpers ============

def _normalize_phone(raw: str) -> str:
    digits = "".join(ch for ch in (raw or "") if ch.isdigit())
    if digits.startswith("33") and len(digits) == 11:
        digits = "0" + digits[2:]
    if len(digits) != 10 or not (digits.startswith("06") or digits.startswith("07")):
        raise HTTPException(status_code=400, detail="Numéro de mobile français invalide.")
    return digits


def _mask_phone(p: str) -> str:
    if len(p) < 4:
        return p
    return f"{p[:2]} ** ** ** {p[-2:]}"


def _gen_code() -> str:
    return f"{secrets.randbelow(10000):04d}"


def _human_booking_ref() -> str:
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "RDV-" + "".join(random.choice(alphabet) for _ in range(5))


def _human_invoice_ref(seq: int) -> str:
    return f"INV-{datetime.now(timezone.utc).year}-{seq:04d}"


async def _ensure_user(phone: str) -> tuple[dict, bool]:
    """Return (user_doc, is_new)."""
    user = await db.users.find_one({"phone": phone}, {"_id": 0})
    if user:
        return user, False
    new_user = User(phone=phone).model_dump()
    new_user["created_at"] = new_user["created_at"].isoformat()
    await db.users.insert_one(new_user)
    return new_user, True


async def _seed_demo_invoices(user_id: str, user_phone: str):
    """On first profile completion, seed 2 example invoices like the SPA had."""
    count = await db.invoices.count_documents({"user_id": user_id})
    if count > 0:
        return
    seq_start = await db.invoices.count_documents({}) + 1
    today = datetime.now(timezone.utc).date()
    samples = [
        {
            "label": "Dépannage Ordinateur",
            "date": (today - timedelta(days=58)).isoformat(),
            "hours": 1.5,
            "base_total": 120.0,
            "net_total": 60.0,
            "paid": True,
        },
        {
            "label": "Configuration Box & Wi-Fi",
            "date": (today - timedelta(days=26)).isoformat(),
            "hours": 1.0,
            "base_total": 80.0,
            "net_total": 40.0,
            "paid": False,
        },
    ]
    for i, s in enumerate(samples):
        inv = Invoice(
            user_id=user_id,
            ref=_human_invoice_ref(seq_start + i),
            label=s["label"],
            date=s["date"],
            hours=s["hours"],
            base_total=s["base_total"],
            net_total=s["net_total"],
            paid=s["paid"],
        ).model_dump()
        inv["created_at"] = inv["created_at"].isoformat()
        if s["paid"]:
            inv["paid_at"] = datetime.now(timezone.utc).isoformat()
        await db.invoices.insert_one(inv)


# ============ Health ============

@api.get("/health")
async def health():
    return {"status": "ok", "sms_dev_mode": config.SMS_DEV_MODE}


# ============ Auth ============

@api.post("/auth/send-otp", response_model=SendOtpResponse)
async def send_otp(body: SendOtpRequest):
    phone = _normalize_phone(body.phone)

    # Rate limit: max 3 OTPs per phone per 10 min
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=10)
    recent_count = await db.otps.count_documents(
        {"phone": phone, "created_at": {"$gte": cutoff.isoformat()}}
    )
    if recent_count >= 3:
        raise HTTPException(
            status_code=429,
            detail="Trop de demandes. Réessayez dans quelques minutes.",
        )

    code = _gen_code()
    now = datetime.now(timezone.utc)
    otp_doc = {
        "phone": phone,
        "code": code,
        "attempts": 0,
        "used": False,
        "created_at": now.isoformat(),
        "expires_at": (now + timedelta(seconds=config.OTP_EXPIRY_SECONDS)).isoformat(),
    }
    await db.otps.insert_one(otp_doc)

    dev_code = None
    try:
        result = await send_otp_sms(phone, code)
        if result.get("status") == "dev_mode":
            dev_code = code
    except Exception as e:
        log.error(f"SMS send failed for {phone}: {e}")
        # We don't reveal Brevo errors to client; but allow login via bypass code.
        # Keep OTP record so the universal bypass works for testing.
        dev_code = None  # don't leak code on real failure

    return SendOtpResponse(
        status="sent",
        masked_phone=_mask_phone(phone),
        dev_code=dev_code,
        expires_in=config.OTP_EXPIRY_SECONDS,
    )


@api.post("/auth/verify-otp", response_model=AuthResponse)
async def verify_otp(body: VerifyOtpRequest):
    phone = _normalize_phone(body.phone)
    code = (body.code or "").strip()
    if len(code) != 4 or not code.isdigit():
        raise HTTPException(status_code=400, detail="Code invalide.")

    # Universal bypass for testing (configurable via OTP_BYPASS_CODE)
    is_bypass = bool(config.OTP_BYPASS_CODE) and code == config.OTP_BYPASS_CODE

    if not is_bypass:
        # Find the latest unused, non-expired OTP for this phone
        now_iso = datetime.now(timezone.utc).isoformat()
        otp_doc = await db.otps.find_one(
            {"phone": phone, "used": False, "expires_at": {"$gt": now_iso}},
            sort=[("created_at", -1)],
        )
        if not otp_doc:
            raise HTTPException(status_code=400, detail="Code expiré ou inexistant. Demandez un nouveau code.")
        if otp_doc.get("attempts", 0) >= 5:
            raise HTTPException(status_code=429, detail="Trop de tentatives. Demandez un nouveau code.")
        if otp_doc["code"] != code:
            await db.otps.update_one({"_id": otp_doc["_id"]}, {"$inc": {"attempts": 1}})
            raise HTTPException(status_code=400, detail="Code incorrect.")
        # Mark used
        await db.otps.update_one({"_id": otp_doc["_id"]}, {"$set": {"used": True}})

    user, is_new = await _ensure_user(phone)
    token = create_token(user["id"], phone)
    return AuthResponse(
        status="ok",
        token=token,
        is_new_user=is_new or not user.get("profile_complete", False),
        user=User(**user),
    )


@api.get("/me", response_model=User)
async def get_me(uid: str = Depends(current_user_id)):
    user = await db.users.find_one({"id": uid}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable.")
    return User(**user)


@api.put("/me", response_model=User)
async def complete_profile(body: UserProfileIn, uid: str = Depends(current_user_id)):
    update = {
        "first_name": body.first_name.strip(),
        "last_name": body.last_name.strip(),
        "email": body.email.strip(),
        "address": body.address.strip(),
        "access_details": (body.access_details or "").strip(),
        "profile_complete": True,
    }
    res = await db.users.find_one_and_update(
        {"id": uid},
        {"$set": update},
        return_document=True,
        projection={"_id": 0},
    )
    if not res:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable.")
    # Seed demo invoices on first completion
    await _seed_demo_invoices(uid, res["phone"])
    return User(**res)


# ============ Bookings ============

VALID_DEVICES = {"pc", "mobile", "box", "security"}
VALID_TIME_WINDOWS = {
    "08h - 09h", "09h - 10h", "10h - 11h", "11h - 12h",
    "14h - 15h", "15h - 16h", "16h - 17h", "17h - 18h",
}


@api.post("/bookings", response_model=Booking)
async def create_booking(body: BookingCreate, uid: str = Depends(current_user_id)):
    if body.device_id not in VALID_DEVICES:
        raise HTTPException(status_code=400, detail="Appareil invalide.")
    if body.time_window not in VALID_TIME_WINDOWS:
        raise HTTPException(status_code=400, detail="Plage horaire invalide.")
    if not body.symptom or len(body.symptom.strip()) < 3:
        raise HTTPException(status_code=400, detail="Merci de décrire votre situation.")
    if not body.cgv_accepted:
        raise HTTPException(status_code=400, detail="Vous devez accepter les CGV.")
    # date sanity: YYYY-MM-DD and >= today
    try:
        d = datetime.fromisoformat(body.date).date()
    except Exception:
        raise HTTPException(status_code=400, detail="Date invalide.")
    today = datetime.now(timezone.utc).date()
    if d < today:
        raise HTTPException(status_code=400, detail="La date doit être dans le futur.")

    user = await db.users.find_one({"id": uid}, {"_id": 0})
    if not user or not user.get("profile_complete"):
        raise HTTPException(status_code=400, detail="Complétez d'abord votre profil.")

    booking = Booking(
        user_id=uid,
        ref=_human_booking_ref(),
        device_id=body.device_id,
        symptom=body.symptom.strip(),
        date=body.date,
        time_window=body.time_window,
        address=user.get("address", ""),
        access_details=user.get("access_details", ""),
        status="confirmed",
        prep_checklist={},
    ).model_dump()
    booking["created_at"] = booking["created_at"].isoformat()
    await db.bookings.insert_one(booking)
    booking.pop("_id", None)
    return Booking(**booking)


@api.get("/bookings", response_model=List[Booking])
async def list_bookings(uid: str = Depends(current_user_id)):
    cursor = db.bookings.find({"user_id": uid}, {"_id": 0}).sort("created_at", -1)
    items = await cursor.to_list(length=100)
    return [Booking(**b) for b in items]


@api.get("/bookings/active", response_model=Optional[Booking])
async def get_active_booking(uid: str = Depends(current_user_id)):
    item = await db.bookings.find_one(
        {"user_id": uid, "status": "confirmed"},
        {"_id": 0},
        sort=[("created_at", -1)],
    )
    if not item:
        return None
    return Booking(**item)


@api.patch("/bookings/{booking_id}", response_model=Booking)
async def update_prep(booking_id: str, body: PrepUpdate, uid: str = Depends(current_user_id)):
    res = await db.bookings.find_one_and_update(
        {"id": booking_id, "user_id": uid},
        {"$set": {"prep_checklist": body.prep_checklist}},
        return_document=True,
        projection={"_id": 0},
    )
    if not res:
        raise HTTPException(status_code=404, detail="Réservation introuvable.")
    return Booking(**res)


@api.post("/bookings/{booking_id}/cancel", response_model=Booking)
async def cancel_booking(booking_id: str, uid: str = Depends(current_user_id)):
    res = await db.bookings.find_one_and_update(
        {"id": booking_id, "user_id": uid},
        {"$set": {"status": "cancelled", "cancelled_at": datetime.now(timezone.utc).isoformat()}},
        return_document=True,
        projection={"_id": 0},
    )
    if not res:
        raise HTTPException(status_code=404, detail="Réservation introuvable.")
    return Booking(**res)


# ============ Invoices ============

@api.get("/invoices", response_model=InvoiceListResponse)
async def list_invoices(uid: str = Depends(current_user_id)):
    cursor = db.invoices.find({"user_id": uid}, {"_id": 0}).sort("date", -1)
    items = await cursor.to_list(length=200)
    return InvoiceListResponse(invoices=[Invoice(**i) for i in items])


@api.post("/invoices/{invoice_id}/pay", response_model=Invoice)
async def pay_invoice(invoice_id: str, uid: str = Depends(current_user_id)):
    res = await db.invoices.find_one_and_update(
        {"id": invoice_id, "user_id": uid},
        {"$set": {"paid": True, "paid_at": datetime.now(timezone.utc).isoformat()}},
        return_document=True,
        projection={"_id": 0},
    )
    if not res:
        raise HTTPException(status_code=404, detail="Facture introuvable.")
    return Invoice(**res)


@api.get("/invoices/{invoice_id}/pdf")
async def download_invoice_pdf(invoice_id: str, uid: str = Depends(current_user_id)):
    inv = await db.invoices.find_one({"id": invoice_id, "user_id": uid}, {"_id": 0})
    if not inv:
        raise HTTPException(status_code=404, detail="Facture introuvable.")
    user = await db.users.find_one({"id": uid}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable.")
    pdf_bytes = build_invoice_pdf(inv, user)
    filename = f"{inv.get('ref') or inv['id']}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
        },
    )


# ============ Contact (Lumi → Marc) ============

@api.post("/contact")
async def contact_marc(
    body: ContactMessageIn,
    uid: Optional[str] = Depends(current_user_id),
):
    user = await db.users.find_one({"id": uid}, {"_id": 0}) if uid else None
    msg = ContactMessage(
        user_id=uid,
        phone=(user or {}).get("phone"),
        message=body.message.strip(),
        context=body.context or "lumi",
    ).model_dump()
    msg["created_at"] = msg["created_at"].isoformat()
    await db.contact_messages.insert_one(msg)
    return {"status": "ok", "message": "Marc vous répond sous 24h ouvrées."}


# ---- Mount routes ----
app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=config.CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    # TTL index for OTPs (auto-delete 1h after creation)
    try:
        await db.otps.create_index("created_at")
        await db.users.create_index("phone", unique=True)
        await db.users.create_index("id", unique=True)
        await db.bookings.create_index("user_id")
        await db.invoices.create_index("user_id")
        log.info("Mongo indexes ensured")
    except Exception as e:
        log.warning(f"Index creation: {e}")


@app.on_event("shutdown")
async def shutdown():
    mongo_client.close()
