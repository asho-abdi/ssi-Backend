require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const Course = require('./models/Course');
const { connectDB } = require('./config/db');

async function seed() {
  await connectDB();
  await User.deleteMany({ email: /@(demo|hms)\.local$/ });
  await Course.deleteMany({});

  const admin = await User.create({
    name: 'Admin Demo',
    email: 'admin@demo.local',
    password: 'password123',
    role: 'admin',
  });
  await User.create({
    name: 'Admin HMS',
    email: 'admin@hms.local',
    password: 'password123',
    role: 'admin',
  });
  const teacher = await User.create({
    name: 'Teacher Demo',
    email: 'teacher@demo.local',
    password: 'password123',
    role: 'teacher',
  });
  const editor = await User.create({
    name: 'Editor Demo',
    email: 'editor@demo.local',
    password: 'password123',
    role: 'editor',
  });
  const student = await User.create({
    name: 'Student Demo',
    email: 'student@demo.local',
    password: 'password123',
    role: 'student',
  });

  const sampleUrl = 'https://www.youtube.com/embed/dQw4w9WgXcQ';
  await Course.create({
    title: 'Full Stack MERN Bootcamp',
    description:
      'Learn MongoDB, Express, React, and Node.js by building real projects. Includes authentication, REST APIs, and deployment.',
    price: 49.99,
    duration: 12,
    thumbnail: '',
    video_url: sampleUrl,
    teacher_id: teacher._id,
    lessons: [
      { title: 'Welcome & setup', video_url: sampleUrl, order: 0 },
      { title: 'API design', video_url: sampleUrl, order: 1 },
      { title: 'React patterns', video_url: sampleUrl, order: 2 },
    ],
  });

  await Course.create({
    title: 'UI/UX for Developers',
    description: 'Practical interface design, accessibility, and modern CSS for developers.',
    price: 29,
    duration: 6,
    thumbnail: '',
    video_url: 'https://player.vimeo.com/video/76979871',
    teacher_id: teacher._id,
    lessons: [{ title: 'Intro', video_url: 'https://player.vimeo.com/video/76979871', order: 0 }],
  });

  console.log('Seed complete.');
  console.log('Accounts (password: password123):');
  console.log(
    '  admin@demo.local, admin@hms.local, teacher@demo.local, editor@demo.local, student@demo.local'
  );
  await mongoose.disconnect();
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
