/**
 * Upload controllers: stream bytes from multer memory → ImageKit.
 * Responses include url (delivery URL stored in MongoDB) and fileId (for delete/replace).
 */
const path = require('path');
const { isImageKitConfigured } = require('../config/imagekit');
const { uploadBuffer } = require('../services/imagekitMedia');

async function uploadImage(req, res) {
  if (!isImageKitConfigured()) {
    return res.status(503).json({ message: 'File uploads are not configured (ImageKit env missing on server)' });
  }
  if (!req.file?.buffer) {
    return res.status(400).json({ message: 'Image file is required' });
  }

  const ext =
    path.extname(req.file.originalname || '').toLowerCase() ||
    (req.file.mimetype === 'image/png'
      ? '.png'
      : req.file.mimetype === 'image/webp'
        ? '.webp'
        : '.jpg');
  const base = path
    .basename(req.file.originalname || 'image', path.extname(req.file.originalname || ''))
    .replace(/[^\w.\-]+/g, '_')
    .slice(0, 60);
  const fileName = `${base || 'image'}${ext}`;

  try {
    const uploaded = await uploadBuffer({
      buffer: req.file.buffer,
      fileName,
      folder: '/lms/images',
    });
    return res.status(201).json({
      message: 'Image uploaded',
      url: uploaded.url,
      fileId: uploaded.fileId,
      path: uploaded.filePath,
      filename: fileName,
      mimetype: req.file.mimetype,
      size: req.file.size,
    });
  } catch (err) {
    console.error('[upload] ImageKit image upload failed:', err?.message || err);
    return res.status(502).json({ message: 'Could not upload image to storage' });
  }
}

function inferFileType(mimetype = '', originalname = '') {
  const ext = String(originalname).toLowerCase();
  const type = String(mimetype).toLowerCase();
  if (type.includes('pdf') || ext.endsWith('.pdf')) return 'pdf';
  if (type.includes('powerpoint') || ext.endsWith('.ppt') || ext.endsWith('.pptx')) return 'ppt';
  if (type.includes('excel') || type.includes('spreadsheet') || ext.endsWith('.xls') || ext.endsWith('.xlsx'))
    return 'excel';
  if (type.includes('zip') || ext.endsWith('.zip')) return 'zip';
  return 'other';
}

async function uploadFile(req, res) {
  if (!isImageKitConfigured()) {
    return res.status(503).json({ message: 'File uploads are not configured (ImageKit env missing on server)' });
  }
  if (!req.file?.buffer) {
    return res.status(400).json({ message: 'File is required' });
  }

  const orig = String(req.file.originalname || 'resource');
  const fileName = orig.replace(/[^\w.\-\s]+/g, '_').slice(0, 180) || 'resource';

  try {
    const uploaded = await uploadBuffer({
      buffer: req.file.buffer,
      fileName,
      folder: '/lms/resources',
    });
    return res.status(201).json({
      message: 'File uploaded',
      url: uploaded.url,
      fileId: uploaded.fileId,
      path: uploaded.filePath,
      storage_path: '',
      filename: fileName,
      original_name: orig,
      mimetype: req.file.mimetype,
      size: req.file.size,
      size_bytes: req.file.size,
      file_type: inferFileType(req.file.mimetype, req.file.originalname),
    });
  } catch (err) {
    console.error('[upload] ImageKit file upload failed:', err?.message || err);
    return res.status(502).json({ message: 'Could not upload file to storage' });
  }
}

module.exports = { uploadImage, uploadFile };
