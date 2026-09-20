/**
 * SchedulerManager
 * Pure adapter over the 6 existing CPU scheduling engines.
 * Does NOT implement any scheduling algorithms internally.
 * Preserves existing engine behavior, validation, and contracts.
 */

import {
  fcfsEngine,
  sjfEngine,
  srtfEngine,
  roundRobinEngine,
  priorityNonPreemptiveEngine,
  priorityPreemptiveEngine
} from '../../engines/cpu/index.js';
import { OSEvents } from './OSEventEmitter.js';

export const SchedulerAlgorithm = Object.freeze({
  FCFS: 'FCFS',
  SJF: 'SJF',
  SRTF: 'SRTF',
  ROUND_ROBIN: 'RR',
  RR: 'RR',
  PRIORITY_NON_PREEMPTIVE: 'PRIORITY_NON_PREEMPTIVE',
  PRIORITY_PREEMPTIVE: 'PRIORITY_PREEMPTIVE'
});

export class SchedulerManager {
  constructor(kernel) {
    this.kernel = kernel;

    // Registry of existing engine instances
    this.engines = new Map([
      ['FCFS', fcfsEngine],
      ['SJF', sjfEngine],
      ['SRTF', srtfEngine],
      ['RR', roundRobinEngine],
      ['ROUND_ROBIN', roundRobinEngine],
      ['PRIORITY_NON_PREEMPTIVE', priorityNonPreemptiveEngine],
      ['PRIORITY_PREEMPTIVE', priorityPreemptiveEngine]
    ]);

    this.reset();
  }

  /**
   * Reset scheduler to default FCFS state.
   */
  reset() {
    this.activeAlgorithmName = 'FCFS';
    this.activeEngine = fcfsEngine;
    this.options = {};
    if (this.kernel && this.kernel.state) {
      this.kernel.state.cpu.activeAlgorithm = 'FCFS';
    }
  }

  /**
   * Set active CPU scheduling algorithm and options.
   * @param {string} name
   * @param {Object} [options={}]
   * @returns {{ success: boolean, data?: Object, error?: string }}
   */
  setAlgorithm(name, options = {}) {
    const normalizedName = String(name || '').trim().toUpperCase();
    const engine = this.engines.get(normalizedName);

    if (!engine) {
      const validNames = Array.from(new Set(this.engines.keys()));
      return {
        success: false,
        error: `Unknown CPU scheduling algorithm "${name}". Supported: ${validNames.join(', ')}`
      };
    }

    this.activeAlgorithmName = normalizedName;
    this.activeEngine = engine;
    this.options = { ...options };

    if (this.kernel && this.kernel.state) {
      this.kernel.state.cpu.activeAlgorithm = normalizedName;
    }

    if (this.kernel && this.kernel.events) {
      this.kernel.events.emit(OSEvents.CPU_ALGORITHM_CHANGED, {
        algorithm: normalizedName,
        options: { ...this.options }
      });
    }

    return {
      success: true,
      data: {
        algorithm: normalizedName,
        options: { ...this.options }
      }
    };
  }

  /**
   * Get active scheduling algorithm details.
   * @returns {{ algorithm: string, engineName: string, options: Object }}
   */
  getAlgorithm() {
    return {
      algorithm: this.activeAlgorithmName,
      engineName: this.activeEngine.name,
      options: { ...this.options }
    };
  }

  /**
   * Run the active CPU scheduling engine over a workload.
   * Pure delegation to existing engine's run() method.
   * @param {Array<Object>} processes
   * @param {Object} [runtimeOptions={}]
   * @returns {{ success: boolean, data?: Object, error?: string }}
   */
  schedule(processes, runtimeOptions = {}) {
    if (!Array.isArray(processes) || processes.length === 0) {
      return { success: false, error: 'Processes array must be non-empty for CPU scheduling' };
    }

    const payload = {
      processes: processes.map(p => ({
        id: String(p.id ?? p.pid),
        arrivalTime: Number(p.arrivalTime ?? 0),
        burstTime: Number(p.burstTime ?? p.remainingTime ?? 1),
        priority: p.priority !== undefined ? Number(p.priority) : 1
      })),
      ...this.options,
      ...runtimeOptions
    };

    try {
      const result = this.activeEngine.run(payload);

      if (this.kernel && this.kernel.hardware) {
        const cpu = this.kernel.hardware.getDevice('cpu0');
        if (cpu && result.metrics && typeof result.metrics.cpuUtilization === 'number') {
          cpu.setUtilization(result.metrics.cpuUtilization);
          cpu.executeWorkload({
            cycles: result.metrics.totalBurstTime || 1,
            instructionCount: payload.processes.length,
            utilization: result.metrics.cpuUtilization
          });
        }
      }

      if (this.kernel && this.kernel.events) {
        this.kernel.events.emit(OSEvents.CPU_SCHEDULED, {
          algorithm: this.activeAlgorithmName,
          metrics: result.metrics
        });
      }

      return { success: true, data: result };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }
}
