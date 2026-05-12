"""Stripe Checkout integration for Le Bon Clic — official Stripe Python SDK.

Flows:
  - Pay an existing unpaid invoice (server fetches amount in EUR from MongoDB)
  - Pay a fixed booking deposit (server-side amount, never trusted from client)

Endpoints (mounted under /api):
  POST /api/payments/checkout/invoice/{invoice_id}
  POST /api/payments/checkout/deposit/{booking_id}
  GET  /api/payments/status/{session_id}
  POST /api/webhook/stripe

Security:
  - Amounts are ALWAYS computed server-side. Frontend only sends `origin_url`.
  - A `payment_transactions` collection records every attempt (audit + idempotency).
  - Webhook signature verified with `STRIPE_WEBHOOK_SECRET`.
  - Side effects fire exactly once per session, whether triggered by webhook or polling.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
import stripe

import config
from auth import current_user_id
from models import PaymentTransaction

log = logging.getLogger("payments")

router = APIRouter(prefix="/api")

# Configure SDK at import time so any module-level use works too.
stripe.api_key = config.STRIPE_API_KEY


# -------- Pydantic input bodies --------

class CheckoutInitBody(BaseModel):
    """Frontend only sends the origin URL (never the amount)."""
    origin_url: str


# -------- Helpers --------

def _require_stripe():
    if not config.STRIPE_API_KEY:
        raise HTTPException(status_code=503, detail="Stripe non configuré.")
    # Re-assign in case env was updated; cheap.
    stripe.api_key = config.STRIPE_API_KEY


def _success_cancel_urls(origin: str) -> tuple[str, str]:
    origin = (origin or "").rstrip("/")
    if not origin:
        raise HTTPException(status_code=400, detail="origin_url manquant.")
    # SPA reads ?session_id=... and polls the backend for final status.
    return (
        f"{origin}/?payment=success&session_id={{CHECKOUT_SESSION_ID}}",
        f"{origin}/?payment=cancelled",
    )


def _eur_amount_to_cents(amount_eur: float) -> int:
    # Stripe expects an integer in the smallest currency unit
    return int(round(float(amount_eur) * 100))


async def _record_transaction(
    db,
    *,
    session_id: str,
    kind: str,
    user_id: Optional[str],
    amount: float,
    currency: str,
    metadata: dict,
    invoice_id: Optional[str] = None,
    booking_id: Optional[str] = None,
) -> None:
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

async def _fulfil_paid_session(db, session_id: str, *, sdk_status: Optional[str] = None) -> dict:
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
        "status": sdk_status or "complete",
        "payment_status": "paid",
        "settled_at": now_iso,
    }
    res = await db.payment_transactions.update_one(
        {"session_id": session_id, "payment_status": {"$ne": "paid"}},
        {"$set": update},
    )
    if res.modified_count == 0:
        # Another concurrent call already settled this tx; nothing to do.
        return await db.payment_transactions.find_one({"session_id": session_id}, {"_id": 0}) or {}
    tx.update(update)

    if tx.get("kind") == "invoice_payment" and tx.get("invoice_id"):
        await db.invoices.update_one(
            {"id": tx["invoice_id"]},
            {"$set": {"paid": True, "paid_at": now_iso, "payment_session_id": session_id}},
        )
        invoice = await db.invoices.find_one({"id": tx["invoice_id"]}, {"_id": 0})
        user = await db.users.find_one({"id": tx.get("user_id")}, {"_id": 0}) if tx.get("user_id") else None
        if invoice and user:
            try:
                await send_payment_confirmation_email(
                    invoice, user, kind="invoice", amount_eur=tx.get("amount", 0)
                )
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
                await send_payment_confirmation_email(
                    booking, user, kind="deposit", amount_eur=tx.get("amount", 0)
                )
            except Exception as e:
                log.error(f"[stripe] confirmation email failed: {e}")

    return tx


# -------- Stripe call helpers (sync SDK) --------

def _create_session_invoice(*, amount_eur: float, success_url: str, cancel_url: str,
                            metadata: dict, invoice_label: str) -> stripe.checkout.Session:
    _require_stripe()
    return stripe.checkout.Session.create(
        mode="payment",
        payment_method_types=["card"],
        line_items=[
            {
                "price_data": {
                    "currency": "eur",
                    "unit_amount": _eur_amount_to_cents(amount_eur),
                    "product_data": {
                        "name": invoice_label[:120] or "Facture Le Bon Clic",
                        "description": "Service à la Personne (-50% crédit d'impôt SAP)",
                    },
                },
                "quantity": 1,
            }
        ],
        success_url=success_url,
        cancel_url=cancel_url,
        metadata=metadata,
        locale="fr",
        billing_address_collection="auto",
    )


def _create_session_deposit(*, amount_eur: float, success_url: str, cancel_url: str,
                            metadata: dict, booking_ref: str) -> stripe.checkout.Session:
    _require_stripe()
    return stripe.checkout.Session.create(
        mode="payment",
        payment_method_types=["card"],
        line_items=[
            {
                "price_data": {
                    "currency": "eur",
                    "unit_amount": _eur_amount_to_cents(amount_eur),
                    "product_data": {
                        "name": f"Acompte rendez-vous {booking_ref}".strip(),
                        "description": "Déduit de la facture finale. Remboursé si annulation 24h avant.",
                    },
                },
                "quantity": 1,
            }
        ],
        success_url=success_url,
        cancel_url=cancel_url,
        metadata=metadata,
        locale="fr",
    )


def _retrieve_session(session_id: str) -> stripe.checkout.Session:
    _require_stripe()
    return stripe.checkout.Session.retrieve(session_id)


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
        try:
            session = _create_session_invoice(
                amount_eur=amount,
                success_url=success_url,
                cancel_url=cancel_url,
                metadata=metadata,
                invoice_label=f"{invoice.get('ref','')} — {invoice.get('label','Prestation')}",
            )
        except stripe.error.StripeError as e:
            log.error(f"[stripe] create_session invoice failed: {e.user_message or e}")
            raise HTTPException(status_code=502, detail="Stripe a refusé la session. Réessayez.")

        await _record_transaction(
            db,
            session_id=session.id,
            kind="invoice_payment",
            user_id=uid,
            amount=amount,
            currency="eur",
            metadata=metadata,
            invoice_id=invoice_id,
        )
        return {"url": session.url, "session_id": session.id}

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
        try:
            session = _create_session_deposit(
                amount_eur=amount,
                success_url=success_url,
                cancel_url=cancel_url,
                metadata=metadata,
                booking_ref=booking.get("ref", ""),
            )
        except stripe.error.StripeError as e:
            log.error(f"[stripe] create_session deposit failed: {e.user_message or e}")
            raise HTTPException(status_code=502, detail="Stripe a refusé la session. Réessayez.")

        await _record_transaction(
            db,
            session_id=session.id,
            kind="booking_deposit",
            user_id=uid,
            amount=amount,
            currency="eur",
            metadata=metadata,
            booking_id=booking_id,
        )
        return {"url": session.url, "session_id": session.id}

    @router.get("/payments/status/{session_id}")
    async def get_status(session_id: str):
        """Poll endpoint. Idempotent: side-effects only fire once."""
        tx = await db.payment_transactions.find_one({"session_id": session_id}, {"_id": 0})
        if not tx:
            raise HTTPException(status_code=404, detail="Session inconnue.")

        try:
            session = _retrieve_session(session_id)
        except stripe.error.StripeError as e:
            log.warning(f"[stripe] retrieve_session fallback for {session_id}: {e}")
            # Defensive fallback so the SPA can keep polling without breaking.
            return {
                "session_id": session_id,
                "status": tx.get("status", "unknown"),
                "payment_status": tx.get("payment_status", "unpaid"),
                "amount_total": _eur_amount_to_cents(tx.get("amount", 0)),
                "currency": tx.get("currency", "eur"),
                "metadata": tx.get("metadata", {}),
                "kind": tx.get("kind"),
                "source": "db_fallback",
            }

        s_status = getattr(session, "status", None) or "open"
        s_payment_status = getattr(session, "payment_status", None) or "unpaid"

        if s_payment_status == "paid":
            await _fulfil_paid_session(db, session_id, sdk_status=s_status)
        else:
            await db.payment_transactions.update_one(
                {"session_id": session_id, "payment_status": {"$ne": "paid"}},
                {"$set": {"status": s_status, "payment_status": s_payment_status}},
            )

        # Stripe metadata is a StripeObject; convert it safely.
        md_obj = getattr(session, "metadata", None)
        if md_obj is None:
            md_dict = {}
        elif hasattr(md_obj, "to_dict"):
            md_dict = md_obj.to_dict() or {}
        elif isinstance(md_obj, dict):
            md_dict = dict(md_obj)
        else:
            md_dict = {}

        return {
            "session_id": session_id,
            "status": s_status,
            "payment_status": s_payment_status,
            "amount_total": getattr(session, "amount_total", None),
            "currency": getattr(session, "currency", "eur"),
            "metadata": md_dict,
            "kind": tx.get("kind"),
            "source": "stripe",
        }

    @router.post("/webhook/stripe")
    async def stripe_webhook(request: Request):
        """Stripe → backend webhook. Verifies signature with STRIPE_WEBHOOK_SECRET."""
        body = await request.body()
        signature = request.headers.get("Stripe-Signature", "")

        if not config.STRIPE_WEBHOOK_SECRET:
            log.error("[stripe webhook] STRIPE_WEBHOOK_SECRET not configured")
            raise HTTPException(status_code=503, detail="Webhook non configuré.")

        try:
            event = stripe.Webhook.construct_event(
                payload=body,
                sig_header=signature,
                secret=config.STRIPE_WEBHOOK_SECRET,
            )
        except (ValueError, stripe.error.SignatureVerificationError) as e:
            log.error(f"[stripe webhook] signature error: {e}")
            raise HTTPException(status_code=400, detail="Webhook invalide.")

        event_type = event["type"]
        data_obj = event["data"]["object"]
        session_id = data_obj.get("id")
        payment_status = data_obj.get("payment_status")

        log.info(
            f"[stripe webhook] type={event_type} session={session_id} payment_status={payment_status}"
        )

        if event_type == "checkout.session.completed" and payment_status == "paid":
            await _fulfil_paid_session(db, session_id, sdk_status="complete")
        elif event_type == "checkout.session.expired":
            await db.payment_transactions.update_one(
                {"session_id": session_id, "payment_status": {"$ne": "paid"}},
                {"$set": {"status": "expired", "payment_status": "unpaid"}},
            )
        elif event_type == "checkout.session.async_payment_succeeded" and payment_status == "paid":
            await _fulfil_paid_session(db, session_id, sdk_status="complete")
        else:
            # Mirror status into our record for traceability
            await db.payment_transactions.update_one(
                {"session_id": session_id, "payment_status": {"$ne": "paid"}},
                {"$set": {"status": "webhook_seen"}},
            )

        return {"received": True}

    app.include_router(router)
