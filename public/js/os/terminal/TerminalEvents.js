/**
 * public/js/os/terminal/TerminalEvents.js
 * Standard OS event constants for the AdityyaOS Terminal & Shell subsystem.
 */

export const TerminalEvents = Object.freeze({
  TERMINAL_OPENED: 'terminal:opened',
  TERMINAL_CLOSED: 'terminal:closed',
  TERMINAL_COMMAND: 'terminal:command',
  TERMINAL_COMMAND_COMPLETED: 'terminal:command:completed',
  TERMINAL_ERROR: 'terminal:error',
  TERMINAL_DIRECTORY_CHANGED: 'terminal:directory:changed',
  TERMINAL_CLEARED: 'terminal:cleared'
});
