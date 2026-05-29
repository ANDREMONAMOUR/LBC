"""Airtable best-effort CRM mirror — aligned on the customer's actual schema.

Base : "Gestion Assistance Informatique - Le Bon Clic" (app0ta8fnXfV0SSi0).

Tables and fields (verified via meta API):
  • Clients
      - Téléphone, Prénom, Nom, Email, "Adresse postale complète",
        "Précisions d'accès", "Statut Profil", "ID interne"
      → Upsert key: Téléphone

  • Réservations
      - "ID Réservation", Client (link → Clients), "Symptôme signalé",
        "Date de l'intervention" (text), Statut (singleSelect), "Notes privées"
      → Upsert key: "ID Réservation"

  • Documents
      - "ID Document", Type (singleSelect), Client (link), "Réservation liée" (link),
        "Montant TTC" (currency), Statut (singleSelect), "Date d'émission"
      → Upsert key: "ID Document"

  • Catalogue & Tarifs — read-only

All write ops are fire-and-forget; errors are logged only.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime
from typing import Any
from urllib.parse import quote

import httpx

import config

log = logging.getLogger("airtable")

AIRTABLE_API = "https://api.airtable.com/v0"


def _enabled() -> bool:
    return bool(
        config.AIRTABLE_SYNC_ENABLED
        and config.AIRTABLE_PAT
        and config.AIRTABLE_BASE_ID
    )


def _headers() -> dict[str, str]:
    return {
        "Authorization": f"Bearer {config.AIRTABLE_PAT}",
        "Content-Type": "application/json",
    }


def _table_url(table_name: str) -> str:
    return f"{AIRTABLE_API}/{config.AIRTABLE_BASE_ID}/{quote(table_name, safe='')}"


def _iso(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value)


def _fire(coro):
    """Schedule a coroutine without awaiting it (fire-and-forget)."""
    try:
        asyncio.create_task(coro)
    except RuntimeError:
        asyncio.get_event_loop().run_until_complete(coro)


async def _find_record_id(table_name: str, field: str, value: str) -> str | None:
    """Look up a record id by exact field match. None on failure."""
    if not value:
        return None
    url = _table_url(table_name)
    # Use filterByFormula with proper escaping for the value
    safe_value = value.replace("'", "\\'")
    params = {
        "filterByFormula": f"{{{field}}} = '{safe_value}'",
        "maxRecords": 1,
        "fields[]": field,
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(url, headers=_headers(), params=params)
            if r.status_code >= 400:
                log.warning(f"[airtable lookup {table_name}.{field}={value!r}] HTTP {r.status_code}: {r.text[:200]}")
                return None
            records = (r.json() or {}).get("records") or []
            return records[0]["id"] if records else None
    except Exception as e:
        log.warning(f"[airtable lookup {table_name}.{field}={value!r}] failed: {e}")
        return None


async def _upsert(table_name: str, merge_on: list[str], fields: dict[str, Any]) -> dict | None:
    """Upsert one record on the given key fields. Returns the upserted record or None."""
    if not _enabled():
        return None
    if not any(fields.get(k) for k in merge_on):
        log.warning(f"[airtable {table_name}] skip upsert, empty merge keys {merge_on}")
        return None
    url = _table_url(table_name)
    body = {
        "performUpsert": {"fieldsToMergeOn": merge_on},
        "records": [{"fields": fields}],
        "typecast": True,
    }
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.patch(url, headers=_headers(), json=body)
            if r.status_code >= 400:
                log.error(f"[airtable {table_name}] HTTP {r.status_code}: {r.text[:500]}")
                return None
            data = r.json()
            recs = data.get("records") or []
            created = len(data.get("createdRecords") or [])
            updated = len(data.get("updatedRecords") or [])
            log.info(
                f"[airtable {table_name}] upsert ok — created={created} updated={updated} id={recs[0].get('id') if recs else None}"
            )
            return recs[0] if recs else None
    except Exception as e:
        log.error(f"[airtable {table_name}] sync failed: {e}")
        return None


# ---------------------------------------------------------------------------
# Status mappers (internal → Airtable singleSelect values)
# ---------------------------------------------------------------------------

_BOOKING_STATUS_FR = {
    "confirmed":   "Confirmée",
    "in_progress": "En cours",
    "completed":   "Réalisée",
    "cancelled":   "Annulée",
}

_INVOICE_STATUS_FR = {
    True:  "Payée",
    False: "À régler",
}


# ---------------------------------------------------------------------------
# Async core syncs
# ---------------------------------------------------------------------------

async def _sync_client_async(user: dict) -> str | None:
    """Upsert a Client and return its Airtable record id."""
    phone = (user.get("phone") or "").strip()
    if not phone:
        return None
    profile_complete = bool(user.get("profile_complete"))
    fields = {
        "Téléphone": phone,
        "Prénom": user.get("first_name") or "",
        "Nom": user.get("last_name") or "",
        "Email": user.get("email") or "",
        "Adresse postale complète": user.get("address") or "",
        "Précisions d'accès": user.get("access_details") or "",
        "Statut Profil": "Complet" if profile_complete else "Incomplet",
        "ID interne": user.get("id") or "",
    }
    fields = {k: v for k, v in fields.items() if v not in (None, "") or k == "Téléphone"}
    rec = await _upsert(config.AIRTABLE_TABLE_CLIENTS, ["Téléphone"], fields)
    return rec.get("id") if rec else None


async def _sync_booking_async(booking: dict, user: dict | None = None) -> str | None:
    """Upsert a Réservation. Resolves linked Client by phone."""
    ref = booking.get("ref") or ""
    if not ref:
        return None
    fields = {
        "ID Réservation": ref,
        "Symptôme signalé": booking.get("symptom") or "",
        "Date de l'intervention": f"{booking.get('date','')} {booking.get('time_window','')}".strip(),
        "Statut": _BOOKING_STATUS_FR.get(booking.get("status"), booking.get("status") or ""),
    }
    if booking.get("field_notes"):
        fields["Notes privées"] = booking["field_notes"]

    # Link to Client via phone lookup (best effort)
    if user and user.get("phone"):
        # Make sure the client exists in Airtable first
        client_rec_id = await _sync_client_async(user)
        if client_rec_id:
            fields["Client"] = [client_rec_id]

    fields = {k: v for k, v in fields.items() if v not in (None, "") or k == "ID Réservation"}
    rec = await _upsert(config.AIRTABLE_TABLE_INTERVENTIONS, ["ID Réservation"], fields)
    return rec.get("id") if rec else None


async def _sync_invoice_async(invoice: dict, user: dict | None = None) -> str | None:
    """Upsert a Document (facture). Links Client + Réservation when available."""
    ref = invoice.get("ref") or ""
    if not ref:
        return None
    fields = {
        "ID Document": ref,
        "Type": "Facture",
        "Date d'émission": invoice.get("date") or "",
        "Montant TTC": float(invoice.get("base_total") or 0),
        "Statut": _INVOICE_STATUS_FR[bool(invoice.get("paid", False))],
    }

    # Link to Client
    if user and user.get("phone"):
        client_rec_id = await _sync_client_async(user)
        if client_rec_id:
            fields["Client"] = [client_rec_id]

    # Link to Réservation if booking_id available
    booking_id = invoice.get("booking_id")
    if booking_id:
        # The Airtable Réservation key is the booking ref, not internal id.
        # We must look it up via the linked booking doc — but to keep this
        # lean we accept the caller passing booking_ref directly via invoice["_booking_ref"].
        booking_ref = invoice.get("_booking_ref")
        if booking_ref:
            booking_rec_id = await _find_record_id(
                config.AIRTABLE_TABLE_INTERVENTIONS, "ID Réservation", booking_ref
            )
            if booking_rec_id:
                fields["Réservation liée"] = [booking_rec_id]

    fields = {k: v for k, v in fields.items() if v not in (None, "") or k == "ID Document"}
    rec = await _upsert(config.AIRTABLE_TABLE_FACTURES, ["ID Document"], fields)
    return rec.get("id") if rec else None


# ---------------------------------------------------------------------------
# Public fire-and-forget helpers
# ---------------------------------------------------------------------------

def sync_client(user: dict) -> None:
    if not _enabled():
        return
    _fire(_sync_client_async(user))


def sync_booking(booking: dict, user: dict | None = None) -> None:
    if not _enabled():
        return
    _fire(_sync_booking_async(booking, user))


def sync_invoice(invoice: dict, user: dict | None = None) -> None:
    if not _enabled():
        return
    _fire(_sync_invoice_async(invoice, user))


# ---------------------------------------------------------------------------
# Read helpers — Catalogue & Tarifs is the source of truth
# ---------------------------------------------------------------------------

async def list_catalogue() -> list[dict]:
    """Read the Catalogue & Tarifs table (read-only). Empty list on failure."""
    if not _enabled():
        return []
    url = _table_url(config.AIRTABLE_TABLE_CATALOGUE)
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.get(url, headers=_headers())
            r.raise_for_status()
            data = r.json()
            return data.get("records") or []
    except Exception as e:
        log.error(f"[airtable catalogue] fetch failed: {e}")
        return []
