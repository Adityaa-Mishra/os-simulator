/**
 * WindowEvents
 * Standardized event names emitted during window lifecycle, interaction, and state changes.
 */

export const WindowEvents = Object.freeze({
  WINDOW_CREATED: 'window:created',
  WINDOW_OPENED: 'window:opened',
  WINDOW_FOCUSED: 'window:focused',
  WINDOW_BLURRED: 'window:blurred',
  WINDOW_MINIMIZED: 'window:minimized',
  WINDOW_RESTORED: 'window:restored',
  WINDOW_MAXIMIZED: 'window:maximized',
  WINDOW_MOVED: 'window:moved',
  WINDOW_RESIZED: 'window:resized',
  WINDOW_CLOSED: 'window:closed',
  ACTIVE_WINDOW_CHANGED: 'window:active_changed'
});
