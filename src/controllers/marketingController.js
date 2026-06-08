const {
  PromotionalBanner,
  MarketingCampaign,
  EmailCampaign,
} = require('../models/Marketing');
const Order = require('../models/Order');

function parsePagination(query) {
  const page = Math.max(1, Number(query.page || 1));
  const limit = Math.min(100, Math.max(1, Number(query.limit || 20)));
  return { page, limit, skip: (page - 1) * limit };
}

/* ── Banners ── */

async function listBanners(req, res) {
  const { page, limit, skip } = parsePagination(req.query);
  const filter = {};
  if (req.query.placement) filter.placement = req.query.placement;
  if (req.query.active != null) filter.active = req.query.active === 'true';
  const [total, rows] = await Promise.all([
    PromotionalBanner.countDocuments(filter),
    PromotionalBanner.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
  ]);
  res.json({ total, page, limit, pages: Math.ceil(total / limit), banners: rows });
}

async function listActiveBanners(req, res) {
  const placement = req.query.placement;
  const now = new Date();
  const filter = {
    active: true,
    $and: [
      { $or: [{ starts_at: null }, { starts_at: { $lte: now } }] },
      { $or: [{ ends_at: null }, { ends_at: { $gte: now } }] },
    ],
  };
  if (placement) filter.placement = placement;
  const rows = await PromotionalBanner.find(filter).sort({ createdAt: -1 }).lean();
  res.json(rows);
}

async function createBanner(req, res) {
  const body = req.body || {};
  if (!body.title) return res.status(400).json({ message: 'title is required' });
  const row = await PromotionalBanner.create({
    title: String(body.title).trim(),
    image_url: String(body.image_url || '').trim(),
    link_url: String(body.link_url || '').trim(),
    placement: body.placement || 'homepage',
    starts_at: body.starts_at ? new Date(body.starts_at) : null,
    ends_at: body.ends_at ? new Date(body.ends_at) : null,
    active: body.active !== false,
  });
  res.status(201).json(row);
}

async function updateBanner(req, res) {
  const row = await PromotionalBanner.findById(req.params.id);
  if (!row) return res.status(404).json({ message: 'Banner not found' });
  const body = req.body || {};
  if (body.title != null) row.title = String(body.title).trim();
  if (body.image_url != null) row.image_url = String(body.image_url).trim();
  if (body.link_url != null) row.link_url = String(body.link_url).trim();
  if (body.placement != null) row.placement = body.placement;
  if (body.starts_at !== undefined) row.starts_at = body.starts_at ? new Date(body.starts_at) : null;
  if (body.ends_at !== undefined) row.ends_at = body.ends_at ? new Date(body.ends_at) : null;
  if (body.active != null) row.active = Boolean(body.active);
  await row.save();
  res.json(row);
}

async function deleteBanner(req, res) {
  const row = await PromotionalBanner.findByIdAndDelete(req.params.id);
  if (!row) return res.status(404).json({ message: 'Banner not found' });
  res.json({ message: 'Banner deleted' });
}

/* ── Marketing campaigns ── */

async function listCampaigns(req, res) {
  const { page, limit, skip } = parsePagination(req.query);
  const filter = {};
  if (req.query.active != null) filter.active = req.query.active === 'true';
  const [total, rows] = await Promise.all([
    MarketingCampaign.countDocuments(filter),
    MarketingCampaign.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
  ]);
  res.json({ total, page, limit, pages: Math.ceil(total / limit), campaigns: rows });
}

async function createCampaign(req, res) {
  const body = req.body || {};
  if (!body.name) return res.status(400).json({ message: 'name is required' });
  const row = await MarketingCampaign.create({
    name: String(body.name).trim(),
    campaign_type: body.campaign_type || 'promotion',
    description: String(body.description || '').trim(),
    discount_type: body.discount_type || 'none',
    discount_value: Number(body.discount_value || 0),
    starts_at: body.starts_at ? new Date(body.starts_at) : null,
    ends_at: body.ends_at ? new Date(body.ends_at) : null,
    active: body.active !== false,
  });
  res.status(201).json(row);
}

async function updateCampaign(req, res) {
  const row = await MarketingCampaign.findById(req.params.id);
  if (!row) return res.status(404).json({ message: 'Campaign not found' });
  const body = req.body || {};
  if (body.name != null) row.name = String(body.name).trim();
  if (body.campaign_type != null) row.campaign_type = body.campaign_type;
  if (body.description != null) row.description = String(body.description).trim();
  if (body.discount_type != null) row.discount_type = body.discount_type;
  if (body.discount_value != null) row.discount_value = Number(body.discount_value);
  if (body.starts_at !== undefined) row.starts_at = body.starts_at ? new Date(body.starts_at) : null;
  if (body.ends_at !== undefined) row.ends_at = body.ends_at ? new Date(body.ends_at) : null;
  if (body.active != null) row.active = Boolean(body.active);
  await row.save();
  res.json(row);
}

async function deleteCampaign(req, res) {
  const row = await MarketingCampaign.findByIdAndDelete(req.params.id);
  if (!row) return res.status(404).json({ message: 'Campaign not found' });
  res.json({ message: 'Campaign deleted' });
}

/* ── Email campaigns ── */

async function listEmailCampaigns(req, res) {
  const { page, limit, skip } = parsePagination(req.query);
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  const [total, rows] = await Promise.all([
    EmailCampaign.countDocuments(filter),
    EmailCampaign.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
  ]);
  res.json({ total, page, limit, pages: Math.ceil(total / limit), email_campaigns: rows });
}

async function createEmailCampaign(req, res) {
  const body = req.body || {};
  if (!body.subject) return res.status(400).json({ message: 'subject is required' });
  const row = await EmailCampaign.create({
    subject: String(body.subject).trim(),
    body: String(body.body || '').trim(),
    audience: body.audience || 'all_students',
    status: body.status || 'draft',
    scheduled_at: body.scheduled_at ? new Date(body.scheduled_at) : null,
  });
  res.status(201).json(row);
}

async function updateEmailCampaign(req, res) {
  const row = await EmailCampaign.findById(req.params.id);
  if (!row) return res.status(404).json({ message: 'Email campaign not found' });
  const body = req.body || {};
  if (body.subject != null) row.subject = String(body.subject).trim();
  if (body.body != null) row.body = String(body.body).trim();
  if (body.audience != null) row.audience = body.audience;
  if (body.status != null) row.status = body.status;
  if (body.scheduled_at !== undefined) row.scheduled_at = body.scheduled_at ? new Date(body.scheduled_at) : null;
  if (body.status === 'sent' && !row.sent_at) {
    row.sent_at = new Date();
    row.sent_count = Number(body.sent_count || row.sent_count || 0);
  }
  await row.save();
  res.json(row);
}

async function deleteEmailCampaign(req, res) {
  const row = await EmailCampaign.findByIdAndDelete(req.params.id);
  if (!row) return res.status(404).json({ message: 'Email campaign not found' });
  res.json({ message: 'Email campaign deleted' });
}

/* ── Overview stats ── */

async function marketingOverview(_req, res) {
  const [bannerCount, activeBanners, campaignCount, activeCampaigns, emailCount, sentEmails, revenueAgg] =
    await Promise.all([
      PromotionalBanner.countDocuments(),
      PromotionalBanner.countDocuments({ active: true }),
      MarketingCampaign.countDocuments(),
      MarketingCampaign.countDocuments({ active: true }),
      EmailCampaign.countDocuments(),
      EmailCampaign.countDocuments({ status: 'sent' }),
      Order.aggregate([{ $match: { status: 'paid' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
    ]);

  const topCampaigns = await MarketingCampaign.find({})
    .sort({ conversions: -1, revenue: -1 })
    .limit(5)
    .select('name conversions revenue active')
    .lean();

  res.json({
    banners: { total: bannerCount, active: activeBanners },
    campaigns: { total: campaignCount, active: activeCampaigns, top: topCampaigns },
    email_campaigns: { total: emailCount, sent: sentEmails },
    platform_revenue: Number((revenueAgg[0]?.total || 0).toFixed(2)),
  });
}

module.exports = {
  listBanners,
  listActiveBanners,
  createBanner,
  updateBanner,
  deleteBanner,
  listCampaigns,
  createCampaign,
  updateCampaign,
  deleteCampaign,
  listEmailCampaigns,
  createEmailCampaign,
  updateEmailCampaign,
  deleteEmailCampaign,
  marketingOverview,
};
