import os
import smtplib
from email.message import EmailMessage

# Load credentials from environment
GMAIL_USER = "taps.slug.tracker@gmail.com"
GMAIL_APP_PASSWORD = os.getenv("GMAIL_APP_PASSWORD")

if not GMAIL_APP_PASSWORD:
    raise SystemExit("❌ GMAIL_APP_PASSWORD not found in environment variables.")

# Compose a simple test message
msg = EmailMessage()
msg["Subject"] = "TAPS Tracker SMTP Test"
msg["From"]    = GMAIL_USER
msg["To"]      = GMAIL_USER   # send to yourself for testing
msg.set_content("If you see this email, your SMTP settings are correct!")

# Send via Gmail’s SMTP server
with smtplib.SMTP_SSL("smtp.gmail.com", 465) as smtp:
    smtp.login(GMAIL_USER, GMAIL_APP_PASSWORD)
    smtp.send_message(msg)

print("✅ Test email sent successfully!")
