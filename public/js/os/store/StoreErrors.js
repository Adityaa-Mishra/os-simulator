/**
 * public/js/os/store/StoreErrors.js
 * Standardized error model for Adityya Store operations.
 */

export class StoreError extends Error {
  /**
   * @param {Object} options
   * @param {string} options.code - Error code (e.g. ESTORE_APP_NOT_FOUND, ESTORE_ALREADY_INSTALLED, etc.)
   * @param {string} options.message - Human-readable error message
   * @param {string} [options.appId=null] - Application ID
   * @param {Error|null} [options.cause=null] - Underlying cause
   */
  constructor({ code, message, appId = null, cause = null }) {
    super(message);
    this.name = 'StoreError';
    this.code = code || 'ESTORE_ERROR';
    this.appId = appId;
    this.cause = cause;
  }

  /**
   * Return a snapshot-safe structured JSON representation.
   * @returns {{ name: string, code: string, message: string, appId: string|null }}
   */
  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      appId: this.appId
    };
  }
}
