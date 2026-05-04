const AuditLog = require('../models/AuditLog');

async function listAuditLogs(req, res) {
  const limit = Math.min(200, Math.max(1, Number(req.query.limit || 30)));
  const page = Math.max(1, Number(req.query.page || 1));
  const skip = (page - 1) * limit;

  const query = {};
  if (req.query.action) query.action = String(req.query.action).trim();
  if (req.query.actor_role) query.actor_role = String(req.query.actor_role).trim();
  if (req.query.status) query.status = String(req.query.status).trim();

  const [rows, total] = await Promise.all([
    AuditLog.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('actor_id', 'name email role').lean(),
    AuditLog.countDocuments(query),
  ]);

  res.json({
    page,
    limit,
    total,
    pages: Math.ceil(total / limit),
    rows,
  });
}

module.exports = { listAuditLogs };
