/**
 * StorageDevice
 * Simulated persistent storage drive for AdityyaOS.
 * Storage contents persist across normal shutdown -> boot cycles.
 * Content is only erased on explicit reset({ clearStorage: true }) or format.
 */

import { HardwareDevice } from './HardwareDevice.js';
import { DeviceType, DeviceStatus } from './HardwareState.js';

export class StorageDevice extends HardwareDevice {
  /**
   * @param {Object} [config={}]
   * @param {number} [config.capacityBytes=102400]
   * @param {number} [config.sectorSize=512]
   * @param {number} [config.totalCylinders=200]
   */
  constructor(config = {}) {
    super({
      id: config.id || 'disk0',
      type: DeviceType.STORAGE,
      name: config.name || 'Virtual Primary Drive',
      vendor: config.vendor || 'AdityyaOS Storage Systems',
      model: config.model || 'NVMe-VDisk',
      enabled: config.enabled ?? true,
      properties: config.properties
    });

    this.capacityBytes = typeof config.capacityBytes === 'number' && config.capacityBytes > 0
      ? Math.floor(config.capacityBytes)
      : 524288; // 512 KB
    this.sectorSize = typeof config.sectorSize === 'number' && config.sectorSize > 0
      ? Math.floor(config.sectorSize)
      : 512;
    this.totalCylinders = typeof config.totalCylinders === 'number' && config.totalCylinders > 0
      ? Math.floor(config.totalCylinders)
      : 1024;

    this.totalSectors = Math.floor(this.capacityBytes / this.sectorSize);
    this.headPosition = 0;
    this.sectors = new Map(); // sectorNumber -> string/data
    this.usedBytes = 0;
  }

  /**
   * Initialize storage device. Persistent: preserves existing sector data.
   * @returns {{ success: boolean, status: string }}
   */
  initialize() {
    this.status = DeviceStatus.INITIALIZING;
    this.status = DeviceStatus.READY;
    return { success: true, status: this.status };
  }

  /**
   * Shutdown storage device. Persistent: preserves existing sector data.
   * @returns {{ success: boolean, status: string }}
   */
  shutdown() {
    this.status = DeviceStatus.OFFLINE;
    return { success: true, status: this.status };
  }

  /**
   * Reset storage device.
   * Preserves data across normal reset unless explicitly instructed to clearStorage/format.
   * @param {Object} [options={}]
   * @param {boolean} [options.clearStorage=false]
   * @param {boolean} [options.format=false]
   * @returns {{ success: boolean, status: string, cleared: boolean }}
   */
  reset(options = {}) {
    this.headPosition = 0;
    const shouldClear = Boolean(options.clearStorage || options.format);
    if (shouldClear) {
      this.sectors.clear();
      this.usedBytes = 0;
    }
    this.status = DeviceStatus.READY;
    return { success: true, status: this.status, cleared: shouldClear };
  }

  /**
   * Seek drive head to target cylinder.
   * @param {number} cylinder
   * @returns {{ success: boolean, data?: { headPosition: number }, error?: string }}
   */
  seek(cylinder) {
    if (typeof cylinder !== 'number' || isNaN(cylinder) || !Number.isInteger(cylinder)) {
      return { success: false, error: 'Cylinder must be an integer' };
    }

    if (cylinder < 0 || cylinder >= this.totalCylinders) {
      return {
        success: false,
        error: `Cylinder ${cylinder} is out of bounds (0 to ${this.totalCylinders - 1})`
      };
    }

    this.headPosition = cylinder;
    return { success: true, data: { headPosition: this.headPosition } };
  }

  /**
   * Read data from a sector.
   * @param {number} sector
   * @param {number} [length=1]
   * @returns {{ success: boolean, data?: Object, error?: string }}
   */
  read(sector, length = 1) {
    if (typeof sector !== 'number' || isNaN(sector) || !Number.isInteger(sector) || sector < 0) {
      return { success: false, error: 'Sector must be a non-negative integer' };
    }

    if (sector >= this.totalSectors) {
      return {
        success: false,
        error: `Sector ${sector} is out of bounds (0 to ${this.totalSectors - 1})`
      };
    }

    const sectorData = this.sectors.get(sector) || null;
    return {
      success: true,
      data: {
        sector,
        length,
        data: sectorData
      }
    };
  }

  /**
   * Write data to a sector.
   * @param {number} sector
   * @param {*} data
   * @returns {{ success: boolean, data?: Object, error?: string }}
   */
  write(sector, data) {
    if (typeof sector !== 'number' || isNaN(sector) || !Number.isInteger(sector) || sector < 0) {
      return { success: false, error: 'Sector must be a non-negative integer' };
    }

    if (sector >= this.totalSectors) {
      return {
        success: false,
        error: `Sector ${sector} is out of bounds (0 to ${this.totalSectors - 1})`
      };
    }

    if (data === null || data === undefined) {
      const wasPresent = this.sectors.has(sector);
      this.sectors.delete(sector);
      if (wasPresent) {
        this.usedBytes = this.sectors.size * this.sectorSize;
      }
      return {
        success: true,
        data: {
          sector,
          bytesWritten: 0,
          usedBytes: this.usedBytes
        }
      };
    }

    const wasPresent = this.sectors.has(sector);
    this.sectors.set(sector, typeof data === 'string' ? data : JSON.stringify(data));

    if (!wasPresent) {
      this.usedBytes = this.sectors.size * this.sectorSize;
    }

    return {
      success: true,
      data: {
        sector,
        bytesWritten: this.sectorSize,
        usedBytes: this.usedBytes
      }
    };
  }

  /**
   * Return a safe, serializable deep snapshot of Storage device state.
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
      capacityBytes: this.capacityBytes,
      usedBytes: this.usedBytes,
      freeBytes: Math.max(0, this.capacityBytes - this.usedBytes),
      sectorSize: this.sectorSize,
      totalCylinders: this.totalCylinders,
      totalSectors: this.totalSectors,
      headPosition: this.headPosition,
      storedSectorCount: this.sectors.size
    }));
  }
}
