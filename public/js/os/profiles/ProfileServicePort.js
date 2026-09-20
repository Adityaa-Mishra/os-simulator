/**
 * public/js/os/profiles/ProfileServicePort.js
 * Restricted facade port for ProfileAPI.
 * Shields raw Kernel and ProfileManager references and returns plain serializable snapshots only.
 */

export class ProfileServicePort {
  #manager;

  /**
   * @param {import('./ProfileManager.js').ProfileManager} manager
   */
  constructor(manager) {
    if (!manager) {
      throw new TypeError('ProfileServicePort requires a ProfileManager instance');
    }
    this.#manager = manager;
  }

  getCurrent() {
    return this.#manager.getCurrentProfile();
  }

  list(requestingUsername = null) {
    return this.#manager.listProfiles(requestingUsername);
  }

  getProfile(username, requestingUsername) {
    return this.#manager.getProfile(username, requestingUsername);
  }

  create({ username, displayName, preferences }) {
    return this.#manager.createProfile({ username, displayName, preferences });
  }

  getPreferences(username, requestingUsername) {
    return this.#manager.getPreferences(username, requestingUsername);
  }

  updatePreferences(patch, requestingUsername) {
    return this.#manager.updatePreferences(patch, requestingUsername);
  }

  requestSwitch({ targetUsername, context }) {
    return this.#manager.requestSwitch({ targetUsername, context });
  }

  approveSwitch(approvalId, requestingPid) {
    return this.#manager.approveSwitch(approvalId, requestingPid);
  }

  denySwitch(approvalId, requestingPid, reason) {
    return this.#manager.denySwitch(approvalId, requestingPid, reason);
  }
}
