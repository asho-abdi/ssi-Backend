const path = require('path');
const { isImageKitConfigured } = require('../config/imagekit');
const { uploadBuffer } = require('../services/imagekitMedia');

async function uploadImage(req, res) {
  if (!isImageKitConfigured()) {
    return res.status(503).json({ message: 'ImageKit is not configured on server' });
  }
  if (!req.file?.buffer) {
    return res.status(400).json({ message: 'Image file is required' });
  }

  const ext =
    path.extname(req.file.originalname || '').toLowerCase() ||
    (req.file.mimetype === 'image/png' ? '.png' : req.file.mimetype === 'image/webp' ? '.webp' : '.jpg');

  const safeBase = path
    .basename(req.file.originalname || 'image', path.extname(req.file.originalname || ''))
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 60);

  const fileName = `${safeBase || 'image'}${ext}`;

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
    console.error('[upload] image upload failed:', err?.message || err);
    return res.status(502).json({ message: 'Failed to upload image to ImageKit' });
  }
}

function inferFileType(mimetype = '', originalname = '') {
  const ext = String(originalname).toLowerCase();
  const type = String(mimetype).toLowerCase();
  if (type.includes('pdf') || ext.endsWith('.pdf')) return 'pdf';
  if (type.includes('powerpoint') || ext.endsWith('.ppt') || ext.endsWith('.pptx')) return 'ppt';
  if (type.includes('excel') || type.includes('spreadsheet') || ext.endsWith('.xls') || ext.endsWith('.xlsx')) return 'excel';
  if (type.includes('zip') || ext.endsWith('.zip')) return 'zip';
  return 'other';
}

async function uploadFile(req, res) {
  if (!isImageKitConfigured()) {
    return res.status(503).json({ message: 'ImageKit is not configured on server' });
  }
  if (!req.file?.buffer) {
    return res.status(400).json({ message: 'File is required' });
  }

  const original = String(req.file.originalname || 'resource').trim();
  const safeName = original.replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 180) || 'resource';

  try {
    const uploaded = await uploadBuffer({
      buffer: req.file.buffer,
      fileName: safeName,
      folder: '/lms/resources',
    });

    return res.status(201).json({
      message: 'File uploaded',
      url: uploaded.url,
      fileId: uploaded.fileId,
      path: uploaded.filePath,
      storage_path: '',
      filename: safeName,
      original_name: original,
      mimetype: req.file.mimetype,
      size: req.file.size,
      size_bytes: req.file.size,
      file_type: inferFileType(req.file.mimetype, req.file.originalname),
    });
  } catch (err) {
    console.error('[upload] file upload failed:', err?.message || err);
    return res.status(502).json({ message: 'Failed to upload file to ImageKit' });
  }
}

module.exports = { uploadImage, uploadFile };