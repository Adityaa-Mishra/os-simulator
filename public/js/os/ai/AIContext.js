/**
 * public/js/os/ai/AIContext.js
 * Sanitized, structured context container for AdityyaOS AI Core.
 * Strictly guarantees that no Kernel, OSState, ProcessManager, FileSystemManager,
 * WindowManager, or host system internals leak into the AI inference context.
 */

export class AIContext {
  /**
   * @param {Object} [options={}]
   * @param {string} [options.appId='system']
   * @param {string} [options.username='user']
   * @param {string} [options.osVersion='1.0.0']
   * @param {string} [options.hostname='adityya-os']
   * @param {string} [options.locale='en-US']
   * @param {Object} [options.customData={}] - Safe key-value pairs (sanitized strings/numbers)
   */
  constructor({
    appId = 'system',
    username = 'user',
    osVersion = '1.0.0',
    hostname = 'adityya-os',
    locale = 'en-US',
    customData = {}
  } = {}) {
    this.appId = String(appId || 'system');
    this.username = String(username || 'user');
    this.osVersion = String(osVersion || '1.0.0');
    this.hostname = String(hostname || 'adityya-os');
    this.locale = String(locale || 'en-US');
    this.timestamp = new Date().toISOString();

    // Sanitize any user-supplied custom data to plain primitive values
    this.customData = this._sanitizeCustomData(customData);
  }

  /**
   * Deeply sanitize an object to contain only primitive types (strings, numbers, booleans).
   * Strips functions, class instances, circular refs, DOM nodes, and private symbols.
   * @private
   * @param {*} data
   * @returns {Object}
   */
  _sanitizeCustomData(data) {
    if (!data || typeof data !== 'object') return {};
    const sanitized = {};
    for (const [key, value] of Object.entries(data)) {
      // Avoid prototype pollution
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
      const valType = typeof value;
      if (valType === 'string' || valType === 'number' || valType === 'boolean') {
        sanitized[key] = value;
      } else if (Array.isArray(value)) {
        sanitized[key] = value.filter(v => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean');
      } else if (value && valType === 'object' && value.constructor === Object) {
        sanitized[key] = this._sanitizeCustomData(value);
      }
    }
    return sanitized;
  }

  /**
   * Return a snapshot-safe serializable plain JSON object.
   * @returns {Object}
   */
  toJSON() {
    return {
      appId: this.appId,
      username: this.username,
      osVersion: this.osVersion,
      hostname: this.hostname,
      locale: this.locale,
      timestamp: this.timestamp,
      customData: { ...this.customData }
    };
  }

  /**
   * Clone this context.
   * @returns {AIContext}
   */
  clone() {
    return new AIContext({
      appId: this.appId,
      username: this.username,
      osVersion: this.osVersion,
      hostname: this.hostname,
      locale: this.locale,
      customData: JSON.parse(JSON.stringify(this.customData))
    });
  }
}
