const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const ROLES = ['admin', 'teacher', 'editor', 'student'];

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    username: { type: String, unique: true, sparse: true, trim: true, lowercase: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    email_verified: { type: Boolean, default: false },
    email_verification_token_hash: { type: String, default: '', select: false },
    email_verification_expires_at: { type: Date, default: null, select: false },
    password_reset_token_hash: { type: String, default: '', select: false },
    password_reset_expires_at: { type: Date, default: null, select: false },
    password: { type: String, required: true, minlength: 6, select: false },
    role: { type: String, enum: ROLES, default: 'student', index: true },
    teacher_fee: { type: Number, min: 0, default: 0 },
    phone: { type: String, trim: true, default: '' },
    bio: { type: String, trim: true, default: '' },
    avatar_url: { type: String, trim: true, default: '' },
    avatar_file_id: { type: String, trim: true, default: '' },
    social: {
      facebook: { type: String, trim: true, default: '' },
      linkedin: { type: String, trim: true, default: '' },
      website: { type: String, trim: true, default: '' },
    },
    instructor_settings: {
      public_profile: { type: Boolean, default: true },
      notifications: { type: Boolean, default: true },
    },
    permissions: {
      createCourse: { type: Boolean },
      editCourse: { type: Boolean },
      deleteCourse: { type: Boolean },
      publishCourse: { type: Boolean },
      viewStudents: { type: Boolean },
      viewEarnings: { type: Boolean },
      manageLessons: { type: Boolean },
      uploadResources: { type: Boolean },
    },
  },
  { timestamps: true }
);

userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

userSchema.methods.toJSON = function toJSON() {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

module.exports = mongoose.model('User', userSchema);
module.exports.ROLES = ROLES;
