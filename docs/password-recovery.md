# Email password recovery

Both users and administrators use Forgot Password with their registered email. A six-digit code expires after ten minutes and allows at most five verification attempts. Enter the code and a new password to reset it. Resending replaces the previous code. Resetting revokes the existing refresh session and does not unlock accounts locked by an administrator or inactivity.

Configure the backend mail service in `backend/.env` or the deployment environment:

```dotenv
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-mail-account
SMTP_PASS=your-mail-provider-password
EMAIL_FROM=your-verified-sender@example.com
```

Use the mail provider's credentials and verified sender. For implicit TLS on port 465, set `SMTP_SECURE=true`. Restart the backend after changing configuration. Email delivery requires a working SMTP connection; automated recovery tests mock delivery and do not send real emails.
