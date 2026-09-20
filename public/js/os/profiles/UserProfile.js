/**
 * public/js/os/profiles/UserProfile.js
 * Plain serializable model representing an AdityyaOS user profile.
 */

import { ProfileStatus } from './ProfileState.js';

let profileSeq = 0;

export class UserProfile {
  /**
   * @param {Object} options
   * @param {string} [options.id]
   * @param {string} options.username
   * @param {string} [options.displayName]
   * @param {string} [options.homeDirectory]
   * @param {Object} [options.preferences]
   * @param {string} [options.status=ProfileStatus.ACTIVE]
   * @param {number} [options.createdAt]
   * @param {number} [options.updatedAt]
   * @param {number} [options.profileStateVersion=1]
   * @param {Object} [options.cloudSyncMetadata]
   */
  constructor({
    id = null,
    username,
    displayName = null,
    homeDirectory = null,
    preferences = {},
    status = ProfileStatus.ACTIVE,
    createdAt = null,
    updatedAt = null,
    profileStateVersion = 1,
    cloudSyncMetadata = {}
  }) {
    if (!username || typeof username !== 'string') {
      throw new TypeError('UserProfile requires a non-empty string username');
    }

    this.id = id || `profile-${username}`;
    this.username = username.trim();
    this.displayName = displayName ? String(displayName).trim() : this.username;
    this.homeDirectory = homeDirectory || `/home/${this.username}`;
    this.preferences = JSON.parse(JSON.stringify(preferences || {}));
    this.status = status;
    this.createdAt = typeof createdAt === 'number' ? createdAt : Date.now();
    this.updatedAt = typeof updatedAt === 'number' ? updatedAt : Date.now();
    this.profileStateVersion = typeof profileStateVersion === 'number' ? profileStateVersion : 1;
    this.cloudSyncMetadata = JSON.parse(JSON.stringify(cloudSyncMetadata || {}));
  }

  /**
   * Update preferences and increment version.
   * @param {Object} patch
   */
  updatePreferences(patch = {}) {
    if (patch && typeof patch === 'object') {
      this.preferences = {
        ...this.preferences,
        ...JSON.parse(JSON.stringify(patch))
      };
      this.profileStateVersion++;
      this.updatedAt = Date.now();
    }
  }

  /**
   * Return a plain, serializable snapshot of this profile.
   * @returns {Object}
   */
  toJSON() {
    return {
      id: this.id,
      username: this.username,
      displayName: this.displayName,
      homeDirectory: this.homeDirectory,
      preferences: JSON.parse(JSON.stringify(this.preferences)),
      status: this.status,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      profileStateVersion: this.profileStateVersion,
      cloudSyncMetadata: JSON.parse(JSON.stringify(this.cloudSyncMetadata))
    };
  }

  stat() {
    return this.toJSON();
  }
}
