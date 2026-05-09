const PlatformSettings = require('../models/PlatformSettings');
const { logAuditEvent } = require('../utils/auditLog');

const SECTIONS = [
  'general',
  'user_role',
  'course',
  'payment',
  'video',
  'quiz',
  'certificate',
  'notifications',
  'security',
  'appearance',
];

function mergePlain(target, patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return target;
  const next = { ...(target || {}) };
  for (const [key, value] of Object.entries(patch)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      next[key] = mergePlain(next[key], value);
    } else {
      next[key] = value;
    }
  }
  return next;
}

/** Plain object for a settings section so merges never drop sibling keys (Mongoose subdocs don't spread like POJOs). */
function sectionToPlain(settings, section) {
  const doc = settings.get ? settings.get(section) : settings[section];
  if (doc == null) return {};
  if (typeof doc.toObject === 'function') {
    return doc.toObject({ flattenMaps: true });
  }
  if (typeof doc === 'object' && !Array.isArray(doc)) {
    return { ...doc };
  }
  return {};
}

async function getOrCreateSettings() {
  let settings = await PlatformSettings.findOne({ key: 'default' });
  if (!settings) {
    settings = await PlatformSettings.create({ key: 'default' });
  }
  return settings;
}

function toDTO(settingsDoc) {
  const raw = settingsDoc.toObject();
  delete raw._id;
  delete raw.__v;
  return raw;
}

async function getSettings(_req, res) {
  const settings = await getOrCreateSettings();
  res.json(toDTO(settings));
}

async function updateSection(req, res) {
  const section = String(req.params.section || '').trim().toLowerCase();
  if (!SECTIONS.includes(section)) {
    return res.status(400).json({ message: 'Invalid settings section' });
  }

  const incoming = req.body || {};
  if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) {
    return res.status(400).json({ message: 'Invalid payload' });
  }

  if (section === 'payment' && Object.prototype.hasOwnProperty.call(incoming, 'instructor_commission_percent')) {
    const pct = Number(incoming.instructor_commission_percent);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      return res.status(400).json({ message: 'Instructor percentage must be between 0 and 100' });
    }
  }

  const settings = await getOrCreateSettings();
  const baseline = sectionToPlain(settings, section);
  const merged = mergePlain(baseline, incoming);
  settings.set(section, merged);
  settings.markModified(section);

  try {
    await settings.save();
  } catch (err) {
    if (err?.name === 'ValidationError') {
      return res.status(400).json({ message: err.message || 'Validation failed' });
    }
    throw err;
  }
  await logAuditEvent(req, {
    action: 'admin.settings_update',
    target_type: 'settings',
    target_id: section,
    details: { section },
  });

  res.json({
    message: `${section} settings saved`,
    settings: toDTO(settings),
  });
}

module.exports = {
  getSettings,
  updateSection,
};
