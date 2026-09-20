/**
 * public/js/os/api/MemoryAPI.js
 * Controlled application interface for safe, read-only memory metrics.
 * Enforces 'memory.read' permission.
 */

export class MemoryAPI {
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
   * Get safe snapshot of system and process memory metrics.
   * Requires 'memory.read' permission.
   * @returns {{
   *   totalMemory: number,
   *   usedMemory: number,
   *   freeMemory: number,
   *   processAllocated: number
   * }}
   */
  getUsage() {
    this._context?.assertPermission('memory.read', 'memory.getUsage');

    const mm = this._kernel?.memoryManager;
    const totalMemory = typeof mm?.total === 'number' ? mm.total : 0;
    const usedMemory = typeof mm?.used === 'number' ? mm.used : 0;
    const freeMemory = Math.max(0, totalMemory - usedMemory);

    let processAllocated = 0;
    if (mm?.processAllocations && this._context?.pid) {
      const procAlloc = mm.processAllocations.get(this._context.pid);
      if (procAlloc) {
        processAllocated = procAlloc.allocatedSize ?? procAlloc.size ?? 0;
      }
    }

    return {
      totalMemory,
      usedMemory,
      freeMemory,
      processAllocated
    };
  }
}
