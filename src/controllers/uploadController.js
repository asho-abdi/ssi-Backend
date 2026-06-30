function publicOrigin() {
  const fromEnv = (process.env.PUBLIC_MEDIA_ORIGIN || process.env.MEDIA_PUBLIC_ORIGIN || '').trim();
  return fromEnv.replace(/\/+$/, '');
}

function absoluteFileUrl(relativePath, req) {
  const origin = publicOrigin();
  if (origin) return `${origin}${relativePath}`;
  // No PUBLIC_MEDIA_ORIGIN set → return relative path so the Vite dev proxy
  // or same-origin serving (production) handles the /uploads/* route correctly.
  // We avoid embedding a hard-coded localhost:PORT that breaks across browsers/environments.
  return relativePath;
}

function uploadImage(req, res) {
  if (!req.file) {
    return res.status(400).json({ message: 'Image file is required' });
  }

  const relativePath = `/uploads/images/${req.file.filename}`;
  const imageUrl = absoluteFileUrl(relativePath, req);

  return res.status(201).json({
    message: 'Image uploaded',
    url: imageUrl,
    path: relativePath,
    filename: req.file.filename,
    mimetype: req.file.mimetype,
    size: req.file.size,
  });
}

const { inferFileType } = require('../utils/resourceFileTypes');

function uploadFile(req, res) {
  if (!req.file) {
    return res.status(400).json({ message: 'File is required' });
  }

  const relativePath = `/uploads/resources/${req.file.filename}`;
  const fileUrl = absoluteFileUrl(relativePath, req);

  return res.status(201).json({
    message: 'File uploaded',
    url: fileUrl,
    path: relativePath,
    storage_path: relativePath,
    filename: req.file.filename,
    original_name: req.file.originalname,
    mimetype: req.file.mimetype,
    size: req.file.size,
    size_bytes: req.file.size,
    file_type: inferFileType(req.file.mimetype, req.file.originalname),
  });
}

module.exports = { uploadImage, uploadFile };
