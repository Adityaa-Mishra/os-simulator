/**
 * MemoryManager
 * Adapts existing memory allocation engines (First Fit, Best Fit, Worst Fit) for AdityyaOS.
 * Provides transactional allocation/free semantics and maintains partition state.
 */

import {
  firstFitEngine,
  bestFitEngine,
  worstFitEngine
} from '../../engines/memory/index.js';
import { OSEvents } from './OSEventEmitter.js';

export const MemoryStrategy = Object.freeze({
  FIRST_FIT: 'FIRST_FIT',
  BEST_FIT: 'BEST_FIT',
  WORST_FIT: 'WORST_FIT'
});

const DEFAULT_PARTITIONS = [
  { id: 'B1', size: 100 },
  { id: 'B2', size: 200 },
  { id: 'B3', size: 300 },
  { id: 'B4', size: 424 } // Total 1024
];

export class MemoryManager {
  constructor(kernel, config = {}) {
    this.kernel = kernel;
    const totalConfig = config.totalMemory || config.total;
    if (totalConfig && !config.partitions) {
      this.partitionConfig = [
        { id: 'B1', size: Math.floor(totalConfig * 0.1) },
        { id: 'B2', size: Math.floor(totalConfig * 0.2) },
        { id: 'B3', size: Math.floor(totalConfig * 0.3) },
        { id: 'B4', size: totalConfig - Math.floor(totalConfig * 0.1) - Math.floor(totalConfig * 0.2) - Math.floor(totalConfig * 0.3) }
      ];
    } else {
      this.partitionConfig = config.partitions || DEFAULT_PARTITIONS;
    }

    this.engines = new Map([
      [MemoryStrategy.FIRST_FIT, firstFitEngine],
      ['FIRST_FIT', firstFitEngine],
      [MemoryStrategy.BEST_FIT, bestFitEngine],
      ['BEST_FIT', bestFitEngine],
      [MemoryStrategy.WORST_FIT, worstFitEngine],
      ['WORST_FIT', worstFitEngine]
    ]);

    this.processAllocations = new Map();

    if (this.kernel && this.kernel.events) {
      this.kernel.events.on(OSEvents.PROCESS_TERMINATED, ({ pid }) => {
        if (this.processAllocations.has(pid)) {
          this.free(pid);
        }
      });
    }

    this.reset();
  }

  /**
   * Reset memory partitions and utilization metrics.
   */
  reset() {
    this.processAllocations.clear();
    this.blocks = this.partitionConfig.map((p, idx) => ({
      id: String(p.id),
      index: idx,
      size: Number(p.size),
      isFree: true,
      allocatedProcessId: null,
      allocatedProcessSize: 0,
      internalFragmentation: 0
    }));

    this.total = this.blocks.reduce((sum, b) => sum + b.size, 0);
    this.used = 0;

    if (this.kernel && this.kernel.hardware) {
      const ram = this.kernel.hardware.getDevice('ram0');
      if (ram) {
        ram.reset();
      }
    }

    this.syncState();
  }

  /**
   * Sync memory stats to the central kernel state.
   */
  syncState() {
    if (this.kernel && this.kernel.state) {
      this.kernel.state.memory.total = this.total;
      this.kernel.state.memory.used = this.used;
      this.kernel.state.memory.free = this.total - this.used;
      this.kernel.state.memory.blocks = this.blocks.map(b => ({ ...b }));
    }
  }

  /**
   * Allocate memory for a process using the requested allocation engine.
   * Transactional: if allocation fails, state is untouched and no event is emitted.
   * @param {number|string} pid
   * @param {number} size
   * @param {string} [strategy='FIRST_FIT']
   * @returns {{ success: boolean, data?: Object, error?: string }}
   */
  allocate(pid, size, strategy = MemoryStrategy.FIRST_FIT) {
    if (pid === undefined || pid === null) {
      return { success: false, error: 'Process ID (pid) is required for memory allocation' };
    }

    if (typeof size !== 'number' || isNaN(size) || size <= 0 || !Number.isInteger(size)) {
      return { success: false, error: 'Memory allocation size must be a positive integer' };
    }

    const normalizedStrategy = String(strategy || '').trim().toUpperCase();
    const engine = this.engines.get(normalizedStrategy);
    if (!engine) {
      return { success: false, error: `Unknown memory allocation strategy "${strategy}". Use FIRST_FIT, BEST_FIT, or WORST_FIT.` };
    }

    // Adapt existing engine's selectBlock method
    const candidateBlock = engine.selectBlock(this.blocks, { id: String(pid), size });

    if (!candidateBlock) {
      return {
        success: false,
        error: `Insufficient contiguous memory or no partition large enough for ${size} bytes using ${normalizedStrategy}`
      };
    }

    // Attempt physical RAM allocation before committing logical block (transactional rollback)
    let physicalAddress = 0;
    if (this.kernel && this.kernel.hardware) {
      const ram = this.kernel.hardware.getDevice('ram0');
      if (ram) {
        const physicalRes = ram.allocate(pid, size);
        if (!physicalRes || !physicalRes.success) {
          return {
            success: false,
            error: `Physical memory allocation failed: ${physicalRes?.error || 'insufficient physical RAM'}`
          };
        }
        physicalAddress = physicalRes.data.address;
      }
    }

    // Success transaction: commit logical block
    candidateBlock.isFree = false;
    candidateBlock.allocatedProcessId = pid;
    candidateBlock.allocatedProcessSize = size;
    candidateBlock.internalFragmentation = candidateBlock.size - size;
    candidateBlock.physicalAddress = physicalAddress;

    this.used = this.blocks.reduce((acc, b) => acc + (b.isFree ? 0 : b.allocatedProcessSize), 0);

    // Track process ownership
    if (!this.processAllocations.has(pid)) {
      this.processAllocations.set(pid, []);
    }
    const allocRecord = {
      blockId: candidateBlock.id,
      address: physicalAddress,
      size
    };
    this.processAllocations.get(pid).push(allocRecord);

    // Sync to Process PCB if process exists
    if (this.kernel && this.kernel.processManager) {
      const pcb = this.kernel.processManager.processes.get(pid);
      if (pcb) {
        pcb.allocatedMemory = (pcb.allocatedMemory || 0) + size;
        pcb.allocations = [...(this.processAllocations.get(pid) || [])];
      }
    }

    this.syncState();

    if (this.kernel && this.kernel.events) {
      this.kernel.events.emit(OSEvents.MEMORY_ALLOCATED, {
        pid,
        size,
        blockId: candidateBlock.id,
        address: physicalAddress,
        internalFragmentation: candidateBlock.internalFragmentation,
        strategy: normalizedStrategy
      });
      this.kernel.events.emit(OSEvents.PROCESS_MEMORY_ALLOCATED, {
        pid,
        blockId: candidateBlock.id,
        address: physicalAddress,
        size
      });
    }

    return {
      success: true,
      data: {
        blockId: candidateBlock.id,
        address: physicalAddress,
        size,
        internalFragmentation: candidateBlock.internalFragmentation,
        strategy: normalizedStrategy
      }
    };
  }

  /**
   * Free all memory allocated to a process.
   * @param {number|string} pid
   * @returns {{ success: boolean, data?: Object, error?: string }}
   */
  free(pid) {
    if (pid === undefined || pid === null) {
      return { success: false, error: 'Process ID (pid) is required to free memory' };
    }

    const allocatedBlocks = this.blocks.filter(b => b.allocatedProcessId === pid);
    if (allocatedBlocks.length === 0) {
      return { success: false, error: `No memory allocated to process ${pid}` };
    }

    const freedBlockIds = [];
    let totalFreedSize = 0;

    for (const block of allocatedBlocks) {
      freedBlockIds.push(block.id);
      totalFreedSize += block.allocatedProcessSize;
      block.isFree = true;
      block.allocatedProcessId = null;
      block.allocatedProcessSize = 0;
      block.internalFragmentation = 0;
      block.physicalAddress = null;
    }

    this.used = this.blocks.reduce((acc, b) => acc + (b.isFree ? 0 : b.allocatedProcessSize), 0);

    // Release in physical RAM
    if (this.kernel && this.kernel.hardware) {
      const ram = this.kernel.hardware.getDevice('ram0');
      if (ram) {
        ram.release(pid);
      }
    }

    // Clear process ownership
    this.processAllocations.delete(pid);

    // Sync to Process PCB if process exists
    if (this.kernel && this.kernel.processManager) {
      const pcb = this.kernel.processManager.processes.get(pid);
      if (pcb) {
        pcb.allocatedMemory = 0;
        pcb.allocations = [];
      }
    }

    this.syncState();

    if (this.kernel && this.kernel.events) {
      this.kernel.events.emit(OSEvents.MEMORY_FREED, {
        pid,
        freedBlocks: freedBlockIds,
        totalFreedSize
      });
      this.kernel.events.emit(OSEvents.PROCESS_MEMORY_RELEASED, {
        pid,
        freedBlocks: freedBlockIds,
        totalFreedSize
      });
    }

    return {
      success: true,
      data: {
        pid,
        freedBlocks: freedBlockIds,
        totalFreedSize
      }
    };
  }

  /**
   * Read from process-owned memory.
   * Maps process-relative offset -> logical allocation -> physical MemoryDevice address.
   * Enforces strict process ownership and allocation boundary checks.
   * @param {number|string} pid
   * @param {number} offset
   * @param {number} [length=1]
   * @returns {{ success: boolean, data?: Object, error?: string }}
   */
  readProcessMemory(pid, offset = 0, length = 1) {
    if (pid === undefined || pid === null) {
      return { success: false, error: 'Process ID (pid) is required to read process memory' };
    }

    const allocs = this.processAllocations.get(pid);
    if (!allocs || allocs.length === 0) {
      return { success: false, error: `No memory allocated to process ${pid}` };
    }

    if (typeof offset !== 'number' || isNaN(offset) || offset < 0 || !Number.isInteger(offset)) {
      return { success: false, error: 'Memory offset must be a non-negative integer' };
    }

    if (typeof length !== 'number' || isNaN(length) || length <= 0 || !Number.isInteger(length)) {
      return { success: false, error: 'Read length must be a positive integer' };
    }

    const totalAllocated = allocs.reduce((sum, a) => sum + a.size, 0);
    if (offset + length > totalAllocated) {
      return {
        success: false,
        error: `Memory access violation: offset ${offset} + length ${length} exceeds allocated ${totalAllocated} bytes for process ${pid}`
      };
    }

    // Map process offset to physical address
    let remaining = offset;
    let target = null;
    for (const a of allocs) {
      if (remaining < a.size) {
        target = a;
        break;
      }
      remaining -= a.size;
    }

    const physicalAddress = target.address + remaining;
    const ram = this.kernel?.hardware?.getDevice('ram0');
    if (!ram) {
      return { success: false, error: 'Physical RAM device not found' };
    }

    const res = ram.read(physicalAddress, length);
    if (!res.success) {
      return res;
    }

    return {
      success: true,
      data: {
        pid,
        processOffset: offset,
        physicalAddress,
        length,
        bytes: res.data.bytes
      }
    };
  }

  /**
   * Write to process-owned memory.
   * Maps process-relative offset -> logical allocation -> physical MemoryDevice address.
   * Enforces strict process ownership and allocation boundary checks.
   * @param {number|string} pid
   * @param {number} offset
   * @param {Array<number>|string} data
   * @returns {{ success: boolean, data?: Object, error?: string }}
   */
  writeProcessMemory(pid, offset, data) {
    if (pid === undefined || pid === null) {
      return { success: false, error: 'Process ID (pid) is required to write process memory' };
    }

    const allocs = this.processAllocations.get(pid);
    if (!allocs || allocs.length === 0) {
      return { success: false, error: `No memory allocated to process ${pid}` };
    }

    if (typeof offset !== 'number' || isNaN(offset) || offset < 0 || !Number.isInteger(offset)) {
      return { success: false, error: 'Memory offset must be a non-negative integer' };
    }

    const dataLength = typeof data === 'string' ? data.length : (Array.isArray(data) ? data.length : -1);
    if (dataLength < 0) {
      return { success: false, error: 'Write data must be a string or array of byte numbers' };
    }

    const totalAllocated = allocs.reduce((sum, a) => sum + a.size, 0);
    if (offset + dataLength > totalAllocated) {
      return {
        success: false,
        error: `Memory access violation: offset ${offset} + data length ${dataLength} exceeds allocated ${totalAllocated} bytes for process ${pid}`
      };
    }

    // Map process offset to physical address
    let remaining = offset;
    let target = null;
    for (const a of allocs) {
      if (remaining < a.size) {
        target = a;
        break;
      }
      remaining -= a.size;
    }

    const physicalAddress = target.address + remaining;
    const ram = this.kernel?.hardware?.getDevice('ram0');
    if (!ram) {
      return { success: false, error: 'Physical RAM device not found' };
    }

    const res = ram.write(physicalAddress, data);
    if (!res.success) {
      return res;
    }

    return {
      success: true,
      data: {
        pid,
        processOffset: offset,
        physicalAddress,
        bytesWritten: res.data.bytesWritten
      }
    };
  }

  /**
   * Get safe copy of process allocations.
   * @param {number|string} pid
   * @returns {Array<Object>}
   */
  getAllocations(pid) {
    return JSON.parse(JSON.stringify(this.processAllocations.get(pid) || []));
  }

  /**
   * Get current memory state snapshot.
   * @returns {{ total: number, used: number, free: number, blocks: Array<Object>, processAllocations: Object }}
   */
  getMemoryState() {
    const allocationsObj = {};
    for (const [pid, allocs] of this.processAllocations.entries()) {
      allocationsObj[pid] = allocs.map(a => ({ ...a }));
    }
    return {
      total: this.total,
      used: this.used,
      free: this.total - this.used,
      blocks: this.blocks.map(b => ({ ...b })),
      processAllocations: allocationsObj
    };
  }
}
