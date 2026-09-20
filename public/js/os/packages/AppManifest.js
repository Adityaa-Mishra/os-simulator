/**
 * public/js/os/packages/AppManifest.js
 * Model representing an AdityyaOS application package manifest (manifest.json).
 */

export class AppManifest {
  /**
   * @param {Object} data
   * @param {string} data.id
   * @param {string} data.name
   * @param {string} data.version
   * @param {string} [data.description='']
   * @param {string} [data.author='']
   * @param {string} data.entry
   * @param {Object} [data.window]
   * @param {Array<string>} [data.permissions=[]]
   * @param {number} [data.memoryRequired=0]
   * @param {string} [data.icon='📦']
   */
  constructor(data = {}) {
    this.id = data.id || '';
    this.name = data.name || '';
    this.version = data.version || '';
    this.description = data.description || '';
    this.author = data.author || '';
    this.entry = data.entry || 'app.js';
    this.window = data.window ? { ...data.window } : null;
    this.permissions = Array.isArray(data.permissions) ? Object.freeze([...data.permissions]) : Object.freeze([]);
    this.memoryRequired = typeof data.memoryRequired === 'number' && !isNaN(data.memoryRequired) ? data.memoryRequired : 0;
    this.icon = data.icon || '📦';
  }

  /**
   * Get an immutable snapshot copy of this manifest.
   * @returns {Object}
   */
  getState() {
    return {
      id: this.id,
      name: this.name,
      version: this.version,
      description: this.description,
      author: this.author,
      entry: this.entry,
      window: this.window ? { ...this.window } : null,
      permissions: [...this.permissions],
      memoryRequired: this.memoryRequired,
      icon: this.icon
    };
  }

  /**
   * JSON serialization support.
   * @returns {Object}
   */
  toJSON() {
    return this.getState();
  }
}
