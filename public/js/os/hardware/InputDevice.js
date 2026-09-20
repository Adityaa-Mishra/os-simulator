/**
 * InputDevice
 * Simulated HID controller for AdityyaOS.
 * Normalizes keyboard and mouse input events for the OS without attaching global browser listeners.
 * Explicit API: sendInput() and normalization functions only.
 */

import { HardwareDevice } from './HardwareDevice.js';
import { DeviceType, DeviceStatus } from './HardwareState.js';

export class InputDevice extends HardwareDevice {
  /**
   * @param {Object} [config={}]
   * @param {number} [config.maxHistory=50]
   */
  constructor(config = {}) {
    super({
      id: config.id || 'input0',
      type: DeviceType.INPUT,
      name: config.name || 'Virtual HID Controller',
      vendor: config.vendor || 'AdityyaOS Generic HID',
      model: config.model || 'VHID-Combo',
      enabled: config.enabled ?? true,
      properties: config.properties
    });

    this.maxHistory = typeof config.maxHistory === 'number' && config.maxHistory > 0
      ? config.maxHistory
      : 50;
    this.supportedInputs = ['keyboard', 'mouse'];
    this.recentEvents = [];
  }

  /**
   * Initialize input device.
   * @returns {{ success: boolean, status: string }}
   */
  initialize() {
    this.status = DeviceStatus.INITIALIZING;
    this.recentEvents = [];
    this.status = DeviceStatus.READY;
    return { success: true, status: this.status };
  }

  /**
   * Shutdown input device.
   * @returns {{ success: boolean, status: string }}
   */
  shutdown() {
    this.status = DeviceStatus.OFFLINE;
    return { success: true, status: this.status };
  }

  /**
   * Reset input device.
   * @param {Object} [options={}]
   * @returns {{ success: boolean, status: string }}
   */
  reset(options = {}) {
    this.recentEvents = [];
    this.status = DeviceStatus.READY;
    return { success: true, status: this.status };
  }

  /**
   * Normalize a keyboard event into standard OS event format.
   * @param {Object} raw
   * @returns {Object}
   */
  normalizeKeyboardEvent(raw = {}) {
    return {
      type: 'keyboard',
      event: String(raw.event || raw.type || 'keydown'),
      key: String(raw.key || ''),
      code: String(raw.code || ''),
      altKey: Boolean(raw.altKey),
      ctrlKey: Boolean(raw.ctrlKey),
      shiftKey: Boolean(raw.shiftKey),
      metaKey: Boolean(raw.metaKey),
      timestamp: typeof raw.timestamp === 'number' ? raw.timestamp : Date.now()
    };
  }

  /**
   * Normalize a mouse event into standard OS event format.
   * @param {Object} raw
   * @returns {Object}
   */
  normalizeMouseEvent(raw = {}) {
    return {
      type: 'mouse',
      event: String(raw.event || raw.type || 'click'),
      x: typeof raw.x === 'number' && !isNaN(raw.x) ? raw.x : 0,
      y: typeof raw.y === 'number' && !isNaN(raw.y) ? raw.y : 0,
      button: typeof raw.button === 'number' && !isNaN(raw.button) ? raw.button : 0,
      altKey: Boolean(raw.altKey),
      ctrlKey: Boolean(raw.ctrlKey),
      shiftKey: Boolean(raw.shiftKey),
      timestamp: typeof raw.timestamp === 'number' ? raw.timestamp : Date.now()
    };
  }

  /**
   * Send a simulated input event to the input controller.
   * @param {Object} rawEvent
   * @returns {{ success: boolean, data?: Object, error?: string }}
   */
  sendInput(rawEvent) {
    if (this.status !== DeviceStatus.READY && this.status !== DeviceStatus.BUSY) {
      return { success: false, error: `Input device is not ready (current status: ${this.status})` };
    }

    if (!rawEvent || typeof rawEvent !== 'object') {
      return { success: false, error: 'Input event must be an object' };
    }

    const inputType = String(rawEvent.type || rawEvent.inputType || '').toLowerCase();
    let normalized;

    if (inputType === 'keyboard' || rawEvent.key !== undefined || rawEvent.code !== undefined) {
      normalized = this.normalizeKeyboardEvent(rawEvent);
    } else if (inputType === 'mouse' || rawEvent.x !== undefined || rawEvent.y !== undefined || rawEvent.button !== undefined) {
      normalized = this.normalizeMouseEvent(rawEvent);
    } else {
      return { success: false, error: 'Unsupported input event: must be keyboard or mouse' };
    }

    this.recentEvents.push(normalized);
    if (this.recentEvents.length > this.maxHistory) {
      this.recentEvents.shift();
    }

    return { success: true, data: normalized };
  }

  /**
   * Get safe copy of recent events.
   * @returns {Array<Object>}
   */
  getRecentEvents() {
    return JSON.parse(JSON.stringify(this.recentEvents));
  }

  /**
   * Return a safe, serializable deep snapshot of Input device state.
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
      supportedInputs: [...this.supportedInputs],
      eventCount: this.recentEvents.length,
      recentEvents: this.recentEvents
    }));
  }
}
