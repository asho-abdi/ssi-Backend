const fs = require('fs');
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

const uploadRoot = path.join(__dirname, '..', '..', 'uploads');
const imageUploadDir = path.join(uploadRoot, 'images');

if (!fs.existsSync(imageUploadDir)) {
  fs.mkdirSync(imageUploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, imageUploadDir),
  filename: (_req, file, cb) => {
    const ext = ALLOWED_MIME_TYPES[file.mimetype] || path.extname(file.originalname).toLowerCase();
    const safeBaseName = path
      .basename(file.originalname, path.extname(file.originalname))
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40);
    const finalName = `${safeBaseName || 'image'}-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, finalName);
  },
});

const imageUpload = multer({
  storage,
  fileFilter: imageFileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
});

module.exports = { imageUpload, imageUploadDir };