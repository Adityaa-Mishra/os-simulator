/**
 * public/js/os/cloud/CloudSnapshot.js
 * Plain serializable data model for an AdityyaOS simulated cloud snapshot.
 */

let cloudSnapSeq = 0;

export class CloudSnapshot {
  /**
   * @param {Object} options
   * @param {string} [options.id]
   * @param {string} options.profileId
   * @param {string} options.username
   * @param {string} [options.description]
   * @param {number} [options.version=1]
   * @param {Object} [options.preferences]
   * @param {Object} [options.files] - Relative path -> { content, permissions, mtime }
   * @param {number} [options.createdAt]
   * @param {string} [options.checksum]
   */
  constructor({
    id = null,
    profileId,
    username,
    description = '',
    version = 1,
    preferences = {},
    files = {},
    createdAt = Date.now(),
    checksum = null
  }) {
    if (!profileId || typeof profileId !== 'string') {
      throw new TypeError('CloudSnapshot requires a profileId string');
    }
    if (!username || typeof username !== 'string') {
      throw new TypeError('CloudSnapshot requires a username string');
    }

    this.id = id || `cloudsnap-${++cloudSnapSeq}-${Date.now()}`;
    this.profileId = profileId;
    this.username = username;
    this.description = String(description || '').trim();
    this.version = typeof version === 'number' ? version : 1;
    this.preferences = JSON.parse(JSON.stringify(preferences || {}));
    this.files = JSON.parse(JSON.stringify(files || {}));
    this.createdAt = createdAt;
    this.checksum = checksum || `chk-${this.id}-${Object.keys(this.files).length}`;
  }

  /**
   * Return a plain serializable representation.
   * @returns {Object}
   */
  toJSON() {
    return {
      id: this.id,
      profileId: this.profileId,
      username: this.username,
      description: this.description,
      version: this.version,
      preferences: JSON.parse(JSON.stringify(this.preferences)),
      files: JSON.parse(JSON.stringify(this.files)),
      fileCount: Object.keys(this.files).length,
      filesCount: Object.keys(this.files).length,
      createdAt: this.createdAt,
      checksum: this.checksum
    };
  }
}
