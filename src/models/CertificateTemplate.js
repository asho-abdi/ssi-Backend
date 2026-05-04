const mongoose = require('mongoose');

const certificateTemplateSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: 'default' },
    org_name: { type: String, default: 'Success Skills Institute' },
    certificate_title: { type: String, default: 'Certificate of Completion' },
    subtitle: { type: String, default: 'This certifies that' },
    completion_text: { type: String, default: 'has successfully completed the course' },
    signature_name: { type: String, default: 'Head of Academics' },
    footer_text: { type: String, default: 'Issued by Success Skills Institute' },
    accent_color: { type: String, default: '#1d3557' },
    background_color: { type: String, default: '#f8fafc' },
    border_color: { type: String, default: '#f28c28' },
    design_image: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('CertificateTemplate', certificateTemplateSchema);
