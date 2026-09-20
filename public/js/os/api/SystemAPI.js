/**
 * public/js/os/api/SystemAPI.js
 * Controlled application interface for safe, read-only system information.
 */

export class SystemAPI {
  /**
   * @param {Object} options
   * @param {import('../kernel/Kernel.js').Kernel} options.kernel
   * @param {import('./APIContext.js').APIContext} options.context
   */
  constructor({ kernel, context }) {
    this._kernel = kernel;
    this._context = context;
  }

  /**
   * Get basic, safe OS and system status information.
   * Returned object is snapshot-safe and decoupled from internal Kernel state.
   * @returns {{
   *   name: string,
   *   version: string,
   *   status: string,
   *   uptime: number,
   *   user: string,
   *   arch: string,
   *   kernelVersion: string
   * }}
   */
  getInfo() {
    const sysState = this._kernel?.state?.system || {};
    return {
      name: 'AdityyaOS',
      version: '1.0.0',
      status: sysState.status || 'RUNNING',
      uptime: typeof sysState.uptime === 'number' ? sysState.uptime : 0,
      user: this._context?.username || sysState.user || 'user',
      arch: 'x86_64',
      kernelVersion: '1.0.0'
    };
  }

  /**
   * Get current system uptime in seconds/ticks.
   * @returns {number}
   */
  getUptime() {
    return this._kernel?.state?.system?.uptime || 0;
  }

  /**
   * Get current OS status string.
   * @returns {string}
   */
  getStatus() {
    return this._kernel?.state?.system?.status || 'RUNNING';
  }
}
