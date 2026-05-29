"""Airtable best-effort CRM mirror.

Syncs MongoDB documents (users, bookings, invoices) to the customer's
Airtable workspace. All operations are fire-and-forget and never raise
back to the caller — errors are logged only, so a temporary Airtable
outage cannot block the public API.

Tables (configurable via env, defaults match the customer's setup):
  - AIRTABLE_TABLE_CLIENTS       → "Clients"            (upsert on "Téléphone")
  - AIRTABLE_TABLE_CATALOGUE     → "Catalogue & Tarifs" (read-only, source of truth)
  - AIRTABLE_TABLE_INTERVENTIONS → "Réservations"       (upsert on "Référence")
  - AIRTABLE_TABLE_FACTURES      → "Documents"          (upsert on "Référence")

Field naming follows the French business conventions of the SAP space.
If the customer's Airtable column names differ, errors will appear in
backend logs but the public app keeps working.
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
    # Airtable table names may contain spaces or "&" — must be URL-encoded.
    return f"{AIRTABLE_API}/{config.AIRTABLE_BASE_ID}/{quote(table_name, safe='')}"


async def _upsert(table_name: str, merge_on: list[str], fields: dict[str, Any]) -> None:
    """Upsert a single record. Best-effort: errors only logged."""
    if not _enabled():
        return
    # Skip empty merge keys — would create dupes
    if not any(fields.get(k) for k in merge_on):
        log.warning(f"[airtable {table_name}] skip upsert, all merge keys empty: {merge_on}")
        return
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
                log.error(
                    f"[airtable {table_name}] HTTP {r.status_code}: {r.text[:400]}"
                )
                return
            data = r.json()
            recs = data.get("records") or []
            created = len(data.get("createdRecords") or [])
            updated = len(data.get("updatedRecords") or [])
            log.info(
                f"[airtable {table_name}] upsert ok — created={created} updated={updated} ids={[r.get('id') for r in recs]}"
            )
    except Exception as e:
        log.error(f"[airtable {table_name}] sync failed: {e}")


def _fire(coro):
    """Schedule a coroutine without awaiting it."""
    try:
        asyncio.create_task(coro)
    except RuntimeError:
        # No running loop (e.g. called from a sync context) — run inline.
        asyncio.get_event_loop().run_until_complete(coro)


def _iso(value: Any) -> str | None:
    """Convert a datetime-like value to ISO 8601 string or None."""
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value)


# ---------------------------------------------------------------------------
# Public sync helpers — call these from hot paths, they never raise.
# ---------------------------------------------------------------------------

def sync_client(user: dict) -> None:
    """Push a Client (user) profile to Airtable, upserting on Téléphone."""
    if not _enabled():
        return
    phone = user.get("phone") or ""
    fields = {
        "Téléphone": phone,
        "Prénom": user.get("first_name") or "",
        "Nom": user.get("last_name") or "",
        "Email": user.get("email") or "",
        "Adresse": user.get("address") or "",
        "Détails d'accès": user.get("access_details") or "",
        "ID interne": user.get("id") or "",
        "Créé le": _iso(user.get("created_at")),
    }
    # Strip empty string fields except phone (merge key)
    fields = {k: v for k, v in fields.items() if v not in (None, "") or k == "Téléphone"}
    _fire(_upsert(config.AIRTABLE_TABLE_CLIENTS, ["Téléphone"], fields))


def sync_booking(booking: dict, user: dict | None = None) -> None:
    """Push a Réservation (booking) to Airtable, upserting on Référence."""
    if not _enabled():
        return
    ref = booking.get("ref") or ""
    phone = (user or {}).get("phone") or ""
    fields = {
        "Référence": ref,
        "Téléphone client": phone,
        "Type d'intervention": booking.get("device_id") or "",
        "Symptôme": booking.get("symptom") or "",
        "Date": booking.get("date") or "",
        "Créneau": booking.get("time_window") or "",
        "Statut": booking.get("status") or "",
        "Adresse": booking.get("address") or "",
        "ID interne": booking.get("id") or "",
        "Créé le": _iso(booking.get("created_at")),
    }
    if booking.get("cancelled_at"):
        fields["Annulée le"] = _iso(booking["cancelled_at"])
    if booking.get("field_notes"):
        fields["Notes terrain"] = booking["field_notes"]
    if booking.get("actual_hours") is not None:
        fields["Heures réelles"] = float(booking["actual_hours"])
    fields = {k: v for k, v in fields.items() if v not in (None, "") or k == "Référence"}
    _fire(_upsert(config.AIRTABLE_TABLE_INTERVENTIONS, ["Référence"], fields))


def sync_invoice(invoice: dict, user: dict | None = None) -> None:
    """Push a Document/Facture to Airtable, upserting on Référence."""
    if not _enabled():
        return
    ref = invoice.get("ref") or ""
    phone = (user or {}).get("phone") or ""
    fields = {
        "Référence": ref,
        "Téléphone client": phone,
        "Intitulé": invoice.get("label") or "",
        "Date": invoice.get("date") or "",
        "Heures": float(invoice.get("hours") or 0),
        "Total HT": float(invoice.get("base_total") or 0),
        "Net après SAP": float(invoice.get("net_total") or 0),
        "Payée": bool(invoice.get("paid", False)),
        "ID interne": invoice.get("id") or "",
        "Créé le": _iso(invoice.get("created_at")),
    }
    if invoice.get("paid_at"):
        fields["Payée le"] = _iso(invoice["paid_at"])
    fields = {k: v for k, v in fields.items() if v not in (None, "") or k in {"Référence", "Payée"}}
    _fire(_upsert(config.AIRTABLE_TABLE_FACTURES, ["Référence"], fields))


# ---------------------------------------------------------------------------
# Admin helpers — list Airtable content (read-only)
# ---------------------------------------------------------------------------

async def list_catalogue() -> list[dict]:
    """Read the Catalogue & Tarifs table (source of truth for prices).

    Returns the records as Airtable returns them (each is {"id", "fields", ...}).
    Empty list if Airtable is disabled or fails.
    """
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
