/**
 * ImageKit upload + delete helpers.
 * Upload flow: multer keeps file in memory → we pass buffer to ImageKit → DB stores returned url + fileId for later delete.
 */
const { getImageKit } = require('../config/imagekit');

/**
 * Upload a single file buffer to ImageKit.
 * @param {object} opts
 * @param {Buffer} opts.buffer
 * @param {string} opts.fileName - safe filename with extension
 * @param {string} opts.folder - e.g. "/lms/thumbnails" (leading slash optional)
 * @param {boolean} [opts.useUniqueFileName=true]
 */
async function uploadBuffer({ buffer, fileName, folder = '/lms', useUniqueFileName = true }) {
  const ik = getImageKit();
  const normalizedFolder = folder.startsWith('/') ? folder : `/${folder}`;
  const result = await ik.upload({
    file: buffer,
    fileName: String(fileName || 'file').replace(/[^\w.\-]+/g, '_'),
    folder: normalizedFolder,
    useUniqueFileName,
  });
  return {
    url: result.url,
    fileId: result.fileId,
    filePath: result.filePath,
  };
}

/**
 * Delete a file from the ImageKit media library by fileId (returned on upload).
 * Swallows 404-style errors so replays / stale IDs do not break requests.
 */
async function safeDeleteFile(fileId) {
  const id = String(fileId || '').trim();
  if (!id) return;
  try {
    const ik = getImageKit();
    await new Promise((resolve, reject) => {
      ik.deleteFile(id, (err, response) => {
        if (err) reject(err);
        else resolve(response);
      });
    });
  } catch (err) {
    const msg = String(err?.message || err || '');
    if (/not\s*found|404|does\s*not\s*exist/i.test(msg)) {
      return;
    }
    console.warn('[imagekit] deleteFile skipped or failed:', msg);
  }
}

module.exports = {
  uploadBuffer,
  safeDeleteFile,
};
