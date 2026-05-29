"""Generate a SAP-compliant PDF invoice using ReportLab."""
import os
from io import BytesIO
from datetime import datetime

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    Image,
)
from reportlab.lib.enums import TA_LEFT, TA_RIGHT, TA_CENTER

import config

SAP_LOGO_PATH = os.path.join(os.path.dirname(__file__), "assets", "sap-logo.jpg")

INK = colors.HexColor("#1E293B")
CYAN = colors.HexColor("#06B6D4")
PURPLE = colors.HexColor("#8B5CF6")
MUTED = colors.HexColor("#64748B")
LIGHT = colors.HexColor("#F1F5F9")
GREEN = colors.HexColor("#16A34A")
GREEN_SOFT = colors.HexColor("#DCFCE7")


def _styles():
    base = getSampleStyleSheet()
    return {
        "h1": ParagraphStyle("h1", parent=base["Heading1"], fontName="Helvetica-Bold",
                              fontSize=22, textColor=INK, leading=26, spaceAfter=4),
        "h2": ParagraphStyle("h2", parent=base["Heading2"], fontName="Helvetica-Bold",
                              fontSize=12, textColor=INK, leading=16, spaceBefore=10, spaceAfter=4),
        "body": ParagraphStyle("body", parent=base["BodyText"], fontName="Helvetica",
                                fontSize=10, textColor=INK, leading=14),
        "muted": ParagraphStyle("muted", parent=base["BodyText"], fontName="Helvetica",
                                 fontSize=9, textColor=MUTED, leading=12),
        "right": ParagraphStyle("right", parent=base["BodyText"], fontName="Helvetica",
                                 fontSize=10, textColor=INK, alignment=TA_RIGHT),
        "bold_right": ParagraphStyle("bold_right", parent=base["BodyText"], fontName="Helvetica-Bold",
                                       fontSize=10, textColor=INK, alignment=TA_RIGHT),
        "brand": ParagraphStyle("brand", parent=base["Heading1"], fontName="Helvetica-Bold",
                                 fontSize=20, textColor=INK),
        "sap_title": ParagraphStyle("sap_title", parent=base["BodyText"], fontName="Helvetica-Bold",
                                      fontSize=11, textColor=GREEN),
        "sap_body": ParagraphStyle("sap_body", parent=base["BodyText"], fontName="Helvetica",
                                     fontSize=9, textColor=INK, leading=12),
    }


def build_invoice_pdf(invoice: dict, user: dict) -> bytes:
    """Build a single-page A4 invoice PDF and return raw bytes."""
    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=18 * mm, rightMargin=18 * mm,
        topMargin=18 * mm, bottomMargin=18 * mm,
        title=f"Facture {invoice.get('ref', '')}",
        author=config.COMPANY_NAME,
    )
    S = _styles()
    story = []

    # ---- Header band: Brand + invoice meta ----
    brand_cell = [
        Paragraph(f"<b>{config.COMPANY_NAME}</b>", S["brand"]),
        Paragraph("L'expertise informatique à domicile", S["muted"]),
        Spacer(1, 3),
        Paragraph(config.COMPANY_ADDRESS, S["muted"]),
        Paragraph(f"Tél. {config.COMPANY_SVI} · {config.COMPANY_EMAIL}", S["muted"]),
        Paragraph(
            f"SIRET {config.COMPANY_SIRET} · Agrément SAP {config.COMPANY_SAP_AGREMENT}",
            S["muted"],
        ),
    ]
    # SAP logo block (right next to invoice meta)
    sap_logo_block = None
    if os.path.exists(SAP_LOGO_PATH):
        try:
            sap_logo_block = Image(SAP_LOGO_PATH, width=22 * mm, height=22 * mm)
        except Exception:
            sap_logo_block = None

    meta_cell = [
        Paragraph("<b>FACTURE</b>", S["bold_right"]),
        Paragraph(f"N° {invoice.get('ref', '')}", S["right"]),
        Paragraph(
            f"Date : {datetime.fromisoformat(invoice['date']).strftime('%d/%m/%Y') if invoice.get('date') else ''}",
            S["right"],
        ),
    ]
    if sap_logo_block is not None:
        # Put logo on the left of brand block via a 3-col header
        header = Table(
            [[sap_logo_block, brand_cell, meta_cell]],
            colWidths=[26 * mm, 90 * mm, 54 * mm],
        )
    else:
        header = Table(
            [[brand_cell, meta_cell]],
            colWidths=[116 * mm, 54 * mm],
        )
    header.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LINEBELOW", (0, 0), (-1, -1), 1, INK),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
    ]))
    story.append(header)
    story.append(Spacer(1, 14))

    # ---- Billed-to ----
    story.append(Paragraph("<b>Facturer à</b>", S["h2"]))
    full_name = f"{user.get('first_name', '')} {user.get('last_name', '')}".strip() or "Client"
    story.append(Paragraph(full_name, S["body"]))
    if user.get("address"):
        story.append(Paragraph(user["address"], S["body"]))
    if user.get("email"):
        story.append(Paragraph(user["email"], S["muted"]))
    if user.get("phone"):
        story.append(Paragraph("Tél. " + user["phone"], S["muted"]))

    story.append(Spacer(1, 14))

    # ---- Line items ----
    base_total = float(invoice.get("base_total", 0.0))
    hours = float(invoice.get("hours", 1))
    rate = base_total / hours if hours else config.HOURLY_BASE
    net_total = float(invoice.get("net_total", base_total / 2))
    credit = base_total - net_total

    items = [
        ["Désignation", "Heures", "Tarif HT", "Total"],
        [invoice.get("label", "Intervention informatique à domicile"),
         f"{hours:g} h", f"{rate:.2f} €/h", f"{base_total:.2f} €"],
    ]
    items_table = Table(items, colWidths=[90 * mm, 22 * mm, 28 * mm, 30 * mm])
    items_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), INK),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 10),
        ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 1), (-1, -1), 10),
        ("TEXTCOLOR", (0, 1), (-1, -1), INK),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT]),
        ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
        ("ALIGN", (0, 0), (0, -1), "LEFT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    story.append(items_table)
    story.append(Spacer(1, 10))

    # ---- Totals box ----
    totals = [
        ["Sous-total HT", f"{base_total:.2f} €"],
        ["TVA non applicable (art. 293 B du CGI)", "—"],
        ["Total à régler (TTC)", f"{base_total:.2f} €"],
    ]
    totals_table = Table(totals, colWidths=[120 * mm, 50 * mm])
    totals_table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("ALIGN", (-1, 0), (-1, -1), "RIGHT"),
        ("LINEABOVE", (0, -1), (-1, -1), 1, INK),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(totals_table)
    story.append(Spacer(1, 14))

    # ---- SAP / Crédit d'impôt callout ----
    sap_cell = [
        Paragraph("<b>Service à la Personne — Crédit d'impôt 50%</b>", S["sap_title"]),
        Spacer(1, 2),
        Paragraph(
            "Conformément à l'article 199 sexdecies du CGI, vous bénéficiez d'un crédit d'impôt "
            "égal à 50% des sommes versées pour ces services à domicile. "
            f"À déclarer en case <b>7DB</b> : {base_total:.2f} €.",
            S["sap_body"],
        ),
        Spacer(1, 4),
        Paragraph(
            f"Soit un <b>crédit d'impôt de {credit:.2f} €</b> — "
            f"<b>coût net pour vous : {net_total:.2f} €</b>.",
            S["sap_body"],
        ),
    ]
    sap_table = Table([[sap_cell]], colWidths=[170 * mm])
    sap_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), GREEN_SOFT),
        ("BOX", (0, 0), (-1, -1), 0.5, GREEN),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
    ]))
    story.append(sap_table)
    story.append(Spacer(1, 14))

    # ---- Payment status ----
    paid = invoice.get("paid", False)
    status_color = GREEN if paid else PURPLE
    status_text = "PAYÉE" if paid else "À RÉGLER"
    status_table = Table([[Paragraph(
        f"<font color='white'><b>Statut : {status_text}</b></font>", S["body"]
    )]], colWidths=[170 * mm])
    status_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), status_color),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    story.append(status_table)
    story.append(Spacer(1, 18))

    # ---- Footer ----
    story.append(Paragraph(
        "Paiement par CB, virement ou chèque CESU. "
        "Aucun escompte pour paiement anticipé. "
        "Pénalité de retard : 3 fois le taux d'intérêt légal. Indemnité forfaitaire pour frais de recouvrement : 40 €.",
        S["muted"],
    ))
    story.append(Spacer(1, 6))
    story.append(Paragraph(
        f"{config.COMPANY_NAME} — {config.COMPANY_ADDRESS} — SIRET {config.COMPANY_SIRET} — Agrément SAP {config.COMPANY_SAP_AGREMENT}",
        S["muted"],
    ))

    doc.build(story)
    pdf_bytes = buf.getvalue()
    buf.close()
    return pdf_bytes
