"""Centralized config loaded from environment."""
import os
from pathlib import Path
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
CORS_ORIGINS = os.environ.get("CORS_ORIGINS", "*").split(",")

# Brevo
BREVO_API_KEY = os.environ.get("BREVO_API_KEY", "")
BREVO_SENDER_NAME = os.environ.get("BREVO_SENDER_NAME", "LeBonClic")
BREVO_SMS_URL = "https://api.brevo.com/v3/transactionalSMS/send"

# Auth
JWT_SECRET = os.environ.get("JWT_SECRET", "change-me")
JWT_ALGO = "HS256"
JWT_EXPIRY_HOURS = int(os.environ.get("JWT_EXPIRY_HOURS", "720"))

# OTP
OTP_EXPIRY_SECONDS = int(os.environ.get("OTP_EXPIRY_SECONDS", "600"))
OTP_BYPASS_CODE = os.environ.get("OTP_BYPASS_CODE", "1234")  # universal demo code
SMS_DEV_MODE = os.environ.get("SMS_DEV_MODE", "false").lower() in {"1", "true", "yes"}

# Business
HOURLY_BASE = float(os.environ.get("HOURLY_BASE", "80"))
HOURLY_NET = float(os.environ.get("HOURLY_NET", "40"))
COMPANY_NAME = os.environ.get("COMPANY_NAME", "Le Bon Clic")
COMPANY_SVI = os.environ.get("COMPANY_SVI", "06 25 55 47 02")
COMPANY_EMAIL = os.environ.get("COMPANY_EMAIL", "contact@lebonclic.tech")
COMPANY_ADDRESS = os.environ.get("COMPANY_ADDRESS", "43 Rue Molière, 69006 Lyon")
COMPANY_SIRET = os.environ.get("COMPANY_SIRET", "")
COMPANY_SAP_AGREMENT = os.environ.get("COMPANY_SAP_AGREMENT", "")

# Stripe Checkout
STRIPE_API_KEY = os.environ.get("STRIPE_API_KEY", "")
# Fixed deposit amount when a customer wants to secure their booking (EUR)
BOOKING_DEPOSIT_EUR = float(os.environ.get("BOOKING_DEPOSIT_EUR", "10.0"))
