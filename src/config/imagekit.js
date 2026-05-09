const ImageKit = require('imagekit');

let imagekitClient = null;

function isImageKitConfigured() {
  return Boolean(
    String(process.env.IMAGEKIT_PUBLIC_KEY || '').trim() &&
      String(process.env.IMAGEKIT_PRIVATE_KEY || '').trim() &&
      String(process.env.IMAGEKIT_URL_ENDPOINT || '').trim()
  );
}

function getImageKit() {
  if (!isImageKitConfigured()) {
    throw new Error('ImageKit env vars are missing. Set IMAGEKIT_PUBLIC_KEY, IMAGEKIT_PRIVATE_KEY, IMAGEKIT_URL_ENDPOINT.');
  }
  if (!imagekitClient) {
    imagekitClient = new ImageKit({
      publicKey: String(process.env.IMAGEKIT_PUBLIC_KEY || '').trim(),
      privateKey: String(process.env.IMAGEKIT_PRIVATE_KEY || '').trim(),
      urlEndpoint: String(process.env.IMAGEKIT_URL_ENDPOINT || '').trim().replace(/\/+$/, ''),
    });
  }
  return imagekitClient;
}

module.exports = {
  getImageKit,
  isImageKitConfigured,
};