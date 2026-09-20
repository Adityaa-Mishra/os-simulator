/**
 * public/js/os/profiles/ProfileError.js
 * Structured, serializable error class for AdityyaOS profile operations.
 */

export class ProfileError extends Error {
  /**
   * @param {Object} options
   * @param {string} options.code
   * @param {string} options.message
   * @param {string} [options.operation]
   * @param {string} [options.username]
   * @param {Error} [options.cause]
   */
  constructor({ code, message, operation = null, username = null, cause = null }) {
    super(message);
    this.name = 'ProfileError';
    this.code = code || 'EPROFILE';
    this.operation = operation;
    this.username = username;
    this.cause = cause;
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      operation: this.operation,
      username: this.username
    };
  }
}
