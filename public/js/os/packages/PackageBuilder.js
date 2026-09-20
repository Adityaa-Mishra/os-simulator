/**
 * public/js/os/packages/PackageBuilder.js
 * Fluent builder for assembling and validating .aapp AppPackage instances.
 */

import { AppManifest } from './AppManifest.js';
import { AppPackage } from './AppPackage.js';
import { PackageValidator } from './PackageValidator.js';

export class PackageBuilder {
  constructor() {
    this._manifestData = null;
    this._files = new Map();
    this._metadata = {};
  }

  /**
   * Set application manifest data.
   * @param {Object|AppManifest} manifest
   * @returns {this}
   */
  setManifest(manifest) {
    this._manifestData = manifest instanceof AppManifest ? manifest.getState() : { ...manifest };
    return this;
  }

  /**
   * Add a virtual text file to the package.
   * Content is stored purely as string/data.
   * @param {string} path
   * @param {string} content
   * @returns {this}
   */
  addFile(path, content) {
    if (typeof path !== 'string' || !path.trim()) {
      throw new TypeError('File path must be a non-empty string');
    }
    this._files.set(path.trim(), typeof content === 'string' ? content : String(content ?? ''));
    return this;
  }

  /**
   * Set package metadata.
   * @param {Object} metadata
   * @returns {this}
   */
  setMetadata(metadata) {
    this._metadata = { ...metadata };
    return this;
  }

  /**
   * Validate and build the sealed AppPackage instance.
   * @returns {AppPackage}
   */
  build() {
    const manifest = new AppManifest(this._manifestData || {});

    // Ensure manifest.json is available in files
    if (!this._files.has('manifest.json')) {
      this._files.set('manifest.json', JSON.stringify(manifest.getState(), null, 2));
    }

    const pkg = new AppPackage({
      manifest,
      files: this._files,
      metadata: this._metadata
    });

    PackageValidator.assertValid(pkg);
    return pkg;
  }
}
