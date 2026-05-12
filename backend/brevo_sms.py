"""Brevo Transactional SMS sender.

Docs: https://developers.brevo.com/reference/sendtransacsms
"""
import logging
import httpx

import config

log = logging.getLogger("brevo_sms")


def to_e164_fr(phone_digits: str) -> str:
    """Convert a 10-digit French mobile (06.../07...) to +33 E.164."""
    digits = "".join(ch for ch in phone_digits if ch.isdigit())
    if digits.startswith("33") and len(digits) == 11:
        return "+" + digits
    if digits.startswith("0") and len(digits) == 10:
        return "+33" + digits[1:]
    return "+" + digits  # fallback


async def send_otp_sms(phone_digits: str, code: str) -> dict:
    """Send a French SMS via Brevo. Returns the Brevo response dict.

    Raises httpx.HTTPStatusError on non-2xx.
    """
    recipient = to_e164_fr(phone_digits)
    # Keep message short and explicit. Brevo bills per segment of 160 chars.
    content = (
        f"Le Bon Clic : votre code de connexion est {code}. "
        f"Valable 10 min. Ne le partagez avec personne."
    )
    payload = {
        "sender": config.BREVO_SENDER_NAME[:11],  # FR: max 11 alphanum
        "recipient": recipient,
        "content": content,
        "type": "transactional",
        "tag": "otp_login",
        "unicodeEnabled": False,
    }
    headers = {
        "accept": "application/json",
        "content-type": "application/json",
        "api-key": config.BREVO_API_KEY,
    }

    if config.SMS_DEV_MODE or not config.BREVO_API_KEY:
        log.warning(f"[SMS DEV] would send to {recipient}: code={code}")
        return {"status": "dev_mode", "recipient": recipient}

    async with httpx.AsyncClient(timeout=15.0) as client:
        r = await client.post(config.BREVO_SMS_URL, headers=headers, json=payload)
        try:
            r.raise_for_status()
        except httpx.HTTPStatusError as e:
            log.error(
                f"Brevo SMS error {r.status_code} for {recipient}: {r.text}"
            )
            raise
        data = r.json()
        log.info(
            f"Brevo SMS sent to {recipient}: messageId={data.get('messageId')} credits={data.get('usedCredits')}"
        )
        return data
