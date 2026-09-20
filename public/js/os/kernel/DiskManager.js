/**
 * DiskManager
 * Adapts existing Disk Scheduling engines (FCFS, SSTF, SCAN, C-SCAN, LOOK, C-LOOK) for AdityyaOS.
 * Manages virtual disk drives, cylinder request queues, and head trajectory scheduling.
 */

import {
  fcfsDiskEngine,
  sstfDiskEngine,
  scanDiskEngine,
  cscanDiskEngine,
  lookDiskEngine,
  clookDiskEngine
} from '../../engines/disk/index.js';
import { OSEvents } from './OSEventEmitter.js';

export const DiskAlgorithm = Object.freeze({
  FCFS: 'FCFS',
  SSTF: 'SSTF',
  SCAN: 'SCAN',
  CSCAN: 'CSCAN',
  LOOK: 'LOOK',
  CLOOK: 'CLOOK'
});

export const StorageRequestStatus = Object.freeze({
  QUEUED: 'QUEUED',
  SCHEDULED: 'SCHEDULED',
  EXECUTING: 'EXECUTING',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  FAILED: 'FAILED'
});

export class DiskManager {
  constructor(kernel, config = {}) {
    this.kernel = kernel;
    this.diskId = config.id || 'disk0';
    this.totalCylinders = config.totalCylinders || 200;
    this.storageRequests = [];
    this.requestIdCounter = 1;

    this.engines = new Map([
      [DiskAlgorithm.FCFS, fcfsDiskEngine],
      ['FCFS', fcfsDiskEngine],
      [DiskAlgorithm.SSTF, sstfDiskEngine],
      ['SSTF', sstfDiskEngine],
      [DiskAlgorithm.SCAN, scanDiskEngine],
      ['SCAN', scanDiskEngine],
      [DiskAlgorithm.CSCAN, cscanDiskEngine],
      ['CSCAN', cscanDiskEngine],
      [DiskAlgorithm.LOOK, lookDiskEngine],
      ['LOOK', lookDiskEngine],
      [DiskAlgorithm.CLOOK, clookDiskEngine],
      ['CLOOK', clookDiskEngine]
    ]);

    if (this.kernel && this.kernel.events) {
      this.kernel.events.on(OSEvents.PROCESS_TERMINATED, ({ pid }) => {
        this.cancelRequestsForProcess(pid);
      });
    }

    this.reset();
  }

  /**
   * Reset the disk manager to default parameters.
   */
  reset() {
    this.headPosition = 53;
    this.direction = 'right';
    this.activeAlgorithmName = 'FCFS';
    this.activeEngine = fcfsDiskEngine;
    this.pendingRequests = [];
    this.storageRequests = [];

    this.syncState();
  }

  /**
   * Sync disk state to the central kernel state.
   */
  syncState() {
    if (this.kernel && this.kernel.state) {
      this.kernel.state.disks = [
        {
          id: this.diskId,
          totalCylinders: this.totalCylinders,
          headPosition: this.headPosition,
          direction: this.direction,
          activeAlgorithm: this.activeAlgorithmName,
          pendingRequests: [...this.pendingRequests],
          requests: this.storageRequests.map(r => ({ ...r }))
        }
      ];
    }
  }

  /**
   * Set head position.
   * @param {number} pos
   * @returns {{ success: boolean, headPosition?: number, error?: string }}
   */
  setHeadPosition(pos) {
    if (typeof pos !== 'number' || isNaN(pos) || !Number.isInteger(pos) || pos < 0 || pos >= this.totalCylinders) {
      return { success: false, error: `Invalid head position: ${pos}` };
    }
    this.headPosition = pos;
    this.syncState();
    return { success: true, headPosition: this.headPosition };
  }

  /**
   * Set active disk scheduling algorithm.
   * @param {string} name
   * @returns {{ success: boolean, data?: Object, error?: string }}
   */
  setAlgorithm(name) {
    const normalized = String(name || '').trim().toUpperCase();
    const engine = this.engines.get(normalized);

    if (!engine) {
      const valid = Array.from(new Set(this.engines.keys()));
      return { success: false, error: `Unknown disk algorithm "${name}". Supported: ${valid.join(', ')}` };
    }

    this.activeAlgorithmName = normalized;
    this.activeEngine = engine;
    this.syncState();

    return { success: true, data: { algorithm: normalized } };
  }

  /**
   * Queue a cylinder I/O request.
   * @param {number} cylinder
   * @param {number|string} [pid=null]
   * @param {Object} [options={}]
   * @returns {{ success: boolean, data?: Object, error?: string }}
   */
  addRequest(cylinder, pid = null, options = {}) {
    if (typeof cylinder !== 'number' || isNaN(cylinder) || !Number.isInteger(cylinder)) {
      return { success: false, error: 'Cylinder must be an integer' };
    }

    if (cylinder < 0 || cylinder >= this.totalCylinders) {
      return {
        success: false,
        error: `Cylinder ${cylinder} is out of bounds (0 to ${this.totalCylinders - 1})`
      };
    }

    const requestId = `req-${this.requestIdCounter++}`;
    const req = {
      requestId,
      pid: pid !== undefined && pid !== null ? pid : null,
      cylinder,
      sector: typeof options.sector === 'number' && options.sector >= 0 ? options.sector : (cylinder % 200),
      operation: options.operation || 'seek',
      data: options.data !== undefined ? (typeof options.data === 'string' ? options.data : JSON.stringify(options.data)) : null,
      status: StorageRequestStatus.QUEUED,
      createdAt: Date.now(),
      completedAt: null
    };

    this.storageRequests.push(req);
    this.pendingRequests.push(cylinder);
    this.syncState();

    if (this.kernel && this.kernel.events) {
      this.kernel.events.emit(OSEvents.DISK_REQUEST_ADDED, {
        cylinder,
        pid,
        totalPending: this.pendingRequests.length
      });
      this.kernel.events.emit(OSEvents.STORAGE_REQUEST_QUEUED, {
        request: { ...req }
      });
    }

    return {
      success: true,
      data: {
        cylinder,
        pid,
        requestId,
        totalPending: this.pendingRequests.length
      }
    };
  }

  /**
   * Cancel all queued storage requests for a process.
   * Does not cancel completed or already executing requests.
   * @param {number|string} pid
   * @returns {{ success: boolean, data?: Object, error?: string }}
   */
  cancelRequestsForProcess(pid) {
    if (pid === undefined || pid === null) {
      return { success: false, error: 'Process ID (pid) is required to cancel storage requests' };
    }

    const cancelledRequests = [];
    for (const r of this.storageRequests) {
      if (r.pid === pid && r.status === StorageRequestStatus.QUEUED) {
        r.status = StorageRequestStatus.CANCELLED;
        cancelledRequests.push(r.requestId);
        if (this.kernel && this.kernel.events) {
          this.kernel.events.emit(OSEvents.STORAGE_REQUEST_CANCELLED, {
            requestId: r.requestId,
            pid
          });
        }
      }
    }

    // Re-filter pendingRequests so cancelled cylinders are removed from scheduler queue
    this.pendingRequests = this.storageRequests
      .filter(r => r.status === StorageRequestStatus.QUEUED)
      .map(r => r.cylinder);

    this.syncState();

    return {
      success: true,
      data: {
        pid,
        cancelledCount: cancelledRequests.length,
        cancelledRequests
      }
    };
  }

  /**
   * Get a safe copy of a storage request by ID.
   * @param {string} requestId
   * @returns {Object|null}
   */
  getRequest(requestId) {
    const req = this.storageRequests.find(r => r.requestId === requestId);
    return req ? { ...req } : null;
  }

  /**
   * Clear all pending requests from the queue.
   * @returns {{ success: boolean, data?: Object }}
   */
  clearRequests() {
    this.pendingRequests = [];
    this.storageRequests = [];
    this.syncState();
    return { success: true, data: { cleared: true } };
  }

  /**
   * Execute disk scheduling over the queue or supplied requests.
   * Pure delegation to existing disk engine.
   * Transitions active queued requests through SCHEDULED -> EXECUTING -> COMPLETED.
   * @param {Object} [options={}]
   * @returns {{ success: boolean, data?: Object, error?: string }}
   */
  schedule(options = {}) {
    const requests = options.requests || this.pendingRequests;

    if (!Array.isArray(requests) || requests.length === 0) {
      return { success: false, error: 'No disk requests available to schedule' };
    }

    const initialHead = options.initialHead !== undefined ? options.initialHead : this.headPosition;
    const direction = options.direction || this.direction;
    const diskSize = options.diskSize || this.totalCylinders;

    // Transition active queued requests to SCHEDULED
    const queuedRequests = this.storageRequests.filter(r => r.status === StorageRequestStatus.QUEUED);
    for (const r of queuedRequests) {
      r.status = StorageRequestStatus.SCHEDULED;
    }

    try {
      const result = this.activeEngine.run({
        requests: [...requests],
        initialHead,
        direction,
        diskSize
      });

      // Execute queued requests on virtual storage
      const disk = this.kernel?.hardware?.getDevice('disk0');
      for (const r of queuedRequests) {
        r.status = StorageRequestStatus.EXECUTING;
        if (this.kernel && this.kernel.events) {
          this.kernel.events.emit(OSEvents.STORAGE_REQUEST_STARTED, { requestId: r.requestId, pid: r.pid });
        }

        if (r.operation === 'write' && disk && r.data !== null) {
          disk.write(r.sector, r.data);
        } else if (r.operation === 'read' && disk) {
          r.result = disk.read(r.sector);
        }

        r.status = StorageRequestStatus.COMPLETED;
        r.completedAt = Date.now();
        if (this.kernel && this.kernel.events) {
          this.kernel.events.emit(OSEvents.STORAGE_REQUEST_COMPLETED, { requestId: r.requestId, pid: r.pid });
        }
      }

      // If scheduled successfully, update state
      if (!options.requests) {
        this.pendingRequests = [];
      }

      // Update head position to the final serviced head
      if (result.metrics && typeof result.metrics.finalHead === 'number') {
        this.headPosition = result.metrics.finalHead;
        if (disk) {
          disk.seek(this.headPosition);
        }
      }

      this.syncState();

      if (this.kernel && this.kernel.events) {
        this.kernel.events.emit(OSEvents.DISK_SCHEDULED, {
          algorithm: this.activeAlgorithmName,
          totalMovement: result.metrics.totalMovement
        });
      }

      return { success: true, data: result };
    } catch (err) {
      for (const r of queuedRequests) {
        r.status = StorageRequestStatus.FAILED;
        if (this.kernel && this.kernel.events) {
          this.kernel.events.emit(OSEvents.STORAGE_REQUEST_FAILED, { requestId: r.requestId, error: err.message });
        }
      }
      return { success: false, error: err.message };
    }
  }

  /**
   * Get current disk state snapshot.
   * @returns {Object}
   */
  getDiskState() {
    return {
      id: this.diskId,
      totalCylinders: this.totalCylinders,
      headPosition: this.headPosition,
      direction: this.direction,
      activeAlgorithm: this.activeAlgorithmName,
      pendingRequests: [...this.pendingRequests],
      requests: this.storageRequests.map(r => ({ ...r }))
    };
  }
}
