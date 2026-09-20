/**
 * HardwareDevice
 * Common base class and abstraction for all virtual hardware devices in AdityyaOS.
 * Enforces predictable lifecycle (REGISTER -> INITIALIZE -> READY -> USE -> SHUTDOWN),
 * status transitions, and snapshot-safe state reporting.
 */

import { DeviceStatus } from './HardwareState.js';

export class HardwareDevice {
  /**
   * @param {Object} config
   * @param {string} config.id
   * @param {string} config.type
   * @param {string} [config.name]
   * @param {string} [config.vendor]
   * @param {string} [config.model]
   * @param {boolean} [config.enabled=true]
   * @param {Object} [config.properties={}]
   */
  constructor(config = {}) {
    this.id = config.id !== undefined ? String(config.id) : 'dev0';
    this.type = config.type || 'generic';
    this.name = config.name || 'Generic Virtual Device';
    this.vendor = config.vendor || 'AdityyaOS Generic';
    this.model = config.model || 'Model-0';
    this.status = DeviceStatus.OFFLINE;
    this.enabled = config.enabled ?? true;
    this.properties = { ...(config.properties || {}) };
    this.eventEmitter = null;
  }

  /**
   * Set reference to OS event emitter.
   * @param {import('../kernel/OSEventEmitter.js').OSEventEmitter} emitter
   */
  setEventEmitter(emitter) {
    this.eventEmitter = emitter;
  }

  /**
   * Emit an event through the OS event bus.
   * @param {string} event
   * @param {*} payload
   */
  emit(event, payload) {
    if (this.eventEmitter && typeof this.eventEmitter.emit === 'function') {
      this.eventEmitter.emit(event, payload);
    }
  }

  /**
   * Initialize the device.
   * Transitions status to INITIALIZING -> READY (or ERROR on failure).
   * @returns {{ success: boolean, status: string, error?: string }}
   */
  initialize() {
    this.status = DeviceStatus.INITIALIZING;
    this.status = DeviceStatus.READY;
    return { success: true, status: this.status };
  }

  /**
   * Shutdown the device.
   * Transitions status to OFFLINE.
   * @returns {{ success: boolean, status: string }}
   */
  shutdown() {
    this.status = DeviceStatus.OFFLINE;
    return { success: true, status: this.status };
  }

  /**
   * Reset the device to its pristine ready state.
   * @param {Object} [options={}]
   * @returns {{ success: boolean, status: string }}
   */
  reset(options = {}) {
    this.status = DeviceStatus.READY;
    return { success: true, status: this.status };
  }

  /**
   * Get current device status string.
   * @returns {string}
   */
  getStatus() {
    return this.status;
  }

  /**
   * Return a safe, serializable deep copy of the device state.
   * Mutating the returned object will never mutate the internal device state.
   * @returns {Object}
   */
  getState() {
    return JSON.parse(JSON.stringify({
      id: this.id,
      type: this.type,
      name: this.name,
      vendor: this.vendor,
      model: this.model,
      status: this.status,
      enabled: this.enabled,
      properties: this.properties
    }));
  }

  /**
   * JSON serialization support.
   * @returns {Object}
   */
  toJSON() {
    return this.getState();
  }
}
