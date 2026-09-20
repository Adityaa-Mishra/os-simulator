/**
 * public/js/os/network/VirtualNetworkAdapter.js
 * Virtual Network Interface Card (NIC) hardware device for AdityyaOS.
 * Extends HardwareDevice to integrate cleanly with the Virtual Hardware subsystem.
 */

import { HardwareDevice } from '../hardware/HardwareDevice.js';
import { DeviceStatus } from '../hardware/HardwareState.js';

export class VirtualNetworkAdapter extends HardwareDevice {
  /**
   * @param {Object} [config={}]
   * @param {string} [config.id='net0']
   * @param {string} [config.name='Virtual Ethernet Adapter']
   * @param {string} [config.vendor='AdityyaOS Virtual Silicon']
   * @param {string} [config.model='VNet-Gigabit']
   * @param {string} [config.macAddress='02:00:00:00:00:01']
   * @param {number} [config.speedMbps=1000]
   */
  constructor(config = {}) {
    super({
      id: config.id || 'net0',
      type: 'network',
      name: config.name || 'Virtual Ethernet Adapter',
      vendor: config.vendor || 'AdityyaOS Virtual Silicon',
      model: config.model || 'VNet-Gigabit',
      enabled: config.enabled ?? true,
      properties: {
        macAddress: config.macAddress || '02:00:00:00:00:01',
        speedMbps: config.speedMbps || 1000,
        duplex: 'full',
        linkDetected: true,
        ...(config.properties || {})
      }
    });

    this.macAddress = this.properties.macAddress;
    this.speedMbps = this.properties.speedMbps;
    this.linkDetected = this.properties.linkDetected;
  }

  /**
   * Initialize the virtual adapter.
   * @returns {{ success: boolean, status: string, error?: string }}
   */
  initialize() {
    this.status = DeviceStatus.INITIALIZING;
    this.status = DeviceStatus.READY;
    return { success: true, status: this.status };
  }

  /**
   * Transmit frame through virtual wire.
   * @param {import('./Packet.js').Packet} packet
   * @returns {boolean}
   */
  transmit(packet) {
    if (this.status !== DeviceStatus.READY || !this.linkDetected) {
      return false;
    }
    return true;
  }

  /**
   * Set link state (plugged/unplugged).
   * @param {boolean} connected
   */
  setLink(connected) {
    this.linkDetected = Boolean(connected);
    this.properties.linkDetected = this.linkDetected;
  }
}
