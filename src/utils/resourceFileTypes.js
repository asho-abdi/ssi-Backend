const path = require('path');

const RESOURCE_EXTENSIONS = new Set([
  '.pdf',
  '.doc',
  '.docx',
  '.ppt',
  '.pptx',
  '.xls',
  '.xlsx',
  '.csv',
  '.zip',
  '.rar',
  '.7z',
  '.tar',
  '.gz',
  '.exe',
  '.msi',
  '.dmg',
  '.deb',
  '.rpm',
  '.apk',
  '.pkg',
  '.txt',
  '.rtf',
  '.odt',
  '.ods',
  '.odp',
]);

const RESOURCE_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'application/zip',
  'application/x-zip-compressed',
  'application/x-rar-compressed',
  'application/x-7z-compressed',
  'application/x-tar',
  'application/gzip',
  'application/vnd.android.package-archive',
  'application/x-msdownload',
  'application/x-msi',
  'application/octet-stream',
]);

const INSTALLER_EXTENSIONS = new Set(['.exe', '.msi', '.dmg', '.deb', '.rpm', '.apk', '.pkg']);

function inferFileType(mimetype = '', originalname = '') {
  const ext = String(originalname).toLowerCase();
  const type = String(mimetype).toLowerCase();
  if (type.includes('pdf') || ext.endsWith('.pdf')) return 'pdf';
  if (type.includes('word') || ext.endsWith('.doc') || ext.endsWith('.docx')) return 'word';
  if (type.includes('powerpoint') || ext.endsWith('.ppt') || ext.endsWith('.pptx')) return 'ppt';
  if (type.includes('excel') || type.includes('spreadsheet') || ext.endsWith('.xls') || ext.endsWith('.xlsx') || ext.endsWith('.csv')) {
    return 'excel';
  }
  if (type.includes('zip') || ext.endsWith('.zip') || ext.endsWith('.rar') || ext.endsWith('.7z') || ext.endsWith('.tar') || ext.endsWith('.gz')) {
    return 'zip';
  }
  return 'other';
}

function isAllowedResourceUpload(file) {
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (RESOURCE_EXTENSIONS.has(ext)) return true;
  const mime = String(file.mimetype || '').toLowerCase();
  if (RESOURCE_MIME_TYPES.has(mime) && (mime !== 'application/octet-stream' || INSTALLER_EXTENSIONS.has(ext))) {
    return true;
  }
  return INSTALLER_EXTENSIONS.has(ext);
}

module.exports = {
  RESOURCE_EXTENSIONS,
  RESOURCE_MIME_TYPES,
  inferFileType,
  isAllowedResourceUpload,
};
