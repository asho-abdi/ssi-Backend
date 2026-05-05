const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    actor_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    actor_role: { type: String, trim: true, default: 'system', index: true },
    action: { type: String, required: true, trim: true, index: true },
    target_type: { type: String, trim: true, default: '' },
    target_id: { type: String, trim: true, default: '' },
    status: { type: String, enum: ['success', 'failed'], default: 'success', index: true },
    ip_address: { type: String, trim: true, default: '' },
    user_agent: { type: String, trim: true, default: '' },
    details: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

auditLogSchema.index({ createdAt: -1, action: 1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
