const mongoose = require('mongoose');
const crypto = require('crypto');

const EVENT_TYPES = ['webinar', 'physical'];
const EVENT_STATUSES = ['draft', 'published', 'closed', 'cancelled'];
const MEETING_PLATFORMS = ['zoom', 'google_meet', 'microsoft_teams', 'custom'];

const eventSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true, unique: true },
    description: { type: String, default: '' },
    event_type: { type: String, enum: EVENT_TYPES, required: true },
    category: { type: String, default: '', trim: true },
    thumbnail: { type: String, default: '' },

    instructor: {
      name: { type: String, default: '', trim: true },
      photo: { type: String, default: '' },
      bio: { type: String, default: '' },
    },

    event_date: { type: Date, required: true },
    start_time: { type: String, default: '' },
    end_time: { type: String, default: '' },
    timezone: { type: String, default: 'UTC' },

    /** Physical event address */
    location: { type: String, default: '' },

    /** Webinar-specific */
    webinar_link: { type: String, default: '' },
    meeting_platform: { type: String, enum: [...MEETING_PLATFORMS, ''], default: '' },

    capacity: {
      unlimited: { type: Boolean, default: true },
      max_participants: { type: Number, min: 1, default: null },
    },

    registration: {
      enabled: { type: Boolean, default: true },
      require_approval: { type: Boolean, default: false },
      open_date: { type: Date, default: null },
      close_date: { type: Date, default: null },
    },

    status: { type: String, enum: EVENT_STATUSES, default: 'draft' },

    /** Unique public token for the registration URL */
    registration_token: { type: String, unique: true, sparse: true },
  },
  { timestamps: true }
);

eventSchema.index({ status: 1, event_date: 1 });
eventSchema.index({ registration_token: 1 });

/** Auto-generate slug and registration_token before first save */
eventSchema.pre('validate', function (next) {
  if (!this.slug) {
    this.slug = this.title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .substring(0, 80);
  }
  if (!this.registration_token) {
    this.registration_token = crypto.randomBytes(16).toString('hex');
  }
  next();
});

module.exports = mongoose.model('Event', eventSchema);
