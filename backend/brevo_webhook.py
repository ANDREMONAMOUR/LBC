"""Brevo transactional webhook receiver.

Brevo posts SMS + Email event notifications (delivered, bounced, opened, etc.)
to a URL we configure on their dashboard. Brevo does NOT sign these requests,
so we protect the endpoint with a shared secret embedded in the URL path.

Reference:
- https://developers.brevo.com/docs/transactional-webhooks (email)
- https://developers.brevo.com/docs/sms-webhooks (sms)
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request

import config

log = logging.getLogger("brevo_webhook")

router = APIRouter()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _check_secret(secret: str) -> None:
    expected = (config.BREVO_WEBHOOK_SECRET or "").strip()
    if not expected:
        raise HTTPException(status_code=404, detail="Not found")
    if secret != expected:
        # Mask as 404 to avoid leaking that the endpoint exists.
        raise HTTPException(status_code=404, detail="Not found")


def attach(app, db):
    """Mount the Brevo webhook router and inject the Mongo db handle."""

    @router.post("/webhook/brevo/{secret}/email")
    async def brevo_email_webhook(secret: str, request: Request):
        _check_secret(secret)
        try:
            payload = await request.json()
        except Exception as e:
            log.error(f"[brevo email] invalid JSON: {e}")
            raise HTTPException(status_code=400, detail="Invalid JSON")

        # Brevo posts either a single event dict or a list of events.
        events = payload if isinstance(payload, list) else [payload]
        stored = 0
        for ev in events:
            try:
                doc = {
                    "channel": "email",
                    "event": ev.get("event"),
                    "email": ev.get("email"),
                    "message_id": ev.get("message-id") or ev.get("messageId"),
                    "date": ev.get("date") or ev.get("ts"),
                    "subject": ev.get("subject"),
                    "tag": ev.get("tag"),
                    "raw": ev,
                    "received_at": _now(),
                }
                # Idempotency: upsert on (message_id + event)
                key = {"message_id": doc["message_id"], "event": doc["event"], "channel": "email"}
                if doc["message_id"]:
                    await db.brevo_events.update_one(key, {"$setOnInsert": doc}, upsert=True)
                else:
                    await db.brevo_events.insert_one(doc)
                stored += 1
                log.info(f"[brevo email] {doc['event']} for {doc['email']} (msg={doc['message_id']})")
            except Exception as e:
                log.exception(f"[brevo email] failed to store event: {e}")

        return {"status": "ok", "stored": stored}

    @router.post("/webhook/brevo/{secret}/sms")
    async def brevo_sms_webhook(secret: str, request: Request):
        _check_secret(secret)
        try:
            payload = await request.json()
        except Exception as e:
            log.error(f"[brevo sms] invalid JSON: {e}")
            raise HTTPException(status_code=400, detail="Invalid JSON")

        events = payload if isinstance(payload, list) else [payload]
        stored = 0
        for ev in events:
            try:
                doc = {
                    "channel": "sms",
                    "event": ev.get("event"),
                    "msisdn": ev.get("msisdn") or ev.get("recipient"),
                    "message_id": ev.get("message_id") or ev.get("messageId") or ev.get("msg_id"),
                    "date": ev.get("date") or ev.get("ts"),
                    "tag": ev.get("tag"),
                    "credits_used": ev.get("credits_used") or ev.get("usedCredits"),
                    "raw": ev,
                    "received_at": _now(),
                }
                key = {"message_id": doc["message_id"], "event": doc["event"], "channel": "sms"}
                if doc["message_id"]:
                    await db.brevo_events.update_one(key, {"$setOnInsert": doc}, upsert=True)
                else:
                    await db.brevo_events.insert_one(doc)
                stored += 1
                log.info(f"[brevo sms] {doc['event']} for {doc['msisdn']} (msg={doc['message_id']})")
            except Exception as e:
                log.exception(f"[brevo sms] failed to store event: {e}")

        return {"status": "ok", "stored": stored}

    app.include_router(router, prefix="/api")
