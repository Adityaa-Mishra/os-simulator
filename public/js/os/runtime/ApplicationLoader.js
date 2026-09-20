/**
 * public/js/os/runtime/ApplicationLoader.js
 * In-memory registry and loader for AdityyaOS application definitions.
 */

import { ApplicationValidator } from './ApplicationValidator.js';

export class ApplicationLoader {
  constructor() {
    this._definitions = new Map();
  }

  /**
   * Register and validate an application definition.
   * @param {Object} definition
   * @returns {boolean}
   */
  register(definition) {
    ApplicationValidator.assertValid(definition);
    this._definitions.set(definition.id, {
      ...definition,
      permissions: Array.isArray(definition.permissions) ? [...definition.permissions] : undefined,
      window: definition.window ? { ...definition.window } : null
    });
    return true;
  }

  /**
   * Alias for register.
   * @param {Object} definition
   * @returns {boolean}
   */
  load(definition) {
    return this.register(definition);
  }

  /**
   * Unregister an application definition.
   * @param {string} appId
   * @returns {boolean}
   */
  unregister(appId) {
    return this._definitions.delete(appId);
  }

  /**
   * Alias for unregister.
   * @param {string} appId
   * @returns {boolean}
   */
  unload(appId) {
    return this.unregister(appId);
  }

  /**
   * Check if an application definition exists.
   * @param {string} appId
   * @returns {boolean}
   */
  has(appId) {
    return this._definitions.has(appId);
  }

  /**
   * Get an application definition copy by ID.
   * @param {string} appId
   * @returns {Object|null}
   */
  get(appId) {
    const def = this._definitions.get(appId);
    if (!def) return null;
    return {
      ...def,
      permissions: Array.isArray(def.permissions) ? [...def.permissions] : undefined,
      window: def.window ? { ...def.window } : null
    };
  }

  /**
   * Get all registered application definitions.
   * @returns {Array<Object>}
   */
  getAll() {
    return Array.from(this._definitions.values()).map(def => ({
      ...def,
      permissions: Array.isArray(def.permissions) ? [...def.permissions] : undefined,
      window: def.window ? { ...def.window } : null
    }));
  }

  /**
   * Clear all registered applications.
   */
  clear() {
    this._definitions.clear();
  }
}
