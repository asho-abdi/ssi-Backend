const mongoose = require('mongoose');

const RETRY_DELAY_MS = 5000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveMongoUri() {
  const fromEnv = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (fromEnv) return fromEnv;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('MONGO_URI or MONGODB_URI must be set in production');
  }
  return 'mongodb://127.0.0.1:27017/elearning';
}

async function connectDB() {
  const uri = resolveMongoUri();
  const masked = uri.replace(/:\/\/([^:]+):([^@]+)@/, '://$1:***@');
  console.log('[db] Connecting:', masked.split('?')[0]);
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 15_000,
    connectTimeoutMS: 15_000,
  });
  console.log('[db] MongoDB connected successfully');
  console.log('[db] NODE_ENV:', process.env.NODE_ENV || 'development');
}

/**
 * Runs forever: connects to MongoDB, waits if already connected, retries on failure every RETRY_DELAY_MS.
 * Never rejects; safe to call at startup without crashing the process.
 */
function startMongoConnection() {
  (async function worker() {
    for (;;) {
      try {
        while (mongoose.connection.readyState === 1) {
          await new Promise((resolve) => {
            mongoose.connection.once('disconnected', resolve);
          });
          console.log('[db] Disconnected; attempting reconnect...');
        }
        await connectDB();
      } catch (err) {
        console.error('[db] Connection failed:', err.message);
        console.log(`[db] Retrying in ${RETRY_DELAY_MS / 1000}s...`);
        await sleep(RETRY_DELAY_MS);
      }
    }
  })().catch((err) => {
    console.error('[db] Unexpected connection worker error:', err.message || err);
    setTimeout(() => startMongoConnection(), RETRY_DELAY_MS);
  });
}

module.exports = { connectDB, resolveMongoUri, startMongoConnection, RETRY_DELAY_MS };
