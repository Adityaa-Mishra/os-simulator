/**
 * public/js/os/api/ApplicationAPI.js
 * Controlled application interface for lifecycle self-management.
 * Allows an application instance to query its identity and request termination,
 * enforcing 'application.lifecycle' permission.
 */

import { SYSTEM_APPLICATIONS } from '../desktop/Launcher.js';

export class ApplicationAPI {
  /**
   * @param {Object} options
   * @param {import('../runtime/ApplicationRuntime.js').ApplicationRuntime} [options.runtime]
   * @param {import('../shell/WindowManager.js').WindowManager} [options.windowManager]
   * @param {import('./APIContext.js').APIContext} options.context
   */
  constructor({ runtime = null, windowManager = null, context }) {
    this._runtime = runtime;
    this._windowManager = windowManager;
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

  /**
   * Launch another application.
   * Requires 'application.lifecycle' permission.
   * @param {string} appId
   * @param {Object} [options={}]
   * @returns {Object|null}
   */
  launch(appId, options = {}) {
    this._context?.assertPermission('application.lifecycle', 'app.launch');
    if (this._runtime && typeof this._runtime.launch === 'function') {
      return this._runtime.launch(appId, options);
    }
    if (this._windowManager && typeof this._windowManager.openWindow === 'function') {
      const registry = this._windowManager.applicationRegistry || this._windowManager.registry;
      const app = registry?.get?.(appId) || SYSTEM_APPLICATIONS.find(a => a.id === appId);
      if (app) {
        const view = typeof app.createView === 'function'
          ? app.createView({ windowManager: this._windowManager, kernel: this._windowManager?.kernel, ...options })
          : null;
        return this._windowManager.openWindow({
          appId: app.id,
          title: options.title || app.name,
          icon: options.icon || app.icon,
          width: options.width || app.defaultWidth,
          height: options.height || app.defaultHeight,
          singleton: options.singleton ?? app.singleton,
          view
        });
      }
    }
    return null;
  }
}
