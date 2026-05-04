const mongoose = require('mongoose');

function resolveMongoUri() {
  const fromEnv = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (fromEnv) return fromEnv;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('MONGODB_URI or MONGO_URI must be set in production');
  }
  return 'mongodb://127.0.0.1:27017/elearning';
}

async function connectDB() {
  const uri = resolveMongoUri();
  const masked = uri.replace(/:\/\/([^:]+):([^@]+)@/, '://$1:***@');
  console.log('[db] Connecting:', masked.split('?')[0]);
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri);
  console.log('[db] MongoDB connected');
}

module.exports = { connectDB, resolveMongoUri };
