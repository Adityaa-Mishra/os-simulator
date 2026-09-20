/**
 * public/js/os/api/ProfileAPI.js
 * Application-facing facade for AdityyaOS User Profiles.
 * Enforces profile permissions, PID ownership, and returns plain serializable snapshots only.
 * Does NOT retain or expose raw Kernel or ProfileManager references.
 */

import { APIError } from './APIError.js';

export class ProfileAPI {
  /**
   * @param {Object} options
   * @param {import('../profiles/ProfileServicePort.js').ProfileServicePort} options.servicePort
   * @param {import('./APIContext.js').APIContext} options.context
   */
  constructor({ servicePort, context } = {}) {
    if (!servicePort) {
      throw new TypeError('ProfileAPI requires a servicePort instance');
    }
    if (!context) {
      throw new TypeError('ProfileAPI requires an APIContext instance');
    }

    this._servicePort = servicePort;
    this._context = context;
  }

  /**
   * Get the current active user profile.
   * Requires 'profile.read' permission.
   * @returns {Object}
   */
  getCurrent() {
    this._context.assertPermission('profile.read', 'profile.getCurrent');
    return this._servicePort.getCurrent();
  }

  /**
   * List available profiles (public metadata only).
   * Returns only caller's profile to prevent cross-profile enumeration.
   * Requires 'profile.read' permission.
   * @returns {Array<Object>}
   */
  list() {
    this._context.assertPermission('profile.read', 'profile.list');
    return this._servicePort.list(this._context.username);
  }

  /**
   * Get profile by username.
   * Prevents foreign profile discovery: foreign profiles return uniform ENOENT error.
   * Requires 'profile.read' permission.
   * @param {string} username
   * @returns {Object}
   */
  getProfile(username) {
    this._context.assertPermission('profile.read', 'profile.getProfile');
    const profile = this._servicePort.getProfile(username, this._context.username);
    if (!profile) {
      throw new APIError({
        code: 'ENOENT',
        message: `Profile "${username}" not found or access denied`,
        operation: 'profile.getProfile',
        appId: this._context.appId
      });
    }
    return profile;
  }

  /**
   * Controlled profile creation.
   * Requires 'profile.write' permission.
   * @param {Object} params
   * @param {string} params.username
   * @param {string} [params.displayName]
   * @param {Object} [params.preferences]
   * @returns {Object} Plain serializable profile metadata
   */
  create({ username, displayName = null, preferences = {} } = {}) {
    this._context.assertPermission('profile.write', 'profile.create');
    try {
      return this._servicePort.create({ username, displayName, preferences });
    } catch (err) {
      throw new APIError({
        code: err.code || 'EPROFILECREATEFAILED',
        message: err.message,
        operation: 'profile.create',
        appId: this._context.appId,
        cause: err
      });
    }
  }

  /**
   * Get preferences for current profile.
   * Requires 'profile.read' permission.
   * @returns {Object}
   */
  getPreferences() {
    this._context.assertPermission('profile.read', 'profile.getPreferences');
    try {
      return this._servicePort.getPreferences(this._context.username, this._context.username);
    } catch (err) {
      throw new APIError({
        code: err.code || 'EPROFILEPREFFAILED',
        message: err.message,
        operation: 'profile.getPreferences',
        appId: this._context.appId,
        cause: err
      });
    }
  }

  /**
   * Update preferences for current profile.
   * Requires 'profile.write' permission.
   * @param {Object} patch
   * @returns {Object}
   */
  updatePreferences(patch = {}) {
    this._context.assertPermission('profile.write', 'profile.updatePreferences');
    try {
      return this._servicePort.updatePreferences(patch, this._context.username);
    } catch (err) {
      throw new APIError({
        code: err.code || 'EPROFILEUPDATEFAILED',
        message: err.message,
        operation: 'profile.updatePreferences',
        appId: this._context.appId,
        cause: err
      });
    }
  }

  /**
   * Request a profile switch.
   * Requires 'profile.switch' permission.
   * Returns an immutable approval request requiring user confirmation.
   * @param {string} targetUsername
   * @returns {Object} Approval request record
   */
  switch(targetUsername) {
    this._context.assertPermission('profile.switch', 'profile.switch');
    try {
      return this._servicePort.requestSwitch({
        targetUsername,
        context: this._context
      });
    } catch (err) {
      throw new APIError({
        code: err.code || 'EPROFILESWITCHFAILED',
        message: err.message,
        operation: 'profile.switch',
        appId: this._context.appId,
        cause: err
      });
    }
  }

  /**
   * Approve and execute a pending profile switch.
   * Requires 'profile.switch' permission.
   * @param {string} approvalId
   * @returns {Object}
   */
  approveSwitch(approvalId) {
    this._context.assertPermission('profile.switch', 'profile.approveSwitch');
    try {
      return this._servicePort.approveSwitch(approvalId, this._context.pid);
    } catch (err) {
      throw new APIError({
        code: err.code || 'EPROFILESWITCHFAILED',
        message: err.message,
        operation: 'profile.approveSwitch',
        appId: this._context.appId,
        cause: err
      });
    }
  }

  /**
   * Deny a pending profile switch request.
   * Requires 'profile.switch' permission.
   * @param {string} approvalId
   * @param {string} [reason='User denied']
   * @returns {Object}
   */
  denySwitch(approvalId, reason = 'User denied') {
    this._context.assertPermission('profile.switch', 'profile.denySwitch');
    try {
      return this._servicePort.denySwitch(approvalId, this._context.pid, reason);
    } catch (err) {
      throw new APIError({
        code: err.code || 'EPROFILESWITCHFAILED',
        message: err.message,
        operation: 'profile.denySwitch',
        appId: this._context.appId,
        cause: err
      });
    }
  }
}
