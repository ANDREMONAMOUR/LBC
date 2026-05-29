"""Invoice-related service helpers."""
from datetime import datetime, timezone

from fastapi import HTTPException
from fastapi.responses import Response

from database import db
from models import Invoice, InvoiceListResponse
from pdf_invoice import build_invoice_pdf


async def list_invoices_service(uid: str) -> InvoiceListResponse:
    cursor = db.invoices.find({"user_id": uid}, {"_id": 0}).sort("date", -1)
    items = await cursor.to_list(length=200)
    return InvoiceListResponse(invoices=[Invoice(**i) for i in items])


async def pay_invoice_service(invoice_id: str, uid: str) -> Invoice:
    res = await db.invoices.find_one_and_update(
        {"id": invoice_id, "user_id": uid},
        {"$set": {"paid": True, "paid_at": datetime.now(timezone.utc).isoformat()}},
        return_document=True,
        projection={"_id": 0},
    )
    if not res:
        raise HTTPException(status_code=404, detail="Facture introuvable.")
    return Invoice(**res)


async def download_invoice_pdf_service(invoice_id: str, uid: str) -> Response:
    inv = await db.invoices.find_one({"id": invoice_id, "user_id": uid}, {"_id": 0})
    if not inv:
        raise HTTPException(status_code=404, detail="Facture introuvable.")
    user = await db.users.find_one({"id": uid}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable.")
    pdf_bytes = build_invoice_pdf(inv, user)
    filename = f"{inv.get('ref') or inv['id']}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
        },
    )
