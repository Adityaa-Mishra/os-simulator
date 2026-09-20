/**
 * public/js/os/filesystem/Inode.js
 * Inode-style metadata representation for AdityyaOS filesystem objects.
 * Every file and directory has a stable, unique inodeId and metadata record.
 */

export class Inode {
  /**
   * @param {Object} options
   * @param {number} options.inodeId
   * @param {'file'|'directory'} options.type
   * @param {string} options.name
   * @param {number|null} [options.parentId=null]
   * @param {number} [options.size=0]
   * @param {string} [options.permissions]
   * @param {Array<Object>} [options.storageBlocks=[]]
   * @param {string} [options.createdAt]
   * @param {string} [options.modifiedAt]
   * @param {string} [options.accessedAt]
   */
  constructor({
    inodeId,
    type,
    name,
    parentId = null,
    size = 0,
    permissions = null,
    storageBlocks = [],
    createdAt = null,
    modifiedAt = null,
    accessedAt = null
  }) {
    if (typeof inodeId !== 'number' || isNaN(inodeId) || inodeId <= 0) {
      throw new TypeError('Inode ID must be a positive integer');
    }
    if (type !== 'file' && type !== 'directory') {
      throw new TypeError(`Invalid inode type "${type}". Must be "file" or "directory"`);
    }
    if (!name || typeof name !== 'string') {
      throw new TypeError('Inode name must be a non-empty string');
    }

    const now = new Date().toISOString();

    this.inodeId = inodeId;
    this.type = type;
    this.name = name;
    this.parentId = parentId;
    this.size = typeof size === 'number' && size >= 0 ? size : 0;
    this.permissions = permissions || (type === 'directory' ? 'rwx' : 'rw-');
    this.storageBlocks = Array.isArray(storageBlocks) ? storageBlocks.map(b => ({ ...b })) : [];
    this.createdAt = createdAt || now;
    this.modifiedAt = modifiedAt || now;
    this.accessedAt = accessedAt || now;
    this.openCount = 0; // Number of open descriptors referencing this inode
  }

  /**
   * Update the access timestamp.
   */
  touch() {
    this.accessedAt = new Date().toISOString();
  }

  /**
   * Update the modification timestamp and access timestamp.
   */
  markModified() {
    const now = new Date().toISOString();
    this.modifiedAt = now;
    this.accessedAt = now;
  }

  /**
   * Return a clean, safe stat metadata object.
   * @returns {Object}
   */
  stat() {
    return {
      inodeId: this.inodeId,
      type: this.type,
      name: this.name,
      parentId: this.parentId,
      size: this.size,
      permissions: this.permissions,
      createdAt: this.createdAt,
      modifiedAt: this.modifiedAt,
      accessedAt: this.accessedAt,
      openCount: this.openCount,
      storageBlocks: this.storageBlocks.map(b => ({ ...b }))
    };
  }

  /**
   * Return a serializable snapshot for persistent storage.
   * @returns {Object}
   */
  toJSON() {
    return {
      inodeId: this.inodeId,
      type: this.type,
      name: this.name,
      parentId: this.parentId,
      size: this.size,
      permissions: this.permissions,
      createdAt: this.createdAt,
      modifiedAt: this.modifiedAt,
      accessedAt: this.accessedAt,
      storageBlocks: this.storageBlocks.map(b => ({ ...b }))
    };
  }

  /**
   * Create an Inode from a deserialized JSON object.
   * @param {Object} json
   * @returns {Inode}
   */
  static fromJSON(json) {
    return new Inode(json);
  }
}
