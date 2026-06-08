const Contact = require('../models/Contact');

async function createContact(req, res) {
  const { fullName, email, phone, subject, message } = req.body;
  if (!fullName || !email || !subject || !message) {
    return res.status(400).json({ message: 'fullName, email, subject, and message are required' });
  }
  const doc = await Contact.create({
    fullName: String(fullName).trim(),
    email:    String(email).trim().toLowerCase(),
    phone:    String(phone || '').trim(),
    subject:  String(subject).trim(),
    message:  String(message).trim(),
  });
  return res.status(201).json({ message: 'Message sent successfully', id: doc._id });
}

async function getContacts(req, res) {
  const { read } = req.query;
  const filter = {};
  if (read === 'true')  filter.read = true;
  if (read === 'false') filter.read = false;
  const contacts = await Contact.find(filter).sort({ createdAt: -1 }).lean();
  return res.json(contacts);
}

async function markRead(req, res) {
  const { id } = req.params;
  const doc = await Contact.findByIdAndUpdate(id, { read: true }, { new: true });
  if (!doc) return res.status(404).json({ message: 'Message not found' });
  return res.json(doc);
}

module.exports = { createContact, getContacts, markRead };
