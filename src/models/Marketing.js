const mongoose = require('mongoose');

const promotionalBannerSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    image_url: { type: String, default: '', trim: true },
    link_url: { type: String, default: '', trim: true },
    placement: { type: String, enum: ['homepage', 'catalog', 'dashboard'], default: 'homepage', index: true },
    starts_at: { type: Date, default: null },
    ends_at: { type: Date, default: null },
    active: { type: Boolean, default: true, index: true },
    impressions: { type: Number, min: 0, default: 0 },
    clicks: { type: Number, min: 0, default: 0 },
  },
  { timestamps: true }
);

const marketingCampaignSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    campaign_type: { type: String, enum: ['discount', 'promotion', 'referral'], default: 'promotion' },
    description: { type: String, default: '', trim: true },
    discount_type: { type: String, enum: ['percentage', 'fixed', 'none'], default: 'none' },
    discount_value: { type: Number, min: 0, default: 0 },
    starts_at: { type: Date, default: null },
    ends_at: { type: Date, default: null },
    active: { type: Boolean, default: true, index: true },
    conversions: { type: Number, min: 0, default: 0 },
    revenue: { type: Number, min: 0, default: 0 },
  },
  { timestamps: true }
);

const emailCampaignSchema = new mongoose.Schema(
  {
    subject: { type: String, required: true, trim: true },
    body: { type: String, default: '', trim: true },
    audience: { type: String, enum: ['all_students', 'all_instructors', 'custom'], default: 'all_students' },
    status: { type: String, enum: ['draft', 'scheduled', 'sent', 'cancelled'], default: 'draft', index: true },
    scheduled_at: { type: Date, default: null },
    sent_at: { type: Date, default: null },
    sent_count: { type: Number, min: 0, default: 0 },
  },
  { timestamps: true }
);

module.exports = {
  PromotionalBanner: mongoose.model('PromotionalBanner', promotionalBannerSchema),
  MarketingCampaign: mongoose.model('MarketingCampaign', marketingCampaignSchema),
  EmailCampaign: mongoose.model('EmailCampaign', emailCampaignSchema),
};
