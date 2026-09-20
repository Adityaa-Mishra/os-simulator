/**
 * public/js/os/store/StoreEvents.js
 * Event constants for Adityya Store lifecycle and management.
 */

export const StoreEvents = Object.freeze({
  STORE_INITIALIZED: 'store:initialized',
  STORE_APP_INSTALLED: 'store:app:installed',
  STORE_APP_UNINSTALLED: 'store:app:uninstalled',
  STORE_INSTALL_FAILED: 'store:install:failed',
  STORE_CATALOG_UPDATED: 'store:catalog:updated'
});
