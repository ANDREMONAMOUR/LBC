"""Authentication-related service helpers."""
from datetime import datetime, timedelta, timezone

import config
from auth import create_token
from database import db
from models import AuthResponse, SendOtpResponse, User, VerifyOtpRequest
from twilio_sms import send_otp_sms
from utils_common import gen_code, mask_phone, normalize_phone
from services_user import ensure_user


async def send_otp_code(body) -> SendOtpResponse:
    phone = normalize_phone(body.phone)

    cutoff = datetime.now(timezone.utc) - timedelta(minutes=10)
    recent_count = await db.otps.count_documents(
        {"phone": phone, "created_at": {"$gte": cutoff.isoformat()}}
    )
    if recent_count >= 3:
        from fastapi import HTTPException
        raise HTTPException(
            status_code=429,
            detail="Trop de demandes. Réessayez dans quelques minutes.",
        )

    code = gen_code()
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
    except Exception:
        dev_code = None

    return SendOtpResponse(
        status="sent",
        masked_phone=mask_phone(phone),
        dev_code=dev_code,
        expires_in=config.OTP_EXPIRY_SECONDS,
    )


async def verify_otp_code(body: VerifyOtpRequest) -> AuthResponse:
    from fastapi import HTTPException

    phone = normalize_phone(body.phone)
    code = (body.code or "").strip()
    if len(code) != 4 or not code.isdigit():
        raise HTTPException(status_code=400, detail="Code invalide.")

    is_bypass = bool(config.OTP_BYPASS_CODE) and code == config.OTP_BYPASS_CODE

    if not is_bypass:
        now_iso = datetime.now(timezone.utc).isoformat()
        otp_doc = await db.otps.find_one(
            {"phone": phone, "used": False, "expires_at": {"$gt": now_iso}},
            sort=[("created_at", -1)],
        )
        if not otp_doc:
            raise HTTPException(status_code=400, detail="Code expiré ou inexistant. Demandez un nouveau code.")
        if otp_doc.get("attempts", 0) >= 5:
            raise HTTPException(status_code=429, detail="Trop de tentatives. Demandez un nouveau code.")
        if otp_doc["code"] != code:
            await db.otps.update_one({"_id": otp_doc["_id"]}, {"$inc": {"attempts": 1}})
            raise HTTPException(status_code=400, detail="Code incorrect.")
        await db.otps.update_one({"_id": otp_doc["_id"]}, {"$set": {"used": True}})

    user, is_new = await ensure_user(phone)
    token = create_token(user["id"], phone)
    return AuthResponse(
        status="ok",
        token=token,
        is_new_user=is_new or not user.get("profile_complete", False),
        user=User(**user),
    )


async def demo_auth_user(body) -> AuthResponse:
    from fastapi import HTTPException

    if not config.SMS_DEV_MODE:
        raise HTTPException(
            status_code=403,
            detail="Mode démo désactivé sur cet environnement.",
        )
    phone = normalize_phone(body.phone)
    user, is_new = await ensure_user(phone)
    token = create_token(user["id"], phone)
    return AuthResponse(
        status="ok",
        token=token,
        is_new_user=is_new or not user.get("profile_complete", False),
        user=User(**user),
    )
