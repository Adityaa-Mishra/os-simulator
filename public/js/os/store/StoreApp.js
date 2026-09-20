/**
 * public/js/os/store/StoreApp.js
 * Model representing an application catalog entry in the Adityya Store.
 */

import { AppPackage } from '../packages/AppPackage.js';

export class StoreApp {
  /**
   * @param {Object} options
   * @param {string} options.id
   * @param {string} options.name
   * @param {string} options.version
   * @param {string} [options.description='']
   * @param {string} [options.author='AdityyaOS']
   * @param {string} [options.category='General']
   * @param {string} [options.icon='📦']
   * @param {Array<string>} [options.permissions=[]]
   * @param {AppPackage} options.package
   * @param {Function|null} [options.trustedEntry=null] - Runtime-only trusted entry function
   */
  constructor({
    id,
    name,
    version,
    description = '',
    author = 'AdityyaOS',
    category = 'General',
    icon = '📦',
    permissions = [],
    package: pkg,
    trustedEntry = null
  }) {
    this.id = id;
    this.name = name;
    this.version = version;
    this.description = description;
    this.author = author;
    this.category = category;
    this.icon = icon;
    this.permissions = Array.isArray(permissions) ? Object.freeze([...permissions]) : Object.freeze([]);
    this.package = pkg;
    // Runtime-only entry function, strictly excluded from serialization
    this.trustedEntry = typeof trustedEntry === 'function' ? trustedEntry : null;
  }

  /**
   * Get an immutable, snapshot-safe representation of this store catalog entry.
   * Functions are strictly excluded.
   * @returns {Object}
   */
  getState() {
    return {
      id: this.id,
      name: this.name,
      version: this.version,
      description: this.description,
      author: this.author,
      category: this.category,
      icon: this.icon,
      permissions: [...this.permissions],
      package: this.package ? this.package.getState() : null
    };
  }

  /**
   * JSON serialization support.
   */
  toJSON() {
    return this.getState();
  }
}
