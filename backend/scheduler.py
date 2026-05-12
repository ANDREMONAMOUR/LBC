"""APScheduler integration for Le Bon Clic.

Responsibility: send J-1 reminders (SMS + email) at 18:00 Europe/Paris
for every confirmed booking taking place the next day, exactly once.

Anti-doublon: bookings.reminder_j1_sent_at is set after a successful run.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import httpx
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

import config
from brevo_email import send_reminder_j1_email
from brevo_sms import to_e164_fr

log = logging.getLogger("scheduler")

PARIS_TZ = ZoneInfo("Europe/Paris")

_scheduler: AsyncIOScheduler | None = None


async def _send_reminder_sms(phone_digits: str, booking: dict) -> dict | None:
    """Send a short J-1 reminder SMS via Brevo. Best-effort."""
    recipient = to_e164_fr(phone_digits)
    time_window = booking.get("time_window", "")
    ref = booking.get("ref", "")
    content = (
        f"Le Bon Clic : rappel - votre RDV {ref} est demain ({time_window}). "
        f"Jordan vous appelle avant. Branchez votre appareil. Tel: {config.COMPANY_SVI}."
    )
    payload = {
        "sender": config.BREVO_SENDER_NAME[:11],
        "recipient": recipient,
        "content": content,
        "type": "transactional",
        "tag": "reminder_j1",
        "unicodeEnabled": False,
    }
    headers = {
        "accept": "application/json",
        "content-type": "application/json",
        "api-key": config.BREVO_API_KEY,
    }
    if config.SMS_DEV_MODE or not config.BREVO_API_KEY:
        log.warning(f"[reminder_sms DEV] would send to {recipient}: {content}")
        return {"status": "dev_mode"}
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.post(config.BREVO_SMS_URL, headers=headers, json=payload)
            r.raise_for_status()
            data = r.json()
            log.info(
                f"[reminder_sms] sent to {recipient}: messageId={data.get('messageId')}"
            )
            return data
    except httpx.HTTPStatusError as e:
        log.error(
            f"[reminder_sms] HTTP {e.response.status_code} for {recipient}: {e.response.text}"
        )
        return None
    except Exception as e:
        log.error(f"[reminder_sms] failed for {recipient}: {e}")
        return None


async def send_j1_reminders(db) -> int:
    """Find every confirmed booking happening tomorrow (Europe/Paris) and notify.

    Returns the number of bookings successfully notified.
    """
    now_paris = datetime.now(PARIS_TZ)
    tomorrow = (now_paris + timedelta(days=1)).date().isoformat()
    log.info(f"[reminder_j1] scanning bookings for date={tomorrow}")

    cursor = db.bookings.find(
        {
            "date": tomorrow,
            "status": "confirmed",
            "reminder_j1_sent_at": {"$exists": False},
        },
        {"_id": 0},
    )
    bookings = await cursor.to_list(length=500)
    if not bookings:
        log.info("[reminder_j1] no eligible bookings")
        return 0

    sent = 0
    for b in bookings:
        user = await db.users.find_one({"id": b["user_id"]}, {"_id": 0})
        if not user:
            log.warning(f"[reminder_j1] user {b['user_id']} missing for booking {b.get('ref')}")
            continue
        sms_res = await _send_reminder_sms(user.get("phone", ""), b)
        email_res = await send_reminder_j1_email(b, user)
        # We mark sent even if one channel fails, to avoid duplicate spam.
        await db.bookings.update_one(
            {"id": b["id"]},
            {
                "$set": {
                    "reminder_j1_sent_at": datetime.utcnow().isoformat(),
                    "reminder_j1_sms_ok": bool(sms_res),
                    "reminder_j1_email_ok": bool(email_res),
                }
            },
        )
        sent += 1
    log.info(f"[reminder_j1] processed {sent} booking(s)")
    return sent


def start_scheduler(db) -> AsyncIOScheduler:
    """Start the AsyncIOScheduler. Must be called from FastAPI startup."""
    global _scheduler
    if _scheduler is not None:
        return _scheduler
    _scheduler = AsyncIOScheduler(timezone=PARIS_TZ)

    async def _job():
        try:
            await send_j1_reminders(db)
        except Exception as e:
            log.exception(f"[reminder_j1] job crashed: {e}")

    # Fires every day at 18:00 Europe/Paris
    _scheduler.add_job(
        _job,
        trigger=CronTrigger(hour=18, minute=0, timezone=PARIS_TZ),
        id="reminder_j1_daily",
        replace_existing=True,
        misfire_grace_time=60 * 60,  # if missed by up to 1h, still run
        coalesce=True,
    )
    _scheduler.start()
    log.info("Scheduler started (reminder_j1 cron 18:00 Europe/Paris)")
    return _scheduler


def shutdown_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        try:
            _scheduler.shutdown(wait=False)
        except Exception:
            pass
        _scheduler = None
        log.info("Scheduler stopped")
