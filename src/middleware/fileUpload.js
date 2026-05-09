const path = require('path');
const multer = require('multer');

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

const fileUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter,
});

module.exports = { fileUpload };