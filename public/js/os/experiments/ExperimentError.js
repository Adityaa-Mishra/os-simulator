/**
 * public/js/os/experiments/ExperimentError.js
 * Structured, serializable error class for AdityyaOS experiments.
 */

export class ExperimentError extends Error {
  /**
   * @param {Object} options
   * @param {string} options.code
   * @param {string} options.message
   * @param {string} [options.operation]
   * @param {string} [options.experimentId]
   * @param {Error} [options.cause]
   */
  constructor({ code, message, operation = null, experimentId = null, cause = null }) {
    super(message);
    this.name = 'ExperimentError';
    this.code = code || 'EEXPERIMENT';
    this.operation = operation;
    this.experimentId = experimentId;
    this.cause = cause;
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      operation: this.operation,
      experimentId: this.experimentId
    };
  }
}
