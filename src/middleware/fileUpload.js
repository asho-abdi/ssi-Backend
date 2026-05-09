const fs = require('fs');
const path = require('path');
const multer = require('multer');

const uploadDir = path.resolve(process.cwd(), 'uploads', 'resources');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const allowedMimeTypes = new Set([
  'application/pdf',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/zip',
  'application/x-zip-compressed',
]);

const allowedExtensions = new Set(['.pdf', '.ppt', '.pptx', '.xls', '.xlsx', '.zip']);

function fileFilter(_req, file, cb) {
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (allowedMimeTypes.has(file.mimetype) || allowedExtensions.has(ext)) {
    cb(null, true);
    return;
  }
  cb(new Error('Only PPT, PDF, Excel, and ZIP files are allowed'));
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const safeBase = path.basename(file.originalname, path.extname(file.originalname)).replace(/[^a-zA-Z0-9_-]/g, '_');
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${safeBase}${ext}`);
  },
});

const fileUpload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter,
});

module.exports = { fileUpload };