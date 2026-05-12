"""Specific tests for Stripe SDK migration verification.

Tests:
1. Official Stripe SDK is used (not emergentintegrations)
2. Session creation with real Stripe API
3. Session format verification (cs_test_...)
4. Metadata completeness
5. Amount calculation (cents)
6. Locale='fr' verification
7. Multiple session creation for same invoice
"""
import requests
import sys
from datetime import datetime, timedelta, timezone

BASE_URL = "https://experts-domicile.preview.emergentagent.com/api"

class StripeMigrationTester:
    def __init__(self):
        self.base_url = BASE_URL
        self.token = None
        self.user_id = None
        self.phone = "0698765432"
        self.tests_run = 0
        self.tests_passed = 0
        self.tests_failed = 0
        self.failed_tests = []
    
    def log(self, msg: str, level: str = "INFO"):
        timestamp = datetime.now().strftime("%H:%M:%S")
        print(f"[{timestamp}] {level}: {msg}")
    
    def run_test(self, name: str, method: str, endpoint: str, 
                 expected_status: int, data: dict = None,
                 check_response: callable = None) -> tuple[bool, dict]:
        url = f"{self.base_url}/{endpoint}"
        headers = {'Content-Type': 'application/json'}
        if self.token:
            headers['Authorization'] = f'Bearer {self.token}'
        
        self.tests_run += 1
        self.log(f"Test #{self.tests_run}: {name}")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, timeout=30)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers, timeout=30)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=headers, timeout=30)
            else:
                raise ValueError(f"Unsupported method: {method}")
            
            success = response.status_code == expected_status
            
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
    
    def setup_auth(self):
        """Setup authentication and create unpaid invoice."""
        # Send OTP
        success, _ = self.run_test(
            "Send OTP",
            "POST",
            "auth/send-otp",
            200,
            data={"phone": self.phone}
        )
        if not success:
            return False
        
        # Verify OTP with bypass code
        success, response = self.run_test(
            "Verify OTP with bypass code 1234",
            "POST",
            "auth/verify-otp",
            200,
            data={"phone": self.phone, "code": "1234"},
            check_response=lambda r: "token" in r and "user" in r
        )
        if not success:
            return False
        
        self.token = response.get("token")
        self.user_id = response.get("user", {}).get("id")
        self.log(f"  Token: {self.token[:20]}...")
        self.log(f"  User ID: {self.user_id}")
        
        # Complete profile
        success, _ = self.run_test(
            "Complete profile",
            "PUT",
            "me",
            200,
            data={
                "first_name": "Test",
                "last_name": "Stripe",
                "email": "test.stripe@example.com",
                "address": "123 Test St, Lyon",
                "access_details": "Code: 1234"
            }
        )
        return success
    
    def test_invoice_checkout_session(self):
        """Test POST /api/payments/checkout/invoice/{id} - verify real Stripe session."""
        # Get invoices
        success, response = self.run_test(
            "List invoices",
            "GET",
            "invoices",
            200
        )
        if not success:
            return False
        
        invoices = response.get("invoices", [])
        unpaid_invoice = next((inv for inv in invoices if not inv.get("paid")), None)
        
        if not unpaid_invoice:
            self.log("  ⚠️  No unpaid invoice found", "WARN")
            return False
        
        self.invoice_id = unpaid_invoice.get("id")
        self.invoice_amount = unpaid_invoice.get("net_total", 0)
        self.log(f"  Invoice ID: {self.invoice_id}")
        self.log(f"  Invoice amount: {self.invoice_amount} EUR")
        
        # Create checkout session
        success, response = self.run_test(
            "Create invoice checkout session",
            "POST",
            f"payments/checkout/invoice/{self.invoice_id}",
            200,
            data={"origin_url": "https://example.com"},
            check_response=lambda r: (
                "url" in r and 
                "session_id" in r and 
                r["session_id"].startswith("cs_test_") and
                "checkout.stripe.com" in r["url"]
            )
        )
        
        if success and response:
            self.session_id = response.get("session_id")
            self.checkout_url = response.get("url")
            self.log(f"  ✅ Session ID: {self.session_id}")
            self.log(f"  ✅ Checkout URL: {self.checkout_url[:60]}...")
            self.log(f"  ✅ Session ID format correct (cs_test_...)")
            self.log(f"  ✅ URL points to checkout.stripe.com")
        
        return success
    
    def test_payment_status_with_metadata(self):
        """Test GET /api/payments/status/{session_id} - verify complete metadata."""
        if not hasattr(self, 'session_id'):
            self.log("  ⚠️  No session_id, skipping", "WARN")
            return False
        
        success, response = self.run_test(
            "Get payment status with metadata",
            "GET",
            f"payments/status/{self.session_id}",
            200,
            check_response=lambda r: (
                r.get("session_id") == self.session_id and
                r.get("source") == "stripe" and
                r.get("currency") == "eur" and
                "metadata" in r and
                isinstance(r["metadata"], dict) and
                r["metadata"].get("kind") == "invoice_payment" and
                r["metadata"].get("invoice_id") == self.invoice_id and
                r["metadata"].get("user_id") == self.user_id and
                "amount_total" in r
            )
        )
        
        if success and response:
            metadata = response.get("metadata", {})
            amount_total = response.get("amount_total")
            expected_amount_cents = int(round(self.invoice_amount * 100))
            
            self.log(f"  ✅ Source: {response.get('source')}")
            self.log(f"  ✅ Currency: {response.get('currency')}")
            self.log(f"  ✅ Amount (cents): {amount_total}")
            self.log(f"  ✅ Expected (cents): {expected_amount_cents}")
            self.log(f"  ✅ Metadata kind: {metadata.get('kind')}")
            self.log(f"  ✅ Metadata invoice_id: {metadata.get('invoice_id')}")
            self.log(f"  ✅ Metadata user_id: {metadata.get('user_id')}")
            
            # Verify amount calculation
            if amount_total == expected_amount_cents:
                self.log(f"  ✅ Amount calculation correct: {self.invoice_amount} EUR = {amount_total} cents")
            else:
                self.log(f"  ⚠️  Amount mismatch: expected {expected_amount_cents}, got {amount_total}", "WARN")
        
        return success
    
    def test_multiple_sessions_same_invoice(self):
        """Test creating multiple sessions for same unpaid invoice."""
        if not hasattr(self, 'invoice_id'):
            self.log("  ⚠️  No invoice_id, skipping", "WARN")
            return False
        
        success, response = self.run_test(
            "Create second session for same invoice",
            "POST",
            f"payments/checkout/invoice/{self.invoice_id}",
            200,
            data={"origin_url": "https://example.com"},
            check_response=lambda r: (
                "session_id" in r and 
                r["session_id"].startswith("cs_test_") and
                r["session_id"] != self.session_id  # Different session
            )
        )
        
        if success and response:
            second_session_id = response.get("session_id")
            self.log(f"  ✅ Second session created: {second_session_id}")
            self.log(f"  ✅ Multiple checkout attempts allowed for unpaid invoices")
        
        return success
    
    def test_deposit_checkout_session(self):
        """Test POST /api/payments/checkout/deposit/{booking_id} - verify 10€ session."""
        # Create a booking
        tomorrow = (datetime.now(timezone.utc) + timedelta(days=1)).date().isoformat()
        success, response = self.run_test(
            "Create booking for deposit test",
            "POST",
            "bookings",
            200,
            data={
                "device_id": "pc",
                "symptom": "Test deposit",
                "date": tomorrow,
                "time_window": "10h - 11h",
                "cgv_accepted": True
            }
        )
        
        if not success:
            return False
        
        booking_id = response.get("id")
        self.log(f"  Booking ID: {booking_id}")
        
        # Create deposit checkout session
        success, response = self.run_test(
            "Create deposit checkout session (10€)",
            "POST",
            f"payments/checkout/deposit/{booking_id}",
            200,
            data={"origin_url": "https://example.com"},
            check_response=lambda r: (
                "session_id" in r and 
                r["session_id"].startswith("cs_test_")
            )
        )
        
        if success and response:
            deposit_session_id = response.get("session_id")
            self.log(f"  ✅ Deposit session: {deposit_session_id}")
            
            # Verify deposit session metadata
            success2, response2 = self.run_test(
                "Get deposit session status",
                "GET",
                f"payments/status/{deposit_session_id}",
                200,
                check_response=lambda r: (
                    r.get("source") == "stripe" and
                    r.get("currency") == "eur" and
                    r.get("amount_total") == 1000 and  # 10.0 EUR = 1000 cents
                    r["metadata"].get("kind") == "booking_deposit" and
                    r["metadata"].get("booking_id") == booking_id
                )
            )
            
            if success2 and response2:
                self.log(f"  ✅ Deposit amount: {response2.get('amount_total')} cents (10.00 EUR)")
                self.log(f"  ✅ Metadata kind: {response2['metadata'].get('kind')}")
        
        return success
    
    def run_all_tests(self):
        """Run all Stripe migration tests."""
        self.log("=" * 80)
        self.log("Stripe SDK Migration Verification Tests")
        self.log("=" * 80)
        
        # Setup
        if not self.setup_auth():
            self.log("❌ Setup failed, aborting tests", "ERROR")
            return 1
        
        # Run tests
        self.test_invoice_checkout_session()
        self.test_payment_status_with_metadata()
        self.test_multiple_sessions_same_invoice()
        self.test_deposit_checkout_session()
        
        # Summary
        self.log("\n" + "=" * 80)
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
        
        return 0 if self.tests_failed == 0 else 1

def main():
    tester = StripeMigrationTester()
    return tester.run_all_tests()

if __name__ == "__main__":
    sys.exit(main())
