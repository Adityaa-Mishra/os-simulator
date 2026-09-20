/**
 * public/js/os/api/APIContext.js
 * Controlled identity and scope for an AdityyaOS application instance.
 * Strictly isolates application identity and enforces immutable permissions without leaking Kernel private state.
 */

import { APIError } from './APIError.js';

export class APIContext {
  /**
   * @param {Object} options
   * @param {string} options.appId
   * @param {string} options.instanceId
   * @param {number} options.pid
   * @param {string} [options.profileId='default']
   * @param {string} [options.username='user']
   * @param {Array<string>} [options.permissions]
   * @param {string} [options.cwd='/home/user']
   */
  constructor({
    appId,
    instanceId,
    pid,
    profileId = null,
    username = 'user',
    permissions = undefined,
    cwd = null
  }) {
    if (!appId || typeof appId !== 'string') {
      throw new TypeError('APIContext requires a non-empty string appId');
    }
    if (!instanceId || typeof instanceId !== 'string') {
      throw new TypeError('APIContext requires a non-empty string instanceId');
    }
    if (typeof pid !== 'number' || isNaN(pid) || pid <= 0) {
      throw new TypeError('APIContext requires a valid positive number pid');
    }

    this.appId = appId;
    this.instanceId = instanceId;
    this.pid = pid;
    this.username = typeof username === 'string' && username ? username : 'user';
    this.profileId = profileId || (this.username === 'user' ? 'default' : `profile-${this.username}`);
    // Distinguish:
    // undefined -> legacy trusted Phase 20 compatibility
    // []        -> explicitly no permissions
    // [...]     -> exactly those permissions
    // null      -> explicitly not undefined, so not legacy; defaults to [] (no permissions)
    this._isLegacy = (permissions === undefined);
    this.permissions = Array.isArray(permissions) ? Object.freeze([...permissions]) : Object.freeze([]);
    this.cwd = typeof cwd === 'string' && cwd ? cwd : `/home/${this.username}`;
  }

  /**
   * Check if a specific permission is granted to this application instance.
   * @param {string} permission
   * @returns {boolean}
   */
  hasPermission(permission) {
    if (this._isLegacy) {
      return true; // Legacy trusted Phase 20 in-memory apps
    }
    return this.permissions.includes(permission);
  }

  /**
   * Assert that a permission is granted, throwing an EPERM APIError if not.
   * @param {string} permission
   * @param {string} operation
   */
  assertPermission(permission, operation) {
    if (!this.hasPermission(permission)) {
      throw new APIError({
        code: 'EPERM',
        message: `Permission denied: '${permission}' required for '${operation}'`,
        operation,
        appId: this.appId
      });
    }
  }

  /**
   * Returns an immutable snapshot copy of this context.
   * @returns {{
   *   appId: string,
   *   instanceId: string,
   *   pid: number,
   *   username: string,
   *   permissions: Array<string>|null,
   *   cwd: string
   * }}
   */
  getState() {
    return {
      appId: this.appId,
      instanceId: this.instanceId,
      pid: this.pid,
      profileId: this.profileId,
      username: this.username,
      permissions: this.permissions ? [...this.permissions] : null,
      cwd: this.cwd
    };
  }

  /**
   * JSON serialization support.
   */
  toJSON() {
    return this.getState();
  }
}
