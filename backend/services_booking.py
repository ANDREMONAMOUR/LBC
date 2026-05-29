"""Booking-related service helpers."""
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import HTTPException

import airtable_sync
from database import db
from models import Booking
from utils_common import fire_and_forget, human_booking_ref
from brevo_email import (
    send_booking_cancelled_email,
    send_booking_created_email,
    send_booking_updated_email,
)


VALID_DEVICES = {"laptop", "desktop", "printer", "wifi", "smartphone", "tablet", "other"}
VALID_TIME_WINDOWS = {"09:00-12:00", "14:00-18:00", "18:00-20:00"}


def validate_booking_date(date_str: str):
    try:
        booking_date = datetime.fromisoformat(date_str).date()
    except Exception:
        raise HTTPException(status_code=400, detail="Date invalide.")
    today = datetime.now(timezone.utc).date()
    if booking_date < today:
        raise HTTPException(status_code=400, detail="La date doit être dans le futur.")
    return booking_date


async def create_booking_service(body, uid: str, logger) -> Booking:
    if body.device_id not in VALID_DEVICES:
        raise HTTPException(status_code=400, detail="Appareil invalide.")
    if body.time_window not in VALID_TIME_WINDOWS:
        raise HTTPException(status_code=400, detail="Plage horaire invalide.")
    if not body.symptom or len(body.symptom.strip()) < 3:
        raise HTTPException(status_code=400, detail="Merci de décrire votre situation.")
    if not body.cgv_accepted:
        raise HTTPException(status_code=400, detail="Vous devez accepter les CGV.")

    validate_booking_date(body.date)

    user = await db.users.find_one({"id": uid}, {"_id": 0})
    if not user or not user.get("profile_complete"):
        raise HTTPException(status_code=400, detail="Complétez d'abord votre profil.")

    booking = Booking(
        user_id=uid,
        ref=human_booking_ref(),
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

    fire_and_forget(send_booking_created_email(booking, user), logger)
    airtable_sync.sync_booking(booking, user)
    return Booking(**booking)


async def list_bookings_service(uid: str) -> List[Booking]:
    cursor = db.bookings.find({"user_id": uid}, {"_id": 0}).sort("created_at", -1)
    items = await cursor.to_list(length=100)
    return [Booking(**b) for b in items]


async def get_active_booking_service(uid: str) -> Optional[Booking]:
    item = await db.bookings.find_one(
        {"user_id": uid, "status": "confirmed"},
        {"_id": 0},
        sort=[("created_at", -1)],
    )
    if not item:
        return None
    return Booking(**item)


async def update_prep_service(booking_id: str, prep_checklist: dict, uid: str) -> Booking:
    res = await db.bookings.find_one_and_update(
        {"id": booking_id, "user_id": uid},
        {"$set": {"prep_checklist": prep_checklist}},
        return_document=True,
        projection={"_id": 0},
    )
    if not res:
        raise HTTPException(status_code=404, detail="Réservation introuvable.")
    return Booking(**res)


async def cancel_booking_service(booking_id: str, uid: str, logger) -> Booking:
    res = await db.bookings.find_one_and_update(
        {"id": booking_id, "user_id": uid},
        {"$set": {"status": "cancelled", "cancelled_at": datetime.now(timezone.utc).isoformat()}},
        return_document=True,
        projection={"_id": 0},
    )
    if not res:
        raise HTTPException(status_code=404, detail="Réservation introuvable.")
    user = await db.users.find_one({"id": uid}, {"_id": 0})
    if user:
        fire_and_forget(send_booking_cancelled_email(res, user), logger)
    return Booking(**res)


async def reschedule_booking_service(booking_id: str, body, uid: str, logger) -> Booking:
    if body.time_window not in VALID_TIME_WINDOWS:
        raise HTTPException(status_code=400, detail="Plage horaire invalide.")
    validate_booking_date(body.date)

    res = await db.bookings.find_one_and_update(
        {"id": booking_id, "user_id": uid},
        {
            "$set": {
                "date": body.date,
                "time_window": body.time_window,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        },
        return_document=True,
        projection={"_id": 0},
    )
    if not res:
        raise HTTPException(status_code=404, detail="Réservation introuvable.")
    user = await db.users.find_one({"id": uid}, {"_id": 0})
    if user:
        fire_and_forget(send_booking_updated_email(res, user), logger)
        airtable_sync.sync_booking(res, user)
    return Booking(**res)
