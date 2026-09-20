/**
 * OSEventEmitter
 * Pure, deterministic OS-wide event bus for AdityyaOS kernel and subsystems.
 * Completely decoupled from the DOM. Supports on, off, once, emit, listenerCount, and removeAllListeners.
 */

export const OSEvents = Object.freeze({
  // System Lifecycle Events
  SYSTEM_BOOTING: 'system:booting',
  SYSTEM_READY: 'system:ready',
  SYSTEM_RUNNING: 'system:running',
  SYSTEM_SHUTTING_DOWN: 'system:shutting_down',
  SYSTEM_STOPPED: 'system:stopped',
  SYSTEM_RESET: 'system:reset',

  // Process Events
  PROCESS_CREATED: 'process:created',
  PROCESS_STATE_CHANGED: 'process:state_changed',
  PROCESS_TERMINATED: 'process:terminated',
  PROCESS_SUSPENDED: 'process:suspended',
  PROCESS_RESUMED: 'process:resumed',

  // CPU / Scheduler Events
  CPU_ALGORITHM_CHANGED: 'cpu:algorithm_changed',
  CPU_SCHEDULED: 'cpu:scheduled',

  // Memory Events
  MEMORY_ALLOCATED: 'memory:allocated',
  MEMORY_FREED: 'memory:freed',

  // File System Events
  FILESYSTEM_MOUNTING: 'fs:mounting',
  FILESYSTEM_MOUNTED: 'fs:mounted',
  FILESYSTEM_UNMOUNTING: 'fs:unmounting',
  FILESYSTEM_UNMOUNTED: 'fs:unmounted',
  FILE_CREATED: 'fs:file_created',
  FILE_READ: 'fs:file_read',
  FILE_WRITTEN: 'fs:file_written',
  FILE_DELETED: 'fs:file_deleted',
  FILE_RENAMED: 'fs:file_renamed',
  FILE_OPENED: 'fs:file_opened',
  FILE_CLOSED: 'fs:file_closed',
  DIRECTORY_CREATED: 'fs:dir_created',
  DIRECTORY_DELETED: 'fs:dir_deleted',
  STORAGE_ALLOCATED: 'fs:storage_allocated',
  STORAGE_RELEASED: 'fs:storage_released',

  // Disk Events
  DISK_REQUEST_ADDED: 'disk:request_added',
  DISK_SCHEDULED: 'disk:scheduled',

  // Resource / Deadlock Events
  RESOURCE_REGISTERED: 'resource:registered',
  RESOURCE_ALLOCATED: 'resource:allocated',
  RESOURCE_RELEASED: 'resource:released',

  // Syscall Events
  SYSCALL_DISPATCHED: 'syscall:dispatched',
  SYSCALL_SUCCESS: 'syscall:success',
  SYSCALL_ERROR: 'syscall:error',

  // Virtual Hardware Events
  HARDWARE_INITIALIZING: 'hardware:initializing',
  HARDWARE_READY: 'hardware:ready',
  HARDWARE_ERROR: 'hardware:error',
  DEVICE_REGISTERED: 'hardware:device_registered',
  DEVICE_REMOVED: 'hardware:device_removed',
  DEVICE_READY: 'hardware:device_ready',
  DEVICE_BUSY: 'hardware:device_busy',
  DEVICE_ERROR: 'hardware:device_error',
  DEVICE_RESET: 'hardware:device_reset',
  HARDWARE_SHUTDOWN: 'hardware:shutdown',

  // Phase 16: Process / Memory / Storage Integration Events
  PROCESS_CPU_ASSIGNED: 'process:cpu_assigned',
  PROCESS_CPU_RELEASED: 'process:cpu_released',
  PROCESS_MEMORY_ALLOCATED: 'process:memory_allocated',
  PROCESS_MEMORY_RELEASED: 'process:memory_released',
  STORAGE_REQUEST_QUEUED: 'storage:request_queued',
  STORAGE_REQUEST_STARTED: 'storage:request_started',
  STORAGE_REQUEST_COMPLETED: 'storage:request_completed',
  STORAGE_REQUEST_FAILED: 'storage:request_failed',
  STORAGE_REQUEST_CANCELLED: 'storage:request_cancelled',

  // Phase 18: Terminal & Shell Events
  TERMINAL_OPENED: 'terminal:opened',
  TERMINAL_CLOSED: 'terminal:closed',
  TERMINAL_COMMAND: 'terminal:command',
  TERMINAL_COMMAND_COMPLETED: 'terminal:command:completed',
  TERMINAL_ERROR: 'terminal:error',
  TERMINAL_DIRECTORY_CHANGED: 'terminal:directory:changed',
  TERMINAL_CLEARED: 'terminal:cleared',

  // Phase 19 & 20: Application API & Runtime Events
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
  APP_ERROR: 'app:error',

  // Phase 25: Network Events
  NETWORK_INTERFACE_UP: 'network:interface_up',
  NETWORK_INTERFACE_DOWN: 'network:interface_down',
  NETWORK_PACKET_SENT: 'network:packet_sent',
  NETWORK_PACKET_RECEIVED: 'network:packet_received',
  NETWORK_PACKET_DROPPED: 'network:packet_dropped',
  NETWORK_SOCKET_CREATED: 'network:socket_created',
  NETWORK_SOCKET_STATE_CHANGED: 'network:socket_state_changed',
  NETWORK_SOCKET_CLOSED: 'network:socket_closed',

  // Phase 26: AI Events
  AI_REQUEST_STARTED: 'ai:request_started',
  AI_REQUEST_COMPLETED: 'ai:request_completed',
  AI_REQUEST_FAILED: 'ai:request_failed',
  AI_SESSION_CREATED: 'ai:session_created',
  AI_SESSION_CLOSED: 'ai:session_closed'
});

export class OSEventEmitter {
  constructor() {
    this.listeners = new Map();
  }

  /**
   * Register an event listener.
   * @param {string} event
   * @param {Function} handler
   */
  on(event, handler) {
    if (typeof handler !== 'function') {
      throw new TypeError('Event handler must be a function');
    }
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(handler);
    return () => this.off(event, handler);
  }

  /**
   * Register a one-time event listener.
   * @param {string} event
   * @param {Function} handler
   */
  once(event, handler) {
    if (typeof handler !== 'function') {
      throw new TypeError('Event handler must be a function');
    }
    const wrapper = (...args) => {
      this.off(event, wrapper);
      handler(...args);
    };
    return this.on(event, wrapper);
  }

  /**
   * Remove an event listener.
   * @param {string} event
   * @param {Function} handler
   */
  off(event, handler) {
    if (!this.listeners.has(event)) return;
    const set = this.listeners.get(event);
    set.delete(handler);
    if (set.size === 0) {
      this.listeners.delete(event);
    }
  }

  /**
   * Synchronously emit an event to all registered listeners.
   * @param {string} event
   * @param {*} payload
   */
  emit(event, payload) {
    if (!this.listeners.has(event)) return false;
    const handlers = Array.from(this.listeners.get(event));
    for (const handler of handlers) {
      try {
        handler(payload);
      } catch (err) {
        // Do not let listener errors crash the kernel
        console.error(`[OSEventEmitter] Error in listener for "${event}":`, err);
      }
    }
    return true;
  }

  /**
   * Get the number of listeners for an event.
   * @param {string} event
   * @returns {number}
   */
  listenerCount(event) {
    return this.listeners.has(event) ? this.listeners.get(event).size : 0;
  }

  /**
   * Remove all listeners, or all listeners for a specific event.
   * @param {string} [event]
   */
  removeAllListeners(event) {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }
}
