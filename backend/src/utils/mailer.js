const nodemailer = require('nodemailer');

let transporter = null;

const getTransporter = () => {
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });

  return transporter;
};

const sendPasswordResetEmail = async (user, resetUrl) => {
  const from = process.env.EMAIL_FROM || 'no-reply@pais.local';
  const displayName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username;

  await getTransporter().sendMail({
    from,
    to: user.email,
    subject: 'Reset your PAIS password',
    html: `
      <div style="font-family: Arial, Helvetica, sans-serif; max-width: 480px; margin: 0 auto; color: #1e293b;">
        <h2 style="color:#0f172a;">Password Reset Request</h2>
        <p>Hi ${displayName},</p>
        <p>We received a request to reset your PAIS (Property Accountability Information System) account password. Click the button below to choose a new one. This link expires in 1 hour.</p>
        <p style="text-align:center; margin: 28px 0;">
          <a href="${resetUrl}" style="background:#0d9488;color:#ffffff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;">Reset Password</a>
        </p>
        <p>If you didn't request a password reset, you can safely ignore this email — your password will not be changed.</p>
        <p style="color:#94a3b8;font-size:12px;">If the button above doesn't work, copy and paste this link into your browser:<br/>${resetUrl}</p>
      </div>
    `,
  });
};

module.exports = { sendPasswordResetEmail };
