"""Comprehensive backend API tests for Le Bon Clic.

Tests all endpoints, OTP bypass, Brevo email integration, scheduler, and PDF generation.
"""
import requests
import sys
from datetime import datetime, timedelta, timezone
from typing import Optional

# Backend URL from frontend/.env
BASE_URL = "https://experts-domicile.preview.emergentagent.com/api"

class LeBonClicTester:
    def __init__(self):
        self.base_url = BASE_URL
        self.token: Optional[str] = None
        self.user_id: Optional[str] = None
        self.phone: str = ""
        self.tests_run = 0
        self.tests_passed = 0
        self.tests_failed = 0
        self.failed_tests = []
        
    def log(self, msg: str, level: str = "INFO"):
        """Log a message with timestamp."""
        timestamp = datetime.now().strftime("%H:%M:%S")
        print(f"[{timestamp}] {level}: {msg}")
    
    def run_test(self, name: str, method: str, endpoint: str, 
                 expected_status: int, data: Optional[dict] = None,
                 headers: Optional[dict] = None, check_response: Optional[callable] = None) -> tuple[bool, dict]:
        """Run a single API test."""
        url = f"{self.base_url}/{endpoint}"
        req_headers = {'Content-Type': 'application/json'}
        if self.token:
            req_headers['Authorization'] = f'Bearer {self.token}'
        if headers:
            req_headers.update(headers)
        
        self.tests_run += 1
        self.log(f"Test #{self.tests_run}: {name}")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=req_headers, timeout=30)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=req_headers, timeout=30)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=req_headers, timeout=30)
            elif method == 'PATCH':
                response = requests.patch(url, json=data, headers=req_headers, timeout=30)
            else:
                raise ValueError(f"Unsupported method: {method}")
            
            success = response.status_code == expected_status
            
            # Additional response validation if provided
            if success and check_response:
                try:
                    response_data = response.json() if response.content else {}
                    if not check_response(response_data):
                        success = False
                        self.log(f"  ❌ Response validation failed", "ERROR")
                except Exception as e:
                    success = False
                    self.log(f"  ❌ Response validation error: {e}", "ERROR")
            
            if success:
                self.tests_passed += 1
                self.log(f"  ✅ PASSED - Status: {response.status_code}")
            else:
                self.tests_failed += 1
                self.failed_tests.append(name)
                self.log(f"  ❌ FAILED - Expected {expected_status}, got {response.status_code}", "ERROR")
                if response.content:
                    try:
                        self.log(f"  Response: {response.json()}", "ERROR")
                    except:
                        self.log(f"  Response: {response.text[:200]}", "ERROR")
            
            return success, response.json() if response.content else {}
        
        except Exception as e:
            self.tests_failed += 1
            self.failed_tests.append(name)
            self.log(f"  ❌ FAILED - Exception: {str(e)}", "ERROR")
            return False, {}
    
    def test_health(self):
        """Test GET /api/health."""
        success, response = self.run_test(
            "Health check",
            "GET",
            "health",
            200,
            check_response=lambda r: r.get("status") == "ok" and r.get("sms_dev_mode") == False
        )
        return success
    
    def test_send_otp_valid(self):
        """Test POST /api/auth/send-otp with valid French phone."""
        self.phone = "0612345678"
        success, response = self.run_test(
            "Send OTP - valid phone",
            "POST",
            "auth/send-otp",
            200,
            data={"phone": self.phone},
            check_response=lambda r: "masked_phone" in r and "expires_in" in r
        )
        return success
    
    def test_send_otp_invalid(self):
        """Test POST /api/auth/send-otp with invalid phone."""
        success, response = self.run_test(
            "Send OTP - invalid phone",
            "POST",
            "auth/send-otp",
            400,
            data={"phone": "1234567890"}
        )
        return success
    
    def test_verify_otp_bypass(self):
        """Test POST /api/auth/verify-otp with bypass code '1234'."""
        success, response = self.run_test(
            "Verify OTP - bypass code 1234",
            "POST",
            "auth/verify-otp",
            200,
            data={"phone": self.phone, "code": "1234"},
            check_response=lambda r: "token" in r and "user" in r
        )
        if success and response:
            self.token = response.get("token")
            self.user_id = response.get("user", {}).get("id")
            self.log(f"  Token acquired: {self.token[:20]}...")
            self.log(f"  User ID: {self.user_id}")
        return success
    
    def test_verify_otp_incorrect(self):
        """Test POST /api/auth/verify-otp with incorrect code."""
        # Use a different phone to avoid OTP conflicts
        success, response = self.run_test(
            "Verify OTP - incorrect code",
            "POST",
            "auth/verify-otp",
            400,
            data={"phone": "0698765432", "code": "9999"}
        )
        return success
    
    def test_get_me_with_token(self):
        """Test GET /api/me with valid token."""
        success, response = self.run_test(
            "Get user profile - with token",
            "GET",
            "me",
            200,
            check_response=lambda r: r.get("id") == self.user_id
        )
        return success
    
    def test_get_me_without_token(self):
        """Test GET /api/me without token."""
        # Temporarily remove token
        saved_token = self.token
        self.token = None
        success, response = self.run_test(
            "Get user profile - without token",
            "GET",
            "me",
            401
        )
        self.token = saved_token
        return success
    
    def test_complete_profile(self):
        """Test PUT /api/me - complete profile (triggers 2 invoice_ready emails)."""
        success, response = self.run_test(
            "Complete user profile",
            "PUT",
            "me",
            200,
            data={
                "first_name": "Jean",
                "last_name": "Dupont",
                "email": "jean.dupont@example.com",
                "address": "12 Rue de la Paix, 69001 Lyon",
                "access_details": "Code porte: 1234A"
            },
            check_response=lambda r: r.get("profile_complete") == True
        )
        if success:
            self.log("  ⚠️  Check backend logs for 2x 'invoice_ready' email sends", "INFO")
        return success
    
    def test_create_booking_tomorrow(self):
        """Test POST /api/bookings - create booking for tomorrow."""
        tomorrow = (datetime.now(timezone.utc) + timedelta(days=1)).date().isoformat()
        success, response = self.run_test(
            "Create booking - tomorrow",
            "POST",
            "bookings",
            200,
            data={
                "device_id": "pc",
                "symptom": "Mon ordinateur est très lent",
                "date": tomorrow,
                "time_window": "10h - 11h",
                "cgv_accepted": True
            },
            check_response=lambda r: "id" in r and r.get("status") == "confirmed"
        )
        if success and response:
            self.booking_id = response.get("id")
            self.booking_ref = response.get("ref")
            self.log(f"  Booking created: {self.booking_ref} (ID: {self.booking_id})")
            self.log("  ⚠️  Check backend logs for 'booking_created' email send", "INFO")
        return success
    
    def test_create_booking_past_date(self):
        """Test POST /api/bookings - past date returns 400."""
        yesterday = (datetime.now(timezone.utc) - timedelta(days=1)).date().isoformat()
        success, response = self.run_test(
            "Create booking - past date",
            "POST",
            "bookings",
            400,
            data={
                "device_id": "mobile",
                "symptom": "Test",
                "date": yesterday,
                "time_window": "14h - 15h",
                "cgv_accepted": True
            }
        )
        return success
    
    def test_create_booking_invalid_time_window(self):
        """Test POST /api/bookings - invalid time_window returns 400."""
        tomorrow = (datetime.now(timezone.utc) + timedelta(days=1)).date().isoformat()
        success, response = self.run_test(
            "Create booking - invalid time_window",
            "POST",
            "bookings",
            400,
            data={
                "device_id": "box",
                "symptom": "Test",
                "date": tomorrow,
                "time_window": "99h - 99h",
                "cgv_accepted": True
            }
        )
        return success
    
    def test_create_booking_invalid_device(self):
        """Test POST /api/bookings - invalid device_id returns 400."""
        tomorrow = (datetime.now(timezone.utc) + timedelta(days=1)).date().isoformat()
        success, response = self.run_test(
            "Create booking - invalid device_id",
            "POST",
            "bookings",
            400,
            data={
                "device_id": "invalid_device",
                "symptom": "Test",
                "date": tomorrow,
                "time_window": "15h - 16h",
                "cgv_accepted": True
            }
        )
        return success
    
    def test_list_bookings(self):
        """Test GET /api/bookings - list user's bookings."""
        success, response = self.run_test(
            "List bookings",
            "GET",
            "bookings",
            200,
            check_response=lambda r: isinstance(r, list) and len(r) > 0
        )
        return success
    
    def test_reschedule_booking(self):
        """Test POST /api/bookings/{id}/reschedule - modify date and time_window."""
        if not hasattr(self, 'booking_id'):
            self.log("  ⚠️  Skipping - no booking_id available", "WARN")
            return False
        
        new_date = (datetime.now(timezone.utc) + timedelta(days=2)).date().isoformat()
        success, response = self.run_test(
            "Reschedule booking",
            "POST",
            f"bookings/{self.booking_id}/reschedule",
            200,
            data={
                "date": new_date,
                "time_window": "14h - 15h"
            },
            check_response=lambda r: r.get("date") == new_date and r.get("time_window") == "14h - 15h"
        )
        if success:
            self.log("  ⚠️  Check backend logs for 'booking_updated' email send", "INFO")
            self.log("  ⚠️  Reminder flags should be reset (reminder_j1_sent_at unset)", "INFO")
        return success
    
    def test_reschedule_booking_past_date(self):
        """Test POST /api/bookings/{id}/reschedule - past date returns 400."""
        if not hasattr(self, 'booking_id'):
            self.log("  ⚠️  Skipping - no booking_id available", "WARN")
            return False
        
        yesterday = (datetime.now(timezone.utc) - timedelta(days=1)).date().isoformat()
        success, response = self.run_test(
            "Reschedule booking - past date",
            "POST",
            f"bookings/{self.booking_id}/reschedule",
            400,
            data={
                "date": yesterday,
                "time_window": "10h - 11h"
            }
        )
        return success
    
    def test_reschedule_booking_not_found(self):
        """Test POST /api/bookings/{id}/reschedule - unknown booking_id returns 404."""
        tomorrow = (datetime.now(timezone.utc) + timedelta(days=1)).date().isoformat()
        success, response = self.run_test(
            "Reschedule booking - not found",
            "POST",
            "bookings/nonexistent-id-12345/reschedule",
            404,
            data={
                "date": tomorrow,
                "time_window": "10h - 11h"
            }
        )
        return success
    
    def test_list_invoices(self):
        """Test GET /api/invoices - list user's invoices (2 seeded invoices)."""
        success, response = self.run_test(
            "List invoices",
            "GET",
            "invoices",
            200,
            check_response=lambda r: "invoices" in r and len(r["invoices"]) >= 2
        )
        if success and response:
            invoices = response.get("invoices", [])
            self.log(f"  Found {len(invoices)} invoice(s)")
            if invoices:
                self.invoice_id = invoices[0].get("id")
                self.log(f"  First invoice ID: {self.invoice_id}")
        return success
    
    def test_pay_invoice(self):
        """Test POST /api/invoices/{id}/pay - mark invoice as paid."""
        if not hasattr(self, 'invoice_id'):
            self.log("  ⚠️  Skipping - no invoice_id available", "WARN")
            return False
        
        success, response = self.run_test(
            "Pay invoice",
            "POST",
            f"invoices/{self.invoice_id}/pay",
            200,
            check_response=lambda r: r.get("paid") == True
        )
        return success
    
    def test_download_invoice_pdf(self):
        """Test GET /api/invoices/{id}/pdf - download PDF."""
        if not hasattr(self, 'invoice_id'):
            self.log("  ⚠️  Skipping - no invoice_id available", "WARN")
            return False
        
        url = f"{self.base_url}/invoices/{self.invoice_id}/pdf"
        headers = {'Authorization': f'Bearer {self.token}'}
        
        self.tests_run += 1
        self.log(f"Test #{self.tests_run}: Download invoice PDF")
        
        try:
            response = requests.get(url, headers=headers, timeout=30)
            
            success = (
                response.status_code == 200 and
                response.headers.get('content-type') == 'application/pdf' and
                len(response.content) > 1024  # > 1KB
            )
            
            if success:
                self.tests_passed += 1
                self.log(f"  ✅ PASSED - PDF size: {len(response.content)} bytes")
            else:
                self.tests_failed += 1
                self.failed_tests.append("Download invoice PDF")
                self.log(f"  ❌ FAILED - Status: {response.status_code}, "
                        f"Content-Type: {response.headers.get('content-type')}, "
                        f"Size: {len(response.content)} bytes", "ERROR")
            
            return success
        
        except Exception as e:
            self.tests_failed += 1
            self.failed_tests.append("Download invoice PDF")
            self.log(f"  ❌ FAILED - Exception: {str(e)}", "ERROR")
            return False
    
    def test_cancel_booking(self):
        """Test POST /api/bookings/{id}/cancel - cancel booking."""
        if not hasattr(self, 'booking_id'):
            self.log("  ⚠️  Skipping - no booking_id available", "WARN")
            return False
        
        success, response = self.run_test(
            "Cancel booking",
            "POST",
            f"bookings/{self.booking_id}/cancel",
            200,
            check_response=lambda r: r.get("status") == "cancelled"
        )
        if success:
            self.log("  ⚠️  Check backend logs for 'booking_cancelled' email send", "INFO")
        return success
    
    def test_admin_run_reminders_j1_first(self):
        """Test POST /api/admin/run-reminders-j1 - first run."""
        # First, create a booking for tomorrow to test reminders
        tomorrow = (datetime.now(timezone.utc) + timedelta(days=1)).date().isoformat()
        success, response = self.run_test(
            "Create booking for J-1 reminder test",
            "POST",
            "bookings",
            200,
            data={
                "device_id": "security",
                "symptom": "Test reminder",
                "date": tomorrow,
                "time_window": "17h - 18h",
                "cgv_accepted": True
            }
        )
        
        if not success:
            self.log("  ⚠️  Failed to create test booking for reminders", "WARN")
            return False
        
        self.reminder_booking_id = response.get("id")
        
        # Now trigger the reminder job
        success, response = self.run_test(
            "Admin run J-1 reminders - first run",
            "POST",
            "admin/run-reminders-j1",
            200,
            check_response=lambda r: "notified" in r and r.get("notified") >= 1
        )
        if success:
            self.log(f"  Notified {response.get('notified')} booking(s)")
            self.log("  ⚠️  Check backend logs for SMS + email sends", "INFO")
        return success
    
    def test_admin_run_reminders_j1_second(self):
        """Test POST /api/admin/run-reminders-j1 - second run (idempotence)."""
        success, response = self.run_test(
            "Admin run J-1 reminders - second run (idempotence)",
            "POST",
            "admin/run-reminders-j1",
            200,
            check_response=lambda r: r.get("notified") == 0
        )
        if success:
            self.log("  ✅ Idempotence verified - no duplicate reminders sent")
        return success
    
    def test_contact_with_auth(self):
        """Test POST /api/contact - with authentication."""
        success, response = self.run_test(
            "Contact - with auth",
            "POST",
            "contact",
            200,
            data={
                "message": "Bonjour, j'ai une question sur mes factures.",
                "context": "lumi"
            },
            check_response=lambda r: r.get("status") == "ok"
        )
        return success
    
    def test_contact_without_auth(self):
        """Test POST /api/contact - without authentication."""
        # Temporarily remove token
        saved_token = self.token
        self.token = None
        
        success, response = self.run_test(
            "Contact - without auth",
            "POST",
            "contact",
            200,
            data={
                "message": "Question anonyme",
                "context": "lumi"
            },
            check_response=lambda r: r.get("status") == "ok"
        )
        
        self.token = saved_token
        return success
    
    def run_all_tests(self):
        """Run all backend tests in sequence."""
        self.log("=" * 80)
        self.log("Le Bon Clic Backend API Tests")
        self.log("=" * 80)
        
        # Health check
        self.test_health()
        
        # Auth flow
        self.test_send_otp_valid()
        self.test_send_otp_invalid()
        self.test_verify_otp_bypass()
        self.test_verify_otp_incorrect()
        
        # User profile
        self.test_get_me_with_token()
        self.test_get_me_without_token()
        self.test_complete_profile()
        
        # Bookings - create
        self.test_create_booking_tomorrow()
        self.test_create_booking_past_date()
        self.test_create_booking_invalid_time_window()
        self.test_create_booking_invalid_device()
        
        # Bookings - list
        self.test_list_bookings()
        
        # Bookings - reschedule
        self.test_reschedule_booking()
        self.test_reschedule_booking_past_date()
        self.test_reschedule_booking_not_found()
        
        # Invoices
        self.test_list_invoices()
        self.test_pay_invoice()
        self.test_download_invoice_pdf()
        
        # Bookings - cancel (after invoice tests to keep booking active longer)
        self.test_cancel_booking()
        
        # Admin reminders
        self.test_admin_run_reminders_j1_first()
        self.test_admin_run_reminders_j1_second()
        
        # Contact
        self.test_contact_with_auth()
        self.test_contact_without_auth()
        
        # Summary
        self.log("=" * 80)
        self.log(f"Tests completed: {self.tests_run}")
        self.log(f"✅ Passed: {self.tests_passed}")
        self.log(f"❌ Failed: {self.tests_failed}")
        
        if self.failed_tests:
            self.log("Failed tests:", "ERROR")
            for test in self.failed_tests:
                self.log(f"  - {test}", "ERROR")
        
        success_rate = (self.tests_passed / self.tests_run * 100) if self.tests_run > 0 else 0
        self.log(f"Success rate: {success_rate:.1f}%")
        self.log("=" * 80)
        
        # Additional checks to mention
        self.log("\n📋 Manual verification needed:")
        self.log("  1. Check backend logs for Brevo email sends (status 201 or dev_mode warnings)")
        self.log("  2. Check backend logs for scheduler startup message")
        self.log("  3. Verify no crashes if email address is missing (best-effort)")
        
        return 0 if self.tests_failed == 0 else 1


def main():
    tester = LeBonClicTester()
    return tester.run_all_tests()


if __name__ == "__main__":
    sys.exit(main())
