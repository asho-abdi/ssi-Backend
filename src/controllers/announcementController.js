const Announcement = require('../models/Announcement');
const { AUDIENCE_ROLES } = require('../models/Announcement');
const { logAuditEvent } = require('../utils/auditLog');

function normalizeAudienceRoles(input) {
  if (!Array.isArray(input) || input.length === 0) return [...AUDIENCE_ROLES];
  const roles = [...new Set(input.map((v) => String(v || '').trim().toLowerCase()).filter((v) => AUDIENCE_ROLES.includes(v)))];
  return roles.length > 0 ? roles : [...AUDIENCE_ROLES];
}

function normalizeDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

async function listVisible(req, res) {
  const now = new Date();
  const role = String(req.userRole || '').toLowerCase();
  const rows = await Announcement.find({
    is_active: true,
    audience_roles: role,
    starts_at: { $lte: now },
    $or: [{ ends_at: null }, { ends_at: { $gte: now } }],
  })
    .sort({ priority: -1, starts_at: -1, createdAt: -1 })
    .limit(20)
    .lean();
  res.json(rows);
}

async function listAllAdmin(req, res) {
  const limit = Math.min(200, Math.max(1, Number(req.query.limit || 60)));
  const rows = await Announcement.find({})
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('created_by', 'name email role')
    .lean();
  res.json(rows);
}

async function createAnnouncement(req, res) {
  const title = String(req.body?.title || '').trim();
  const message = String(req.body?.message || '').trim();
  if (!title || !message) {
    return res.status(400).json({ message: 'title and message are required' });
  }
  const startsAt = normalizeDate(req.body?.starts_at) || new Date();
  const endsAt = normalizeDate(req.body?.ends_at);
  if (endsAt && endsAt < startsAt) {
    return res.status(400).json({ message: 'ends_at must be after starts_at' });
  }

  const announcement = await Announcement.create({
    title,
    message,
    priority: ['low', 'normal', 'high'].includes(String(req.body?.priority || '')) ? req.body.priority : 'normal',
    audience_roles: normalizeAudienceRoles(req.body?.audience_roles),
    starts_at: startsAt,
    ends_at: endsAt,
    is_active: req.body?.is_active != null ? Boolean(req.body.is_active) : true,
    created_by: req.userId,
  });

  await logAuditEvent(req, {
    action: 'admin.announcement_create',
    target_type: 'announcement',
    target_id: announcement._id,
    details: { title: announcement.title, priority: announcement.priority },
  });

  res.status(201).json(announcement);
}

async function updateAnnouncement(req, res) {
  const announcement = await Announcement.findById(req.params.id);
  if (!announcement) return res.status(404).json({ message: 'Announcement not found' });

  if (req.body?.title != null) announcement.title = String(req.body.title).trim();
  if (req.body?.message != null) announcement.message = String(req.body.message).trim();
  if (req.body?.priority != null) {
    const nextPriority = String(req.body.priority).trim().toLowerCase();
    if (!['low', 'normal', 'high'].includes(nextPriority)) {
      return res.status(400).json({ message: 'Invalid priority' });
    }
    announcement.priority = nextPriority;
  }
  if (req.body?.audience_roles != null) {
    announcement.audience_roles = normalizeAudienceRoles(req.body.audience_roles);
  }
  if (req.body?.starts_at != null) {
    const startsAt = normalizeDate(req.body.starts_at);
    if (!startsAt) return res.status(400).json({ message: 'Invalid starts_at' });
    announcement.starts_at = startsAt;
  }
  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'ends_at')) {
    const endsAt = normalizeDate(req.body.ends_at);
    if (req.body.ends_at && !endsAt) return res.status(400).json({ message: 'Invalid ends_at' });
    announcement.ends_at = endsAt;
  }
  if (req.body?.is_active != null) announcement.is_active = Boolean(req.body.is_active);
  if (announcement.ends_at && announcement.ends_at < announcement.starts_at) {
    return res.status(400).json({ message: 'ends_at must be after starts_at' });
  }

  await announcement.save();
  await logAuditEvent(req, {
    action: 'admin.announcement_update',
    target_type: 'announcement',
    target_id: announcement._id,
    details: { title: announcement.title, active: announcement.is_active },
  });

  res.json(announcement);
}

async function deleteAnnouncement(req, res) {
  const announcement = await Announcement.findByIdAndDelete(req.params.id);
  if (!announcement) return res.status(404).json({ message: 'Announcement not found' });
  await logAuditEvent(req, {
    action: 'admin.announcement_delete',
    target_type: 'announcement',
    target_id: announcement._id,
    details: { title: announcement.title },
  });
  res.json({ message: 'Announcement deleted' });
}

module.exports = {
  listVisible,
  listAllAdmin,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
};
