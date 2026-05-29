"""Shared utility helpers for the backend."""
import asyncio
import logging
import random
import secrets
from datetime import datetime, timezone

from fastapi import HTTPException


def normalize_phone(raw: str) -> str:
    digits = "".join(ch for ch in (raw or "") if ch.isdigit())
    if digits.startswith("33") and len(digits) == 11:
        digits = "0" + digits[2:]
    if len(digits) != 10 or not (digits.startswith("06") or digits.startswith("07")):
        raise HTTPException(status_code=400, detail="Numéro de mobile français invalide.")
    return digits


def mask_phone(p: str) -> str:
    if len(p) < 4:
        return p
    return f"{p[:2]} ** ** ** {p[-2:]}"


def gen_code() -> str:
    return f"{secrets.randbelow(10000):04d}"


def human_booking_ref() -> str:
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "RDV-" + "".join(random.choice(alphabet) for _ in range(5))


def human_invoice_ref(seq: int) -> str:
    return f"INV-{datetime.now(timezone.utc).year}-{seq:04d}"


def fire_and_forget(coro, logger: logging.Logger) -> None:
    """Fire-and-forget an awaitable. Errors are logged but never propagate."""

    async def _runner():
        try:
            await coro
        except Exception as e:
            logger.error(f"Background task failed: {e}")

    try:
        asyncio.get_running_loop().create_task(_runner())
    except RuntimeError:
        asyncio.run(_runner())
