/**
 * BaseCpuEngine
 * Extends BaseSimulationEngine with shared CPU validation,
 * snapshot management, and standard metrics computation.
 */

import { BaseSimulationEngine } from '../../core/simulationEngine.js';

export class BaseCpuEngine extends BaseSimulationEngine {
  constructor(algorithmId, name, options = {}) {
    super('cpu', algorithmId, name);
    this.isPreemptive = options.isPreemptive || false;
    this.requiresQuantum = options.requiresQuantum || false;
    this.requiresPriority = options.requiresPriority || false;
  }

  /**
   * Validate CPU simulation inputs.
   */
  validate(inputs) {
    if (!inputs || typeof inputs !== 'object') {
      return { isValid: false, error: 'Input configuration must be an object' };
    }

    if (!Array.isArray(inputs.processes) || inputs.processes.length === 0) {
      return { isValid: false, error: 'At least one process must be provided in the processes array' };
    }

    const seenIds = new Set();

    for (let i = 0; i < inputs.processes.length; i++) {
      const p = inputs.processes[i];

      if (p.id === undefined || p.id === null || String(p.id).trim() === '') {
        return { isValid: false, error: `Process at index ${i} has an invalid or missing ID` };
      }

      const idStr = String(p.id).trim();
      if (seenIds.has(idStr)) {
        return { isValid: false, error: `Duplicate process ID detected: "${idStr}"` };
      }
      seenIds.add(idStr);

      if (typeof p.arrivalTime !== 'number' || isNaN(p.arrivalTime) || p.arrivalTime < 0) {
        return { isValid: false, error: `Process "${idStr}" must have a non-negative arrivalTime (>= 0)` };
      }

      if (typeof p.burstTime !== 'number' || isNaN(p.burstTime) || p.burstTime <= 0) {
        return { isValid: false, error: `Process "${idStr}" must have a positive burstTime (> 0)` };
      }

      if (this.requiresPriority) {
        if (typeof p.priority !== 'number' || isNaN(p.priority)) {
          return { isValid: false, error: `Process "${idStr}" requires a numeric priority` };
        }
      }
    }

    if (this.requiresQuantum) {
      if (typeof inputs.quantum !== 'number' || isNaN(inputs.quantum) || inputs.quantum <= 0) {
        return { isValid: false, error: 'Round Robin requires a positive time quantum (> 0)' };
      }
    }

    return { isValid: true };
  }

  /**
   * Calculate standard CPU performance metrics.
   *
   * Formulations:
   * Elapsed Simulation Time = Final Completion Time - Earliest Arrival Time
   * Turnaround Time (TAT)   = Completion Time (CT) - Arrival Time (AT)
   * Waiting Time (WT)       = Turnaround Time (TAT) - Burst Time (BT)
   * Response Time (RT)      = First Start Time (ST) - Arrival Time (AT)
   * CPU Utilization (%)     = (Total Busy Time / Elapsed Simulation Time) * 100
   * Throughput              = Total Processes / Elapsed Simulation Time
   */
  calculateMetrics(processes, totalTime, totalBusyTime, ganttChart) {
    const n = processes.length;
    let totalTAT = 0;
    let totalWT = 0;
    let totalRT = 0;

    const earliestArrivalTime = Math.min(...processes.map(p => p.arrivalTime));
    const elapsedSimulationTime = totalTime - earliestArrivalTime;
    const safeElapsedTime = elapsedSimulationTime > 0 ? elapsedSimulationTime : 1;

    const processMetrics = processes.map(p => {
      const completionTime = p.completionTime;
      const turnaroundTime = completionTime - p.arrivalTime;
      const waitingTime = turnaroundTime - p.burstTime;
      const responseTime = p.firstStartTime - p.arrivalTime;

      totalTAT += turnaroundTime;
      totalWT += waitingTime;
      totalRT += responseTime;

      return {
        id: p.id,
        arrivalTime: p.arrivalTime,
        burstTime: p.burstTime,
        priority: p.priority ?? null,
        firstStartTime: p.firstStartTime,
        completionTime,
        turnaroundTime,
        waitingTime,
        responseTime
      };
    });

    const cpuUtilization = Math.round(((totalBusyTime / safeElapsedTime) * 100) * 100) / 100;
    const throughput = Math.round((n / safeElapsedTime) * 1000) / 1000;

    const averageTurnaroundTime = Math.round((totalTAT / n) * 100) / 100;
    const averageWaitingTime = Math.round((totalWT / n) * 100) / 100;
    const averageResponseTime = Math.round((totalRT / n) * 100) / 100;

    return {
      processMetrics,
      ganttChart,
      totalTime,
      earliestArrivalTime,
      elapsedSimulationTime,
      totalBusyTime,
      idleTime: totalTime - totalBusyTime,
      cpuUtilization,
      throughput,
      averageTurnaroundTime,
      averageWaitingTime,
      averageResponseTime
    };
  }

  /**
   * Helper to initialize internal process models from inputs.
   */
  initializeProcesses(inputProcesses) {
    return inputProcesses.map((p, idx) => ({
      id: String(p.id).trim(),
      arrivalTime: Number(p.arrivalTime),
      burstTime: Number(p.burstTime),
      remainingTime: Number(p.burstTime),
      priority: p.priority !== undefined ? Number(p.priority) : null,
      inputOrder: idx,
      firstStartTime: null,
      completionTime: null,
      state: 'NOT_ARRIVED' // 'NOT_ARRIVED' | 'READY' | 'RUNNING' | 'TERMINATED'
    }));
  }
}
