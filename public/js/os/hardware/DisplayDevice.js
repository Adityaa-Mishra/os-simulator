/**
 * DisplayDevice
 * Simulated display adapter for AdityyaOS.
 * Exposes resolution, refresh rate, and display metrics.
 * Does NOT create a canvas/graphics engine or replace the DOM desktop renderer.
 */

import { HardwareDevice } from './HardwareDevice.js';
import { DeviceType, DeviceStatus } from './HardwareState.js';

export class DisplayDevice extends HardwareDevice {
  /**
   * @param {Object} [config={}]
   * @param {number} [config.width=1920]
   * @param {number} [config.height=1080]
   * @param {number} [config.refreshRate=60]
   * @param {number} [config.colorDepth=24]
   */
  constructor(config = {}) {
    super({
      id: config.id || 'display0',
      type: DeviceType.DISPLAY,
      name: config.name || 'Virtual Framebuffer Display',
      vendor: config.vendor || 'AdityyaOS Graphics Display',
      model: config.model || 'VDisplay-1080p',
      enabled: config.enabled ?? true,
      properties: config.properties
    });

    this.defaultWidth = typeof config.width === 'number' && config.width > 0 ? Math.floor(config.width) : 1920;
    this.defaultHeight = typeof config.height === 'number' && config.height > 0 ? Math.floor(config.height) : 1080;
    this.refreshRate = typeof config.refreshRate === 'number' && config.refreshRate > 0 ? Math.floor(config.refreshRate) : 60;
    this.colorDepth = typeof config.colorDepth === 'number' && config.colorDepth > 0 ? Math.floor(config.colorDepth) : 24;

    this.width = this.defaultWidth;
    this.height = this.defaultHeight;
  }

  /**
   * Initialize display device.
   * @returns {{ success: boolean, status: string }}
   */
  initialize() {
    this.status = DeviceStatus.INITIALIZING;
    this.width = this.defaultWidth;
    this.height = this.defaultHeight;
    this.status = DeviceStatus.READY;
    return { success: true, status: this.status };
  }

  /**
   * Shutdown display device.
   * @returns {{ success: boolean, status: string }}
   */
  shutdown() {
    this.status = DeviceStatus.OFFLINE;
    return { success: true, status: this.status };
  }

  /**
   * Reset display device.
   * @param {Object} [options={}]
   * @returns {{ success: boolean, status: string }}
   */
  reset(options = {}) {
    this.width = this.defaultWidth;
    this.height = this.defaultHeight;
    this.status = DeviceStatus.READY;
    return { success: true, status: this.status };
  }

  /**
   * Set virtual display resolution.
   * @param {number} width
   * @param {number} height
   * @returns {{ success: boolean, data?: Object, error?: string }}
   */
  setResolution(width, height) {
    if (typeof width !== 'number' || isNaN(width) || width <= 0 || !Number.isInteger(width)) {
      return { success: false, error: 'Display width must be a positive integer' };
    }

    if (typeof height !== 'number' || isNaN(height) || height <= 0 || !Number.isInteger(height)) {
      return { success: false, error: 'Display height must be a positive integer' };
    }

    this.width = width;
    this.height = height;

    return {
      success: true,
      data: {
        width: this.width,
        height: this.height,
        refreshRate: this.refreshRate,
        colorDepth: this.colorDepth
      }
    };
  }

  /**
   * Get current resolution and display properties.
   * @returns {{ width: number, height: number, refreshRate: number, colorDepth: number }}
   */
  getResolution() {
    return {
      width: this.width,
      height: this.height,
      refreshRate: this.refreshRate,
      colorDepth: this.colorDepth
    };
  }

  /**
   * Return a safe, serializable deep snapshot of Display device state.
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
      width: this.width,
      height: this.height,
      refreshRate: this.refreshRate,
      colorDepth: this.colorDepth
    }));
  }
}
