"""Twilio Programmable SMS sender (REST API via httpx).

Replaces the previous Brevo SMS module. Same callable signature:
    await send_otp_sms(phone_digits: str, code: str) -> dict
    await send_sms(phone_digits: str, content: str, tag: str = "") -> dict

Configuration (backend/.env):
    TWILIO_ACCOUNT_SID  — starts with "AC..."
    TWILIO_AUTH_TOKEN
    TWILIO_FROM         — either a +E.164 number, a Messaging Service SID (MG...),
                          or an alphanumeric sender ID (max 11 chars, FR-approved)

If TWILIO_FROM is empty OR SMS_DEV_MODE is true, the function logs the message
locally and returns {"status": "dev_mode"} without hitting Twilio.
"""
from __future__ import annotations

import logging
from typing import Any

import httpx

import config

log = logging.getLogger("twilio_sms")

TWILIO_API_BASE = "https://api.twilio.com/2010-04-01"


def to_e164_fr(phone_digits: str) -> str:
    """Convert a 10-digit French mobile (06.../07...) to +33 E.164."""
    digits = "".join(ch for ch in (phone_digits or "") if ch.isdigit())
    if digits.startswith("33") and len(digits) == 11:
        return "+" + digits
    if digits.startswith("0") and len(digits) == 10:
        return "+33" + digits[1:]
    return "+" + digits  # fallback


def _twilio_configured() -> bool:
    return bool(config.TWILIO_ACCOUNT_SID and config.TWILIO_AUTH_TOKEN and config.TWILIO_FROM)


def _from_field(sender: str) -> dict:
    """Build the From or MessagingServiceSid form field correctly."""
    sender = (sender or "").strip()
    if sender.startswith("MG"):
        return {"MessagingServiceSid": sender}
    # Phone numbers and alphanumeric sender IDs go in From=
    return {"From": sender}


async def send_sms(phone_digits: str, content: str, tag: str = "") -> dict[str, Any]:
    """Send an arbitrary SMS via Twilio. Best-effort, returns the API response dict.

    On dev_mode (Twilio not configured OR SMS_DEV_MODE=true), logs the message
    and returns {"status": "dev_mode"}.
    """
    recipient = to_e164_fr(phone_digits)

    if config.SMS_DEV_MODE or not _twilio_configured():
        log.warning(f"[SMS DEV] would send to {recipient} (tag={tag}): {content}")
        return {"status": "dev_mode", "recipient": recipient}

    url = f"{TWILIO_API_BASE}/Accounts/{config.TWILIO_ACCOUNT_SID}/Messages.json"
    data = {"To": recipient, "Body": content, **_from_field(config.TWILIO_FROM)}
    auth = (config.TWILIO_ACCOUNT_SID, config.TWILIO_AUTH_TOKEN)

    async with httpx.AsyncClient(timeout=15.0) as client:
        r = await client.post(url, data=data, auth=auth)
        try:
            r.raise_for_status()
        except httpx.HTTPStatusError:
            log.error(
                f"Twilio SMS error {r.status_code} for {recipient} (tag={tag}): {r.text}"
            )
            raise
        payload = r.json()
        log.info(
            f"Twilio SMS sent to {recipient} (tag={tag}): sid={payload.get('sid')} status={payload.get('status')}"
        )
        return payload


async def send_otp_sms(phone_digits: str, code: str) -> dict[str, Any]:
    """Send the login OTP SMS. Kept signature-compatible with the previous Brevo sender."""
    content = (
        f"Le Bon Clic : votre code de connexion est {code}. "
        f"Valable 10 min. Ne le partagez avec personne."
    )
    return await send_sms(phone_digits, content, tag="otp_login")
