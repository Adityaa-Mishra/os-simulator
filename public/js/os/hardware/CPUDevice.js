/**
 * CPUDevice
 * Simulated CPU device for AdityyaOS.
 * Represents the physical processing hardware receiving work from the Scheduler and Process managers.
 * Does NOT implement scheduling algorithms.
 * Workload execution is strictly simulation-only; never executes arbitrary code.
 */

import { HardwareDevice } from './HardwareDevice.js';
import { DeviceType, DeviceStatus } from './HardwareState.js';

export class CPUDevice extends HardwareDevice {
  /**
   * @param {Object} [config={}]
   */
  constructor(config = {}) {
    super({
      id: config.id || 'cpu0',
      type: DeviceType.CPU,
      name: config.name || 'Adityya-64 Virtual Processor',
      vendor: config.vendor || 'AdityyaOS Virtual Silicon',
      model: config.model || 'A64-Sim',
      enabled: config.enabled ?? true,
      properties: config.properties
    });

    this.cores = typeof config.cores === 'number' && config.cores > 0 ? config.cores : 1;
    this.architecture = config.architecture || 'Adityya64';
    this.frequencyMHz = typeof config.frequencyMHz === 'number' && config.frequencyMHz > 0 ? config.frequencyMHz : 2400;
    this.utilization = 0;
    this.currentProcess = null;
    this.instructionsExecuted = 0;
  }

  /**
   * Initialize CPU device.
   * @returns {{ success: boolean, status: string }}
   */
  initialize() {
    this.status = DeviceStatus.INITIALIZING;
    this.utilization = 0;
    this.currentProcess = null;
    this.status = DeviceStatus.READY;
    return { success: true, status: this.status };
  }

  /**
   * Shutdown CPU device.
   * @returns {{ success: boolean, status: string }}
   */
  shutdown() {
    this.status = DeviceStatus.OFFLINE;
    this.utilization = 0;
    this.currentProcess = null;
    return { success: true, status: this.status };
  }

  /**
   * Reset CPU device to pristine state.
   * @param {Object} [options={}]
   * @returns {{ success: boolean, status: string }}
   */
  reset(options = {}) {
    this.utilization = 0;
    this.currentProcess = null;
    this.instructionsExecuted = 0;
    this.status = DeviceStatus.READY;
    return { success: true, status: this.status };
  }

  /**
   * Set CPU utilization percentage (0 to 100).
   * @param {number} pct
   * @returns {{ success: boolean, data?: { utilization: number }, error?: string }}
   */
  setUtilization(pct) {
    if (typeof pct !== 'number' || isNaN(pct)) {
      return { success: false, error: 'Utilization must be a valid number' };
    }
    this.utilization = Math.max(0, Math.min(100, Math.round(pct * 100) / 100));
    return { success: true, data: { utilization: this.utilization } };
  }

  /**
   * Assign a process to the CPU.
   * @param {number|string} pid
   * @returns {{ success: boolean, data?: { currentProcess: number|string }, error?: string }}
   */
  assignProcess(pid) {
    if (pid === undefined || pid === null) {
      return { success: false, error: 'Process ID cannot be null or undefined' };
    }
    this.currentProcess = pid;
    return { success: true, data: { currentProcess: this.currentProcess } };
  }

  /**
   * Release the currently assigned process from the CPU.
   * @returns {{ success: boolean, data?: { currentProcess: null } }}
   */
  releaseProcess() {
    this.currentProcess = null;
    return { success: true, data: { currentProcess: null } };
  }

  /**
   * Execute simulated workload.
   * Simulation-only: strictly increments counters and updates simulated workload metrics.
   * Never executes arbitrary JavaScript or functions.
   * @param {Object} [payload={}]
   * @param {number} [payload.cycles=1]
   * @param {number} [payload.instructionCount=1]
   * @param {number|string} [payload.pid]
   * @param {number} [payload.utilization]
   * @returns {{ success: boolean, data?: Object, error?: string }}
   */
  executeWorkload(payload = {}) {
    if (this.status !== DeviceStatus.READY && this.status !== DeviceStatus.BUSY) {
      return { success: false, error: `CPU device is not ready (current status: ${this.status})` };
    }

    const cycles = typeof payload.cycles === 'number' && payload.cycles > 0 ? Math.floor(payload.cycles) : 1;
    const instructionCount = typeof payload.instructionCount === 'number' && payload.instructionCount > 0 ? Math.floor(payload.instructionCount) : 1;

    this.instructionsExecuted += instructionCount;

    if (payload.pid !== undefined && payload.pid !== null) {
      this.currentProcess = payload.pid;
    }

    if (typeof payload.utilization === 'number' && !isNaN(payload.utilization)) {
      this.setUtilization(payload.utilization);
    }

    return {
      success: true,
      data: {
        executedCycles: cycles,
        instructionsExecuted: instructionCount,
        totalInstructions: this.instructionsExecuted,
        currentProcess: this.currentProcess,
        utilization: this.utilization
      }
    };
  }

  /**
   * Return a safe, serializable deep snapshot of CPU state.
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
      cores: this.cores,
      architecture: this.architecture,
      frequencyMHz: this.frequencyMHz,
      utilization: this.utilization,
      currentProcess: this.currentProcess,
      instructionsExecuted: this.instructionsExecuted
    }));
  }
}
