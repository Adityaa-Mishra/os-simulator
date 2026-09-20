/**
 * public/js/os/runtime/RuntimeEvents.js
 * Application Runtime lifecycle and management event constants.
 */

export const RuntimeEvents = Object.freeze({
  APP_REGISTERED: 'app:registered',
  APP_UNREGISTERED: 'app:unregistered',
  APP_LOADED: 'app:loaded',
  APP_LAUNCHING: 'app:launching',
  APP_STARTED: 'app:started',
  APP_SUSPENDED: 'app:suspended',
  APP_RESUMED: 'app:resumed',
  APP_TERMINATING: 'app:terminating',
  APP_TERMINATED: 'app:terminated',
  APP_FAILED: 'app:failed',
  APP_ERROR: 'app:error'
});
