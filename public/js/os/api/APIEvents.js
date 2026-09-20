/**
 * public/js/os/api/APIEvents.js
 * Controlled application-facing event constants for AdityyaOS.
 */

export const APIEvents = Object.freeze({
  API_READY: 'api:ready',
  WINDOW_RESIZED: 'window:resized',
  WINDOW_FOCUSED: 'window:focused',
  WINDOW_BLURRED: 'window:blurred',
  APP_SUSPENDED: 'app:suspended',
  APP_RESUMED: 'app:resumed',
  APP_TERMINATING: 'app:terminating'
});
