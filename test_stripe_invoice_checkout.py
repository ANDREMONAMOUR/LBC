"""Test Stripe invoice checkout with a fresh user to ensure unpaid invoice exists."""
import requests
import sys
from datetime import datetime

BASE_URL = "https://experts-domicile.preview.emergentagent.com/api"

def test_invoice_checkout():
    """Create a new user and test invoice checkout."""
    print("=" * 80)
    print("Testing Stripe Invoice Checkout with Fresh User")
    print("=" * 80)
    
    # 1. Create new user with unique phone
    phone = f"0612{datetime.now().strftime('%H%M%S')}"
    print(f"\n1. Creating new user with phone: {phone}")
    
    # Send OTP
    r = requests.post(f"{BASE_URL}/auth/send-otp", json={"phone": phone})
    if r.status_code != 200:
        print(f"❌ Failed to send OTP: {r.status_code}")
        return False
    print("✅ OTP sent")
    
    # Verify with bypass code
    r = requests.post(f"{BASE_URL}/auth/verify-otp", json={"phone": phone, "code": "1234"})
    if r.status_code != 200:
        print(f"❌ Failed to verify OTP: {r.status_code}")
        return False
    
    data = r.json()
    token = data["token"]
    user_id = data["user"]["id"]
    print(f"✅ User created: {user_id}")
    
    # 2. Complete profile (triggers 2 demo invoices)
    print("\n2. Completing profile (will seed 2 demo invoices)")
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    r = requests.put(
        f"{BASE_URL}/me",
        json={
            "first_name": "Test",
            "last_name": "Stripe",
            "email": f"stripe{datetime.now().strftime('%H%M%S')}@yopmail.com",
            "address": "123 Test Street, Lyon",
            "access_details": "Code: 1234"
        },
        headers=headers
    )
    if r.status_code != 200:
        print(f"❌ Failed to complete profile: {r.status_code}")
        return False
    print("✅ Profile completed")
    
    # 3. Get invoices
    print("\n3. Getting invoices")
    r = requests.get(f"{BASE_URL}/invoices", headers=headers)
    if r.status_code != 200:
        print(f"❌ Failed to get invoices: {r.status_code}")
        return False
    
    invoices = r.json()["invoices"]
    print(f"✅ Found {len(invoices)} invoice(s)")
    
    unpaid_invoice = next((inv for inv in invoices if not inv.get("paid")), None)
    if not unpaid_invoice:
        print("❌ No unpaid invoice found")
        return False
    
    invoice_id = unpaid_invoice["id"]
    invoice_ref = unpaid_invoice["ref"]
    net_total = unpaid_invoice["net_total"]
    print(f"✅ Unpaid invoice: {invoice_ref} - {net_total}€")
    
    # 4. Create checkout session for invoice
    print(f"\n4. Creating Stripe checkout session for invoice {invoice_ref}")
    r = requests.post(
        f"{BASE_URL}/payments/checkout/invoice/{invoice_id}",
        json={"origin_url": "https://example.com"},
        headers=headers
    )
    if r.status_code != 200:
        print(f"❌ Failed to create checkout session: {r.status_code}")
        print(f"Response: {r.text}")
        return False
    
    data = r.json()
    session_id = data["session_id"]
    checkout_url = data["url"]
    print(f"✅ Checkout session created: {session_id}")
    print(f"   URL: {checkout_url[:80]}...")
    
    # 5. Verify payment status
    print(f"\n5. Checking payment status")
    r = requests.get(f"{BASE_URL}/payments/status/{session_id}")
    if r.status_code != 200:
        print(f"❌ Failed to get payment status: {r.status_code}")
        return False
    
    status = r.json()
    print(f"✅ Payment status retrieved:")
    print(f"   Session ID: {status['session_id']}")
    print(f"   Status: {status['status']}")
    print(f"   Payment status: {status['payment_status']}")
    print(f"   Kind: {status['kind']}")
    print(f"   Amount: {status['amount_total']/100:.2f} {status['currency'].upper()}")
    print(f"   Source: {status['source']}")
    
    # Verify amount matches invoice
    expected_amount_cents = int(net_total * 100)
    if status['amount_total'] != expected_amount_cents:
        print(f"❌ Amount mismatch: expected {expected_amount_cents}, got {status['amount_total']}")
        return False
    print(f"✅ Amount matches invoice net_total")
    
    # 6. Try to create another session for same invoice (should succeed - multiple sessions allowed)
    print(f"\n6. Creating second checkout session for same invoice (should succeed)")
    r = requests.post(
        f"{BASE_URL}/payments/checkout/invoice/{invoice_id}",
        json={"origin_url": "https://example.com"},
        headers=headers
    )
    if r.status_code != 200:
        print(f"❌ Failed to create second session: {r.status_code}")
        return False
    
    session_id_2 = r.json()["session_id"]
    print(f"✅ Second session created: {session_id_2}")
    print(f"   (Multiple sessions allowed until invoice is marked paid)")
    
    # 7. Mark invoice as paid manually
    print(f"\n7. Marking invoice as paid (simulating payment completion)")
    r = requests.post(f"{BASE_URL}/invoices/{invoice_id}/pay", headers=headers)
    if r.status_code != 200:
        print(f"❌ Failed to mark invoice as paid: {r.status_code}")
        return False
    print(f"✅ Invoice marked as paid")
    
    # 8. Try to create session for paid invoice (should fail with 400)
    print(f"\n8. Trying to create session for paid invoice (should fail)")
    r = requests.post(
        f"{BASE_URL}/payments/checkout/invoice/{invoice_id}",
        json={"origin_url": "https://example.com"},
        headers=headers
    )
    if r.status_code != 400:
        print(f"❌ Expected 400, got {r.status_code}")
        return False
    
    error_msg = r.json().get("detail", "")
    if "déjà payée" not in error_msg.lower():
        print(f"❌ Unexpected error message: {error_msg}")
        return False
    
    print(f"✅ Correctly rejected with 400: {error_msg}")
    
    print("\n" + "=" * 80)
    print("✅ ALL INVOICE CHECKOUT TESTS PASSED")
    print("=" * 80)
    return True

if __name__ == "__main__":
    success = test_invoice_checkout()
    sys.exit(0 if success else 1)
