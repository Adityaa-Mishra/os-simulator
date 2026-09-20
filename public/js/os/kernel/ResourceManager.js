/**
 * ResourceManager
 * Adapts Banker's Safety and Resource Request deadlock avoidance engines for AdityyaOS.
 * Transactionally manages system resources, claims, allocations, and safe state checks.
 */

import {
  bankersSafetyEngine,
  bankersRequestEngine
} from '../../engines/deadlock/index.js';
import { OSEvents } from './OSEventEmitter.js';

export class ResourceManager {
  constructor(kernel) {
    this.kernel = kernel;
    this.reset();
  }

  /**
   * Reset resource registry and allocations.
   */
  reset() {
    this.names = [];
    this.total = {};
    this.available = {};
    this.allocated = {}; // pid -> { R1: count, ... }
    this.max = {};       // pid -> { R1: count, ... }

    this.syncState();
  }

  /**
   * Sync resources to central kernel state.
   */
  syncState() {
    if (this.kernel && this.kernel.state) {
      this.kernel.state.resources = {
        names: [...this.names],
        available: { ...this.available },
        allocated: JSON.parse(JSON.stringify(this.allocated)),
        max: JSON.parse(JSON.stringify(this.max))
      };
    }
  }

  /**
   * Register available system resources.
   * @param {Object.<string, number>} resources - Map of resource names to total counts
   * @returns {{ success: boolean, data?: Object, error?: string }}
   */
  registerResources(resources = {}) {
    if (!resources || typeof resources !== 'object' || Object.keys(resources).length === 0) {
      return { success: false, error: 'Resources must be a non-empty object map of counts' };
    }

    const newNames = [];
    const newTotal = {};
    const newAvailable = {};

    for (const [name, count] of Object.entries(resources)) {
      if (typeof count !== 'number' || isNaN(count) || count < 0 || !Number.isInteger(count)) {
        return { success: false, error: `Resource "${name}" count must be a non-negative integer` };
      }
      newNames.push(name);
      newTotal[name] = count;
      newAvailable[name] = count;
    }

    this.names = newNames;
    this.total = newTotal;
    this.available = newAvailable;
    this.allocated = {};
    this.max = {};

    this.syncState();

    if (this.kernel && this.kernel.events) {
      this.kernel.events.emit(OSEvents.RESOURCE_REGISTERED, { resources: { ...this.total } });
    }

    return { success: true, data: { resources: { ...this.total } } };
  }

  /**
   * Declare maximum resource demand for a process.
   * @param {number|string} pid
   * @param {Object.<string, number>} maxDemand
   * @returns {{ success: boolean, data?: Object, error?: string }}
   */
  declareMax(pid, maxDemand = {}) {
    if (pid === undefined || pid === null) {
      return { success: false, error: 'Process ID (pid) is required' };
    }

    const demand = {};
    for (const name of this.names) {
      const count = maxDemand[name] || 0;
      if (typeof count !== 'number' || count < 0 || count > this.total[name]) {
        return {
          success: false,
          error: `Max demand for "${name}" (${count}) exceeds total system capacity (${this.total[name]})`
        };
      }
      demand[name] = count;
    }

    this.max[pid] = demand;
    if (!this.allocated[pid]) {
      this.allocated[pid] = Object.fromEntries(this.names.map(n => [n, 0]));
    }

    this.syncState();
    return { success: true, data: { pid, max: { ...this.max[pid] } } };
  }

  /**
   * Request resources for a process with Banker's safety verification.
   * Transactional: If unsafe, rollback and return error without emitting success events.
   * @param {number|string} pid
   * @param {Object.<string, number>} request
   * @returns {{ success: boolean, data?: Object, error?: string }}
   */
  request(pid, request = {}) {
    if (pid === undefined || pid === null) {
      return { success: false, error: 'Process ID (pid) is required' };
    }

    if (!this.max[pid]) {
      return { success: false, error: `Process ${pid} has not declared maximum resource demand` };
    }

    const currentAlloc = this.allocated[pid] || Object.fromEntries(this.names.map(n => [n, 0]));
    const maxDemand = this.max[pid];

    // 1. Validation check
    for (const [name, count] of Object.entries(request)) {
      if (!this.names.includes(name)) {
        return { success: false, error: `Unknown resource type "${name}"` };
      }
      if (typeof count !== 'number' || count < 0 || !Number.isInteger(count)) {
        return { success: false, error: `Requested count for "${name}" must be a non-negative integer` };
      }
      if (count + currentAlloc[name] > maxDemand[name]) {
        return {
          success: false,
          error: `Process ${pid} request for "${name}" exceeds its declared maximum claim`
        };
      }
      if (count > this.available[name]) {
        return {
          success: false,
          error: `Insufficient available "${name}" (${this.available[name]} available, ${count} requested)`
        };
      }
    }

    // 2. Prepare tentative state for Banker's Safety Engine
    const pids = Object.keys(this.max);
    const availableArr = this.names.map(n => this.available[n] - (request[n] || 0));
    const maxMatrix = pids.map(p => this.names.map(n => this.max[p][n] || 0));
    const allocMatrix = pids.map(p => {
      const isTarget = String(p) === String(pid);
      return this.names.map(n => {
        const base = this.allocated[p]?.[n] || 0;
        return isTarget ? base + (request[n] || 0) : base;
      });
    });

    try {
      // 3. Delegate to existing BankersSafetyEngine
      const safetyResult = bankersSafetyEngine.run({
        processes: pids.map(p => `P${p}`),
        available: availableArr,
        max: maxMatrix,
        allocation: allocMatrix
      });

      if (!safetyResult.safe) {
        return {
          success: false,
          error: 'Resource request denied: granting request would lead to an unsafe state (deadlock avoidance)'
        };
      }

      // 4. Commit transaction
      for (const [name, count] of Object.entries(request)) {
        this.available[name] -= count;
        currentAlloc[name] += count;
      }
      this.allocated[pid] = currentAlloc;
      this.syncState();

      if (this.kernel && this.kernel.events) {
        this.kernel.events.emit(OSEvents.RESOURCE_ALLOCATED, {
          pid,
          request: { ...request },
          safeSequence: safetyResult.safeSequence
        });
      }

      return {
        success: true,
        data: {
          pid,
          allocated: { ...request },
          safeSequence: safetyResult.safeSequence
        }
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Release allocated resources for a process.
   * @param {number|string} pid
   * @param {Object.<string, number>} release
   * @returns {{ success: boolean, data?: Object, error?: string }}
   */
  release(pid, release = {}) {
    if (pid === undefined || pid === null) {
      return { success: false, error: 'Process ID (pid) is required' };
    }

    const currentAlloc = this.allocated[pid];
    if (!currentAlloc) {
      return { success: false, error: `Process ${pid} has no allocated resources` };
    }

    for (const [name, count] of Object.entries(release)) {
      if (!this.names.includes(name)) {
        return { success: false, error: `Unknown resource type "${name}"` };
      }
      if (typeof count !== 'number' || count < 0 || !Number.isInteger(count)) {
        return { success: false, error: `Release count for "${name}" must be a non-negative integer` };
      }
      if (count > (currentAlloc[name] || 0)) {
        return {
          success: false,
          error: `Cannot release ${count} of "${name}" (only ${currentAlloc[name] || 0} allocated to process ${pid})`
        };
      }
    }

    for (const [name, count] of Object.entries(release)) {
      currentAlloc[name] -= count;
      this.available[name] += count;
    }

    this.syncState();

    if (this.kernel && this.kernel.events) {
      this.kernel.events.emit(OSEvents.RESOURCE_RELEASED, {
        pid,
        released: { ...release }
      });
    }

    return {
      success: true,
      data: {
        pid,
        released: { ...release }
      }
    };
  }

  /**
   * Check if current resource distribution is in a safe state.
   * Pure delegation to existing BankersSafetyEngine.
   * @returns {{ success: boolean, data?: Object, error?: string }}
   */
  checkSafety() {
    const pids = Object.keys(this.max);
    if (pids.length === 0 || this.names.length === 0) {
      return { success: true, data: { isSafe: true, safeSequence: [] } };
    }

    const availableArr = this.names.map(n => this.available[n] || 0);
    const maxMatrix = pids.map(p => this.names.map(n => this.max[p][n] || 0));
    const allocMatrix = pids.map(p => this.names.map(n => this.allocated[p]?.[n] || 0));

    try {
      const result = bankersSafetyEngine.run({
        processes: pids.map(p => `P${p}`),
        available: availableArr,
        max: maxMatrix,
        allocation: allocMatrix
      });

      return {
        success: true,
        data: {
          isSafe: result.safe,
          safeSequence: result.safeSequence
        }
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Get current resource state snapshot.
   * @returns {Object}
   */
  getResourceState() {
    return {
      names: [...this.names],
      total: { ...this.total },
      available: { ...this.available },
      allocated: JSON.parse(JSON.stringify(this.allocated)),
      max: JSON.parse(JSON.stringify(this.max))
    };
  }
}
