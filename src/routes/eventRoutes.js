const express = require('express');
const { protect, requireRoles } = require('../middleware/auth');
const {
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
} = require('../controllers/eventController');

const router = express.Router();

const adminOnly = [protect, requireRoles('admin')];

// ── public ───────────────────────────────────────────────────────────────────
router.get('/register/:token', getEventByToken);
router.post('/register/:token', submitRegistration);

// ── admin: analytics ─────────────────────────────────────────────────────────
router.get('/analytics', ...adminOnly, getAnalytics);

// ── admin: all registrations (across all events) ─────────────────────────────
router.get('/registrations', ...adminOnly, listAllRegistrations);
router.get('/registrations/export', ...adminOnly, (req, res) => {
  req.params.id = null;
  return exportRegistrations(req, res);
});
router.patch('/registrations/:regId/status', ...adminOnly, updateRegistrationStatus);

// ── admin: event CRUD ────────────────────────────────────────────────────────
router.get('/', ...adminOnly, listEvents);
router.post('/', ...adminOnly, createEvent);
router.get('/:id', ...adminOnly, getEvent);
router.put('/:id', ...adminOnly, updateEvent);
router.delete('/:id', ...adminOnly, deleteEvent);

// ── admin: per-event registrations ──────────────────────────────────────────
router.get('/:id/registrations', ...adminOnly, listRegistrations);
router.get('/:id/registrations/export', ...adminOnly, exportRegistrations);

module.exports = router;
