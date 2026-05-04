function uploadImage(req, res) {
  if (!req.file) {
    return res.status(400).json({ message: 'Image file is required' });
  }

  const relativePath = `/uploads/images/${req.file.filename}`;
  const host = req.get('host');
  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  const imageUrl = host ? `${protocol}://${host}${relativePath}` : relativePath;

  return res.status(201).json({
    message: 'Image uploaded',
    url: imageUrl,
    path: relativePath,
    filename: req.file.filename,
    mimetype: req.file.mimetype,
    size: req.file.size,
  });
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

function uploadFile(req, res) {
  if (!req.file) {
    return res.status(400).json({ message: 'File is required' });
  }

  const relativePath = `/uploads/resources/${req.file.filename}`;
  const host = req.get('host');
  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  const fileUrl = host ? `${protocol}://${host}${relativePath}` : relativePath;

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
