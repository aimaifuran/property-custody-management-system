const PASSWORD_POLICY_MESSAGE = 'Password must be at least 8 characters and include an uppercase letter, a lowercase letter, a number, and a special character.';
const isStrongPassword = value => typeof value === 'string'
  && value.length >= 8
  && Buffer.byteLength(value) <= 72
  && /[A-Z]/.test(value)
  && /[a-z]/.test(value)
  && /[0-9]/.test(value)
  && /[^A-Za-z0-9]/.test(value);

module.exports = { PASSWORD_POLICY_MESSAGE, isStrongPassword };
