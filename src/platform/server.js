require('dotenv').config();
const { connectDB } = require('../config/db');
const { createApp } = require('./app');

const PORT = process.env.PLATFORM_PORT || process.env.PORT || 5100;

async function start() {
  await connectDB();
  const app = createApp();
  app.listen(PORT, () => {
    console.log(`[platform-api] listening on port ${PORT}`);
  });
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
