function slugify(input = '') {
  return String(input)
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[-\s]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

module.exports = { slugify };
