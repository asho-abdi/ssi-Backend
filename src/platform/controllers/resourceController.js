const mongoose = require('mongoose');
const { getPagination, buildPaginatedResponse } = require('../utils/pagination');
const { slugify } = require('../utils/slugify');
const { asyncHandler } = require('../middleware/asyncHandler');

function normalizeBody(Model, body = {}) {
  const payload = { ...body };
  const paths = Model.schema.paths;

  if (paths.slug && !payload.slug && typeof payload.name === 'string') payload.slug = slugify(payload.name);
  if (paths.slug && !payload.slug && typeof payload.title === 'string') payload.slug = slugify(payload.title);
  if (paths.email && typeof payload.email === 'string') payload.email = payload.email.toLowerCase().trim();
  if (paths.code && typeof payload.code === 'string') payload.code = payload.code.toUpperCase().trim();
  if (paths.referralCode && typeof payload.referralCode === 'string')
    payload.referralCode = payload.referralCode.toUpperCase().trim();

  return payload;
}

function buildFilters(Model, query = {}) {
  const filters = {};
  const searchable = ['status', 'role', 'courseId', 'teacherId', 'studentId', 'userId', 'categoryId', 'type'];
  searchable.forEach((key) => {
    if (query[key] != null && query[key] !== '') filters[key] = query[key];
  });

  if (query.search) {
    const text = String(query.search).trim();
    if (text) {
      if (Model.schema.paths.title || Model.schema.paths.description) {
        filters.$or = [];
        if (Model.schema.paths.title) filters.$or.push({ title: new RegExp(text, 'i') });
        if (Model.schema.paths.name) filters.$or.push({ name: new RegExp(text, 'i') });
        if (Model.schema.paths.fullName) filters.$or.push({ fullName: new RegExp(text, 'i') });
        if (Model.schema.paths.email) filters.$or.push({ email: new RegExp(text, 'i') });
      }
    }
  }

  Object.keys(filters).forEach((k) => {
    if (k.endsWith('Id') || k === 'userId' || k === 'studentId' || k === 'teacherId' || k === 'categoryId') {
      if (typeof filters[k] === 'string' && mongoose.Types.ObjectId.isValid(filters[k])) {
        filters[k] = new mongoose.Types.ObjectId(filters[k]);
      }
    }
  });

  return filters;
}

function createResourceController(Model, options = {}) {
  const defaultSort = options.defaultSort || { createdAt: -1 };
  const populate = options.populate || '';

  const list = asyncHandler(async (req, res) => {
    const { page, limit, skip } = getPagination(req.query);
    const filters = buildFilters(Model, req.query);
    const sort = req.query.sortBy ? { [req.query.sortBy]: req.query.sortOrder === 'asc' ? 1 : -1 } : defaultSort;

    const [total, docs] = await Promise.all([
      Model.countDocuments(filters),
      Model.find(filters).sort(sort).skip(skip).limit(limit).populate(populate).lean(),
    ]);

    return res.json(buildPaginatedResponse({ docs, total, page, limit }));
  });

  const getById = asyncHandler(async (req, res) => {
    const doc = await Model.findById(req.params.id).populate(populate).lean();
    if (!doc) return res.status(404).json({ message: `${Model.modelName} not found` });
    return res.json(doc);
  });

  const create = asyncHandler(async (req, res) => {
    const payload = normalizeBody(Model, req.body);
    const doc = await Model.create(payload);
    return res.status(201).json(doc);
  });

  const update = asyncHandler(async (req, res) => {
    const payload = normalizeBody(Model, req.body);
    const doc = await Model.findByIdAndUpdate(req.params.id, payload, {
      new: true,
      runValidators: true,
    });
    if (!doc) return res.status(404).json({ message: `${Model.modelName} not found` });
    return res.json(doc);
  });

  const remove = asyncHandler(async (req, res) => {
    const doc = await Model.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ message: `${Model.modelName} not found` });
    return res.status(204).send();
  });

  return { list, getById, create, update, remove };
}

module.exports = { createResourceController };
