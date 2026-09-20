/**
 * public/js/os/store/StoreService.js
 * Central coordinator for Adityya Store application repository operations.
 * Orchestrates catalog search, package retrieval, validation, and installation
 * through PackageRegistry and ApplicationLoader without launching applications.
 */

import { StoreCatalog } from './StoreCatalog.js';
import { StoreRepository } from './StoreRepository.js';
import { StoreError } from './StoreErrors.js';
import { StoreEvents } from './StoreEvents.js';

export class StoreService {
  /**
   * @param {Object} options
   * @param {import('../packages/PackageRegistry.js').PackageRegistry} options.packageRegistry
   * @param {StoreCatalog} [options.catalog]
   * @param {StoreRepository} [options.repository]
   * @param {import('../kernel/OSEventEmitter.js').OSEventEmitter} [options.events]
   */
  constructor({
    packageRegistry,
    catalog = null,
    repository = null,
    events = null
  }) {
    if (!packageRegistry) {
      throw new TypeError('StoreService requires a PackageRegistry instance');
    }

    this.packageRegistry = packageRegistry;
    this.catalog = catalog || new StoreCatalog();
    this.repository = repository || new StoreRepository({ catalog: this.catalog });
    this.events = events;
  }

  /**
   * Check if an application is installed.
   * @param {string} appId
   * @returns {boolean}
   */
  isInstalled(appId) {
    return Boolean(this.packageRegistry.has(appId));
  }

  /**
   * List catalog applications with installation status.
   * @param {string|null} [category=null]
   * @returns {Array<Object>}
   */
  list(category = null) {
    return this.catalog.list(category).map(app => ({
      ...app.getState(),
      isInstalled: this.isInstalled(app.id)
    }));
  }

  /**
   * Search catalog applications with installation status.
   * @param {string} query
   * @returns {Array<Object>}
   */
  search(query) {
    return this.catalog.search(query).map(app => ({
      ...app.getState(),
      isInstalled: this.isInstalled(app.id)
    }));
  }

  /**
   * Get an application from the store with installation status.
   * @param {string} appId
   * @returns {Object|null}
   */
  get(appId) {
    const app = this.catalog.getApp(appId);
    if (!app) return null;
    return {
      ...app.getState(),
      isInstalled: this.isInstalled(appId)
    };
  }

  /**
   * Get available versions for an application.
   * @param {string} appId
   * @returns {Array<string>}
   */
  getVersions(appId) {
    return this.catalog.getVersions(appId);
  }

  /**
   * Install an application package from the Store.
   * Validates and registers package into PackageRegistry and ApplicationLoader.
   * DOES NOT automatically launch the application.
   * @param {string} appId
   * @param {Object} [options={}]
   * @returns {{ appId: string, version: string, installedAt: number, isInstalled: boolean }}
   */
  install(appId, options = {}) {
    const app = this.catalog.getApp(appId);
    if (!app) {
      throw new StoreError({
        code: 'ESTORE_APP_NOT_FOUND',
        message: `Application "${appId}" not found in store catalog`,
        appId
      });
    }

    if (this.isInstalled(appId)) {
      throw new StoreError({
        code: 'ESTORE_ALREADY_INSTALLED',
        message: `Application "${appId}" is already installed`,
        appId
      });
    }

    try {
      const record = this.packageRegistry.install(app.package, app.trustedEntry);

      if (this.events) {
        this.events.emit(StoreEvents.STORE_APP_INSTALLED, {
          appId,
          version: app.version
        });
      }

      return {
        appId,
        version: app.version,
        installedAt: record.installedAt,
        isInstalled: true
      };
    } catch (err) {
      if (this.events) {
        this.events.emit(StoreEvents.STORE_INSTALL_FAILED, {
          appId,
          error: err.message
        });
      }

      throw new StoreError({
        code: 'ESTORE_INSTALL_FAILED',
        message: `Failed to install "${appId}": ${err.message}`,
        appId,
        cause: err
      });
    }
  }

  /**
   * Uninstall an application from the Store.
   * @param {string} appId
   * @param {Object} [options={ force: false }]
   * @returns {boolean}
   */
  uninstall(appId, options = { force: false }) {
    if (!this.isInstalled(appId)) {
      throw new StoreError({
        code: 'ESTORE_APP_NOT_FOUND',
        message: `Application "${appId}" is not installed`,
        appId
      });
    }

    const uninstalled = this.packageRegistry.uninstall(appId, options);

    if (uninstalled && this.events) {
      this.events.emit(StoreEvents.STORE_APP_UNINSTALLED, { appId });
    }

    return uninstalled;
  }

  /**
   * Get safe snapshot of store service state.
   * @returns {Object}
   */
  getState() {
    return {
      catalogCount: this.catalog.getState().count,
      installedCount: this.packageRegistry.list().length,
      apps: this.list()
    };
  }

  /**
   * JSON serialization support.
   */
  toJSON() {
    return this.getState();
  }
}
