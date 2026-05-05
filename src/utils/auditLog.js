const AuditLog = require('../models/AuditLog');

function pickIp(req) {
  return (
    req?.headers?.['x-forwarded-for'] ||
    req?.ip ||
    req?.socket?.remoteAddress ||
    req?.connection?.remoteAddress ||
    ''
  );
}

async function logAuditEvent(req, payload) {
  try {
    const actorRole = req?.user?.role || req?.actorRole || payload?.actor_role || 'system';
    const actorId = req?.userId || payload?.actor_id || null;
    await AuditLog.create({
      actor_id: actorId || null,
      actor_role: actorRole,
      action: String(payload?.action || '').trim(),
      target_type: String(payload?.target_type || '').trim(),
      target_id: payload?.target_id != null ? String(payload.target_id) : '',
      status: payload?.status === 'failed' ? 'failed' : 'success',
      ip_address: String(pickIp(req) || ''),
      user_agent: String(req?.headers?.['user-agent'] || ''),
      details: payload?.details && typeof payload.details === 'object' ? payload.details : {},
    });
  } catch (_error) {
    // Do not block user flows if audit logging fails.
  }
}

module.exports = { logAuditEvent };
