const PERMISSION_KEYS = [
  'createCourse',
  'editCourse',
  'deleteCourse',
  'publishCourse',
  'viewStudents',
  'viewEarnings',
  'manageLessons',
  'uploadResources',
];

const ROLE_PERMISSION_DEFAULTS = {
  admin: {
    createCourse: true,
    editCourse: true,
    deleteCourse: true,
    publishCourse: true,
    viewStudents: true,
    viewEarnings: true,
    manageLessons: true,
    uploadResources: true,
  },
  teacher: {
    createCourse: true,
    editCourse: true,
    deleteCourse: false,
    publishCourse: true,
    viewStudents: true,
    viewEarnings: true,
    manageLessons: true,
    uploadResources: true,
  },
  editor: {
    createCourse: true,
    editCourse: true,
    deleteCourse: false,
    publishCourse: true,
    viewStudents: false,
    viewEarnings: false,
    manageLessons: true,
    uploadResources: true,
  },
  student: {
    createCourse: false,
    editCourse: false,
    deleteCourse: false,
    publishCourse: false,
    viewStudents: false,
    viewEarnings: false,
    manageLessons: false,
    uploadResources: false,
  },
};

function getRolePermissionDefaults(role) {
  const normalizedRole = String(role || 'student').toLowerCase();
  return { ...(ROLE_PERMISSION_DEFAULTS[normalizedRole] || ROLE_PERMISSION_DEFAULTS.student) };
}

function normalizePermissions(input, role) {
  const base = getRolePermissionDefaults(role);
  const incoming = input && typeof input === 'object' ? input : {};
  const normalized = { ...base };
  PERMISSION_KEYS.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(incoming, key)) {
      normalized[key] = Boolean(incoming[key]);
    }
  });
  return normalized;
}

function hasPermission(permissions, key) {
  if (!key) return true;
  return Boolean(permissions?.[key]);
}

module.exports = {
  PERMISSION_KEYS,
  ROLE_PERMISSION_DEFAULTS,
  getRolePermissionDefaults,
  normalizePermissions,
  hasPermission,
};
