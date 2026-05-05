const mongoose = require('mongoose');

const platformSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: 'default' },
    general: {
      platform_name: { type: String, default: 'Success Skills Institute' },
      logo_url: { type: String, default: '' },
      favicon_url: { type: String, default: '' },
      language: { type: String, default: 'en' },
      timezone: { type: String, default: 'UTC' },
      currency: { type: String, default: 'USD' },
    },
    user_role: {
      enable_registration: { type: Boolean, default: true },
      instructor_approval: { type: String, enum: ['manual', 'auto'], default: 'manual' },
      roles: {
        admin: { type: Boolean, default: true },
        teacher: { type: Boolean, default: true },
        student: { type: Boolean, default: true },
        editor: { type: Boolean, default: true },
      },
      permissions: {
        manage_users: { type: Boolean, default: true },
        manage_courses: { type: Boolean, default: true },
        manage_payments: { type: Boolean, default: true },
        manage_reports: { type: Boolean, default: true },
      },
    },
    course: {
      course_approval: { type: String, enum: ['manual', 'auto'], default: 'manual' },
      enable_preview: { type: Boolean, default: true },
      progress_tracking: { type: Boolean, default: true },
      enable_certificates: { type: Boolean, default: true },
    },
    payment: {
      methods: {
        stripe: { type: Boolean, default: false },
        paypal: { type: Boolean, default: false },
        manual: { type: Boolean, default: true },
        evc_plus: { type: Boolean, default: false },
        zaad: { type: Boolean, default: false },
        sahal: { type: Boolean, default: false },
      },
      revenue_sharing_enabled: { type: Boolean, default: true },
      instructor_commission_percent: { type: Number, min: 0, max: 100, default: 70 },
      withdrawal: {
        min_amount: { type: Number, min: 0, default: 50 },
        hold_days: { type: Number, min: 0, default: 7 },
        methods: {
          manual: { type: Boolean, default: true },
          bank_transfer: { type: Boolean, default: false },
          e_check: { type: Boolean, default: false },
          paypal: { type: Boolean, default: false },
        },
        bank_instructions: { type: String, default: '' },
      },
    },
    video: {
      provider: { type: String, enum: ['youtube', 'vimeo', 'upload'], default: 'youtube' },
      autoplay: { type: Boolean, default: false },
      enable_controls: { type: Boolean, default: true },
      protection: {
        prevent_download: { type: Boolean, default: false },
        disable_embed: { type: Boolean, default: false },
      },
    },
    quiz: {
      passing_grade_percent: { type: Number, min: 0, max: 100, default: 70 },
      default_time_limit_minutes: { type: Number, min: 0, default: 30 },
      show_correct_answers: { type: Boolean, default: true },
      allow_retake: { type: Boolean, default: true },
    },
    certificate: {
      enable_generation: { type: Boolean, default: true },
      template_name: { type: String, default: 'Default template' },
      placeholders: {
        student_name: { type: Boolean, default: true },
        course_name: { type: Boolean, default: true },
        awarded_date: { type: Boolean, default: true },
      },
    },
    notifications: {
      email_notifications: { type: Boolean, default: true },
      course_completion_alerts: { type: Boolean, default: true },
      new_user_alerts: { type: Boolean, default: true },
      instructor_notifications: { type: Boolean, default: true },
    },
    security: {
      prevent_video_download: { type: Boolean, default: false },
      disable_right_click: { type: Boolean, default: false },
      session_timeout_minutes: { type: Number, min: 5, default: 60 },
      force_strong_passwords: { type: Boolean, default: true },
      max_login_attempts: { type: Number, min: 1, default: 5 },
    },
    appearance: {
      theme_color: { type: String, default: '#2563eb' },
      font_family: { type: String, default: 'Inter' },
      layout: { type: String, enum: ['default', 'compact', 'wide'], default: 'default' },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('PlatformSettings', platformSettingsSchema);
