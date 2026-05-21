"""
Admin authentication helpers.

Uses the same JWT secret as client auth but with a `role: "admin"` claim
to distinguish admin tokens. Passwords are stored bcrypt-hashed in
db.admins. Admins cannot login via the OTP/demo client flow.
"""
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
import jwt
from fastapi import Header, HTTPException, status

import config


ADMIN_JWT_EXPIRY_HOURS = 24 * 7  # 1 week


def hash_password(password: str) -> str:
    """bcrypt hash. Returns utf-8 string ready to store."""
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    if not password or not password_hash:
        return False
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except Exception:
        return False


def create_admin_token(admin_id: str, email: str) -> str:
    payload = {
        "sub": admin_id,
        "email": email,
        "role": "admin",
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(hours=ADMIN_JWT_EXPIRY_HOURS),
    }
    return jwt.encode(payload, config.JWT_SECRET, algorithm=config.JWT_ALGO)


def decode_admin_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, config.JWT_SECRET, algorithms=[config.JWT_ALGO])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Session expirée. Veuillez vous reconnecter.")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token invalide.")
    if payload.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Accès admin requis.")
    return payload


async def current_admin_id(authorization: Optional[str] = Header(None)) -> str:
    """FastAPI dependency: returns admin_id if token is valid, else 401/403."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentification admin requise.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = authorization.split(" ", 1)[1].strip()
    payload = decode_admin_token(token)
    admin_id = payload.get("sub")
    if not admin_id:
        raise HTTPException(status_code=401, detail="Token admin invalide.")
    return admin_id
