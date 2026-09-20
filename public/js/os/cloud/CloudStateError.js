/**
 * public/js/os/cloud/CloudStateError.js
 * Structured, serializable error class for simulated cloud operations.
 */

export class CloudStateError extends Error {
  /**
   * @param {Object} options
   * @param {string} options.code
   * @param {string} options.message
   * @param {string} [options.operation]
   * @param {string} [options.snapshotId]
   * @param {Error} [options.cause]
   */
  constructor({ code, message, operation = null, snapshotId = null, cause = null }) {
    super(message);
    this.name = 'CloudStateError';
    this.code = code || 'ECLOUD';
    this.operation = operation;
    this.snapshotId = snapshotId;
    this.cause = cause;
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      operation: this.operation,
      snapshotId: this.snapshotId
    };
  }
}
