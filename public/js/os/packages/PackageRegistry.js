/**
 * public/js/os/packages/PackageRegistry.js
 * Central registry for installed AdityyaOS packages.
 * Coordinates package installation, uninstallation, rollback safety,
 * and registration of trusted runtime definitions into ApplicationLoader without launching.
 */

import { PackageValidator } from './PackageValidator.js';
import { PackageError } from './PackageErrors.js';

export class PackageRegistry {
  /**
   * @param {Object} [options]
   * @param {import('../runtime/ApplicationLoader.js').ApplicationLoader} [options.applicationLoader]
   * @param {import('../runtime/ApplicationRuntime.js').ApplicationRuntime} [options.applicationRuntime]
   */
  constructor(options = {}) {
    this.applicationLoader = options.applicationLoader || null;
    this.applicationRuntime = options.applicationRuntime || null;
    this._packages = new Map(); // appId -> { package: AppPackage, installedAt: number, version: string }
  }

  /**
   * Install an application package into the registry.
   * Transactional: If registration fails, changes are completely rolled back.
   * DOES NOT automatically launch the application.
   * @param {import('./AppPackage.js').AppPackage} pkg
   * @param {Function|null} [trustedEntryFn=null] - Optional trusted runtime entry function
   * @returns {{ appId: string, version: string, installedAt: number }}
   */
  install(pkg, trustedEntryFn = null) {
    PackageValidator.assertValid(pkg);

    const appId = pkg.manifest.id;
    if (this._packages.has(appId)) {
      throw new PackageError({
        code: 'EALREADY_INSTALLED',
        message: `Package "${appId}" is already installed`,
        appId
      });
    }

    const installedAt = Date.now();
    const record = {
      package: pkg,
      installedAt,
      version: pkg.manifest.version
    };

    // 1. Stage in PackageRegistry
    this._packages.set(appId, record);

    // 2. Register trusted definition in ApplicationLoader if provided
    if (this.applicationLoader && typeof trustedEntryFn === 'function') {
      try {
        const def = {
          id: appId,
          name: pkg.manifest.name,
          version: pkg.manifest.version,
          description: pkg.manifest.description,
          entry: trustedEntryFn,
          window: pkg.manifest.window ? { ...pkg.manifest.window } : null,
          permissions: [...pkg.manifest.permissions],
          memoryRequired: pkg.manifest.memoryRequired
        };
        this.applicationLoader.register(def);
      } catch (err) {
        // Rollback package registry state on failure
        this._packages.delete(appId);
        throw new PackageError({
          code: 'ETRANSACTION_FAILED',
          message: `Package installation failed during runtime registration: ${err.message}`,
          appId,
          cause: err
        });
      }
    }

    return {
      appId,
      version: pkg.manifest.version,
      installedAt
    };
  }

  /**
   * Uninstall an application package.
   * Safely terminates any active instances before removing package and loader registrations.
   * @param {string} appId
   * @param {Object} [options={ force: false }]
   * @returns {boolean}
   */
  uninstall(appId, options = { force: false }) {
    if (!this.has(appId)) {
      throw new PackageError({
        code: 'ENOT_INSTALLED',
        message: `Cannot uninstall: package "${appId}" is not installed`,
        appId
      });
    }

    // 1. Terminate any running instances of this application
    if (this.applicationRuntime) {
      const activeInstances = this.applicationRuntime.getInstancesByAppId(appId).filter(inst =>
        inst.state !== 'TERMINATED' && inst.state !== 'FAILED'
      );
      for (const inst of activeInstances) {
        this.applicationRuntime.terminate(inst.instanceId, 0);
      }
    }

    // 2. Unregister from ApplicationLoader
    if (this.applicationLoader) {
      this.applicationLoader.unregister(appId);
    }

    // 3. Remove from PackageRegistry
    return this._packages.delete(appId);
  }

  /**
   * Check if a package is installed.
   * @param {string} appId
   * @returns {boolean}
   */
  has(appId) {
    return this._packages.has(appId);
  }

  /**
   * Get an installed package record snapshot.
   * @param {string} appId
   * @returns {{ package: Object, installedAt: number, version: string }|null}
   */
  get(appId) {
    const record = this._packages.get(appId);
    if (!record) return null;
    return {
      package: record.package.getState(),
      installedAt: record.installedAt,
      version: record.version
    };
  }

  /**
   * List all installed packages.
   * @returns {Array<{ id: string, name: string, version: string, description: string, permissions: string[], installedAt: number }>}
   */
  list() {
    return Array.from(this._packages.values()).map(record => ({
      id: record.package.manifest.id,
      name: record.package.manifest.name,
      version: record.package.manifest.version,
      description: record.package.manifest.description,
      permissions: [...record.package.manifest.permissions],
      installedAt: record.installedAt
    }));
  }

  /**
   * Get safe snapshot of registry state.
   * @returns {Object}
   */
  getState() {
    return {
      installedCount: this._packages.size,
      packages: this.list()
    };
  }

  /**
   * JSON serialization support.
   */
  toJSON() {
    return this.getState();
  }
}
