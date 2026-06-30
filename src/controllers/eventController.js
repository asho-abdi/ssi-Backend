const QRCode = require('qrcode');
const Event = require('../models/Event');
const EventRegistration = require('../models/EventRegistration');
const { sendEventConfirmationEmail } = require('../services/emailService');

// ─── helpers ────────────────────────────────────────────────────────────────

function sanitizeEventBody(body) {
  return {
    title: body.title != null ? String(body.title).trim() : undefined,
    slug: body.slug != null ? String(body.slug).trim().toLowerCase().replace(/[^a-z0-9-]/g, '-') : undefined,
    description: body.description != null ? String(body.description) : undefined,
    event_type: body.event_type,
    category: body.category != null ? String(body.category).trim() : undefined,
    thumbnail: body.thumbnail != null ? String(body.thumbnail).trim() : undefined,
    instructor: body.instructor
      ? {
          name: String(body.instructor.name || '').trim(),
          photo: String(body.instructor.photo || '').trim(),
          bio: String(body.instructor.bio || '').trim(),
        }
      : undefined,
    event_date: body.event_date ? new Date(body.event_date) : undefined,
    start_time: body.start_time != null ? String(body.start_time).trim() : undefined,
    end_time: body.end_time != null ? String(body.end_time).trim() : undefined,
    timezone: body.timezone != null ? String(body.timezone).trim() : undefined,
    location: body.location != null ? String(body.location).trim() : undefined,
    webinar_link: body.webinar_link != null ? String(body.webinar_link).trim() : undefined,
    meeting_platform: body.meeting_platform != null ? body.meeting_platform : undefined,
    capacity:
      body.capacity != null
        ? {
            unlimited: Boolean(body.capacity.unlimited ?? true),
            max_participants: body.capacity.max_participants != null ? Number(body.capacity.max_participants) : null,
          }
        : undefined,
    registration:
      body.registration != null
        ? {
            enabled: Boolean(body.registration.enabled ?? true),
            require_approval: Boolean(body.registration.require_approval ?? false),
            open_date: body.registration.open_date ? new Date(body.registration.open_date) : null,
            close_date: body.registration.close_date ? new Date(body.registration.close_date) : null,
          }
        : undefined,
    status: body.status,
  };
}

async function generateQrDataUrl(registrationId) {
  const content = `EVT-REG:${registrationId}`;
  try {
    return await QRCode.toDataURL(content, { errorCorrectionLevel: 'M', margin: 2, width: 256 });
  } catch {
    return '';
  }
}

// ─── admin: event CRUD ───────────────────────────────────────────────────────

async function listEvents(req, res) {
  const { status, type, search } = req.query;
  const filter = {};
  if (status) filter.status = status;
  if (type) filter.event_type = type;
  if (search) filter.$text = { $search: search };

  const events = await Event.find(filter).sort({ event_date: -1 }).lean();

  const ids = events.map((e) => e._id);
  const regCounts = await EventRegistration.aggregate([
    { $match: { event_id: { $in: ids } } },
    { $group: { _id: '$event_id', count: { $sum: 1 } } },
  ]);
  const countMap = new Map(regCounts.map((r) => [String(r._id), r.count]));

  const result = events.map((e) => ({
    ...e,
    registration_count: countMap.get(String(e._id)) || 0,
  }));

  res.json(result);
}

async function createEvent(req, res) {
  const data = sanitizeEventBody(req.body);
  if (!data.title) return res.status(400).json({ message: 'title is required' });
  if (!data.event_type) return res.status(400).json({ message: 'event_type is required' });
  if (!data.event_date) return res.status(400).json({ message: 'event_date is required' });

  // Ensure unique slug
  const base = data.slug || data.title.toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-').substring(0, 80);
  let slug = base;
  let suffix = 1;
  while (await Event.exists({ slug })) {
    slug = `${base}-${suffix++}`;
  }
  data.slug = slug;

  const event = await Event.create(data);
  res.status(201).json(event);
}

async function getEvent(req, res) {
  const event = await Event.findById(req.params.id).lean();
  if (!event) return res.status(404).json({ message: 'Event not found' });
  const regCount = await EventRegistration.countDocuments({ event_id: event._id });
  res.json({ ...event, registration_count: regCount });
}

async function updateEvent(req, res) {
  const event = await Event.findById(req.params.id);
  if (!event) return res.status(404).json({ message: 'Event not found' });

  const data = sanitizeEventBody(req.body);
  Object.keys(data).forEach((key) => {
    if (data[key] !== undefined) {
      if (key === 'instructor' || key === 'capacity' || key === 'registration') {
        event[key] = { ...(event[key]?.toObject ? event[key].toObject() : event[key]), ...data[key] };
      } else {
        event[key] = data[key];
      }
    }
  });

  await event.save();
  res.json(event);
}

async function deleteEvent(req, res) {
  const event = await Event.findById(req.params.id);
  if (!event) return res.status(404).json({ message: 'Event not found' });
  await EventRegistration.deleteMany({ event_id: event._id });
  await event.deleteOne();
  res.json({ message: 'Event deleted' });
}

// ─── analytics ───────────────────────────────────────────────────────────────

async function getAnalytics(req, res) {
  const now = new Date();

  const [totalEvents, upcomingEvents, totalRegistrations, attendedCount] = await Promise.all([
    Event.countDocuments(),
    Event.countDocuments({ event_date: { $gte: now }, status: 'published' }),
    EventRegistration.countDocuments(),
    EventRegistration.countDocuments({ status: 'attended' }),
  ]);

  const attendanceRate = totalRegistrations > 0 ? Math.round((attendedCount / totalRegistrations) * 100) : 0;

  // Registrations per event (top 10)
  const perEvent = await EventRegistration.aggregate([
    { $group: { _id: '$event_id', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 10 },
    {
      $lookup: {
        from: 'events',
        localField: '_id',
        foreignField: '_id',
        as: 'event',
      },
    },
    { $unwind: { path: '$event', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 1,
        count: 1,
        eventTitle: { $ifNull: ['$event.title', 'Unknown'] },
        eventDate: '$event.event_date',
      },
    },
  ]);

  // Monthly registrations (last 6 months)
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const monthly = await EventRegistration.aggregate([
    { $match: { createdAt: { $gte: sixMonthsAgo } } },
    {
      $group: {
        _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
        count: { $sum: 1 },
      },
    },
    { $sort: { '_id.year': 1, '_id.month': 1 } },
  ]);

  res.json({
    totalEvents,
    upcomingEvents,
    totalRegistrations,
    attendedCount,
    attendanceRate,
    perEvent,
    monthly,
  });
}

// ─── public registration ─────────────────────────────────────────────────────

async function getEventByToken(req, res) {
  const { token } = req.params;
  const event = await Event.findOne({ registration_token: token }).lean();
  if (!event) return res.status(404).json({ message: 'Event not found' });
  if (event.status !== 'published') return res.status(404).json({ message: 'Event not found' });

  const now = new Date();
  const regOpen = !event.registration.open_date || now >= new Date(event.registration.open_date);
  const regClosed = event.registration.close_date && now > new Date(event.registration.close_date);
  const regEnabled = event.registration.enabled && regOpen && !regClosed;

  const regCount = await EventRegistration.countDocuments({ event_id: event._id });
  const capacityFull = !event.capacity.unlimited && regCount >= event.capacity.max_participants;

  res.json({ ...event, registrationOpen: regEnabled && !capacityFull });
}

async function submitRegistration(req, res) {
  const { token } = req.params;
  const event = await Event.findOne({ registration_token: token }).lean();
  if (!event) return res.status(404).json({ message: 'Event not found' });
  if (event.status !== 'published') return res.status(400).json({ message: 'Registration is not open' });
  if (!event.registration.enabled) return res.status(400).json({ message: 'Registration is disabled' });

  const now = new Date();
  if (event.registration.close_date && now > new Date(event.registration.close_date)) {
    return res.status(400).json({ message: 'Registration has closed' });
  }

  const { full_name, email, phone, country, organization } = req.body;
  if (!full_name || !email) return res.status(400).json({ message: 'full_name and email are required' });

  const emailNorm = String(email).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNorm)) {
    return res.status(400).json({ message: 'Invalid email address' });
  }

  // Duplicate check
  const existing = await EventRegistration.findOne({ event_id: event._id, email: emailNorm });
  if (existing) return res.status(409).json({ message: 'You are already registered for this event' });

  // Capacity check
  if (!event.capacity.unlimited) {
    const regCount = await EventRegistration.countDocuments({ event_id: event._id });
    if (regCount >= event.capacity.max_participants) {
      return res.status(400).json({ message: 'This event is fully booked' });
    }
  }

  const initialStatus = event.registration.require_approval ? 'pending' : 'approved';

  const reg = await EventRegistration.create({
    event_id: event._id,
    full_name: String(full_name).trim(),
    email: emailNorm,
    phone: String(phone || '').trim(),
    country: String(country || '').trim(),
    organization: String(organization || '').trim(),
    status: initialStatus,
  });

  // Generate QR if auto-approved
  if (initialStatus === 'approved') {
    reg.qr_code = await generateQrDataUrl(String(reg._id));
    await reg.save();
  }

  // Send confirmation email (best-effort)
  try {
    if (typeof sendEventConfirmationEmail === 'function') {
      await sendEventConfirmationEmail({
        to: emailNorm,
        name: reg.full_name,
        eventTitle: event.title,
        eventDate: event.event_date,
        status: initialStatus,
      });
    }
  } catch {
    // email is optional
  }

  res.status(201).json({
    message:
      initialStatus === 'approved'
        ? 'Registration successful! You are confirmed for this event.'
        : 'Registration submitted! You will be notified once approved.',
    registration: {
      _id: reg._id,
      status: reg.status,
      full_name: reg.full_name,
      email: reg.email,
    },
  });
}

// ─── admin: registration management ─────────────────────────────────────────

async function listRegistrations(req, res) {
  const { status, search } = req.query;
  const filter = {};

  if (req.params.id) filter.event_id = req.params.id;
  if (status) filter.status = status;
  if (search) {
    const rx = new RegExp(search, 'i');
    filter.$or = [{ full_name: rx }, { email: rx }, { phone: rx }, { country: rx }];
  }

  const regs = await EventRegistration.find(filter)
    .populate('event_id', 'title event_date event_type')
    .sort({ createdAt: -1 })
    .lean();

  res.json(regs);
}

async function updateRegistrationStatus(req, res) {
  const { regId } = req.params;
  const { status, notes } = req.body;

  const VALID = ['pending', 'approved', 'rejected', 'attended', 'absent'];
  if (!VALID.includes(status)) {
    return res.status(400).json({ message: 'Invalid status' });
  }

  const reg = await EventRegistration.findById(regId);
  if (!reg) return res.status(404).json({ message: 'Registration not found' });

  const prevStatus = reg.status;
  reg.status = status;
  if (notes != null) reg.notes = String(notes).trim();

  // Mark check-in time when moved to attended
  if (status === 'attended' && prevStatus !== 'attended') {
    reg.check_in_time = new Date();
  }

  // Generate QR when approved for the first time
  if (status === 'approved' && !reg.qr_code) {
    reg.qr_code = await generateQrDataUrl(String(reg._id));
  }

  await reg.save();
  res.json(reg);
}

async function exportRegistrations(req, res) {
  const filter = {};
  if (req.params.id) filter.event_id = req.params.id;

  const regs = await EventRegistration.find(filter)
    .populate('event_id', 'title event_date')
    .sort({ createdAt: -1 })
    .lean();

  const header = ['Name', 'Email', 'Phone', 'Country', 'Organization', 'Event', 'Event Date', 'Status', 'Registered At', 'Check-in Time'];
  const rows = regs.map((r) => [
    r.full_name,
    r.email,
    r.phone || '',
    r.country || '',
    r.organization || '',
    r.event_id?.title || '',
    r.event_id?.event_date ? new Date(r.event_id.event_date).toLocaleDateString() : '',
    r.status,
    new Date(r.createdAt).toLocaleString(),
    r.check_in_time ? new Date(r.check_in_time).toLocaleString() : '',
  ]);

  const csvContent = [header, ...rows]
    .map((row) => row.map((cell) => `"${String(cell || '').replace(/"/g, '""')}"`).join(','))
    .join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="event-registrations.csv"');
  res.send(csvContent);
}

// ─── all registrations (across all events) ──────────────────────────────────

async function listAllRegistrations(req, res) {
  req.params.id = null;
  return listRegistrations(req, res);
}

module.exports = {
  listEvents,
  createEvent,
  getEvent,
  updateEvent,
  deleteEvent,
  getAnalytics,
  getEventByToken,
  submitRegistration,
  listRegistrations,
  listAllRegistrations,
  updateRegistrationStatus,
  exportRegistrations,
};
