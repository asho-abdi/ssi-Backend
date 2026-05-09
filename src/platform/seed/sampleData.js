const { slugify } = require('../utils/slugify');
const { generateCertificateId } = require('../utils/ids');

const sampleUsers = [
  { fullName: 'Admin One', email: 'admin@platform.local', role: 'admin', phone: '+252600000001' },
  { fullName: 'Teacher One', email: 'teacher@platform.local', role: 'teacher', phone: '+252600000002' },
  { fullName: 'Editor One', email: 'editor@platform.local', role: 'editor', phone: '+252600000003' },
  { fullName: 'Student One', email: 'student@platform.local', role: 'student', phone: '+252600000004' },
];

const sampleCategories = [
  { name: 'Technology', slug: slugify('Technology'), status: 'active' },
  { name: 'Business & Management', slug: slugify('Business & Management'), status: 'active' },
];

function buildSampleCourse(teacherId, categoryId) {
  return {
    title: 'Modern Node.js for Scalable Systems',
    slug: slugify('Modern Node.js for Scalable Systems'),
    description: 'Build scalable APIs with Node.js, Express, MongoDB, and architecture patterns.',
    price: 49.99,
    discountPrice: 39.99,
    durationHours: 12,
    thumbnail: '',
    teacherId,
    categoryId,
    status: 'published',
    level: 'intermediate',
    language: 'en',
  };
}

function buildSampleCertificate(studentId, courseId, enrollmentId) {
  return {
    certificateId: generateCertificateId(),
    studentId,
    courseId,
    enrollmentId,
    completionType: 'full_completion',
    verificationUrl: `https://example.com/verify/${generateCertificateId('VERIFY')}`,
    signatureName: 'Head of Academics',
    status: 'issued',
  };
}

module.exports = {
  sampleUsers,
  sampleCategories,
  buildSampleCourse,
  buildSampleCertificate,
};
