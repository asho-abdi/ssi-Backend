const CustomPricingLink = require('../models/CustomPricingLink');
const Course = require('../models/Course');
const { generatePricingToken } = require('../models/CustomPricingLink');

async function validatePricingLink(link, courseId) {
  if (!link || !link.active) return { ok: false, error: 'Pricing link is inactive' };
  if (link.expires_at && new Date(link.expires_at) < new Date()) {
    return { ok: false, error: 'Pricing link has expired' };
  }
  if (link.usage_limit != null && Number(link.used_count || 0) >= Number(link.usage_limit)) {
    return { ok: false, error: 'Pricing link usage limit reached' };
  }
  if (courseId && String(link.course_id) !== String(courseId)) {
    return { ok: false, error: 'Pricing link does not match this course' };
  }
  return { ok: true, link };
}

async function resolveByToken(token, courseId) {
  const link = await CustomPricingLink.findOne({ token: String(token || '').trim() }).lean();
  return validatePricingLink(link, courseId);
}

async function incrementUsage(linkId) {
  if (!linkId) return;
  await CustomPricingLink.findByIdAndUpdate(linkId, { $inc: { used_count: 1 } });
}

async function listPricingLinks(req, res) {
  const courseId = req.query.course_id;
  const filter = {};
  if (courseId) filter.course_id = courseId;
  const rows = await CustomPricingLink.find(filter)
    .populate('course_id', 'title price sale_price')
    .populate('created_by', 'name email')
    .sort({ createdAt: -1 })
    .lean();
  res.json(rows);
}

async function createPricingLink(req, res) {
  const { course_id, custom_price, label, notes, expires_at, usage_limit, active } = req.body || {};
  if (!course_id) return res.status(400).json({ message: 'course_id is required' });
  const price = Number(custom_price);
  if (!Number.isFinite(price) || price < 0) return res.status(400).json({ message: 'custom_price must be non-negative' });
  const course = await Course.findById(course_id).lean();
  if (!course) return res.status(404).json({ message: 'Course not found' });

  const token = generatePricingToken();
  const row = await CustomPricingLink.create({
    course_id,
    token,
    custom_price: price,
    label: String(label || '').trim(),
    notes: String(notes || '').trim(),
    expires_at: expires_at ? new Date(expires_at) : null,
    usage_limit: usage_limit != null ? Number(usage_limit) : null,
    active: active !== false,
    created_by: req.userId,
  });
  res.status(201).json(row);
}

async function updatePricingLink(req, res) {
  const row = await CustomPricingLink.findById(req.params.id);
  if (!row) return res.status(404).json({ message: 'Pricing link not found' });
  const { custom_price, label, notes, expires_at, usage_limit, active } = req.body || {};
  if (custom_price != null) {
    const price = Number(custom_price);
    if (!Number.isFinite(price) || price < 0) return res.status(400).json({ message: 'custom_price must be non-negative' });
    row.custom_price = price;
  }
  if (label != null) row.label = String(label).trim();
  if (notes != null) row.notes = String(notes).trim();
  if (expires_at !== undefined) row.expires_at = expires_at ? new Date(expires_at) : null;
  if (usage_limit !== undefined) row.usage_limit = usage_limit != null ? Number(usage_limit) : null;
  if (active != null) row.active = Boolean(active);
  await row.save();
  res.json(row);
}

async function deletePricingLink(req, res) {
  const row = await CustomPricingLink.findByIdAndDelete(req.params.id);
  if (!row) return res.status(404).json({ message: 'Pricing link not found' });
  res.json({ message: 'Deleted' });
}

async function publicResolve(req, res) {
  const { token } = req.params;
  const courseId = req.query.course_id;
  const result = await resolveByToken(token, courseId);
  if (!result.ok) return res.status(400).json({ message: result.error });
  const course = await Course.findById(result.link.course_id).select('title price sale_price thumbnail pricing_type').lean();
  res.json({
    link: {
      _id: result.link._id,
      token: result.link.token,
      custom_price: result.link.custom_price,
      label: result.link.label,
      expires_at: result.link.expires_at,
    },
    course,
  });
}

module.exports = {
  validatePricingLink,
  resolveByToken,
  incrementUsage,
  listPricingLinks,
  createPricingLink,
  updatePricingLink,
  deletePricingLink,
  publicResolve,
};
