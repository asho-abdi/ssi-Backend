/**
 * ImageKit client for server-side uploads and deletes.
 * Env (Railway / local): IMAGEKIT_PUBLIC_KEY, IMAGEKIT_PRIVATE_KEY, IMAGEKIT_URL_ENDPOINT
 * URL endpoint is your ImageKit delivery base, e.g. https://ik.imagekit.io/your_id
 */
const ImageKit = require('imagekit');

/** @type {import('imagekit').ImageKit | null} */
let client = null;

function isImageKitConfigured() {
  return Boolean(
    process.env.IMAGEKIT_PUBLIC_KEY &&
      process.env.IMAGEKIT_PRIVATE_KEY &&
      process.env.IMAGEKIT_URL_ENDPOINT
  );
}

/**
 * Singleton ImageKit SDK instance. Call only after verifying isImageKitConfigured().
 */
function getImageKit() {
  if (!isImageKitConfigured()) {
    throw new Error('ImageKit env vars are missing. Set IMAGEKIT_PUBLIC_KEY, IMAGEKIT_PRIVATE_KEY, IMAGEKIT_URL_ENDPOINT.');
  }
  if (!client) {
    client = new ImageKit({
      publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
      privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
      urlEndpoint: String(process.env.IMAGEKIT_URL_ENDPOINT).replace(/\/+$/, ''),
    });
  }
  return client;
}

module.exports = {
  getImageKit,
  isImageKitConfigured,
};
