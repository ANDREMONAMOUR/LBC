"""Pydantic models for Le Bon Clic backend."""
from datetime import datetime, timezone
from typing import Optional, List
from pydantic import BaseModel, Field, EmailStr, ConfigDict
import uuid


def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ---------------- Auth / User ----------------

class SendOtpRequest(BaseModel):
    phone: str  # 10 digits FR (06xxxxxxxx or 07xxxxxxxx)


class SendOtpResponse(BaseModel):
    status: str = "sent"
    masked_phone: str
    dev_code: Optional[str] = None  # only when SMS_DEV_MODE=true
    expires_in: int


class VerifyOtpRequest(BaseModel):
    phone: str
    code: str


class UserProfileIn(BaseModel):
    first_name: str
    last_name: str
    email: EmailStr
    address: str
    access_details: Optional[str] = ""


class User(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=_uuid)
    phone: str
    first_name: str = ""
    last_name: str = ""
    email: str = ""
    address: str = ""
    access_details: str = ""
    profile_complete: bool = False
    created_at: datetime = Field(default_factory=_now)


class AuthResponse(BaseModel):
    status: str
    token: str
    is_new_user: bool
    user: User


# ---------------- Bookings ----------------

class BookingCreate(BaseModel):
    device_id: str  # pc | mobile | box | security
    symptom: str
    date: str  # YYYY-MM-DD
    time_window: str  # e.g. "10h - 11h"
    cgv_accepted: bool = True


class Booking(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=_uuid)
    ref: str = ""  # human-readable like RDV-AB12X
    user_id: str
    device_id: str
    symptom: str
    date: str
    time_window: str
    address: str = ""
    access_details: str = ""
    status: str = "confirmed"  # confirmed | cancelled | completed
    prep_checklist: dict = Field(default_factory=dict)  # {"0": true, ...}
    created_at: datetime = Field(default_factory=_now)
    cancelled_at: Optional[datetime] = None


class PrepUpdate(BaseModel):
    prep_checklist: dict


class BookingReschedule(BaseModel):
    date: str  # YYYY-MM-DD
    time_window: str  # e.g. "10h - 11h"


# ---------------- Invoices ----------------

class Invoice(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=_uuid)
    ref: str = ""  # INV-2025-0142
    user_id: str
    booking_id: Optional[str] = None
    label: str
    date: str  # YYYY-MM-DD
    hours: float
    base_total: float
    net_total: float
    paid: bool = False
    paid_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=_now)


class InvoiceListResponse(BaseModel):
    invoices: List[Invoice]


# ---------------- Admin (CRM) ----------------

class AdminUser(BaseModel):
    """Admin/staff account, separate from clients (User)."""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=_uuid)
    email: str
    password_hash: str = ""  # bcrypt — never returned to client
    first_name: str = ""
    last_name: str = ""
    role: str = "admin"  # admin | accountant | operator (future)
    created_at: datetime = Field(default_factory=_now)
    last_login_at: Optional[datetime] = None


class AdminPublic(BaseModel):
    """Safe AdminUser representation (no password_hash)."""
    id: str
    email: str
    first_name: str = ""
    last_name: str = ""
    role: str = "admin"
    last_login_at: Optional[datetime] = None


class AdminLoginRequest(BaseModel):
    email: str
    password: str


class AdminAuthResponse(BaseModel):
    status: str = "ok"
    token: str
    admin: AdminPublic


class AdminChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class AdminClientUpdate(BaseModel):
    """Patch payload for admin to update a client profile/CRM fields."""
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    access_details: Optional[str] = None
    admin_notes: Optional[str] = None
    tags: Optional[List[str]] = None


class AdminBookingCreate(BaseModel):
    """Admin creates a booking manually (e.g. phone call)."""
    user_id: Optional[str] = None  # if existing client
    phone: Optional[str] = None    # else, create/find user from phone
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    access_details: Optional[str] = None
    device_id: str
    symptom: str
    date: str
    time_window: str


class AdminBookingUpdate(BaseModel):
    date: Optional[str] = None
    time_window: Optional[str] = None
    status: Optional[str] = None  # confirmed | cancelled | completed | in_progress
    field_notes: Optional[str] = None
    materials_used: Optional[List[str]] = None
    actual_hours: Optional[float] = None


class AdminInvoiceCreate(BaseModel):
    user_id: str
    booking_id: Optional[str] = None
    label: str
    date: str  # YYYY-MM-DD
    hours: float
    base_total: Optional[float] = None  # auto = hours * 80 if missing
    net_total: Optional[float] = None   # auto = hours * 40 if missing


class AdminInvoiceUpdate(BaseModel):
    label: Optional[str] = None
    date: Optional[str] = None
    hours: Optional[float] = None
    base_total: Optional[float] = None
    net_total: Optional[float] = None
    paid: Optional[bool] = None


# ---------------- Chatbot ----------------

class ContactMessageIn(BaseModel):
    message: str
    context: Optional[str] = "lumi"


class ContactMessage(BaseModel):
    id: str = Field(default_factory=_uuid)
    user_id: Optional[str] = None
    phone: Optional[str] = None
    message: str
    context: str = "lumi"
    created_at: datetime = Field(default_factory=_now)


# ---------------- Payments ----------------

class PaymentTransaction(BaseModel):
    """Audit record for every Stripe Checkout attempt."""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=_uuid)
    session_id: str
    kind: str  # invoice_payment | booking_deposit
    user_id: Optional[str] = None
    invoice_id: Optional[str] = None
    booking_id: Optional[str] = None
    amount: float
    currency: str = "eur"
    status: str = "initiated"  # initiated | open | complete | expired | webhook_seen
    payment_status: str = "unpaid"  # unpaid | paid | no_payment_required
    metadata: dict = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=_now)
    settled_at: Optional[datetime] = None
