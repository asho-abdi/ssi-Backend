const Notification = require('../models/Notification');

async function listMyNotifications(req, res) {
  const limit = Math.min(200, Math.max(1, Number(req.query.limit || 50)));
  const rows = await Notification.find({ user_id: req.userId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
  const unread_count = await Notification.countDocuments({ user_id: req.userId, is_read: false });
  res.json({ unread_count, rows });
}

async function markRead(req, res) {
  const id = String(req.params.id || '').trim();
  const updated = await Notification.findOneAndUpdate(
    { _id: id, user_id: req.userId },
    { $set: { is_read: true, read_at: new Date() } },
    { new: true }
  ).lean();
  if (!updated) return res.status(404).json({ message: 'Notification not found' });
  res.json(updated);
}

async function markAllRead(req, res) {
  await Notification.updateMany({ user_id: req.userId, is_read: false }, { $set: { is_read: true, read_at: new Date() } });
  res.json({ message: 'All notifications marked as read' });
}

module.exports = { listMyNotifications, markRead, markAllRead };
