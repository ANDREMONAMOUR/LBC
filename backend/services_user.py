"""User-related service helpers."""
from datetime import datetime, timedelta, timezone

from models import Invoice, User
from database import db
from utils_common import human_invoice_ref


async def ensure_user(phone: str) -> tuple[dict, bool]:
    """Return (user_doc, is_new)."""
    user = await db.users.find_one({"phone": phone}, {"_id": 0})
    if user:
        return user, False
    new_user = User(phone=phone).model_dump()
    new_user["created_at"] = new_user["created_at"].isoformat()
    await db.users.insert_one(new_user)
    return new_user, True


async def seed_demo_invoices(user_id: str, user_phone: str):
    """On first profile completion, seed 2 example invoices like the SPA had."""
    count = await db.invoices.count_documents({"user_id": user_id})
    if count > 0:
        return
    seq_start = await db.invoices.count_documents({}) + 1
    today = datetime.now(timezone.utc).date()
    samples = [
        {
            "label": "Dépannage Ordinateur",
            "date": (today - timedelta(days=58)).isoformat(),
            "hours": 1.5,
            "base_total": 120.0,
            "net_total": 60.0,
            "paid": True,
        },
        {
            "label": "Configuration Box & Wi-Fi",
            "date": (today - timedelta(days=26)).isoformat(),
            "hours": 1.0,
            "base_total": 80.0,
            "net_total": 40.0,
            "paid": False,
        },
    ]
    for i, sample in enumerate(samples):
        inv = Invoice(
            user_id=user_id,
            ref=human_invoice_ref(seq_start + i),
            label=sample["label"],
            date=sample["date"],
            hours=sample["hours"],
            base_total=sample["base_total"],
            net_total=sample["net_total"],
            paid=sample["paid"],
            payment_url=f"/factures/{seq_start + i}",
        ).model_dump()
        inv["created_at"] = inv["created_at"].isoformat()
        await db.invoices.insert_one(inv)
