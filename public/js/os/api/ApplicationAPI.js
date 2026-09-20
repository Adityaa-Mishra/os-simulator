/**
 * public/js/os/api/ApplicationAPI.js
 * Controlled application interface for lifecycle self-management.
 * Allows an application instance to query its identity and request termination,
 * enforcing 'application.lifecycle' permission.
 */

export class ApplicationAPI {
  /**
   * @param {Object} options
   * @param {import('../runtime/ApplicationRuntime.js').ApplicationRuntime} [options.runtime]
   * @param {import('./APIContext.js').APIContext} options.context
   */
  constructor({ runtime, context }) {
    this._runtime = runtime;
    this._context = context;
  }

  /**
   * Get unique instance ID of this running application.
   * @returns {string}
   */
  getId() {
    return this._context?.instanceId;
  }

  /**
   * Get application definition ID.
   * @returns {string}
   */
  getAppId() {
    return this._context?.appId;
  }

  /**
   * Request voluntary termination of this application instance.
   * Requires 'application.lifecycle' permission.
   * @param {number} [exitCode=0]
   */
  exit(exitCode = 0) {
    this._context?.assertPermission('application.lifecycle', 'app.exit');
    if (this._runtime && typeof this._runtime.terminate === 'function') {
      return this._runtime.terminate(this.getId(), exitCode);
    }
  }
}
