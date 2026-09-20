/**
 * public/js/os/filesystem/Directory.js
 * Represents a directory node in AdityyaOS.
 * Holds directory metadata (Inode) and child entry mappings (name -> inodeId).
 */

import { Inode } from './Inode.js';

export class Directory extends Inode {
  /**
   * @param {Object} options
   * @param {number} options.inodeId
   * @param {string} options.name
   * @param {number|null} [options.parentId=null]
   * @param {string} [options.permissions='rwx']
   * @param {Object|Map<string, number>} [options.children={}]
   * @param {string} [options.createdAt]
   * @param {string} [options.modifiedAt]
   * @param {string} [options.accessedAt]
   */
  constructor(options) {
    super({
      ...options,
      type: 'directory',
      permissions: options.permissions || 'rwx',
      size: 0
    });

    this.children = new Map();

    if (options.children) {
      if (options.children instanceof Map) {
        for (const [name, id] of options.children.entries()) {
          this.children.set(name, id);
        }
      } else if (typeof options.children === 'object') {
        for (const [name, id] of Object.entries(options.children)) {
          this.children.set(name, id);
        }
      }
    }
  }

  /**
   * Add a child entry to this directory.
   * @param {string} name
   * @param {number} inodeId
   */
  addChild(name, inodeId) {
    if (!name || typeof name !== 'string') {
      throw new TypeError('Child name must be a non-empty string');
    }
    if (typeof inodeId !== 'number' || isNaN(inodeId) || inodeId <= 0) {
      throw new TypeError('Child inode ID must be a positive integer');
    }

    this.children.set(name, inodeId);
    this.markModified();
  }

  /**
   * Remove a child entry by name.
   * @param {string} name
   * @returns {boolean} true if removed
   */
  removeChild(name) {
    const deleted = this.children.delete(name);
    if (deleted) {
      this.markModified();
    }
    return deleted;
  }

  /**
   * Get inode ID for a child name.
   * @param {string} name
   * @returns {number|null}
   */
  getChild(name) {
    this.touch();
    return this.children.get(name) || null;
  }

  /**
   * Check if a child name exists.
   * @param {string} name
   * @returns {boolean}
   */
  hasChild(name) {
    return this.children.has(name);
  }

  /**
   * List all child entries.
   * @returns {Array<{ name: string, inodeId: number }>}
   */
  list() {
    this.touch();
    const result = [];
    for (const [name, inodeId] of this.children.entries()) {
      result.push({ name, inodeId });
    }
    return result;
  }

  /**
   * Check if directory is empty.
   * @returns {boolean}
   */
  isEmpty() {
    return this.children.size === 0;
  }

  /**
   * Return a serializable snapshot including children for persistence.
   * @returns {Object}
   */
  toJSON() {
    const childrenObj = {};
    for (const [name, id] of this.children.entries()) {
      childrenObj[name] = id;
    }

    return {
      ...super.toJSON(),
      children: childrenObj
    };
  }

  /**
   * Create Directory instance from JSON.
   * @param {Object} json
   * @returns {Directory}
   */
  static fromJSON(json) {
    return new Directory(json);
  }
}
