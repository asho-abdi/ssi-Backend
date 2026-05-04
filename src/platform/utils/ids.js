const crypto = require('crypto');

function generateCertificateId(prefix = 'CERT') {
  const rand = crypto.randomBytes(4).toString('hex').toUpperCase();
  const ts = Date.now().toString(36).toUpperCase();
  return `${prefix}-${ts}-${rand}`;
}

module.exports = { generateCertificateId };
