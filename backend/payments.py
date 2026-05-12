"""Stripe Checkout integration for Le Bon Clic.

Flows:
  - Pay an existing unpaid invoice (server fetches amount in EUR)
  - Pay a fixed booking deposit (server-side amount, never trusted from client)

Endpoints (mounted under /api):
  POST /api/payments/checkout/invoice/{invoice_id}
  POST /api/payments/checkout/deposit/{booking_id}
  GET  /api/payments/status/{session_id}
  POST /api/webhook/stripe

Security notes:
  - Amounts are ALWAYS computed server-side. The frontend only sends `origin_url`.
  - A `payment_transactions` collection records every attempt for audit/idempotency.
  - Webhook signature verified by the emergentintegrations SDK.
  - Status check is idempotent: the linked invoice/booking is finalised once only.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

import config
from auth import current_user_id
from models import PaymentTransaction
from emergentintegrations.payments.stripe.checkout import (
    StripeCheckout,
    CheckoutSessionRequest,
)

log = logging.getLogger("payments")

router = APIRouter(prefix="/api")


# -------- Pydantic input bodies --------

class CheckoutInitBody(BaseModel):
    """Frontend only sends the origin URL (never the amount)."""
    origin_url: str


# -------- Helpers --------

def _stripe(request: Request) -> StripeCheckout:
    """Build a StripeCheckout instance. Webhook URL is derived from the request host."""
    if not config.STRIPE_API_KEY:
        raise HTTPException(status_code=503, detail="Stripe non configuré.")
    host_url = str(request.base_url).rstrip("/")
    webhook_url = f"{host_url}/api/webhook/stripe"
    return StripeCheckout(api_key=config.STRIPE_API_KEY, webhook_url=webhook_url)


def _success_cancel_urls(origin: str) -> tuple[str, str]:
    origin = (origin or "").rstrip("/")
    if not origin:
        raise HTTPException(status_code=400, detail="origin_url manquant.")
    # SPA reads ?session_id=... and polls the backend for final status.
    return (
        f"{origin}/?payment=success&session_id={{CHECKOUT_SESSION_ID}}",
        f"{origin}/?payment=cancelled",
    )


async def _record_transaction(db, *, session_id: str, kind: str, user_id: Optional[str],
                              amount: float, currency: str, metadata: dict,
                              invoice_id: Optional[str] = None,
                              booking_id: Optional[str] = None) -> None:
    doc = PaymentTransaction(
        session_id=session_id,
        kind=kind,
        user_id=user_id,
        invoice_id=invoice_id,
        booking_id=booking_id,
        amount=amount,
        currency=currency,
        status="initiated",
        payment_status="unpaid",
        metadata=metadata,
    ).model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.payment_transactions.insert_one(doc)


# -------- Internal: fulfilment (idempotent) --------

async def _fulfil_paid_session(db, session_id: str, status_obj) -> dict:
    """Apply business effects of a paid session exactly once.

    Returns the updated payment_transactions document.
    """
    from brevo_email import send_payment_confirmation_email  # local import to avoid cycle

    tx = await db.payment_transactions.find_one({"session_id": session_id}, {"_id": 0})
    if not tx:
        log.warning(f"[stripe] unknown session_id={session_id}; ignoring")
        return {}

    # Idempotency: if already settled, just return as-is.
    if tx.get("payment_status") == "paid":
        return tx

    now_iso = datetime.now(timezone.utc).isoformat()
    update = {
        "status": getattr(status_obj, "status", tx.get("status")),
        "payment_status": "paid",
        "settled_at": now_iso,
    }
    await db.payment_transactions.update_one(
        {"session_id": session_id, "payment_status": {"$ne": "paid"}},
        {"$set": update},
    )
    tx.update(update)

    # Apply side effects
    if tx.get("kind") == "invoice_payment" and tx.get("invoice_id"):
        await db.invoices.update_one(
            {"id": tx["invoice_id"]},
            {"$set": {"paid": True, "paid_at": now_iso, "payment_session_id": session_id}},
        )
        invoice = await db.invoices.find_one({"id": tx["invoice_id"]}, {"_id": 0})
        user = await db.users.find_one({"id": tx.get("user_id")}, {"_id": 0}) if tx.get("user_id") else None
        if invoice and user:
            try:
                await send_payment_confirmation_email(invoice, user, kind="invoice", amount_eur=tx.get("amount", 0))
            except Exception as e:
                log.error(f"[stripe] confirmation email failed: {e}")

    elif tx.get("kind") == "booking_deposit" and tx.get("booking_id"):
        await db.bookings.update_one(
            {"id": tx["booking_id"]},
            {
                "$set": {
                    "deposit_paid": True,
                    "deposit_amount": tx.get("amount", 0),
                    "deposit_paid_at": now_iso,
                    "deposit_session_id": session_id,
                }
            },
        )
        booking = await db.bookings.find_one({"id": tx["booking_id"]}, {"_id": 0})
        user = await db.users.find_one({"id": tx.get("user_id")}, {"_id": 0}) if tx.get("user_id") else None
        if booking and user:
            try:
                await send_payment_confirmation_email(booking, user, kind="deposit", amount_eur=tx.get("amount", 0))
            except Exception as e:
                log.error(f"[stripe] confirmation email failed: {e}")

    return tx


# -------- Endpoints --------

def attach(app, db):
    """Attach the payments router to the FastAPI app, with closures over `db`."""

    @router.post("/payments/checkout/invoice/{invoice_id}")
    async def checkout_invoice(
        invoice_id: str,
        body: CheckoutInitBody,
        request: Request,
        uid: str = Depends(current_user_id),
    ):
        invoice = await db.invoices.find_one({"id": invoice_id, "user_id": uid}, {"_id": 0})
        if not invoice:
            raise HTTPException(status_code=404, detail="Facture introuvable.")
        if invoice.get("paid"):
            raise HTTPException(status_code=400, detail="Cette facture est déjà payée.")

        # Server-side amount only
        amount = float(invoice.get("net_total", 0) or 0)
        if amount <= 0:
            raise HTTPException(status_code=400, detail="Montant invalide.")

        success_url, cancel_url = _success_cancel_urls(body.origin_url)
        metadata = {
            "kind": "invoice_payment",
            "invoice_id": invoice_id,
            "invoice_ref": invoice.get("ref", ""),
            "user_id": uid,
        }
        stripe = _stripe(request)
        session = await stripe.create_checkout_session(
            CheckoutSessionRequest(
                amount=float(f"{amount:.2f}"),
                currency="eur",
                success_url=success_url,
                cancel_url=cancel_url,
                metadata=metadata,
            )
        )
        await _record_transaction(
            db,
            session_id=session.session_id,
            kind="invoice_payment",
            user_id=uid,
            amount=amount,
            currency="eur",
            metadata=metadata,
            invoice_id=invoice_id,
        )
        return {"url": session.url, "session_id": session.session_id}

    @router.post("/payments/checkout/deposit/{booking_id}")
    async def checkout_deposit(
        booking_id: str,
        body: CheckoutInitBody,
        request: Request,
        uid: str = Depends(current_user_id),
    ):
        booking = await db.bookings.find_one(
            {"id": booking_id, "user_id": uid, "status": "confirmed"}, {"_id": 0}
        )
        if not booking:
            raise HTTPException(status_code=404, detail="Réservation introuvable.")
        if booking.get("deposit_paid"):
            raise HTTPException(status_code=400, detail="L'acompte est déjà versé.")

        amount = float(config.BOOKING_DEPOSIT_EUR)
        if amount <= 0:
            raise HTTPException(status_code=400, detail="Acompte désactivé.")

        success_url, cancel_url = _success_cancel_urls(body.origin_url)
        metadata = {
            "kind": "booking_deposit",
            "booking_id": booking_id,
            "booking_ref": booking.get("ref", ""),
            "user_id": uid,
        }
        stripe = _stripe(request)
        session = await stripe.create_checkout_session(
            CheckoutSessionRequest(
                amount=float(f"{amount:.2f}"),
                currency="eur",
                success_url=success_url,
                cancel_url=cancel_url,
                metadata=metadata,
            )
        )
        await _record_transaction(
            db,
            session_id=session.session_id,
            kind="booking_deposit",
            user_id=uid,
            amount=amount,
            currency="eur",
            metadata=metadata,
            booking_id=booking_id,
        )
        return {"url": session.url, "session_id": session.session_id}

    @router.get("/payments/status/{session_id}")
    async def get_status(session_id: str, request: Request):
        """Poll endpoint. Idempotent: side-effects only fire once.

        We always have a record in `payment_transactions`. If the SDK call to
        Stripe fails (network / sandbox mismatch), we still return the latest
        snapshot from the DB so the frontend can keep polling gracefully.
        """
        tx = await db.payment_transactions.find_one({"session_id": session_id}, {"_id": 0})
        if not tx:
            raise HTTPException(status_code=404, detail="Session inconnue.")

        stripe = _stripe(request)
        try:
            status_obj = await stripe.get_checkout_status(session_id)
        except Exception as e:
            log.warning(f"[stripe] get_status fallback for {session_id}: {e}")
            return {
                "session_id": session_id,
                "status": tx.get("status", "unknown"),
                "payment_status": tx.get("payment_status", "unpaid"),
                "amount_total": int(round(float(tx.get("amount", 0)) * 100)),
                "currency": tx.get("currency", "eur"),
                "metadata": tx.get("metadata", {}),
                "kind": tx.get("kind"),
                "source": "db_fallback",
            }

        if status_obj.payment_status == "paid":
            await _fulfil_paid_session(db, session_id, status_obj)
        else:
            await db.payment_transactions.update_one(
                {"session_id": session_id, "payment_status": {"$ne": "paid"}},
                {"$set": {"status": status_obj.status, "payment_status": status_obj.payment_status}},
            )

        return {
            "session_id": session_id,
            "status": status_obj.status,
            "payment_status": status_obj.payment_status,
            "amount_total": status_obj.amount_total,
            "currency": status_obj.currency,
            "metadata": status_obj.metadata,
            "kind": tx.get("kind"),
            "source": "stripe",
        }

    @router.post("/webhook/stripe")
    async def stripe_webhook(request: Request):
        """Stripe → backend webhook. Verifies signature via SDK."""
        body = await request.body()
        signature = request.headers.get("Stripe-Signature", "")
        stripe = _stripe(request)
        try:
            event = await stripe.handle_webhook(body, signature)
        except Exception as e:
            log.error(f"[stripe webhook] signature/parse error: {e}")
            raise HTTPException(status_code=400, detail="Webhook invalide.")

        log.info(
            f"[stripe webhook] type={event.event_type} session={event.session_id} payment_status={event.payment_status}"
        )

        if event.payment_status == "paid":
            # Recreate a tiny status-like object so _fulfil_paid_session can use status field.
            class _S:
                status = "complete"
                payment_status = "paid"
            await _fulfil_paid_session(db, event.session_id, _S())
        else:
            await db.payment_transactions.update_one(
                {"session_id": event.session_id, "payment_status": {"$ne": "paid"}},
                {"$set": {"status": "webhook_seen", "payment_status": event.payment_status}},
            )
        return {"received": True}

    app.include_router(router)
