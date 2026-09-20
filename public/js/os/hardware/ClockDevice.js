/**
 * ClockDevice
 * Simulated Real-Time Clock (RTC) and hardware APIC timer for AdityyaOS.
 * Provides simulated clock ticks and timing signals.
 * Does NOT compete with Kernel uptime; Kernel remains authoritative for OS lifecycle uptime.
 */

import { HardwareDevice } from './HardwareDevice.js';
import { DeviceType, DeviceStatus } from './HardwareState.js';

export class ClockDevice extends HardwareDevice {
  /**
   * @param {Object} [config={}]
   * @param {number} [config.frequencyHz=1000]
   */
  constructor(config = {}) {
    super({
      id: config.id || 'clock0',
      type: DeviceType.CLOCK,
      name: config.name || 'Real-Time Clock & APIC Timer',
      vendor: config.vendor || 'AdityyaOS System Timer',
      model: config.model || 'RTC-Sim',
      enabled: config.enabled ?? true,
      properties: config.properties
    });

    this.frequencyHz = typeof config.frequencyHz === 'number' && config.frequencyHz > 0
      ? config.frequencyHz
      : 1000;
    this.tickCount = 0;
  }

  /**
   * Initialize clock device.
   * @returns {{ success: boolean, status: string }}
   */
  initialize() {
    this.status = DeviceStatus.INITIALIZING;
    this.tickCount = 0;
    this.status = DeviceStatus.READY;
    return { success: true, status: this.status };
  }

  /**
   * Shutdown clock device.
   * @returns {{ success: boolean, status: string }}
   */
  shutdown() {
    this.status = DeviceStatus.OFFLINE;
    return { success: true, status: this.status };
  }

  /**
   * Reset clock ticks.
   * @param {Object} [options={}]
   * @returns {{ success: boolean, status: string }}
   */
  reset(options = {}) {
    this.tickCount = 0;
    this.status = DeviceStatus.READY;
    return { success: true, status: this.status };
  }

  /**
   * Get current timestamp.
   * @returns {number}
   */
  getTime() {
    return Date.now();
  }

  /**
   * Get current simulated tick count.
   * @returns {number}
   */
  getTicks() {
    return this.tickCount;
  }

  /**
   * Increment simulated hardware clock tick counter.
   * @param {number} [count=1]
   * @returns {{ success: boolean, data: { ticks: number } }}
   */
  tick(count = 1) {
    const increment = typeof count === 'number' && count > 0 ? Math.floor(count) : 1;
    this.tickCount += increment;
    return {
      success: true,
      data: { ticks: this.tickCount }
    };
  }

  /**
   * Return a safe, serializable deep snapshot of Clock device state.
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
      frequencyHz: this.frequencyHz,
      tickCount: this.tickCount,
      currentTime: this.getTime()
    }));
  }
}
