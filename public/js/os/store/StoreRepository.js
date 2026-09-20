/**
 * public/js/os/store/StoreRepository.js
 * Simulated repository abstraction for fetching application package bundles.
 */

import { StoreError } from './StoreErrors.js';

export class StoreRepository {
  /**
   * @param {Object} [options]
   * @param {import('./StoreCatalog.js').StoreCatalog} [options.catalog]
   */
  constructor(options = {}) {
    this.catalog = options.catalog || null;
  }

  /**
   * Fetch an AppPackage by appId and optional version.
   * @param {string} appId
   * @param {string|null} [version=null]
   * @returns {import('../packages/AppPackage.js').AppPackage}
   */
  fetchPackage(appId, version = null) {
    if (!this.catalog) {
      throw new StoreError({
        code: 'ESTORE_UNAVAILABLE',
        message: 'Store catalog repository is unavailable',
        appId
      });
    }

    const app = this.catalog.getApp(appId);
    if (!app || !app.package) {
      throw new StoreError({
        code: 'ESTORE_APP_NOT_FOUND',
        message: `Package for "${appId}" not found in repository`,
        appId
      });
    }

    if (version && app.version !== version) {
      throw new StoreError({
        code: 'ESTORE_VERSION_NOT_FOUND',
        message: `Version "${version}" for "${appId}" not found in repository`,
        appId
      });
    }

    return app.package;
  }

  /**
   * Get available versions for an application.
   * @param {string} appId
   * @returns {Array<string>}
   */
  getAvailableVersions(appId) {
    if (!this.catalog) return [];
    return this.catalog.getVersions(appId);
  }
}
