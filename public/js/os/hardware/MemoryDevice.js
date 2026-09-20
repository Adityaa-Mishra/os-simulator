/**
 * MemoryDevice
 * Simulated physical RAM device for AdityyaOS.
 * Deterministic, bounded, serializable memory model with volatile reset semantics.
 * RAM contents reset on shutdown and reboot.
 */

import { HardwareDevice } from './HardwareDevice.js';
import { DeviceType, DeviceStatus } from './HardwareState.js';

export class MemoryDevice extends HardwareDevice {
  /**
   * @param {Object} [config={}]
   * @param {number} [config.totalBytes=1024]
   */
  constructor(config = {}) {
    super({
      id: config.id || 'ram0',
      type: DeviceType.MEMORY,
      name: config.name || 'Virtual Main Memory',
      vendor: config.vendor || 'AdityyaOS Memory Corp',
      model: config.model || 'DDR4-VRAM',
      enabled: config.enabled ?? true,
      properties: config.properties
    });

    const total = typeof config.totalBytes === 'number' && config.totalBytes > 0
      ? Math.floor(config.totalBytes)
      : 1024;

    this.totalBytes = total;
    this.buffer = new Uint8Array(this.totalBytes);
    this.allocations = new Map(); // pid -> { pid, address, size }
    this.usedBytes = 0;
    this.freeBytes = this.totalBytes;
    this.utilization = 0;
  }

  /**
   * Initialize RAM device. Volatile: always starts cleared.
   * @returns {{ success: boolean, status: string }}
   */
  initialize() {
    this.status = DeviceStatus.INITIALIZING;
    this.clearMemory();
    this.status = DeviceStatus.READY;
    return { success: true, status: this.status };
  }

  /**
   * Shutdown RAM device. Volatile: clears all data.
   * @returns {{ success: boolean, status: string }}
   */
  shutdown() {
    this.clearMemory();
    this.status = DeviceStatus.OFFLINE;
    return { success: true, status: this.status };
  }

  /**
   * Reset RAM device to pristine state.
   * @param {Object} [options={}]
   * @returns {{ success: boolean, status: string }}
   */
  reset(options = {}) {
    this.clearMemory();
    this.status = DeviceStatus.READY;
    return { success: true, status: this.status };
  }

  /**
   * Internal helper to wipe volatile memory.
   */
  clearMemory() {
    this.buffer.fill(0);
    this.allocations.clear();
    this.usedBytes = 0;
    this.freeBytes = this.totalBytes;
    this.utilization = 0;
  }

  /**
   * Allocate a block of physical memory for a process.
   * @param {number|string} pid
   * @param {number} size
   * @returns {{ success: boolean, data?: Object, error?: string }}
   */
  allocate(pid, size) {
    if (this.status !== DeviceStatus.READY && this.status !== DeviceStatus.BUSY) {
      return { success: false, error: `Memory device is not ready (current status: ${this.status})` };
    }

    if (pid === undefined || pid === null) {
      return { success: false, error: 'Process ID (pid) is required for memory allocation' };
    }

    if (typeof size !== 'number' || isNaN(size) || size <= 0 || !Number.isInteger(size)) {
      return { success: false, error: 'Memory allocation size must be a positive integer' };
    }

    if (size > this.freeBytes) {
      return {
        success: false,
        error: `Insufficient memory: requested ${size} bytes, available ${this.freeBytes} bytes`
      };
    }

    // Find next available offset
    let nextOffset = 0;
    for (const alloc of this.allocations.values()) {
      if (alloc.address + alloc.size > nextOffset) {
        nextOffset = alloc.address + alloc.size;
      }
    }

    // If offset exceeds total, check if fragmented allocation fits in total free
    if (nextOffset + size > this.totalBytes) {
      // Simple contiguous allocator check
      let currentOffset = 0;
      const sorted = Array.from(this.allocations.values()).sort((a, b) => a.address - b.address);
      let found = false;
      for (const alloc of sorted) {
        if (alloc.address - currentOffset >= size) {
          nextOffset = currentOffset;
          found = true;
          break;
        }
        currentOffset = alloc.address + alloc.size;
      }
      if (!found && this.totalBytes - currentOffset >= size) {
        nextOffset = currentOffset;
        found = true;
      }
      if (!found) {
        return {
          success: false,
          error: `Memory fragmentation: cannot allocate ${size} contiguous bytes`
        };
      }
    }

    const record = {
      pid,
      address: nextOffset,
      size
    };

    this.allocations.set(pid, record);
    this.usedBytes += size;
    this.freeBytes = this.totalBytes - this.usedBytes;
    this.utilization = Math.round((this.usedBytes / this.totalBytes) * 10000) / 100;

    return {
      success: true,
      data: { ...record, freeBytes: this.freeBytes, utilization: this.utilization }
    };
  }

  /**
   * Release memory allocated to a process.
   * @param {number|string} pid
   * @returns {{ success: boolean, data?: Object, error?: string }}
   */
  release(pid) {
    if (pid === undefined || pid === null) {
      return { success: false, error: 'Process ID (pid) is required to release memory' };
    }

    const alloc = this.allocations.get(pid);
    if (!alloc) {
      return { success: false, error: `No memory allocated to process ${pid}` };
    }

    // Zero out memory slice
    this.buffer.fill(0, alloc.address, alloc.address + alloc.size);

    this.allocations.delete(pid);
    this.usedBytes -= alloc.size;
    this.freeBytes = this.totalBytes - this.usedBytes;
    this.utilization = Math.round((this.usedBytes / this.totalBytes) * 10000) / 100;

    return {
      success: true,
      data: {
        pid,
        releasedSize: alloc.size,
        freedAddress: alloc.address,
        usedBytes: this.usedBytes,
        freeBytes: this.freeBytes
      }
    };
  }

  /**
   * Read bytes from virtual physical memory address space.
   * Clearly defined representation: returns an array of integer byte values (0-255).
   * @param {number} address
   * @param {number} [length=1]
   * @returns {{ success: boolean, data?: { address: number, length: number, bytes: Array<number> }, error?: string }}
   */
  read(address, length = 1) {
    if (typeof address !== 'number' || isNaN(address) || address < 0 || !Number.isInteger(address)) {
      return { success: false, error: 'Address must be a non-negative integer' };
    }

    if (typeof length !== 'number' || isNaN(length) || length <= 0 || !Number.isInteger(length)) {
      return { success: false, error: 'Read length must be a positive integer' };
    }

    if (address + length > this.totalBytes) {
      return {
        success: false,
        error: `Memory read out of bounds: address ${address} + length ${length} exceeds capacity ${this.totalBytes}`
      };
    }

    const bytes = Array.from(this.buffer.slice(address, address + length));
    return {
      success: true,
      data: { address, length, bytes }
    };
  }

  /**
   * Write bytes to virtual physical memory address space.
   * Clearly defined representation: accepts an Array of byte numbers (0-255) or a UTF-8 string.
   * @param {number} address
   * @param {Array<number>|string} data
   * @returns {{ success: boolean, data?: { address: number, bytesWritten: number }, error?: string }}
   */
  write(address, data) {
    if (typeof address !== 'number' || isNaN(address) || address < 0 || !Number.isInteger(address)) {
      return { success: false, error: 'Address must be a non-negative integer' };
    }

    let byteData = [];
    if (typeof data === 'string') {
      for (let i = 0; i < data.length; i++) {
        byteData.push(data.charCodeAt(i) & 0xff);
      }
    } else if (Array.isArray(data)) {
      byteData = data.map(b => (typeof b === 'number' && !isNaN(b) ? Math.max(0, Math.min(255, Math.floor(b))) : 0));
    } else {
      return { success: false, error: 'Write data must be an Array of bytes or a string' };
    }

    if (byteData.length === 0) {
      return { success: true, data: { address, bytesWritten: 0 } };
    }

    if (address + byteData.length > this.totalBytes) {
      return {
        success: false,
        error: `Memory write out of bounds: address ${address} + length ${byteData.length} exceeds capacity ${this.totalBytes}`
      };
    }

    for (let i = 0; i < byteData.length; i++) {
      this.buffer[address + i] = byteData[i];
    }

    return {
      success: true,
      data: { address, bytesWritten: byteData.length }
    };
  }

  /**
   * Convenience getter for used memory in bytes.
   */
  get used() {
    return this.usedBytes;
  }

  /**
   * Get allocations for a PID or all allocations.
   * @param {number|string} [pid]
   * @returns {Array<Object>}
   */
  getAllocations(pid) {
    if (pid !== undefined && pid !== null) {
      const alloc = this.allocations.get(pid);
      return alloc ? [{ ...alloc }] : [];
    }
    return Array.from(this.allocations.values()).map(a => ({ ...a }));
  }

  /**
   * Return a safe, serializable deep snapshot of Memory device state.
   * @returns {Object}
   */
  getState() {
    const safeAllocations = {};
    for (const [pid, val] of this.allocations.entries()) {
      safeAllocations[pid] = { ...val };
    }

    return JSON.parse(JSON.stringify({
      id: this.id,
      type: this.type,
      name: this.name,
      vendor: this.vendor,
      model: this.model,
      status: this.status,
      enabled: this.enabled,
      totalBytes: this.totalBytes,
      usedBytes: this.usedBytes,
      freeBytes: this.freeBytes,
      utilization: this.utilization,
      allocationCount: this.allocations.size,
      allocations: safeAllocations
    }));
  }
}
