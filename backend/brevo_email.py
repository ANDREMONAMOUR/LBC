"""Brevo Transactional Email sender.

Docs: https://developers.brevo.com/reference/sendtransacemail

Provides:
  - send_booking_created_email
  - send_booking_updated_email
  - send_booking_cancelled_email
  - send_invoice_ready_email
  - send_reminder_j1_email

All sends are best-effort: never raise to the caller. Failures are logged.
"""
from __future__ import annotations

import logging
from typing import Optional

import httpx

import config

log = logging.getLogger("brevo_email")

BREVO_EMAIL_URL = "https://api.brevo.com/v3/smtp/email"

# Le Bon Clic brand palette (kept minimal for inline email styles)
BRAND_PRIMARY = "#1f2937"   # ink-800
BRAND_ACCENT = "#06b6d4"    # cyan
BRAND_PURPLE = "#8b5cf6"
BRAND_BG = "#f9fafb"
BRAND_CARD = "#ffffff"
BRAND_TEXT = "#0f172a"
BRAND_MUTED = "#6b7280"


DEVICE_LABEL = {
    "pc": "Ordinateur (Mac/PC)",
    "mobile": "Smartphone & Tablette",
    "box": "Internet & P\u00e9riph\u00e9riques",
    "security": "Comptes & S\u00e9curit\u00e9",
}


def _fmt_date_fr(date_iso: str) -> str:
    """Convert YYYY-MM-DD to e.g. 'mardi 14 mai 2026'."""
    try:
        from datetime import date
        d = date.fromisoformat(date_iso)
    except Exception:
        return date_iso
    days = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"]
    months = [
        "janvier", "f\u00e9vrier", "mars", "avril", "mai", "juin",
        "juillet", "ao\u00fbt", "septembre", "octobre", "novembre", "d\u00e9cembre",
    ]
    return f"{days[d.weekday()]} {d.day} {months[d.month - 1]} {d.year}"


def _user_display_name(user: dict) -> str:
    fn = (user.get("first_name") or "").strip()
    ln = (user.get("last_name") or "").strip()
    full = f"{fn} {ln}".strip()
    return full or "client"


def _shell(title: str, lead: str, body_html: str, cta_text: Optional[str] = None) -> str:
    """Build a senior-friendly HTML email shell. Large fonts, high contrast."""
    cta_block = ""
    if cta_text:
        cta_block = f"""
        <div style="margin: 24px 0 8px 0;">
          <span style="display:inline-block;background:{BRAND_PRIMARY};color:#fff;
                       font-weight:bold;font-size:18px;padding:14px 22px;border-radius:12px;
                       font-family: Arial, Helvetica, sans-serif;">{cta_text}</span>
        </div>
        """
    return f"""<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"><title>{title}</title></head>
<body style="margin:0;padding:0;background:{BRAND_BG};font-family:Arial,Helvetica,sans-serif;color:{BRAND_TEXT};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:{BRAND_BG};padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0"
             style="max-width:600px;width:100%;background:{BRAND_CARD};
                    border-radius:16px;padding:32px;
                    box-shadow:0 1px 3px rgba(0,0,0,0.06);">
        <tr><td>
          <div style="font-size:14px;color:{BRAND_MUTED};letter-spacing:0.08em;text-transform:uppercase;">Le Bon Clic</div>
          <h1 style="font-size:26px;margin:8px 0 16px 0;color:{BRAND_PRIMARY};line-height:1.25;">{title}</h1>
          <p style="font-size:18px;line-height:1.6;margin:0 0 16px 0;">{lead}</p>
          <div style="font-size:17px;line-height:1.7;">{body_html}</div>
          {cta_block}
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:28px 0;">
          <p style="font-size:14px;color:{BRAND_MUTED};margin:0 0 6px 0;">
            Une question&nbsp;? Contactez Jordan&nbsp;:
            <strong>{config.COMPANY_SVI}</strong> &middot;
            <a href="mailto:{config.COMPANY_EMAIL}" style="color:{BRAND_ACCENT};">{config.COMPANY_EMAIL}</a>
          </p>
          <p style="font-size:12px;color:{BRAND_MUTED};margin:6px 0 0 0;">
            {config.COMPANY_NAME} &middot; {config.COMPANY_ADDRESS} &middot; SIRET {config.COMPANY_SIRET}
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>"""


def _booking_facts_html(booking: dict, user: dict) -> str:
    device = DEVICE_LABEL.get(booking.get("device_id", ""), booking.get("device_id", ""))
    address = user.get("address") or booking.get("address") or "\u2014"
    facts = [
        ("R\u00e9f\u00e9rence", booking.get("ref") or booking.get("id", "")[:8]),
        ("Date", _fmt_date_fr(booking.get("date", ""))),
        ("Cr\u00e9neau", booking.get("time_window", "")),
        ("Appareil", device),
        ("Adresse", address),
    ]
    rows = "".join(
        f"<tr><td style='padding:6px 12px 6px 0;color:{BRAND_MUTED};font-size:15px;'>{k}</td>"
        f"<td style='padding:6px 0;font-weight:bold;font-size:17px;'>{v}</td></tr>"
        for k, v in facts
    )
    return f"<table cellpadding='0' cellspacing='0' role='presentation'>{rows}</table>"


async def _send(
    *,
    to_email: str,
    to_name: str,
    subject: str,
    html_content: str,
    text_content: str,
    tag: str,
) -> Optional[dict]:
    if not to_email:
        log.warning(f"[email:{tag}] missing recipient, skipped")
        return None
    if config.SMS_DEV_MODE or not config.BREVO_API_KEY:
        log.warning(f"[email:{tag} DEV] would send to {to_email}: {subject}")
        return {"status": "dev_mode"}

    payload = {
        "sender": {
            "name": config.COMPANY_NAME,
            "email": config.COMPANY_EMAIL,
        },
        "to": [{"email": to_email, "name": to_name or to_email}],
        "replyTo": {"email": config.COMPANY_EMAIL, "name": config.COMPANY_NAME},
        "subject": subject,
        "htmlContent": html_content,
        "textContent": text_content,
        "tags": [tag],
    }
    headers = {
        "accept": "application/json",
        "content-type": "application/json",
        "api-key": config.BREVO_API_KEY,
    }
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.post(BREVO_EMAIL_URL, headers=headers, json=payload)
            r.raise_for_status()
            data = r.json()
            log.info(
                f"[email:{tag}] sent to {to_email}: messageId={data.get('messageId')}"
            )
            return data
    except httpx.HTTPStatusError as e:
        log.error(
            f"[email:{tag}] HTTP {e.response.status_code} for {to_email}: {e.response.text}"
        )
        return None
    except Exception as e:
        log.error(f"[email:{tag}] failed for {to_email}: {e}")
        return None


# ===== Event-specific helpers =====

async def send_booking_created_email(booking: dict, user: dict) -> Optional[dict]:
    name = _user_display_name(user)
    subject = f"Votre rendez-vous est confirm\u00e9 \u2014 {booking.get('ref','')}"
    facts = _booking_facts_html(booking, user)
    lead = (
        f"Bonjour {name}, c'est confirm\u00e9 : Jordan vient chez vous "
        f"<strong>{_fmt_date_fr(booking.get('date',''))}</strong>, sur le cr\u00e9neau "
        f"<strong>{booking.get('time_window','')}</strong>."
    )
    body = (
        "<p style='margin:0 0 12px 0;'>Voici le r\u00e9capitulatif&nbsp;:</p>"
        f"{facts}"
        "<p style='margin:18px 0 0 0;'>Jordan vous appellera quelques minutes avant son arriv\u00e9e."
        " Pensez \u00e0 brancher votre appareil pour gagner du temps.</p>"
    )
    html = _shell("Rendez-vous confirm\u00e9", lead, body, cta_text="Voir mon espace client")
    text = (
        f"Bonjour {name},\n"
        f"Votre rendez-vous est confirm\u00e9.\n"
        f"R\u00e9f : {booking.get('ref','')}\n"
        f"Date : {_fmt_date_fr(booking.get('date',''))}\n"
        f"Cr\u00e9neau : {booking.get('time_window','')}\n"
        f"Adresse : {user.get('address','')}\n\n"
        f"Une question ? {config.COMPANY_SVI} \u2014 {config.COMPANY_EMAIL}\n"
    )
    return await _send(
        to_email=user.get("email", ""),
        to_name=name,
        subject=subject,
        html_content=html,
        text_content=text,
        tag="booking_created",
    )


async def send_booking_updated_email(booking: dict, user: dict) -> Optional[dict]:
    name = _user_display_name(user)
    subject = f"Votre rendez-vous a \u00e9t\u00e9 modifi\u00e9 \u2014 {booking.get('ref','')}"
    facts = _booking_facts_html(booking, user)
    lead = (
        f"Bonjour {name}, votre rendez-vous a bien \u00e9t\u00e9 mis \u00e0 jour. "
        f"Voici les nouveaux d\u00e9tails&nbsp;:"
    )
    body = (
        f"{facts}"
        "<p style='margin:18px 0 0 0;'>Si cette modification ne vient pas de vous,"
        f" appelez Jordan au <strong>{config.COMPANY_SVI}</strong>.</p>"
    )
    html = _shell("Rendez-vous modifi\u00e9", lead, body, cta_text="Voir mon espace client")
    text = (
        f"Bonjour {name},\n"
        f"Votre rendez-vous a \u00e9t\u00e9 mis \u00e0 jour.\n"
        f"R\u00e9f : {booking.get('ref','')}\n"
        f"Date : {_fmt_date_fr(booking.get('date',''))}\n"
        f"Cr\u00e9neau : {booking.get('time_window','')}\n"
    )
    return await _send(
        to_email=user.get("email", ""),
        to_name=name,
        subject=subject,
        html_content=html,
        text_content=text,
        tag="booking_updated",
    )


async def send_booking_cancelled_email(booking: dict, user: dict) -> Optional[dict]:
    name = _user_display_name(user)
    subject = f"Votre rendez-vous a \u00e9t\u00e9 annul\u00e9 \u2014 {booking.get('ref','')}"
    lead = (
        f"Bonjour {name}, votre rendez-vous du "
        f"<strong>{_fmt_date_fr(booking.get('date',''))}</strong> "
        f"({booking.get('time_window','')}) a bien \u00e9t\u00e9 annul\u00e9."
    )
    body = (
        "<p style='margin:0 0 12px 0;'>Aucune somme ne vous sera factur\u00e9e."
        " Vous pouvez reprendre rendez-vous \u00e0 tout moment depuis votre espace client.</p>"
        "<p style='margin:12px 0 0 0;'>Si cette annulation n'est pas de votre fait,"
        f" merci d'appeler Jordan au <strong>{config.COMPANY_SVI}</strong>.</p>"
    )
    html = _shell("Rendez-vous annul\u00e9", lead, body, cta_text="Reprendre rendez-vous")
    text = (
        f"Bonjour {name},\n"
        f"Votre rendez-vous a \u00e9t\u00e9 annul\u00e9.\n"
        f"R\u00e9f : {booking.get('ref','')}\n"
        f"Date initiale : {_fmt_date_fr(booking.get('date',''))} {booking.get('time_window','')}\n\n"
        f"Reprenez rendez-vous quand vous le souhaitez : {config.COMPANY_SVI}\n"
    )
    return await _send(
        to_email=user.get("email", ""),
        to_name=name,
        subject=subject,
        html_content=html,
        text_content=text,
        tag="booking_cancelled",
    )


async def send_invoice_ready_email(invoice: dict, user: dict) -> Optional[dict]:
    name = _user_display_name(user)
    ref = invoice.get("ref") or invoice.get("id", "")[:8]
    subject = f"Votre facture {ref} est disponible"
    net = invoice.get("net_total", 0)
    base = invoice.get("base_total", 0)
    lead = (
        f"Bonjour {name}, votre facture est disponible dans votre espace client."
    )
    body = (
        f"<p style='margin:0 0 8px 0;'><strong>R\u00e9f\u00e9rence&nbsp;:</strong> {ref}</p>"
        f"<p style='margin:0 0 8px 0;'><strong>Prestation&nbsp;:</strong> {invoice.get('label','')}</p>"
        f"<p style='margin:0 0 8px 0;'><strong>Date&nbsp;:</strong> {_fmt_date_fr(invoice.get('date',''))}</p>"
        f"<p style='margin:0 0 8px 0;'><strong>Montant net (apr\u00e8s -50% SAP)&nbsp;:</strong> "
        f"<span style='color:{BRAND_ACCENT};font-weight:bold;'>{net:.2f} \u20ac</span> "
        f"<span style='color:{BRAND_MUTED};font-size:14px;'>(brut {base:.2f} \u20ac)</span></p>"
        "<p style='margin:16px 0 0 0;'>Vous pouvez t\u00e9l\u00e9charger le PDF officiel depuis l'onglet Factures.</p>"
    )
    html = _shell("Facture disponible", lead, body, cta_text="T\u00e9l\u00e9charger ma facture")
    text = (
        f"Bonjour {name},\n"
        f"Votre facture {ref} est disponible (montant net : {net:.2f} EUR).\n"
        f"Connectez-vous \u00e0 votre espace client pour la t\u00e9l\u00e9charger en PDF.\n"
    )
    return await _send(
        to_email=user.get("email", ""),
        to_name=name,
        subject=subject,
        html_content=html,
        text_content=text,
        tag="invoice_ready",
    )


async def send_reminder_j1_email(booking: dict, user: dict) -> Optional[dict]:
    name = _user_display_name(user)
    subject = f"Rappel : votre rendez-vous est demain \u2014 {booking.get('ref','')}"
    facts = _booking_facts_html(booking, user)
    lead = (
        f"Bonjour {name}, juste un petit mot pour vous rappeler votre rendez-vous "
        f"<strong>demain</strong>, sur le cr\u00e9neau "
        f"<strong>{booking.get('time_window','')}</strong>."
    )
    body = (
        f"{facts}"
        "<p style='margin:18px 0 0 0;font-size:17px;'>"
        "<strong>Pour gagner du temps&nbsp;:</strong><br>"
        "\u2022 Branchez votre appareil sur secteur<br>"
        "\u2022 V\u00e9rifiez que la box est allum\u00e9e<br>"
        "\u2022 Pr\u00e9parez un acc\u00e8s libre \u00e0 l'ordinateur</p>"
        f"<p style='margin:14px 0 0 0;color:{BRAND_MUTED};'>Si un imprev\u00fc surgit, "
        f"appelez Jordan au <strong>{config.COMPANY_SVI}</strong>.</p>"
    )
    html = _shell("Rappel \u2014 rendez-vous demain", lead, body, cta_text="Voir mon espace client")
    text = (
        f"Bonjour {name},\n"
        f"Rappel : rendez-vous DEMAIN, cr\u00e9neau {booking.get('time_window','')}.\n"
        f"R\u00e9f : {booking.get('ref','')}\n"
        f"Adresse : {user.get('address','')}\n"
        "Branchez votre appareil et pr\u00e9parez la box. \u00c0 demain !\n"
    )
    return await _send(
        to_email=user.get("email", ""),
        to_name=name,
        subject=subject,
        html_content=html,
        text_content=text,
        tag="reminder_j1",
    )
