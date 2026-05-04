const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Certificate = require('../models/Certificate');
const Course = require('../models/Course');
const User = require('../models/User');
const Progress = require('../models/Progress');
const CertificateTemplate = require('../models/CertificateTemplate');
const Counter = require('../models/Counter');

const DEFAULT_TEMPLATE = {
  org_name: 'Success Skills Institute',
  certificate_title: 'Certificate of Completion',
  subtitle: 'This certifies that',
  completion_text: 'has successfully completed the course',
  signature_name: 'Head of Academics',
  footer_text: 'Issued by Success Skills Institute',
  accent_color: '#1d3557',
  background_color: '#f8fafc',
  border_color: '#f28c28',
  design_image: '',
};

const DESIGN_IMAGE_REGEX = /^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/;
const BUILTIN_TEMPLATE_IMAGE_PATH = path.join(__dirname, '..', 'assets', 'certificate-default.png');
const PLAYFAIR_DISPLAY_FONT_PATH = path.join(
  __dirname,
  '..',
  'assets',
  'fonts',
  'PlayfairDisplay.ttf'
);
let builtInTemplateBuffer = null;
const SERIAL_COUNTER_KEY = 'certificate_serial';
const INITIAL_CERTIFICATE_SERIAL = 29;
let serialCounterInitialized = false;

function getBuiltInTemplateBuffer() {
  if (builtInTemplateBuffer) return builtInTemplateBuffer;
  if (!fs.existsSync(BUILTIN_TEMPLATE_IMAGE_PATH)) return null;
  builtInTemplateBuffer = fs.readFileSync(BUILTIN_TEMPLATE_IMAGE_PATH);
  return builtInTemplateBuffer;
}

function resolveNameFont() {
  if (fs.existsSync(PLAYFAIR_DISPLAY_FONT_PATH)) return PLAYFAIR_DISPLAY_FONT_PATH;
  return 'Helvetica-Bold';
}

function formatSerialNumber(serialValue) {
  const serial = Number(serialValue);
  if (!Number.isFinite(serial) || serial <= 0) return 'CNO.SSI000030';
  return `CNO.SSI${String(Math.trunc(serial)).padStart(6, '0')}`;
}

function parseSerialInput(input) {
  const raw = String(input || '').trim().toUpperCase();
  if (!raw) return null;
  if (/^\d+$/.test(raw)) return Number(raw);
  const match = raw.match(/^CNO\.SSI(\d{1,})$/i);
  if (!match) return null;
  return Number(match[1]);
}

async function ensureSerialCounterInitialized() {
  if (serialCounterInitialized) return;
  const highestCert = await Certificate.findOne({ serial_number: { $type: 'number' } })
    .sort({ serial_number: -1 })
    .select('serial_number')
    .lean();
  const highestSerial = Math.max(INITIAL_CERTIFICATE_SERIAL, Number(highestCert?.serial_number || 0));
  const existingCounter = await Counter.findOne({ key: SERIAL_COUNTER_KEY }).lean();
  if (!existingCounter) {
    await Counter.create({ key: SERIAL_COUNTER_KEY, value: highestSerial });
  } else if (Number(existingCounter.value || 0) < highestSerial) {
    await Counter.updateOne({ key: SERIAL_COUNTER_KEY }, { $set: { value: highestSerial } });
  }
  serialCounterInitialized = true;
}

async function getNextCertificateSerial() {
  await ensureSerialCounterInitialized();
  const counter = await Counter.findOneAndUpdate(
    { key: SERIAL_COUNTER_KEY },
    { $inc: { value: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  return counter.value;
}

async function ensureCertificateHasSerial(cert) {
  const existingSerial = Number(cert?.serial_number || 0);
  if (Number.isFinite(existingSerial) && existingSerial > 0) return Math.trunc(existingSerial);
  const nextSerial = await getNextCertificateSerial();
  cert.serial_number = nextSerial;
  await cert.save();
  return nextSerial;
}

function safeSetFont(doc, preferredFont) {
  try {
    doc.font(preferredFont);
  } catch (_error) {
    doc.font('Helvetica-Bold');
  }
}

function sanitizeHexColor(input, fallback) {
  const color = String(input || '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(color)) return color;
  return fallback;
}

function sanitizeDesignImage(input) {
  if (input == null) return undefined;
  const value = String(input).trim();
  if (!value) return '';
  if (!DESIGN_IMAGE_REGEX.test(value)) return undefined;
  return value;
}

function getStudentName(user) {
  if (user?.name && String(user.name).trim()) return String(user.name).trim();
  if (user?.email) return String(user.email).split('@')[0];
  return 'Student';
}

function formatCertificateDate(dateInput) {
  const date = new Date(dateInput);
  if (Number.isNaN(date.getTime())) return '';
  const day = String(date.getDate()).padStart(2, '0');
  const month = date.toLocaleString('en-US', { month: 'long' });
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
}

function drawSingleLineFittedText(doc, text, config) {
  const {
    x,
    y,
    width,
    maxSize,
    minSize = 14,
    color = '#1f3d69',
    font = 'Helvetica-Bold',
    align = 'center',
    fakeBold = false,
    boldStrength = 0.4,
  } = config;
  const value = String(text || '').trim();
  if (!value) return;

  let size = maxSize;
  while (size > minSize) {
    safeSetFont(doc, font);
    doc.fontSize(size);
    const measuredWidth = doc.widthOfString(value);
    if (measuredWidth <= width) break;
    size -= 1;
  }

  const textOptions = { width, align, lineBreak: false };
  safeSetFont(doc, font);
  doc.fontSize(size).fillColor(color);
  if (fakeBold) {
    // Multiple offset passes create stronger visual weight for variable/static fonts.
    doc.text(value, x + boldStrength, y, textOptions);
    doc.text(value, x + boldStrength * 0.5, y + boldStrength * 0.2, textOptions);
  }
  doc.text(value, x, y, textOptions);
}

function applyPlaceholders(value, context) {
  const source = String(value || '');
  return source.replace(/\{\s*([a-zA-Z_]+)\s*\}/g, (_match, key) => {
    const safeKey = String(key || '').toLowerCase();
    return Object.prototype.hasOwnProperty.call(context, safeKey) ? context[safeKey] : '';
  });
}

async function getOrCreateTemplate() {
  let template = await CertificateTemplate.findOne({ key: 'default' });
  if (!template) {
    template = await CertificateTemplate.create({ key: 'default', ...DEFAULT_TEMPLATE });
  }
  return template;
}

function normalizeCourseIdParam(raw) {
  return String(raw ?? '').trim();
}

function pickDisplayCourseTitle(storedSnapshot, liveCourseTitle) {
  const a = storedSnapshot != null && String(storedSnapshot).trim() ? String(storedSnapshot).trim() : '';
  const b = liveCourseTitle != null && String(liveCourseTitle).trim() ? String(liveCourseTitle).trim() : '';
  return a || b || 'Course';
}

/** Shape for API: always include real FK on `_id` even if Course doc was deleted (populate would otherwise null out `course_id`). */
async function shapeCertificatesWithCourseTitles(rows) {
  const ids = [
    ...new Set(
      (rows || [])
        .map((r) => r?.course_id)
        .filter((id) => id != null)
        .map((id) => String(id))
        .filter((id) => mongoose.Types.ObjectId.isValid(id))
    ),
  ];
  const courses = ids.length ? await Course.find({ _id: { $in: ids } }).select('title').lean() : [];
  const titleById = new Map(courses.map((c) => [String(c._id), c.title || '']));
  return (rows || []).map((row) => {
    const fk = row?.course_id;
    const idStr = fk != null ? String(fk) : '';
    const fromDb = idStr ? titleById.get(idStr) : '';
    const snapshot = row?.course_title != null && String(row.course_title).trim() ? String(row.course_title).trim() : '';
    const displayTitle = pickDisplayCourseTitle(snapshot, fromDb);
    return {
      ...row,
      course_id: {
        _id: fk,
        title: displayTitle,
      },
    };
  });
}

async function listMine(req, res) {
  const certs = await Certificate.find({ user_id: req.userId }).sort({ issue_date: -1 }).lean();
  res.json(await shapeCertificatesWithCourseTitles(certs));
}

async function listAllAdmin(_req, res) {
  const certs = await Certificate.find({}).populate('user_id', 'name email').sort({ issue_date: -1 }).lean();
  const shaped = await shapeCertificatesWithCourseTitles(certs);
  res.json(shaped);
}

async function getTemplate(_req, res) {
  const template = await getOrCreateTemplate();
  res.json(template);
}

async function updateTemplate(req, res) {
  const template = await getOrCreateTemplate();
  const patch = req.body || {};
  if (patch.org_name != null) template.org_name = String(patch.org_name).trim();
  if (patch.certificate_title != null) template.certificate_title = String(patch.certificate_title).trim();
  if (patch.subtitle != null) template.subtitle = String(patch.subtitle).trim();
  if (patch.completion_text != null) template.completion_text = String(patch.completion_text).trim();
  if (patch.signature_name != null) template.signature_name = String(patch.signature_name).trim();
  if (patch.footer_text != null) template.footer_text = String(patch.footer_text).trim();
  if (patch.accent_color != null) {
    template.accent_color = sanitizeHexColor(patch.accent_color, template.accent_color || DEFAULT_TEMPLATE.accent_color);
  }
  if (patch.background_color != null) {
    template.background_color = sanitizeHexColor(
      patch.background_color,
      template.background_color || DEFAULT_TEMPLATE.background_color
    );
  }
  if (patch.border_color != null) {
    template.border_color = sanitizeHexColor(patch.border_color, template.border_color || DEFAULT_TEMPLATE.border_color);
  }
  if (patch.design_image != null) {
    const sanitizedImage = sanitizeDesignImage(patch.design_image);
    if (sanitizedImage === undefined) {
      return res.status(400).json({ message: 'Invalid design image format' });
    }
    template.design_image = sanitizedImage;
  }
  await template.save();
  res.json(template);
}

async function getForCourse(req, res) {
  const courseId = normalizeCourseIdParam(req.params.courseId);
  if (!mongoose.Types.ObjectId.isValid(courseId)) {
    return res.status(400).json({ message: 'Invalid course id' });
  }
  const progress = await Progress.findOne({
    user_id: req.userId,
    course_id: courseId,
  });
  if (!progress || progress.progress_percentage < 100) {
    return res.status(403).json({ message: 'Complete the course to get a certificate' });
  }
  let cert = await Certificate.findOne({ user_id: req.userId, course_id: courseId }).populate(
    'course_id',
    'title'
  );
  const courseRow = await Course.findById(courseId).select('title').lean();
  const initialTitle = courseRow?.title != null ? String(courseRow.title).trim() : '';
  if (!cert) {
    const nextSerial = await getNextCertificateSerial();
    cert = await Certificate.create({
      user_id: req.userId,
      course_id: courseId,
      serial_number: nextSerial,
      issue_date: new Date(),
      course_title: initialTitle,
    });
    cert = await Certificate.findById(cert._id).populate('course_id', 'title');
  } else {
    await ensureCertificateHasSerial(cert);
    if (initialTitle && !(cert.course_title && String(cert.course_title).trim())) {
      cert.course_title = initialTitle;
      await cert.save();
    }
  }
  res.json(cert);
}

async function downloadPdf(req, res) {
  const courseId = normalizeCourseIdParam(req.params.courseId);
  if (!mongoose.Types.ObjectId.isValid(courseId)) {
    return res.status(400).json({ message: 'Invalid course id' });
  }
  const user = await User.findById(req.userId);
  if (!user) return res.status(404).json({ message: 'Not found' });

  const progress = await Progress.findOne({
    user_id: req.userId,
    course_id: courseId,
  });
  let cert = await Certificate.findOne({ user_id: req.userId, course_id: courseId });
  const completed = progress && Number(progress.progress_percentage || 0) >= 100;
  if (!completed && !cert) {
    return res.status(403).json({ message: 'Course not completed' });
  }

  if (!cert) {
    const nextSerial = await getNextCertificateSerial();
    const courseRow = await Course.findById(courseId).select('title').lean();
    const initialTitle = courseRow?.title != null ? String(courseRow.title).trim() : '';
    cert = await Certificate.create({
      user_id: req.userId,
      course_id: courseId,
      serial_number: nextSerial,
      issue_date: new Date(),
      course_title: initialTitle,
    });
  } else {
    await ensureCertificateHasSerial(cert);
  }

  const courseDoc = await Course.findById(courseId).select('title').lean();
  const liveTitle = courseDoc?.title != null ? String(courseDoc.title).trim() : '';
  if (!String(cert.course_title || '').trim() && liveTitle) {
    cert.course_title = liveTitle;
    await cert.save();
  }
  const courseTitle = pickDisplayCourseTitle(cert.course_title, liveTitle);

  const issueDate = cert.issue_date || new Date();
  const template = await getOrCreateTemplate();
  const studentName = getStudentName(user);
  const awardedDate = formatCertificateDate(issueDate);
  const serialNumber = formatSerialNumber(cert.serial_number);
  const nameFont = resolveNameFont();
  const layout = {
    // Fixed template slots mapped to the reference certificate layout.
    name: {
      x: 172,
      y: 420,
      width: 680,
      maxSize: 42,
      minSize: 24,
      color: '#e28b28',
      font: nameFont,
      fakeBold: true,
      boldStrength: 0.8,
    },
    course: { x: 188, y: 522, width: 650, maxSize: 22, minSize: 15, color: '#173c6f' },
    serial: { x: 456, y: 622, width: 125, size: 11, color: '#334155' },
    date: { x: 652, y: 612, width: 220, maxSize: 18, minSize: 14, color: '#1f3d69' },
  };

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="certificate-${courseId}.pdf"`
  );

  const doc = new PDFDocument({
    size: [1024, 730],
    margin: 0,
  });
  doc.pipe(res);

  const pageWidth = doc.page.width;
  const pageHeight = doc.page.height;
  const customDesign = sanitizeDesignImage(template.design_image);
  if (customDesign) {
    const imageData = customDesign.split(',')[1];
    const imageBuffer = Buffer.from(imageData, 'base64');
    doc.image(imageBuffer, 0, 0, {
      fit: [pageWidth, pageHeight],
      align: 'center',
      valign: 'center',
    });
  } else {
    const builtInTemplate = getBuiltInTemplateBuffer();
    if (builtInTemplate) {
      doc.image(builtInTemplate, 0, 0, {
        fit: [pageWidth, pageHeight],
        align: 'center',
        valign: 'center',
      });
    } else {
      doc.rect(0, 0, pageWidth, pageHeight).fill('#ffffff');
      doc.lineWidth(1.2).strokeColor('#f28c28').rect(8, 8, pageWidth - 16, pageHeight - 16).stroke();
    }
  }

  // Only dynamic values: student name, course name, awarded date, and fixed serial number.
  drawSingleLineFittedText(doc, studentName, {
    x: layout.name.x,
    y: layout.name.y,
    width: layout.name.width,
    maxSize: layout.name.maxSize,
    minSize: layout.name.minSize,
    color: layout.name.color,
    font: layout.name.font,
    fakeBold: layout.name.fakeBold,
    boldStrength: layout.name.boldStrength,
  });

  drawSingleLineFittedText(doc, courseTitle, {
    x: layout.course.x,
    y: layout.course.y,
    width: layout.course.width,
    maxSize: layout.course.maxSize,
    minSize: layout.course.minSize,
    color: layout.course.color,
  });

  doc.font('Helvetica-Bold').fontSize(layout.serial.size).fillColor(layout.serial.color).text(serialNumber, layout.serial.x, layout.serial.y, {
    width: layout.serial.width,
    align: 'center',
  });

  drawSingleLineFittedText(doc, awardedDate, {
    x: layout.date.x,
    y: layout.date.y,
    width: layout.date.width,
    maxSize: layout.date.maxSize,
    minSize: layout.date.minSize,
    color: layout.date.color,
    align: 'center',
  });

  doc.end();
}

async function verifyPublic(req, res) {
  const serialParam = req.params.serial || req.query.serial;
  const serialNumber = parseSerialInput(serialParam);
  if (!Number.isFinite(serialNumber) || serialNumber <= 0) {
    return res.status(400).json({ message: 'Valid certificate serial is required' });
  }
  const cert = await Certificate.findOne({ serial_number: serialNumber })
    .populate('user_id', 'name')
    .populate('course_id', 'title')
    .lean();
  if (!cert) {
    return res.status(404).json({ valid: false, message: 'Certificate not found' });
  }
  res.json({
    valid: true,
    certificate: {
      serial_number: cert.serial_number,
      serial_label: formatSerialNumber(cert.serial_number),
      issue_date: cert.issue_date,
      student_name: cert.user_id?.name || 'Student',
      course_title: pickDisplayCourseTitle(cert.course_title, cert.course_id?.title),
      verification_url: `/certificate/verify/${formatSerialNumber(cert.serial_number)}`,
    },
  });
}

module.exports = {
  listMine,
  listAllAdmin,
  getTemplate,
  updateTemplate,
  getForCourse,
  downloadPdf,
  verifyPublic,
};
