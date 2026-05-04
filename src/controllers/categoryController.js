const Category = require('../models/Category');

function slugify(input) {
  return String(input)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function resolveSlug(name, rawSlug) {
  if (rawSlug != null && String(rawSlug).trim()) {
    return slugify(String(rawSlug).trim());
  }
  return slugify(name);
}

async function listCategories(_req, res) {
  const categories = await Category.find()
    .populate('parent_id', 'name slug')
    .sort({ name: 1 })
    .lean();
  res.json(categories);
}

async function createCategory(req, res) {
  const { name, slug: rawSlug, description, parent_id, thumbnail } = req.body;
  if (!name) return res.status(400).json({ message: 'name is required' });
  const cleanName = String(name).trim();
  const slug = resolveSlug(cleanName, rawSlug);
  if (!slug) return res.status(400).json({ message: 'Invalid category name' });

  const exists = await Category.findOne({ $or: [{ name: cleanName }, { slug }] });
  if (exists) return res.status(400).json({ message: 'Category already exists' });
  let parentId = null;
  if (parent_id) {
    const parent = await Category.findById(parent_id);
    if (!parent) return res.status(400).json({ message: 'Invalid parent category' });
    parentId = parent._id;
  }

  const category = await Category.create({
    name: cleanName,
    slug,
    description: description ?? '',
    parent_id: parentId,
    thumbnail: thumbnail ?? '',
  });
  const populated = await Category.findById(category._id).populate('parent_id', 'name slug');
  res.status(201).json(populated);
}

async function updateCategory(req, res) {
  const { id } = req.params;
  const { name, slug: rawSlug, description, parent_id, thumbnail } = req.body;
  const category = await Category.findById(id);
  if (!category) return res.status(404).json({ message: 'Category not found' });

  let nextName = category.name;
  let nextSlug = category.slug;
  if (name != null) {
    const cleanName = String(name).trim();
    if (!cleanName) return res.status(400).json({ message: 'name cannot be empty' });
    nextName = cleanName;
  }
  if (rawSlug != null) nextSlug = resolveSlug(nextName, rawSlug);
  else if (name != null) nextSlug = resolveSlug(nextName);

  const duplicate = await Category.findOne({
    _id: { $ne: id },
    $or: [{ name: nextName }, { slug: nextSlug }],
  });
  if (duplicate) return res.status(400).json({ message: 'Category already exists' });

  category.name = nextName;
  category.slug = nextSlug;
  if (description != null) category.description = description;
  if (thumbnail != null) category.thumbnail = thumbnail;
  if (parent_id != null) {
    if (!parent_id) {
      category.parent_id = null;
    } else {
      if (String(parent_id) === String(id)) {
        return res.status(400).json({ message: 'Category cannot be parent of itself' });
      }
      const parent = await Category.findById(parent_id);
      if (!parent) return res.status(400).json({ message: 'Invalid parent category' });
      category.parent_id = parent._id;
    }
  }

  await category.save();
  const populated = await Category.findById(category._id).populate('parent_id', 'name slug');
  res.json(populated);
}

async function deleteCategory(req, res) {
  const { id } = req.params;
  const category = await Category.findByIdAndDelete(id);
  if (!category) return res.status(404).json({ message: 'Category not found' });
  res.json({ message: 'Category deleted' });
}

module.exports = {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
};
