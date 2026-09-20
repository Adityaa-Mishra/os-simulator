/**
 * public/js/os/runtime/ApplicationContext.js
 * Runtime context binding an application instance to its APIContext, AdityyaOSAPI, and window.
 */

export class ApplicationContext {
  /**
   * @param {Object} options
   * @param {string} options.instanceId
   * @param {string} options.appId
   * @param {number} options.pid
   * @param {import('../api/APIContext.js').APIContext} options.apiContext
   * @param {import('../api/AdityyaOSAPI.js').AdityyaOSAPI} options.api
   * @param {import('../shell/WindowState.js').WindowModel|null} [options.windowModel=null]
   */
  constructor({
    instanceId,
    appId,
    pid,
    apiContext,
    api,
    windowModel = null
  }) {
    this.instanceId = instanceId;
    this.appId = appId;
    this.pid = pid;
    this.apiContext = apiContext;
    this.api = api;
    this.windowModel = windowModel;
  }

  /**
   * Get an immutable snapshot of this context.
   * @returns {{
   *   instanceId: string,
   *   appId: string,
   *   pid: number,
   *   windowId: string|null
   * }}
   */
  getState() {
    return {
      instanceId: this.instanceId,
      appId: this.appId,
      pid: this.pid,
      windowId: this.windowModel?.id || null
    };
  }

  /**
   * Clean up context resources upon application termination.
   */
  destroy() {
    if (this.api && typeof this.api.destroy === 'function') {
      this.api.destroy();
    }
  }
}
