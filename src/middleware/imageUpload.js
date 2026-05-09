const path = require('path');
const multer = require('multer');

const ALLOWED_MIME_TYPES = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

function imageFileFilter(_req, file, cb) {
  const isAllowedMime = Boolean(ALLOWED_MIME_TYPES[file.mimetype]);
  const ext = path.extname(file.originalname || '').toLowerCase();
  const isAllowedExt = ['.jpg', '.jpeg', '.png', '.webp'].includes(ext);
  if (isAllowedMime && isAllowedExt) {
    cb(null, true);
    return;
  }
  const err = new Error('Only image files are allowed: jpg, jpeg, png, webp');
  err.status = 400;
  cb(err);
}

const imageUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: imageFileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
});

module.exports = { imageUpload };