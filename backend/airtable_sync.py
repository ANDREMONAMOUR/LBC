"""
Airtable CRM mirror — best-effort, fire-and-forget sync from MongoDB.

Tables (Base appEHw6wjOrkHYhWw):
  - Clients         (clé: Telephone)        ← users
  - Catalogue       (clé: Service_Nom)      ← static device catalog
  - Interventions   (clé: Materiel + Client)← bookings
  - Factures        (clé: Numero Facture)   ← invoices

All functions are awaitable. Errors are logged but never raised.
The caller wraps calls with `_fire(...)` for fire-and-forget.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, Optional

import httpx

import config

log = logging.getLogger("airtable")

API_URL = "https://api.airtable.com/v0"

# Friendly labels for the 4 device categories
DEVICE_LABELS: Dict[str, Dict[str, Any]] = {
    "pc":       {"name": "Dépannage PC / Mac",            "base": 80.0, "net": 40.0, "sap": True},
    "mobile":   {"name": "Smartphone / Tablette",          "base": 80.0, "net": 40.0, "sap": True},
    "box":      {"name": "Box Internet / Wi-Fi",           "base": 80.0, "net": 40.0, "sap": True},
    "security": {"name": "Sécurité informatique / Logiciel", "base": 80.0, "net": 40.0, "sap": True},
}

# Map app booking status → Airtable Statut_RDV single select
STATUS_MAP = {
    "confirmed": "Confirmé",
    "cancelled": "Annulé",
    "completed": "Réalisé",
    "pending":   "A planifier",
}

# In-memory cache: device_id → airtable record id for Catalogue
_catalogue_cache: Dict[str, str] = {}


def _enabled() -> bool:
    return bool(
        config.AIRTABLE_SYNC_ENABLED
        and config.AIRTABLE_PAT
        and config.AIRTABLE_BASE_ID
    )


def _headers() -> Dict[str, str]:
    return {
        "Authorization": f"Bearer {config.AIRTABLE_PAT}",
        "Content-Type": "application/json",
    }


def _url(table_name: str, record_id: Optional[str] = None) -> str:
    base = f"{API_URL}/{config.AIRTABLE_BASE_ID}/{table_name}"
    return f"{base}/{record_id}" if record_id else base


async def _find_one(
    client: httpx.AsyncClient,
    table: str,
    formula: str,
) -> Optional[Dict[str, Any]]:
    """Find a single record by Airtable filterByFormula."""
    try:
        r = await client.get(
            _url(table),
            params={"filterByFormula": formula, "maxRecords": 1, "pageSize": 1},
            headers=_headers(),
            timeout=15.0,
        )
        r.raise_for_status()
        records = r.json().get("records", [])
        return records[0] if records else None
    except Exception as e:
        log.warning(f"[airtable] find {table} failed: {e}")
        return None


async def _create(
    client: httpx.AsyncClient,
    table: str,
    fields: Dict[str, Any],
) -> Optional[str]:
    """Create a single record. Returns Airtable record id or None."""
    try:
        # Use typecast=true to allow Airtable to coerce strings into single-selects, dates, etc.
        r = await client.post(
            _url(table),
            json={"fields": fields, "typecast": True},
            headers=_headers(),
            timeout=15.0,
        )
        r.raise_for_status()
        rec_id = r.json().get("id")
        log.info(f"[airtable] created {table} id={rec_id}")
        return rec_id
    except httpx.HTTPStatusError as e:
        log.warning(
            f"[airtable] create {table} HTTP {e.response.status_code}: "
            f"{e.response.text[:300]}"
        )
        return None
    except Exception as e:
        log.warning(f"[airtable] create {table} failed: {e}")
        return None


async def _update(
    client: httpx.AsyncClient,
    table: str,
    record_id: str,
    fields: Dict[str, Any],
) -> bool:
    """PATCH update (partial). Returns True on success."""
    try:
        r = await client.patch(
            _url(table, record_id),
            json={"fields": fields, "typecast": True},
            headers=_headers(),
            timeout=15.0,
        )
        r.raise_for_status()
        return True
    except httpx.HTTPStatusError as e:
        log.warning(
            f"[airtable] update {table}/{record_id} HTTP {e.response.status_code}: "
            f"{e.response.text[:300]}"
        )
        return False
    except Exception as e:
        log.warning(f"[airtable] update {table}/{record_id} failed: {e}")
        return False


def _escape_formula_string(s: str) -> str:
    """Escape characters dangerous in Airtable formula string literals."""
    return (s or "").replace("\\", "\\\\").replace('"', '\\"')


# ---------------------- public API ----------------------

async def ensure_client(user: Dict[str, Any]) -> Optional[str]:
    """
    Find client in Airtable by Telephone. If absent → create. If present → patch.
    Returns the Airtable record id, or None on failure.
    """
    if not _enabled():
        return None

    phone = user.get("phone") or ""
    if not phone:
        return None

    first = (user.get("first_name") or "").strip()
    last = (user.get("last_name") or "").strip()
    nom_complet = (first + " " + last).strip() or phone

    fields = {
        "Telephone": phone,
        "Prenom": first,
        "Nom": last,
        "Email": (user.get("email") or "").strip(),
        "Adresse_Postale": (user.get("address") or "").strip(),
        "Acces_Logistique": (user.get("access_details") or "").strip(),
        "Nom Complet": nom_complet,
    }

    async with httpx.AsyncClient() as client:
        existing_id = user.get("airtable_id")
        if existing_id:
            ok = await _update(client, config.AIRTABLE_TABLE_CLIENTS, existing_id, fields)
            return existing_id if ok else None

        # Search by phone (primary field)
        formula = f'{{Telephone}} = "{_escape_formula_string(phone)}"'
        existing = await _find_one(client, config.AIRTABLE_TABLE_CLIENTS, formula)
        if existing:
            rec_id = existing["id"]
            await _update(client, config.AIRTABLE_TABLE_CLIENTS, rec_id, fields)
            return rec_id

        return await _create(client, config.AIRTABLE_TABLE_CLIENTS, fields)


async def ensure_service(device_id: str) -> Optional[str]:
    """Get-or-create a row in Catalogue for the given device_id. Cached in memory."""
    if not _enabled():
        return None
    if device_id in _catalogue_cache:
        return _catalogue_cache[device_id]

    spec = DEVICE_LABELS.get(device_id)
    if not spec:
        return None

    async with httpx.AsyncClient() as client:
        formula = f'{{Service_Nom}} = "{_escape_formula_string(spec["name"])}"'
        existing = await _find_one(client, config.AIRTABLE_TABLE_CATALOGUE, formula)
        if existing:
            rec_id = existing["id"]
            _catalogue_cache[device_id] = rec_id
            return rec_id

        fields = {
            "Service_Nom": spec["name"],
            "Prix_TTC": spec["base"],
            "Prix Net SAP": spec["net"],
            "Eligible_SAP": spec["sap"],
        }
        rec_id = await _create(client, config.AIRTABLE_TABLE_CATALOGUE, fields)
        if rec_id:
            _catalogue_cache[device_id] = rec_id
        return rec_id


async def sync_booking(
    booking: Dict[str, Any],
    user: Dict[str, Any],
    client_record_id: Optional[str] = None,
    service_record_id: Optional[str] = None,
) -> Optional[str]:
    """Create or update an Intervention row. Returns airtable record id."""
    if not _enabled():
        return None

    # Resolve links if not provided
    if client_record_id is None:
        client_record_id = await ensure_client(user)
    if service_record_id is None:
        service_record_id = await ensure_service(booking.get("device_id", ""))

    fields: Dict[str, Any] = {
        "Materiel": booking.get("ref") or booking.get("id", ""),
        "Symptome": (booking.get("symptom") or "")[:1000],
        "Date_RDV": booking.get("date") or "",
        "Creneau": booking.get("time_window") or "",
        "Statut_RDV": STATUS_MAP.get(booking.get("status", "confirmed"), "Confirmé"),
    }
    if client_record_id:
        fields["Client"] = [client_record_id]
    if service_record_id:
        fields["Service"] = [service_record_id]

    async with httpx.AsyncClient() as client:
        existing_id = booking.get("airtable_id")
        if existing_id:
            ok = await _update(client, config.AIRTABLE_TABLE_INTERVENTIONS, existing_id, fields)
            return existing_id if ok else None

        # Try find by ref
        ref = booking.get("ref") or ""
        if ref:
            formula = f'{{Materiel}} = "{_escape_formula_string(ref)}"'
            existing = await _find_one(client, config.AIRTABLE_TABLE_INTERVENTIONS, formula)
            if existing:
                rec_id = existing["id"]
                await _update(client, config.AIRTABLE_TABLE_INTERVENTIONS, rec_id, fields)
                return rec_id

        return await _create(client, config.AIRTABLE_TABLE_INTERVENTIONS, fields)


async def sync_invoice(
    invoice: Dict[str, Any],
    intervention_record_id: Optional[str] = None,
) -> Optional[str]:
    """Create or update a Facture row. Returns airtable record id."""
    if not _enabled():
        return None

    fields: Dict[str, Any] = {
        "Numero Facture": invoice.get("ref") or invoice.get("id", ""),
        "Montant": float(invoice.get("net_total") or invoice.get("base_total") or 0),
        "Statut Paiement": "Payé" if invoice.get("paid") else "En attente",
    }
    if intervention_record_id:
        fields["Intervention"] = [intervention_record_id]

    async with httpx.AsyncClient() as client:
        existing_id = invoice.get("airtable_id")
        if existing_id:
            ok = await _update(client, config.AIRTABLE_TABLE_FACTURES, existing_id, fields)
            return existing_id if ok else None

        ref = invoice.get("ref") or ""
        if ref:
            formula = f'{{Numero Facture}} = "{_escape_formula_string(ref)}"'
            existing = await _find_one(client, config.AIRTABLE_TABLE_FACTURES, formula)
            if existing:
                rec_id = existing["id"]
                await _update(client, config.AIRTABLE_TABLE_FACTURES, rec_id, fields)
                return rec_id

        return await _create(client, config.AIRTABLE_TABLE_FACTURES, fields)


# ---------------------- high-level wrappers (used by server.py) ----------------------

async def push_user(db, user: Dict[str, Any]) -> None:
    """Push a user profile to Airtable Clients. Cache the airtable_id in Mongo."""
    if not _enabled():
        return
    rec_id = await ensure_client(user)
    if rec_id and rec_id != user.get("airtable_id"):
        try:
            await db.users.update_one({"id": user["id"]}, {"$set": {"airtable_id": rec_id}})
        except Exception as e:
            log.warning(f"[airtable] persist user.airtable_id failed: {e}")


async def push_booking(db, booking: Dict[str, Any], user: Dict[str, Any]) -> None:
    """Push a booking to Airtable Interventions + ensure Client + Service rows. Cache id in Mongo."""
    if not _enabled():
        return
    client_id = await ensure_client(user)
    if client_id and client_id != user.get("airtable_id"):
        try:
            await db.users.update_one({"id": user["id"]}, {"$set": {"airtable_id": client_id}})
        except Exception as e:
            log.warning(f"[airtable] persist user.airtable_id failed: {e}")

    service_id = await ensure_service(booking.get("device_id", ""))

    rec_id = await sync_booking(booking, user, client_id, service_id)
    if rec_id and rec_id != booking.get("airtable_id"):
        try:
            await db.bookings.update_one({"id": booking["id"]}, {"$set": {"airtable_id": rec_id}})
        except Exception as e:
            log.warning(f"[airtable] persist booking.airtable_id failed: {e}")


async def push_invoice(db, invoice: Dict[str, Any]) -> None:
    """Push an invoice to Airtable Factures. If linked booking has an airtable_id, link it."""
    if not _enabled():
        return

    intervention_rec_id: Optional[str] = None
    booking_id = invoice.get("booking_id")
    if booking_id:
        booking = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
        if booking:
            intervention_rec_id = booking.get("airtable_id")
            if not intervention_rec_id:
                # try to push the booking on-the-fly
                user = await db.users.find_one({"id": booking.get("user_id")}, {"_id": 0})
                if user:
                    await push_booking(db, booking, user)
                    booking = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
                    intervention_rec_id = (booking or {}).get("airtable_id")

    rec_id = await sync_invoice(invoice, intervention_rec_id)
    if rec_id and rec_id != invoice.get("airtable_id"):
        try:
            await db.invoices.update_one({"id": invoice["id"]}, {"$set": {"airtable_id": rec_id}})
        except Exception as e:
            log.warning(f"[airtable] persist invoice.airtable_id failed: {e}")
