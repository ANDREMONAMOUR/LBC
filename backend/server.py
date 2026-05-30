"""Le Bon Clic FastAPI backend — main entrypoint."""
import logging
from typing import Optional, List

from fastapi import FastAPI, APIRouter, HTTPException, Depends, status
from starlette.middleware.cors import CORSMiddleware

import config
from models import (
    SendOtpRequest, SendOtpResponse, VerifyOtpRequest, UserProfileIn,
    User, AuthResponse,
    BookingCreate, Booking, PrepUpdate, BookingReschedule,
    Invoice, InvoiceListResponse,
    ContactMessageIn,
)
from auth import current_user_id, optional_user_id
from services_user import seed_demo_invoices
from services_auth import send_otp_code, verify_otp_code, demo_auth_user
from services_booking import (
    create_booking_service,
    list_bookings_service,
    get_active_booking_service,
    update_prep_service,
    cancel_booking_service,
    reschedule_booking_service,
)
from services_invoice import (
    list_invoices_service,
    pay_invoice_service,
    download_invoice_pdf_service,
)
from services_contact import create_contact_message
from scheduler import start_scheduler, shutdown_scheduler, send_j1_reminders
import payments as payments_module
from admin_router import admin_router, seed_admin_if_needed
import brevo_webhook as brevo_webhook_module
from database import mongo_client, db


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
log = logging.getLogger("lebonclic")

app = FastAPI(title="Le Bon Clic API", version="1.0.0")
api = APIRouter(prefix="/api")


@api.get("/health")
async def health():
    return {"status": "ok", "sms_dev_mode": config.SMS_DEV_MODE}


@api.post("/auth/send-otp", response_model=SendOtpResponse)
async def send_otp(body: SendOtpRequest):
    return await send_otp_code(body)


@api.post("/auth/verify-otp", response_model=AuthResponse)
async def verify_otp(body: VerifyOtpRequest):
    return await verify_otp_code(body)


@api.post("/auth/demo-auth", response_model=AuthResponse)
async def demo_auth(body: SendOtpRequest):
    return await demo_auth_user(body)


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
    await seed_demo_invoices(uid, res.get("phone", ""))
    return User(**res)


@api.post("/bookings", response_model=Booking)
async def create_booking(body: BookingCreate, uid: str = Depends(current_user_id)):
    return await create_booking_service(body, uid, log)


@api.get("/bookings", response_model=List[Booking])
async def list_bookings(uid: str = Depends(current_user_id)):
    return await list_bookings_service(uid)


@api.get("/bookings/active", response_model=Optional[Booking])
async def get_active_booking(uid: str = Depends(current_user_id)):
    return await get_active_booking_service(uid)


@api.patch("/bookings/{booking_id}", response_model=Booking)
async def update_prep(booking_id: str, body: PrepUpdate, uid: str = Depends(current_user_id)):
    return await update_prep_service(booking_id, body.prep_checklist, uid)


@api.post("/bookings/{booking_id}/cancel", response_model=Booking)
async def cancel_booking(booking_id: str, uid: str = Depends(current_user_id)):
    return await cancel_booking_service(booking_id, uid, log)


@api.post("/bookings/{booking_id}/reschedule", response_model=Booking)
async def reschedule_booking(
    booking_id: str,
    body: BookingReschedule,
    uid: str = Depends(current_user_id),
):
    return await reschedule_booking_service(booking_id, body, uid, log)


@api.get("/invoices", response_model=InvoiceListResponse)
async def list_invoices(uid: str = Depends(current_user_id)):
    return await list_invoices_service(uid)


@api.post("/invoices/{invoice_id}/pay", response_model=Invoice)
async def pay_invoice(invoice_id: str, uid: str = Depends(current_user_id)):
    return await pay_invoice_service(invoice_id, uid)


@api.get("/invoices/{invoice_id}/pdf")
async def download_invoice_pdf(invoice_id: str, uid: str = Depends(current_user_id)):
    return await download_invoice_pdf_service(invoice_id, uid)


@api.post("/contact")
async def contact_marc(
    body: ContactMessageIn,
    uid: Optional[str] = Depends(optional_user_id),
):
    return await create_contact_message(body, uid)


@api.post("/admin/run-reminders-j1")
async def admin_run_reminders_j1():
    if not config.OTP_BYPASS_CODE:
        raise HTTPException(status_code=404, detail="Not found")
    count = await send_j1_reminders(db)
    return {"status": "ok", "notified": count}


api.include_router(admin_router)
app.include_router(api)
payments_module.attach(app, db)
brevo_webhook_module.attach(app, db)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=config.CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    log.info("Starting up Le Bon Clic backend...")
    try:
        await db.otps.create_index("expires_at", expireAfterSeconds=3600)
        await db.otps.create_index([("phone", 1), ("created_at", -1)])
        await db.users.create_index("phone", unique=True)
        await db.users.create_index("id", unique=True)
        await db.bookings.create_index([("user_id", 1), ("created_at", -1)])
        await db.bookings.create_index("id", unique=True)
        await db.invoices.create_index([("user_id", 1), ("date", -1)])
        await db.invoices.create_index("id", unique=True)
        await db.payment_transactions.create_index("session_id", unique=True)
        await db.payment_transactions.create_index([("user_id", 1), ("created_at", -1)])
        await db.contact_messages.create_index([("created_at", -1)])
        log.info("MongoDB indexes created successfully")
    except Exception as exc:
        log.error("Failed to create MongoDB indexes: %s", exc, exc_info=True)
        raise RuntimeError(f"MongoDB connection failed at startup: {exc}") from exc
    seed_admin_if_needed()
    start_scheduler(db)
    log.info("Backend started successfully")


@app.on_event("shutdown")
async def shutdown():
    shutdown_scheduler()
    mongo_client.close()
    log.info("Backend stopped")
