/**
 * public/js/os/api/ProcessAPI.js
 * Controlled application interface for safe, isolated process information.
 * Strictly prevents cross-process inspection and enforces 'process.self' permission.
 */

import { APIError } from './APIError.js';

export class ProcessAPI {
  /**
   * @param {Object} options
   * @param {import('../kernel/Kernel.js').Kernel} options.kernel
   * @param {import('./APIContext.js').APIContext} options.context
   */
  constructor({ kernel, context }) {
    this._kernel = kernel;
    this._context = context;
  }

  /**
   * Get PID of calling application instance.
   * @returns {number}
   */
  getPid() {
    return this._context.pid;
  }

  /**
   * Get calling application instance's own process PCB copy.
   * Requires 'process.self' permission.
   * Returns a snapshot clone to prevent mutation of internal Kernel state.
   * @returns {Object|null}
   */
  getCurrent() {
    this._context?.assertPermission('process.self', 'process.getCurrent');
    const pcb = this._kernel?.processManager?.getProcess(this._context.pid);
    if (!pcb) {
      return null;
    }
    return {
      pid: pcb.pid,
      name: pcb.name,
      state: pcb.state,
      priority: pcb.priority,
      burstTime: pcb.burstTime,
      remainingTime: pcb.remainingTime,
      arrivalTime: pcb.arrivalTime,
      memoryRequired: pcb.memoryRequired,
      allocatedMemory: pcb.allocatedMemory,
      createdAt: pcb.createdAt
    };
  }

  /**
   * Get process info by PID with strict cross-process isolation.
   * Requires 'process.self' for own process, or 'process.read' for foreign processes.
   * @param {number} pid
   * @returns {Object}
   */
  getInfo(pid) {
    if (typeof pid !== 'number' || isNaN(pid) || pid <= 0) {
      throw new APIError({
        code: 'EINVAL',
        message: 'Invalid PID: must be a positive number',
        operation: 'process.getInfo',
        appId: this._context?.appId
      });
    }

    if (pid === this._context.pid) {
      this._context?.assertPermission('process.self', 'process.getInfo');
      const info = this.getCurrent();
      if (!info) {
        throw new APIError({
          code: 'ESRCH',
          message: `Process ${pid} not found`,
          operation: 'process.getInfo',
          appId: this._context?.appId
        });
      }
      return info;
    }

    // Foreign PID inspection requires explicit process.read permission
    const hasRead = !this._context?._isLegacy && this._context?.hasPermission('process.read');
    if (!hasRead) {
      throw new APIError({
        code: 'EPERM',
        message: `Permission denied: Cannot inspect foreign process ${pid}`,
        operation: 'process.getInfo',
        appId: this._context?.appId
      });
    }

    const pcb = this._kernel?.processManager?.getProcess(pid);
    if (!pcb) {
      throw new APIError({
        code: 'ESRCH',
        message: `Process ${pid} not found`,
        operation: 'process.getInfo',
        appId: this._context?.appId
      });
    }

    return {
      pid: pcb.pid,
      name: pcb.name,
      state: pcb.state,
      priority: pcb.priority,
      burstTime: pcb.burstTime,
      remainingTime: pcb.remainingTime,
      arrivalTime: pcb.arrivalTime,
      memoryRequired: pcb.memoryRequired,
      allocatedMemory: pcb.allocatedMemory,
      createdAt: pcb.createdAt
    };
  }

  /**
   * List all processes with safe PCB clones.
   * Requires 'process.read' permission.
   * @returns {Array<Object>}
   */
  list() {
    this._context?.assertPermission('process.read', 'process.list');
    const processes = this._kernel?.processManager?.getProcesses() || [];
    return processes.map(pcb => ({
      pid: pcb.pid,
      name: pcb.name,
      state: pcb.state,
      priority: pcb.priority,
      burstTime: pcb.burstTime,
      remainingTime: pcb.remainingTime,
      arrivalTime: pcb.arrivalTime,
      memoryRequired: pcb.memoryRequired,
      allocatedMemory: pcb.allocatedMemory,
      createdAt: pcb.createdAt
    }));
  }

  /**
   * Request termination of an eligible non-critical process.
   * Requires 'process.terminate' permission.
   * Critical system processes (PID 0, PID 1, idle, init, kernel) are strictly protected.
   * @param {number} pid
   * @param {number} [exitCode=0]
   * @returns {{ success: boolean, pid: number }}
   */
  terminate(pid, exitCode = 0) {
    this._context?.assertPermission('process.terminate', 'process.terminate');

    // Critical/system processes must remain protected
    if (pid === 0 || pid === 1) {
      throw new APIError({
        code: 'EPERM',
        message: `Cannot terminate system-critical process ${pid}`,
        operation: 'process.terminate',
        appId: this._context?.appId
      });
    }

    if (typeof pid !== 'number' || isNaN(pid) || pid < 0) {
      throw new APIError({
        code: 'EINVAL',
        message: 'Invalid PID: must be a positive number',
        operation: 'process.terminate',
        appId: this._context?.appId
      });
    }

    const pcb = this._kernel?.processManager?.getProcess(pid);
    if (!pcb) {
      throw new APIError({
        code: 'ESRCH',
        message: `Process ${pid} not found`,
        operation: 'process.terminate',
        appId: this._context?.appId
      });
    }

    if (pcb.isCritical || pcb.name === 'idle' || pcb.name === 'init' || pcb.name === 'kernel') {
      throw new APIError({
        code: 'EPERM',
        message: `Cannot terminate system-critical process ${pid} (${pcb.name})`,
        operation: 'process.terminate',
        appId: this._context?.appId
      });
    }

    const res = this._kernel?.processManager?.terminateProcess(pid);
    if (!res?.success) {
      throw new APIError({
        code: res?.code || 'EIO',
        message: res?.error || `Failed to terminate process ${pid}`,
        operation: 'process.terminate',
        appId: this._context?.appId
      });
    }

    return { success: true, pid };
  }
}
