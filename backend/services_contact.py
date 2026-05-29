"""Contact-related service helpers."""
from database import db
from models import ContactMessage


async def create_contact_message(body, uid: str | None):
    user = await db.users.find_one({"id": uid}, {"_id": 0}) if uid else None
    msg = ContactMessage(
        user_id=uid,
        phone=(user or {}).get("phone"),
        message=body.message.strip(),
        context=body.context or "lumi",
    ).model_dump()
    msg["created_at"] = msg["created_at"].isoformat()
    await db.contact_messages.insert_one(msg)
    return {"status": "ok", "message": "Jordan vous répond sous 24h ouvrées."}
