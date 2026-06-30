const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { isAllowedResourceUpload } = require('../utils/resourceFileTypes');

const uploadDir = path.resolve(process.cwd(), 'uploads', 'resources');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const safeBase = path.basename(file.originalname, path.extname(file.originalname)).replace(/[^a-zA-Z0-9_-]/g, '_');
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${safeBase}${ext}`);
  },
});

function fileFilter(_req, file, cb) {
  if (isAllowedResourceUpload(file)) {
    cb(null, true);
    return;
  }
  cb(new Error('File type not allowed. Upload PDF, Office files, archives, installers, or other supported resources.'));
}

const fileUpload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter,
});

module.exports = { fileUpload };
