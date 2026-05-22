"""
Admin (CRM) router — Phase 1 MVP.

Provides:
  - POST  /api/admin/auth/login
  - POST  /api/admin/auth/change-password
  - GET   /api/admin/me
  - GET   /api/admin/dashboard
  - GET   /api/admin/clients
  - GET   /api/admin/clients/{user_id}
  - PATCH /api/admin/clients/{user_id}
  - GET   /api/admin/bookings
  - POST  /api/admin/bookings
  - PATCH /api/admin/bookings/{booking_id}
  - GET   /api/admin/invoices
  - POST  /api/admin/invoices
  - PATCH /api/admin/invoices/{invoice_id}

All routes (except /auth/login) require Bearer admin token.
"""
from __future__ import annotations

import logging
import re
import secrets
import string
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query

import config
import admin_auth
from database import db
from models import (
    AdminAuthResponse,
    AdminBookingCreate,
    AdminBookingUpdate,
    AdminChangePasswordRequest,
    AdminClientUpdate,
    AdminInvoiceCreate,
    AdminInvoiceUpdate,
    AdminLoginRequest,
    AdminPublic,
    AdminUser,
    Booking,
    Invoice,
    User,
)


log = logging.getLogger("admin")

admin_router = APIRouter(prefix="/admin", tags=["admin"])


# ---------------------- helpers ----------------------

def _now() -> datetime:
    return datetime.now(timezone.utc)


def _normalize_phone(phone: str) -> str:
    digits = re.sub(r"\D", "", phone or "")
    return digits


def _gen_booking_ref() -> str:
    alpha = string.ascii_uppercase + string.digits
    return "RDV-" + "".join(secrets.choice(alpha) for _ in range(5))


def _gen_invoice_ref(year: int, seq: int) -> str:
    return f"INV-{year}-{seq:04d}"


def _safe_admin(admin: dict) -> AdminPublic:
    return AdminPublic(
        id=admin["id"],
        email=admin["email"],
        first_name=admin.get("first_name", ""),
        last_name=admin.get("last_name", ""),
        role=admin.get("role", "admin"),
        last_login_at=admin.get("last_login_at"),
    )


async def _get_admin_or_401(admin_id: str) -> dict:
    admin = await db.admins.find_one({"id": admin_id}, {"_id": 0})
    if not admin:
        raise HTTPException(status_code=401, detail="Compte admin introuvable.")
    return admin


# ---------------------- AUTH ----------------------

@admin_router.post("/auth/login", response_model=AdminAuthResponse)
async def admin_login(body: AdminLoginRequest):
    email = (body.email or "").strip().lower()
    if not email or not body.password:
        raise HTTPException(status_code=400, detail="Email et mot de passe requis.")
    admin = await db.admins.find_one({"email": email}, {"_id": 0})
    if not admin or not admin_auth.verify_password(body.password, admin.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Identifiants invalides.")
    # Update last_login_at
    await db.admins.update_one({"id": admin["id"]}, {"$set": {"last_login_at": _now()}})
    admin["last_login_at"] = _now()
    token = admin_auth.create_admin_token(admin["id"], admin["email"])
    return AdminAuthResponse(status="ok", token=token, admin=_safe_admin(admin))


@admin_router.post("/auth/change-password")
async def admin_change_password(
    body: AdminChangePasswordRequest,
    admin_id: str = Depends(admin_auth.current_admin_id),
):
    admin = await _get_admin_or_401(admin_id)
    if not admin_auth.verify_password(body.current_password, admin.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Mot de passe actuel incorrect.")
    if len(body.new_password) < 8:
        raise HTTPException(status_code=400, detail="Le nouveau mot de passe doit faire au moins 8 caractères.")
    new_hash = admin_auth.hash_password(body.new_password)
    await db.admins.update_one({"id": admin_id}, {"$set": {"password_hash": new_hash}})
    return {"status": "ok"}


@admin_router.get("/me", response_model=AdminPublic)
async def admin_me(admin_id: str = Depends(admin_auth.current_admin_id)):
    admin = await _get_admin_or_401(admin_id)
    return _safe_admin(admin)


# ---------------------- DASHBOARD ----------------------

@admin_router.get("/dashboard")
async def admin_dashboard(_admin_id: str = Depends(admin_auth.current_admin_id)):
    """Aggregated KPIs for the admin landing page."""
    today_str = _now().strftime("%Y-%m-%d")
    week_start = (_now() - timedelta(days=7)).strftime("%Y-%m-%d")
    month_start = (_now() - timedelta(days=30)).strftime("%Y-%m-%d")

    # Totals
    total_clients = await db.users.count_documents({})
    profile_complete = await db.users.count_documents({"profile_complete": True})

    bookings_today = await db.bookings.count_documents({"date": today_str, "status": {"$ne": "cancelled"}})
    bookings_week = await db.bookings.count_documents({"date": {"$gte": week_start}, "status": {"$ne": "cancelled"}})
    bookings_month = await db.bookings.count_documents({"date": {"$gte": month_start}, "status": {"$ne": "cancelled"}})
    bookings_pending = await db.bookings.count_documents({"status": "confirmed", "date": {"$gte": today_str}})
    bookings_completed_month = await db.bookings.count_documents({"status": "completed", "date": {"$gte": month_start}})

    # Revenue (paid invoices, net SAP — what customers actually pay)
    paid_invoices_month_cursor = db.invoices.aggregate([
        {"$match": {"paid": True, "date": {"$gte": month_start}}},
        {"$group": {"_id": None, "total": {"$sum": "$net_total"}, "count": {"$sum": 1}}},
    ])
    paid_month = await paid_invoices_month_cursor.to_list(length=1)
    revenue_month = paid_month[0]["total"] if paid_month else 0.0
    paid_count_month = paid_month[0]["count"] if paid_month else 0

    invoices_unpaid = await db.invoices.count_documents({"paid": False})
    unpaid_cursor = db.invoices.aggregate([
        {"$match": {"paid": False}},
        {"$group": {"_id": None, "total": {"$sum": "$net_total"}}},
    ])
    unpaid_total = await unpaid_cursor.to_list(length=1)
    unpaid_amount = unpaid_total[0]["total"] if unpaid_total else 0.0

    # Next upcoming bookings (4)
    upcoming = await db.bookings.find(
        {"status": {"$in": ["confirmed", "in_progress"]}, "date": {"$gte": today_str}},
        {"_id": 0},
    ).sort([("date", 1), ("time_window", 1)]).to_list(length=4)
    # Enrich with client name/phone
    for b in upcoming:
        u = await db.users.find_one({"id": b.get("user_id")}, {"_id": 0, "first_name": 1, "last_name": 1, "phone": 1})
        if u:
            b["client_name"] = f"{u.get('first_name','')} {u.get('last_name','')}".strip() or u.get("phone", "")
            b["client_phone"] = u.get("phone", "")

    return {
        "kpis": {
            "total_clients": total_clients,
            "profile_complete": profile_complete,
            "bookings_today": bookings_today,
            "bookings_week": bookings_week,
            "bookings_month": bookings_month,
            "bookings_pending": bookings_pending,
            "bookings_completed_month": bookings_completed_month,
            "revenue_month": round(revenue_month, 2),
            "paid_count_month": paid_count_month,
            "invoices_unpaid": invoices_unpaid,
            "unpaid_amount": round(unpaid_amount, 2),
        },
        "upcoming": upcoming,
    }


# ---------------------- CLIENTS ----------------------

@admin_router.get("/clients")
async def admin_list_clients(
    q: str = Query("", description="Search by phone, name, email"),
    limit: int = Query(50, ge=1, le=200),
    skip: int = Query(0, ge=0),
    _admin_id: str = Depends(admin_auth.current_admin_id),
):
    filt: dict = {}
    qstr = (q or "").strip()
    if qstr:
        # Case-insensitive search across multiple fields
        rx = re.escape(qstr)
        filt = {"$or": [
            {"phone": {"$regex": rx, "$options": "i"}},
            {"first_name": {"$regex": rx, "$options": "i"}},
            {"last_name": {"$regex": rx, "$options": "i"}},
            {"email": {"$regex": rx, "$options": "i"}},
            {"tags": {"$regex": rx, "$options": "i"}},
        ]}
    total = await db.users.count_documents(filt)
    cursor = db.users.find(filt, {"_id": 0}).sort([("created_at", -1)]).skip(skip).limit(limit)
    clients = await cursor.to_list(length=limit)
    return {"clients": clients, "total": total, "skip": skip, "limit": limit}


@admin_router.get("/clients/{user_id}")
async def admin_get_client(
    user_id: str,
    _admin_id: str = Depends(admin_auth.current_admin_id),
):
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Client introuvable.")
    bookings = await db.bookings.find({"user_id": user_id}, {"_id": 0}).sort([("date", -1)]).to_list(length=200)
    invoices = await db.invoices.find({"user_id": user_id}, {"_id": 0}).sort([("date", -1)]).to_list(length=200)
    return {"client": user, "bookings": bookings, "invoices": invoices}


@admin_router.patch("/clients/{user_id}")
async def admin_update_client(
    user_id: str,
    body: AdminClientUpdate,
    _admin_id: str = Depends(admin_auth.current_admin_id),
):
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Client introuvable.")
    update = {k: v for k, v in body.dict(exclude_unset=True).items() if v is not None}
    if not update:
        return {"status": "noop", "client": user}
    await db.users.update_one({"id": user_id}, {"$set": update})
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    return {"status": "ok", "client": user}


# ---------------------- BOOKINGS ----------------------

@admin_router.get("/bookings")
async def admin_list_bookings(
    status: Optional[str] = Query(None, description="confirmed|cancelled|completed|in_progress"),
    date_from: Optional[str] = Query(None, description="YYYY-MM-DD"),
    date_to: Optional[str] = Query(None, description="YYYY-MM-DD"),
    user_id: Optional[str] = None,
    limit: int = Query(100, ge=1, le=500),
    skip: int = Query(0, ge=0),
    _admin_id: str = Depends(admin_auth.current_admin_id),
):
    filt: dict = {}
    if status:
        filt["status"] = status
    if user_id:
        filt["user_id"] = user_id
    if date_from or date_to:
        rng: dict = {}
        if date_from:
            rng["$gte"] = date_from
        if date_to:
            rng["$lte"] = date_to
        filt["date"] = rng
    total = await db.bookings.count_documents(filt)
    cursor = db.bookings.find(filt, {"_id": 0}).sort([("date", -1), ("time_window", -1)]).skip(skip).limit(limit)
    bookings = await cursor.to_list(length=limit)
    # Enrich with client info
    for b in bookings:
        u = await db.users.find_one({"id": b.get("user_id")}, {"_id": 0, "first_name": 1, "last_name": 1, "phone": 1, "email": 1})
        if u:
            b["client"] = {
                "id": b.get("user_id"),
                "name": f"{u.get('first_name','')} {u.get('last_name','')}".strip() or u.get("phone", ""),
                "phone": u.get("phone", ""),
                "email": u.get("email", ""),
            }
    return {"bookings": bookings, "total": total, "skip": skip, "limit": limit}


@admin_router.post("/bookings", response_model=Booking)
async def admin_create_booking(
    body: AdminBookingCreate,
    _admin_id: str = Depends(admin_auth.current_admin_id),
):
    # Resolve / create user
    user = None
    if body.user_id:
        user = await db.users.find_one({"id": body.user_id}, {"_id": 0})
    if not user and body.phone:
        phone = _normalize_phone(body.phone)
        user = await db.users.find_one({"phone": phone}, {"_id": 0})
        if not user:
            new_user = User(
                phone=phone,
                first_name=(body.first_name or "").strip(),
                last_name=(body.last_name or "").strip(),
                email=(body.email or "").strip(),
                address=(body.address or "").strip(),
                access_details=(body.access_details or "").strip(),
                profile_complete=bool(body.first_name and body.last_name and body.email and body.address),
            ).dict()
            await db.users.insert_one(new_user)
            user = new_user
    if not user:
        raise HTTPException(status_code=400, detail="Spécifiez user_id ou phone pour créer la réservation.")

    booking = Booking(
        ref=_gen_booking_ref(),
        user_id=user["id"],
        device_id=body.device_id,
        symptom=(body.symptom or "").strip(),
        date=body.date,
        time_window=body.time_window,
        address=user.get("address", ""),
        access_details=user.get("access_details", ""),
        status="confirmed",
    ).dict()
    await db.bookings.insert_one(booking)
    booking.pop("_id", None)
    log.info(f"[admin] booking created ref={booking['ref']} user={user['id']}")
    return Booking(**booking)


@admin_router.patch("/bookings/{booking_id}", response_model=Booking)
async def admin_update_booking(
    booking_id: str,
    body: AdminBookingUpdate,
    _admin_id: str = Depends(admin_auth.current_admin_id),
):
    existing = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Réservation introuvable.")
    update = {k: v for k, v in body.dict(exclude_unset=True).items() if v is not None}
    if "status" in update:
        allowed = {"confirmed", "cancelled", "completed", "in_progress"}
        if update["status"] not in allowed:
            raise HTTPException(status_code=400, detail=f"Statut invalide. Autorisés: {sorted(allowed)}")
        if update["status"] == "cancelled":
            update["cancelled_at"] = _now()
        if update["status"] == "completed":
            update["completed_at"] = _now()
    if not update:
        return Booking(**existing)
    await db.bookings.update_one({"id": booking_id}, {"$set": update})
    res = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    return Booking(**res)


# ---------------------- BOOKING TIMELINE (Brevo events + internal) ----------------------

def _to_e164_fr(phone_digits: str) -> str:
    """Mirror brevo_sms.to_e164_fr — convert 10-digit FR phone to +33 E.164."""
    digits = "".join(ch for ch in (phone_digits or "") if ch.isdigit())
    if digits.startswith("33") and len(digits) == 11:
        return "+" + digits
    if digits.startswith("0") and len(digits) == 10:
        return "+33" + digits[1:]
    return "+" + digits if digits else ""


@admin_router.get("/bookings/{booking_id}/timeline")
async def admin_booking_timeline(
    booking_id: str,
    _admin_id: str = Depends(admin_auth.current_admin_id),
):
    """Return a unified timeline of internal events + Brevo email/SMS events
    related to this booking.

    Matching strategy for Brevo events:
      - email events where event.email == user.email
      - sms events where event.msisdn == E.164(user.phone)
      - filtered from booking.created_at minus 1h, to now
    """
    booking = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not booking:
        raise HTTPException(status_code=404, detail="Réservation introuvable.")
    user = await db.users.find_one({"id": booking["user_id"]}, {"_id": 0}) or {}

    user_email = (user.get("email") or "").strip().lower()
    user_msisdn = _to_e164_fr(user.get("phone") or "")

    items: list[dict] = []

    # 1) Internal markers
    created = booking.get("created_at")
    if created:
        items.append({
            "ts": created.isoformat() if hasattr(created, "isoformat") else str(created),
            "kind": "internal",
            "channel": "system",
            "event": "booking_created",
            "label": f"Réservation créée — {booking.get('ref','')}",
        })
    if booking.get("reminder_j1_sent_at"):
        items.append({
            "ts": booking["reminder_j1_sent_at"],
            "kind": "internal",
            "channel": "system",
            "event": "reminder_j1_dispatched",
            "label": "Rappel J-1 envoyé (SMS + Email)",
            "detail": {
                "sms_ok": bool(booking.get("reminder_j1_sms_ok")),
                "email_ok": bool(booking.get("reminder_j1_email_ok")),
            },
        })
    if booking.get("cancelled_at"):
        ca = booking["cancelled_at"]
        items.append({
            "ts": ca.isoformat() if hasattr(ca, "isoformat") else str(ca),
            "kind": "internal",
            "channel": "system",
            "event": "booking_cancelled",
            "label": "Réservation annulée",
        })
    if booking.get("completed_at"):
        ca = booking["completed_at"]
        items.append({
            "ts": ca.isoformat() if hasattr(ca, "isoformat") else str(ca),
            "kind": "internal",
            "channel": "system",
            "event": "booking_completed",
            "label": "Intervention terminée",
        })

    # 2) Brevo events (from `created_at - 1h` to now)
    cutoff = None
    if created and hasattr(created, "isoformat"):
        cutoff = created - timedelta(hours=1)

    or_clauses = []
    if user_email:
        or_clauses.append({"channel": "email", "email": user_email})
    if user_msisdn:
        or_clauses.append({"channel": "sms", "msisdn": user_msisdn})

    if or_clauses:
        query = {"$or": or_clauses}
        if cutoff is not None:
            query["received_at"] = {"$gte": cutoff}
        cursor = db.brevo_events.find(query, {"_id": 0, "raw": 0}).sort("received_at", 1).limit(200)
        async for ev in cursor:
            recv = ev.get("received_at")
            items.append({
                "ts": recv.isoformat() if hasattr(recv, "isoformat") else str(recv),
                "kind": "brevo",
                "channel": ev.get("channel"),
                "event": ev.get("event"),
                "label": _brevo_event_label(ev),
                "detail": {
                    "message_id": ev.get("message_id"),
                    "tag": ev.get("tag"),
                    "email": ev.get("email"),
                    "msisdn": ev.get("msisdn"),
                    "subject": ev.get("subject"),
                },
            })

    items.sort(key=lambda x: x.get("ts") or "")

    return {
        "booking": {
            "id": booking.get("id"),
            "ref": booking.get("ref"),
            "status": booking.get("status"),
            "date": booking.get("date"),
            "time_window": booking.get("time_window"),
        },
        "user": {
            "email": user_email,
            "phone": user.get("phone"),
        },
        "items": items,
    }


_BREVO_EVENT_FR_EMAIL = {
    "delivered":     "Email livré",
    "opened":        "Email ouvert",
    "unique_opened": "Email ouvert (unique)",
    "click":         "Lien cliqué dans l'email",
    "clicked":       "Lien cliqué dans l'email",
    "hard_bounce":   "Email rejeté (hard bounce)",
    "soft_bounce":   "Email rejeté temporairement",
    "blocked":       "Email bloqué",
    "complaint":     "Plainte spam",
    "spam":          "Marqué comme spam",
    "deferred":      "Email différé",
    "unsubscribed":  "Désabonnement email",
    "sent":          "Email envoyé",
}

_BREVO_EVENT_FR_SMS = {
    "delivered":      "SMS livré",
    "sent":           "SMS envoyé",
    "hardBounce":     "SMS rejeté définitivement",
    "softBounce":     "SMS rejeté temporairement",
    "hard_bounce":    "SMS rejeté définitivement",
    "soft_bounce":    "SMS rejeté temporairement",
    "unsubscription": "Désabonnement SMS (STOP)",
    "blocked":        "SMS bloqué",
}


def _brevo_event_label(ev: dict) -> str:
    channel = ev.get("channel")
    event = ev.get("event") or "unknown"
    if channel == "sms":
        name = _BREVO_EVENT_FR_SMS.get(event, event)
        return f"📱 {name}"
    name = _BREVO_EVENT_FR_EMAIL.get(event, event)
    return f"📧 {name}"


# ---------------------- INVOICES ----------------------

@admin_router.get("/invoices")
async def admin_list_invoices(
    paid: Optional[bool] = Query(None),
    user_id: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    limit: int = Query(100, ge=1, le=500),
    skip: int = Query(0, ge=0),
    _admin_id: str = Depends(admin_auth.current_admin_id),
):
    filt: dict = {}
    if paid is not None:
        filt["paid"] = paid
    if user_id:
        filt["user_id"] = user_id
    if date_from or date_to:
        rng: dict = {}
        if date_from:
            rng["$gte"] = date_from
        if date_to:
            rng["$lte"] = date_to
        filt["date"] = rng
    total = await db.invoices.count_documents(filt)
    cursor = db.invoices.find(filt, {"_id": 0}).sort([("date", -1), ("ref", -1)]).skip(skip).limit(limit)
    invoices = await cursor.to_list(length=limit)
    for inv in invoices:
        u = await db.users.find_one({"id": inv.get("user_id")}, {"_id": 0, "first_name": 1, "last_name": 1, "phone": 1, "email": 1})
        if u:
            inv["client"] = {
                "id": inv.get("user_id"),
                "name": f"{u.get('first_name','')} {u.get('last_name','')}".strip() or u.get("phone", ""),
                "phone": u.get("phone", ""),
                "email": u.get("email", ""),
            }
    return {"invoices": invoices, "total": total, "skip": skip, "limit": limit}


async def _next_invoice_seq(year: int) -> int:
    """Atomic counter for invoice numbering per year."""
    res = await db.counters.find_one_and_update(
        {"_id": f"invoice-{year}"},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=True,
    )
    return int(res.get("seq", 1))


@admin_router.post("/invoices", response_model=Invoice)
async def admin_create_invoice(
    body: AdminInvoiceCreate,
    _admin_id: str = Depends(admin_auth.current_admin_id),
):
    user = await db.users.find_one({"id": body.user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Client introuvable.")
    hours = float(body.hours)
    base = float(body.base_total) if body.base_total is not None else hours * float(config.HOURLY_BASE)
    net = float(body.net_total) if body.net_total is not None else hours * float(config.HOURLY_NET)
    year = int((body.date or "")[:4]) if (body.date or "")[:4].isdigit() else _now().year
    seq = await _next_invoice_seq(year)
    inv = Invoice(
        ref=_gen_invoice_ref(year, seq),
        user_id=body.user_id,
        booking_id=body.booking_id,
        label=(body.label or "").strip(),
        date=body.date,
        hours=hours,
        base_total=round(base, 2),
        net_total=round(net, 2),
        paid=False,
    ).dict()
    await db.invoices.insert_one(inv)
    inv.pop("_id", None)
    log.info(f"[admin] invoice created ref={inv['ref']} user={user['id']}")
    return Invoice(**inv)


@admin_router.patch("/invoices/{invoice_id}", response_model=Invoice)
async def admin_update_invoice(
    invoice_id: str,
    body: AdminInvoiceUpdate,
    _admin_id: str = Depends(admin_auth.current_admin_id),
):
    existing = await db.invoices.find_one({"id": invoice_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Facture introuvable.")
    update = {k: v for k, v in body.dict(exclude_unset=True).items() if v is not None}
    # Recompute totals if hours changed without explicit totals
    if "hours" in update and "base_total" not in update:
        update["base_total"] = round(float(update["hours"]) * float(config.HOURLY_BASE), 2)
    if "hours" in update and "net_total" not in update:
        update["net_total"] = round(float(update["hours"]) * float(config.HOURLY_NET), 2)
    if update.get("paid") is True and not existing.get("paid"):
        update["paid_at"] = _now()
    if update.get("paid") is False:
        update["paid_at"] = None
    if not update:
        return Invoice(**existing)
    await db.invoices.update_one({"id": invoice_id}, {"$set": update})
    res = await db.invoices.find_one({"id": invoice_id}, {"_id": 0})
    return Invoice(**res)


# ---------------------- SEED ----------------------

async def seed_admin_if_needed():
    """Create the first admin from env vars if no admin exists yet.

    Idempotent: only seeds if db.admins is empty AND env vars are set.
    Reads ADMIN_EMAIL and ADMIN_PASSWORD on every call so a fresh password
    in .env (with empty admins collection) is honoured.
    """
    email = (config.ADMIN_EMAIL or "").strip().lower()
    password = config.ADMIN_PASSWORD or ""
    if not email or not password:
        log.warning("[admin] No ADMIN_EMAIL/ADMIN_PASSWORD set — no admin seeded.")
        return
    existing = await db.admins.count_documents({})
    if existing > 0:
        log.info(f"[admin] {existing} admin(s) already exist — skipping seed.")
        return
    admin = AdminUser(
        email=email,
        password_hash=admin_auth.hash_password(password),
        first_name=(config.ADMIN_FIRST_NAME or "").strip(),
        last_name=(config.ADMIN_LAST_NAME or "").strip(),
        role="admin",
    ).dict()
    await db.admins.insert_one(admin)
    log.info(f"[admin] Seeded admin {email}")
