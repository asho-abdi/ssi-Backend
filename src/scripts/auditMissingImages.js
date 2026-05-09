require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { connectDB } = require('../config/db');
const Course = require('../models/Course');
const User = require('../models/User');
const PlatformSettings = require('../models/PlatformSettings');

function isAbsoluteHttp(url) {
  return /^https?:\/\//i.test(url);
}

function normalizeStoredPath(value) {
  const raw = String(value || '').trim().replace(/\\/g, '/');
  if (!raw) return '';
  if (raw.startsWith('/')) return raw;
  if (raw.startsWith('uploads/')) return `/${raw}`;
  return raw;
}

function localUploadExists(storedValue) {
  const normalized = normalizeStoredPath(storedValue);
  if (!normalized.startsWith('/uploads/')) return null;
  const absPath = path.join(process.cwd(), normalized.replace(/^\/+/, ''));
  return fs.existsSync(absPath);
}

function classifyImageValue(storedValue) {
  const normalized = normalizeStoredPath(storedValue);
  if (!normalized) return { status: 'missing', normalized: '' };
  if (isAbsoluteHttp(normalized)) return { status: 'remote', normalized };
  if (normalized.startsWith('/uploads/')) {
    const exists = localUploadExists(normalized);
    return {
      status: exists ? 'local_ok' : 'local_missing_file',
      normalized,
    };
  }
  if (normalized.startsWith('/')) return { status: 'public_asset', normalized };
  return { status: 'invalid_path', normalized };
}

function summarize(records) {
  const counts = records.reduce((acc, row) => {
    acc[row.status] = (acc[row.status] || 0) + 1;
    return acc;
  }, {});
  return counts;
}

async function run() {
  await connectDB();
  const [courses, users, settings] = await Promise.all([
    Course.find({}).select('_id title thumbnail').lean(),
    User.find({}).select('_id name email role avatar_url').lean(),
    PlatformSettings.findOne({ key: 'default' }).select('general.logo_url general.favicon_url').lean(),
  ]);

  const courseThumbs = courses.map((c) => {
    const info = classifyImageValue(c.thumbnail);
    return {
      type: 'course_thumbnail',
      id: String(c._id),
      title: c.title || '',
      value: String(c.thumbnail || ''),
      normalized: info.normalized,
      status: info.status,
    };
  });

  const userAvatars = users.map((u) => {
    const info = classifyImageValue(u.avatar_url);
    return {
      type: 'user_avatar',
      id: String(u._id),
      name: u.name || '',
      email: u.email || '',
      role: u.role || '',
      value: String(u.avatar_url || ''),
      normalized: info.normalized,
      status: info.status,
    };
  });

  const settingsRows = [
    { key: 'logo_url', value: settings?.general?.logo_url || '' },
    { key: 'favicon_url', value: settings?.general?.favicon_url || '' },
  ].map((row) => {
    const info = classifyImageValue(row.value);
    return {
      type: 'platform_setting',
      id: row.key,
      value: String(row.value || ''),
      normalized: info.normalized,
      status: info.status,
    };
  });

  const report = {
    generated_at: new Date().toISOString(),
    totals: {
      courses: courseThumbs.length,
      users: userAvatars.length,
      settings: settingsRows.length,
    },
    summary: {
      course_thumbnails: summarize(courseThumbs),
      user_avatars: summarize(userAvatars),
      settings_images: summarize(settingsRows),
    },
    missing_or_broken: {
      course_thumbnails: courseThumbs.filter((row) => row.status === 'missing' || row.status === 'local_missing_file' || row.status === 'invalid_path'),
      user_avatars: userAvatars.filter((row) => row.status === 'missing' || row.status === 'local_missing_file' || row.status === 'invalid_path'),
      settings_images: settingsRows.filter((row) => row.status === 'missing' || row.status === 'local_missing_file' || row.status === 'invalid_path'),
    },
  };

  console.log(JSON.stringify(report, null, 2));
  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error('[auditMissingImages] failed:', err?.message || err);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
