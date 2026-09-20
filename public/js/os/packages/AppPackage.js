/**
 * public/js/os/packages/AppPackage.js
 * Model representing an AdityyaOS .aapp application package.
 * Strictly stores virtual files as text/data. Never serializes or compiles executable code.
 */

import { AppManifest } from './AppManifest.js';

export class AppPackage {
  /**
   * @param {Object} options
   * @param {AppManifest|Object} options.manifest
   * @param {Map<string, string>|Object<string, string>} [options.files]
   * @param {Object} [options.metadata]
   */
  constructor({ manifest, files = new Map(), metadata = {} }) {
    this.manifest = manifest instanceof AppManifest ? manifest : new AppManifest(manifest);

    this.files = new Map();
    if (files instanceof Map) {
      for (const [path, content] of files.entries()) {
        // Enforce that virtual file content is stored as string/data, never a function
        this.files.set(path, typeof content === 'string' ? content : String(content ?? ''));
      }
    } else if (files && typeof files === 'object') {
      for (const [path, content] of Object.entries(files)) {
        this.files.set(path, typeof content === 'string' ? content : String(content ?? ''));
      }
    }

    this.metadata = {
      format: 'aapp/1.0',
      builtAt: metadata?.builtAt || Date.now(),
      ...metadata
    };
  }

  /**
   * Get application manifest.
   * @returns {AppManifest}
   */
  getManifest() {
    return this.manifest;
  }

  /**
   * Check if a virtual file exists in the package.
   * @param {string} path
   * @returns {boolean}
   */
  hasFile(path) {
    return this.files.has(path);
  }

  /**
   * Get virtual file content by path.
   * @param {string} path
   * @returns {string|null}
   */
  getFile(path) {
    return this.files.get(path) ?? null;
  }

  /**
   * List all virtual file paths in the package.
   * @returns {Array<string>}
   */
  listFiles() {
    return Array.from(this.files.keys());
  }

  /**
   * Serialize package to a 100% JSON-compatible structure or string.
   * Functions are strictly excluded.
   * @param {boolean} [asString=false]
   * @returns {Object|string}
   */
  serialize(asString = false) {
    const rawFiles = {};
    for (const [path, content] of this.files.entries()) {
      // Guarantee no function is serialized
      if (typeof content !== 'function') {
        rawFiles[path] = String(content);
      }
    }

    const payload = {
      format: 'aapp/1.0',
      metadata: { ...this.metadata },
      manifest: this.manifest.getState(),
      files: rawFiles
    };

    return asString ? JSON.stringify(payload) : payload;
  }

  /**
   * Deserialize a JSON string or plain object into an AppPackage.
   * Does NOT dynamically evaluate or compile code.
   * @param {string|Object} data
   * @returns {AppPackage}
   */
  static deserialize(data) {
    let parsed = data;
    if (typeof data === 'string') {
      parsed = JSON.parse(data);
    }

    if (!parsed || typeof parsed !== 'object') {
      throw new TypeError('Invalid serialized package data: expected object');
    }

    const manifest = new AppManifest(parsed.manifest || {});
    const files = new Map();

    if (parsed.files && typeof parsed.files === 'object') {
      for (const [filePath, content] of Object.entries(parsed.files)) {
        files.set(filePath, String(content));
      }
    }

    return new AppPackage({
      manifest,
      files,
      metadata: parsed.metadata || {}
    });
  }

  /**
   * Alias for deserialize.
   * @param {string|Object} data
   * @returns {AppPackage}
   */
  static fromJSON(data) {
    return this.deserialize(data);
  }

  /**
   * Get safe snapshot of package state.
   * @returns {Object}
   */
  getState() {
    return this.serialize(false);
  }

  /**
   * JSON serialization support.
   */
  toJSON() {
    return this.serialize(false);
  }
}
