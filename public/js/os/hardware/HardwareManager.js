/**
 * HardwareManager
 * Central coordinator and single owner of the Virtual Hardware device registry in AdityyaOS.
 * Coordinates device lifecycle, hardware bus dispatch, diagnostic reporting, and transactional initialization.
 */

import { HardwareBus } from './HardwareBus.js';
import { CPUDevice } from './CPUDevice.js';
import { MemoryDevice } from './MemoryDevice.js';
import { StorageDevice } from './StorageDevice.js';
import { InputDevice } from './InputDevice.js';
import { DisplayDevice } from './DisplayDevice.js';
import { ClockDevice } from './ClockDevice.js';
import { DEFAULT_HARDWARE_PROFILE, DeviceStatus } from './HardwareState.js';
import { OSEvents } from '../kernel/OSEventEmitter.js';

export class HardwareManager {
  /**
   * @param {import('../kernel/Kernel.js').Kernel} kernel
   * @param {Object} [config={}]
   */
  constructor(kernel, config = {}) {
    this.kernel = kernel;
    this.config = config;
    this.devices = new Map();
    this.bus = new HardwareBus(this);
    this.isInitialized = false;

    // Register standard hardware devices according to configuration/profile
    this.registerDefaultDevices(config);
  }

  /**
   * Register standard hardware devices on initial construction.
   * Executed exactly once per Kernel/HardwareManager lifetime.
   * @param {Object} [config={}]
   */
  registerDefaultDevices(config = {}) {
    const profile = {
      cpu: { ...DEFAULT_HARDWARE_PROFILE.cpu, ...config.cpu },
      memory: { ...DEFAULT_HARDWARE_PROFILE.memory, ...config.memory },
      storage: { ...DEFAULT_HARDWARE_PROFILE.storage, ...config.storage },
      display: { ...DEFAULT_HARDWARE_PROFILE.display, ...config.display },
      input: { ...DEFAULT_HARDWARE_PROFILE.input, ...config.input },
      clock: { ...DEFAULT_HARDWARE_PROFILE.clock, ...config.clock }
    };

    this.registerDevice(new ClockDevice(profile.clock));
    this.registerDevice(new CPUDevice(profile.cpu));
    this.registerDevice(new MemoryDevice(profile.memory));
    this.registerDevice(new StorageDevice(profile.storage));
    this.registerDevice(new DisplayDevice(profile.display));
    this.registerDevice(new InputDevice(profile.input));
  }

  /**
   * Register a hardware device.
   * @param {import('./HardwareDevice.js').HardwareDevice} device
   * @returns {{ success: boolean, error?: string }}
   */
  registerDevice(device) {
    if (!device || typeof device.id !== 'string' || !device.id.trim()) {
      return { success: false, error: 'Device must have a valid non-empty id' };
    }

    if (this.devices.has(device.id)) {
      return { success: false, error: `Device with id "${device.id}" is already registered` };
    }

    if (this.kernel && this.kernel.events) {
      device.setEventEmitter(this.kernel.events);
    }

    this.devices.set(device.id, device);

    if (this.kernel && this.kernel.events) {
      this.kernel.events.emit(OSEvents.DEVICE_REGISTERED, {
        id: device.id,
        type: device.type,
        name: device.name
      });
    }

    return { success: true };
  }

  /**
   * Unregister a hardware device.
   * @param {string} deviceId
   * @returns {{ success: boolean, error?: string }}
   */
  unregisterDevice(deviceId) {
    const device = this.devices.get(deviceId);
    if (!device) {
      return { success: false, error: `Device "${deviceId}" not found` };
    }

    device.shutdown();
    this.devices.delete(deviceId);

    if (this.kernel && this.kernel.events) {
      this.kernel.events.emit(OSEvents.DEVICE_REMOVED, { id: deviceId });
    }

    return { success: true };
  }

  /**
   * Get device instance by ID.
   * @param {string} deviceId
   * @returns {import('./HardwareDevice.js').HardwareDevice|null}
   */
  getDevice(deviceId) {
    return this.devices.get(deviceId) || null;
  }

  /**
   * Get all registered devices, optionally filtered.
   * @param {Object|Function} [filter]
   * @returns {Array<import('./HardwareDevice.js').HardwareDevice>}
   */
  getDevices(filter) {
    let list = Array.from(this.devices.values());
    if (typeof filter === 'function') {
      list = list.filter(filter);
    } else if (filter && typeof filter === 'object') {
      if (filter.type) list = list.filter(d => d.type === filter.type);
      if (filter.status) list = list.filter(d => d.status === filter.status);
    }
    return list;
  }

  /**
   * Initialize all registered hardware devices transactionally.
   * If any device fails to initialize:
   *  - emits HARDWARE_ERROR and DEVICE_ERROR
   *  - rolls back and cleanly shuts down already-initialized devices
   *  - leaves the hardware in a clean uninitialized/stopped state
   * @returns {{ success: boolean, error?: string }}
   */
  initialize() {
    if (this.kernel && this.kernel.events) {
      this.kernel.events.emit(OSEvents.HARDWARE_INITIALIZING, { timestamp: Date.now() });
    }

    const initializedDevices = [];

    for (const device of this.devices.values()) {
      try {
        const res = device.initialize();
        if (!res || res.success === false) {
          const errorMsg = res?.error || `Device "${device.id}" failed to initialize`;
          this.handleInitializationFailure(device, errorMsg, initializedDevices);
          return { success: false, error: errorMsg };
        }
        initializedDevices.push(device);
        if (this.kernel && this.kernel.events) {
          this.kernel.events.emit(OSEvents.DEVICE_READY, { id: device.id, type: device.type });
        }
      } catch (err) {
        const errorMsg = `Exception initializing device "${device.id}": ${err.message}`;
        this.handleInitializationFailure(device, errorMsg, initializedDevices);
        return { success: false, error: errorMsg };
      }
    }

    this.isInitialized = true;

    if (this.kernel && this.kernel.events) {
      this.kernel.events.emit(OSEvents.HARDWARE_READY, {
        timestamp: Date.now(),
        deviceCount: this.devices.size
      });
    }

    return { success: true };
  }

  /**
   * Rollback helper when hardware initialization fails.
   * @private
   */
  handleInitializationFailure(failingDevice, errorMsg, initializedDevices) {
    if (failingDevice) {
      failingDevice.status = DeviceStatus.ERROR;
    }

    if (this.kernel && this.kernel.events) {
      this.kernel.events.emit(OSEvents.DEVICE_ERROR, {
        id: failingDevice?.id,
        error: errorMsg
      });
      this.kernel.events.emit(OSEvents.HARDWARE_ERROR, {
        failingDevice: failingDevice?.id,
        error: errorMsg
      });
    }

    // Cleanly shut down all devices that were initialized before the failure
    for (const d of initializedDevices.reverse()) {
      try {
        d.shutdown();
      } catch (e) {
        // Suppress rollback errors
      }
    }

    this.isInitialized = false;
  }

  /**
   * Shutdown all hardware devices.
   * @returns {{ success: boolean }}
   */
  shutdown() {
    for (const device of Array.from(this.devices.values()).reverse()) {
      try {
        device.shutdown();
      } catch (err) {
        console.error(`[HardwareManager] Error shutting down device ${device.id}:`, err);
      }
    }

    this.isInitialized = false;

    if (this.kernel && this.kernel.events) {
      this.kernel.events.emit(OSEvents.HARDWARE_SHUTDOWN, { timestamp: Date.now() });
    }

    return { success: true };
  }

  /**
   * Reset all hardware devices.
   * Preserves persistent storage contents unless explicitly formatted or cleared.
   * @param {Object} [options={}]
   * @returns {{ success: boolean }}
   */
  reset(options = {}) {
    for (const device of this.devices.values()) {
      try {
        device.reset(options);
        if (this.kernel && this.kernel.events) {
          this.kernel.events.emit(OSEvents.DEVICE_RESET, { id: device.id, type: device.type });
        }
      } catch (err) {
        console.error(`[HardwareManager] Error resetting device ${device.id}:`, err);
      }
    }

    return { success: true };
  }

  /**
   * Return a safe, serializable deep snapshot of all virtual hardware.
   * Mutating the returned object has zero effect on internal hardware state.
   * @returns {Object}
   */
  getHardwareState() {
    const devicesSnapshot = {};
    for (const [id, device] of this.devices.entries()) {
      devicesSnapshot[id] = device.getState();
    }

    return JSON.parse(JSON.stringify({
      initialized: this.isInitialized,
      deviceCount: this.devices.size,
      devices: devicesSnapshot
    }));
  }

  /**
   * Return a safe, serializable deep snapshot of a single device.
   * @param {string} deviceId
   * @returns {Object|null}
   */
  getDeviceInfo(deviceId) {
    const device = this.devices.get(deviceId);
    return device ? device.getState() : null;
  }

  /**
   * Clean, read-oriented diagnostic API.
   * Safely captures current hardware state across major subsystems.
   * @returns {Object}
   */
  getDiagnostics() {
    return {
      cpu: this.getDeviceInfo('cpu0'),
      memory: this.getDeviceInfo('ram0'),
      storage: this.getDeviceInfo('disk0'),
      display: this.getDeviceInfo('display0'),
      input: this.getDeviceInfo('input0'),
      clock: this.getDeviceInfo('clock0')
    };
  }

  /**
   * Dispatch a request through the hardware bus.
   * @param {string} deviceId
   * @param {string} operation
   * @param {*} [payload={}]
   * @returns {{ success: boolean, data?: any, error?: string }}
   */
  request(deviceId, operation, payload = {}) {
    return this.bus.request(deviceId, operation, payload);
  }
}
