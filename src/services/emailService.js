const nodemailer = require('nodemailer');

let transporter = null;

function isConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function getTransporter() {
  if (transporter) return transporter;
  if (!isConfigured()) return null;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
  return transporter;
}

async function sendPasswordResetOtp({ to, name, code, expiresMinutes }) {
  const from = process.env.EMAIL_FROM || process.env.SMTP_USER;
  const subject = 'Your password reset code';
  const text = `Hello ${name || 'there'},\n\nYour password reset code is: ${code}\n\nIt expires in ${expiresMinutes} minutes.\n\nIf you did not request this, ignore this email.\n\n— Success Skills Institute`;
  const html = `<p>Hello ${name || 'there'},</p><p>Your password reset code is:</p><p style="font-size:24px;font-weight:bold;letter-spacing:4px">${code}</p><p>It expires in ${expiresMinutes} minutes.</p><p>If you did not request this, ignore this email.</p>`;

  const transport = getTransporter();
  if (!transport) {
    console.warn('[email] SMTP not configured — OTP not sent to', to);
    return { ok: false, error: 'Email service not configured' };
  }

  try {
    await transport.sendMail({ from, to, subject, text, html });
    return { ok: true };
  } catch (err) {
    console.error('[email] send failed:', err?.message || err);
    return { ok: false, error: 'Failed to send email' };
  }
}

async function sendEventConfirmationEmail({ to, name, eventTitle, eventDate, status }) {
  const from = process.env.EMAIL_FROM || process.env.SMTP_USER;
  const dateStr = eventDate ? new Date(eventDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : '';
  const isApproved = status === 'approved';
  const subject = isApproved ? `Registration Confirmed: ${eventTitle}` : `Registration Received: ${eventTitle}`;
  const text = isApproved
    ? `Hello ${name},\n\nYour registration for "${eventTitle}"${dateStr ? ` on ${dateStr}` : ''} is confirmed.\n\n— Success Skills Institute`
    : `Hello ${name},\n\nWe received your registration for "${eventTitle}". You will be notified once it is reviewed.\n\n— Success Skills Institute`;
  const html = isApproved
    ? `<p>Hello ${name},</p><p>Your registration for <strong>${eventTitle}</strong>${dateStr ? ` on ${dateStr}` : ''} is <strong>confirmed</strong>.</p><p>— Success Skills Institute</p>`
    : `<p>Hello ${name},</p><p>We received your registration for <strong>${eventTitle}</strong>. You will be notified once it is reviewed.</p><p>— Success Skills Institute</p>`;

  const transport = getTransporter();
  if (!transport) {
    console.warn('[email] SMTP not configured — event confirmation not sent to', to);
    return { ok: false };
  }
  try {
    await transport.sendMail({ from, to, subject, text, html });
    return { ok: true };
  } catch (err) {
    console.error('[email] event confirmation failed:', err?.message || err);
    return { ok: false };
  }
}

module.exports = { isConfigured, sendPasswordResetOtp, sendEventConfirmationEmail };
