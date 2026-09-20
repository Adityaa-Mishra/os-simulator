/**
 * public/js/os/packages/PackageValidator.js
 * Deterministic validator for AdityyaOS application packages and manifests.
 */

import { isValidPermission } from './PackagePermissions.js';
import { PackageError } from './PackageErrors.js';

export class PackageValidator {
  /**
   * Validate an application manifest object.
   * @param {Object} manifest
   * @returns {{ valid: boolean, errors: string[] }}
   */
  static validateManifest(manifest) {
    const errors = [];

    if (!manifest || typeof manifest !== 'object') {
      return { valid: false, errors: ['Manifest must be a non-null object'] };
    }

    // 1. Validate ID
    if (!manifest.id || typeof manifest.id !== 'string') {
      errors.push('Manifest "id" is required and must be a non-empty string');
    } else if (!/^[a-zA-Z0-9._-]+$/.test(manifest.id)) {
      errors.push(`Manifest "id" "${manifest.id}" is invalid (allowed: alphanumeric, '.', '_', '-')`);
    }

    // 2. Validate Name
    if (!manifest.name || typeof manifest.name !== 'string' || !manifest.name.trim()) {
      errors.push('Manifest "name" is required and must be a non-empty string');
    }

    // 3. Validate Version (SemVer: x.y.z)
    if (!manifest.version || typeof manifest.version !== 'string') {
      errors.push('Manifest "version" is required and must be a string');
    } else if (!/^\d+\.\d+\.\d+$/.test(manifest.version.trim())) {
      errors.push(`Manifest "version" "${manifest.version}" must follow semantic versioning (e.g. 1.0.0)`);
    }

    // 4. Validate Entry Path
    if (!manifest.entry || typeof manifest.entry !== 'string' || !manifest.entry.trim()) {
      errors.push('Manifest "entry" is required and must be a non-empty string');
    } else {
      const entryPath = manifest.entry.trim();
      if (entryPath.includes('..') || entryPath.startsWith('/') || /^[a-zA-Z]:/.test(entryPath) || entryPath.includes('\\')) {
        errors.push(`Manifest "entry" "${entryPath}" must be a relative virtual path without directory traversal or host paths`);
      }
    }

    // 5. Validate Permissions
    if (manifest.permissions !== undefined && manifest.permissions !== null) {
      if (!Array.isArray(manifest.permissions)) {
        errors.push('Manifest "permissions" must be an array');
      } else {
        const seen = new Set();
        for (let i = 0; i < manifest.permissions.length; i++) {
          const perm = manifest.permissions[i];
          if (typeof perm !== 'string' || !isValidPermission(perm)) {
            errors.push(`Manifest permission "${perm}" at index ${i} is not a valid AdityyaOS permission`);
          } else if (seen.has(perm)) {
            errors.push(`Manifest permission "${perm}" is duplicated`);
          } else {
            seen.add(perm);
          }
        }
      }
    }

    // 6. Validate Window Configuration if present
    if (manifest.window !== undefined && manifest.window !== null) {
      if (typeof manifest.window !== 'object') {
        errors.push('Manifest "window" configuration must be an object');
      } else {
        if (manifest.window.width !== undefined && (typeof manifest.window.width !== 'number' || manifest.window.width <= 0)) {
          errors.push('Manifest window "width" must be a positive number');
        }
        if (manifest.window.height !== undefined && (typeof manifest.window.height !== 'number' || manifest.window.height <= 0)) {
          errors.push('Manifest window "height" must be a positive number');
        }
        if (manifest.window.resizable !== undefined && typeof manifest.window.resizable !== 'boolean') {
          errors.push('Manifest window "resizable" must be a boolean');
        }
        if (manifest.window.singleton !== undefined && typeof manifest.window.singleton !== 'boolean') {
          errors.push('Manifest window "singleton" must be a boolean');
        }
      }
    }

    // 7. Validate Memory Requirement if present
    if (manifest.memoryRequired !== undefined && manifest.memoryRequired !== null) {
      if (typeof manifest.memoryRequired !== 'number' || isNaN(manifest.memoryRequired) || manifest.memoryRequired < 0) {
        errors.push('Manifest "memoryRequired" must be a non-negative number');
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate an AppPackage instance or package structure.
   * @param {Object} pkg
   * @returns {{ valid: boolean, errors: string[] }}
   */
  static validatePackage(pkg) {
    const errors = [];

    if (!pkg || typeof pkg !== 'object') {
      return { valid: false, errors: ['Package must be a non-null object'] };
    }

    // Extract manifest
    let manifest = pkg.manifest;
    if (!manifest && pkg.hasFile && pkg.hasFile('manifest.json')) {
      try {
        manifest = JSON.parse(pkg.getFile('manifest.json'));
      } catch (err) {
        errors.push(`Malformed manifest.json: ${err.message}`);
      }
    }

    if (!manifest) {
      errors.push('Package is missing a manifest');
      return { valid: false, errors };
    }

    // Validate manifest
    const manifestRes = this.validateManifest(manifest);
    if (!manifestRes.valid) {
      errors.push(...manifestRes.errors);
    }

    // Validate virtual files
    const fileEntries = pkg.files instanceof Map ? Array.from(pkg.files.keys()) : Object.keys(pkg.files || {});

    for (const filePath of fileEntries) {
      if (typeof filePath !== 'string' || !filePath.trim()) {
        errors.push('Package contains empty or invalid file path');
        continue;
      }
      if (filePath.includes('..') || filePath.startsWith('/') || /^[a-zA-Z]:/.test(filePath) || filePath.includes('\\')) {
        errors.push(`Package file path "${filePath}" contains prohibited path traversal or host path patterns`);
      }
    }

    // Ensure entry file exists in package files
    if (manifest.entry) {
      const hasEntry = pkg.hasFile ? pkg.hasFile(manifest.entry) : Boolean(pkg.files && (pkg.files[manifest.entry] !== undefined || (pkg.files instanceof Map && pkg.files.has(manifest.entry))));
      if (!hasEntry) {
        errors.push(`Package is missing declared entry file "${manifest.entry}"`);
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Assert a package is valid, throwing a structured PackageError if not.
   * @param {Object} pkg
   */
  static assertValid(pkg) {
    const result = this.validatePackage(pkg);
    if (!result.valid) {
      throw new PackageError({
        code: 'EPACKAGE_INVALID',
        message: `Package validation failed: ${result.errors.join('; ')}`,
        appId: pkg?.manifest?.id || null
      });
    }
  }
}
