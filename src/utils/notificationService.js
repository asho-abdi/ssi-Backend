const Notification = require('../models/Notification');

async function notifyUsers(userIds, payload) {
  const uniqueIds = [...new Set((userIds || []).map((id) => String(id || '')).filter(Boolean))];
  if (uniqueIds.length === 0) return { inserted: 0 };
  const docs = uniqueIds.map((userId) => ({
    user_id: userId,
    type: String(payload?.type || 'general'),
    title: String(payload?.title || '').trim() || 'Notification',
    message: String(payload?.message || '').trim() || '',
    link: String(payload?.link || '').trim(),
    meta: payload?.meta && typeof payload.meta === 'object' ? payload.meta : {},
  }));
  await Notification.insertMany(docs, { ordered: false });
  return { inserted: docs.length };
}

module.exports = { notifyUsers };
