/**
 * public/js/os/api/APIError.js
 * Standardized error model for the AdityyaOS Application API.
 */

export class APIError extends Error {
  /**
   * @param {Object} options
   * @param {string} options.code - Error code (e.g. ENOENT, EISDIR, EPERM, etc.)
   * @param {string} options.message - Human-readable error message
   * @param {string} [options.operation='unknown'] - API operation name
   * @param {string} [options.appId=null] - Application ID
   * @param {Error|null} [options.cause=null] - Underlying error cause
   */
  constructor({ code, message, operation = 'unknown', appId = null, cause = null }) {
    super(message);
    this.name = 'APIError';
    this.code = code || 'EAPPFAILED';
    this.operation = operation;
    this.appId = appId;
    this.cause = cause;
  }

  /**
   * Return a snapshot-safe structured JSON representation.
   * @returns {{ name: string, code: string, message: string, operation: string, appId: string|null }}
   */
  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      operation: this.operation,
      appId: this.appId
    };
  }
}
