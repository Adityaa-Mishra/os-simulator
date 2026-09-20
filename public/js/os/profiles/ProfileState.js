/**
 * public/js/os/profiles/ProfileState.js
 * Status constants, reserved usernames, and validation rules for AdityyaOS user profiles.
 */

export const ProfileStatus = Object.freeze({
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  LOCKED: 'LOCKED'
});

export const RESERVED_USERNAMES = Object.freeze([
  'root',
  'system',
  'bin',
  'tmp',
  'home',
  'etc',
  'var',
  'dev',
  'proc',
  'sys',
  'kernel',
  'admin',
  'administrator',
  'guest',
  'default'
]);

/**
 * Validate whether a username string is syntactically valid and not reserved.
 * @param {string} username
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateUsername(username) {
  if (typeof username !== 'string' || !username.trim()) {
    return { valid: false, error: 'Username must be a non-empty string' };
  }

  const trimmed = username.trim();

  if (trimmed.length < 2 || trimmed.length > 32) {
    return { valid: false, error: 'Username must be between 2 and 32 characters' };
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
    return { valid: false, error: 'Username can only contain alphanumeric characters, underscores, and hyphens' };
  }

  const lower = trimmed.toLowerCase();
  // 'user' is the valid default username, but other reserved names are rejected
  if (lower !== 'user' && RESERVED_USERNAMES.includes(lower)) {
    return { valid: false, error: `Username "${trimmed}" is reserved` };
  }

  return { valid: true };
}
