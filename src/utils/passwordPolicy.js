/** Shared password rules for register / reset flows. */
function validatePasswordStrength(password) {
  const value = String(password || '');
  if (value.length < 8) {
    return 'Password must be at least 8 characters';
  }
  if (value.length > 128) {
    return 'Password must be at most 128 characters';
  }
  if (!/[a-zA-Z]/.test(value)) {
    return 'Password must include at least one letter';
  }
  if (!/[0-9]/.test(value)) {
    return 'Password must include at least one number';
  }
  return null;
}

module.exports = { validatePasswordStrength };
