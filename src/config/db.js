const mongoose = require('mongoose');

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
  await mongoose.connect(uri);
  console.log('[db] MongoDB connected successfully');
  console.log('[db] NODE_ENV:', process.env.NODE_ENV || 'development');
}

module.exports = { connectDB, resolveMongoUri };
