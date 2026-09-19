/**
 * PcbSimulatorEngine
 * Simulates Operating System Process Management:
 * Process creation, Process Control Block (PCB) tracking,
 * 5-state transitions (NEW, READY, RUNNING, WAITING, TERMINATED),
 * ready & waiting queues, context switching, and I/O wait cycles.
 */

import { BaseSimulationEngine } from '../../core/simulationEngine.js';

export class PcbSimulatorEngine extends BaseSimulationEngine {
  constructor() {
    super('process', 'process_pcb', 'Process Lifecycle & PCB Management');
  }

  getComplexity() {
    return {
      time: 'O(n * total_burst_time)',
      space: 'O(n * total_burst_time)',
      description: 'The simulation evaluates process states and queue transitions unit-by-unit, recording an immutable snapshot at each discrete time step.'
    };
  }

  getPresets() {
    return [
      {
        name: 'Basic 3-Process Lifecycle',
        description: 'Demonstrates standard NEW -> READY -> RUNNING -> TERMINATED lifecycle with staggered arrivals.',
        data: {
          processes: [
            { id: 'P1', arrivalTime: 0, burstTime: 3, priority: 1 },
            { id: 'P2', arrivalTime: 1, burstTime: 2, priority: 2 },
            { id: 'P3', arrivalTime: 2, burstTime: 4, priority: 3 }
          ]
        }
      },
      {
        name: 'I/O Blocked & Waiting State',
        description: 'Processes requesting I/O transition to WAITING and return to READY upon I/O completion.',
        data: {
          processes: [
            {
              id: 'P1',
              arrivalTime: 0,
              burstTime: 5,
              priority: 1,
              ioBursts: [{ start: 2, duration: 2 }] // After 2 units of CPU, blocks for 2 units of I/O
            },
            {
              id: 'P2',
              arrivalTime: 1,
              burstTime: 3,
              priority: 2
            }
          ]
        }
      },
      {
        name: 'Context Switch Demonstration',
        description: 'Multiple processes yielding the CPU and generating measurable context switch events.',
        data: {
          processes: [
            {
              id: 'P1',
              arrivalTime: 0,
              burstTime: 4,
              priority: 1,
              ioBursts: [{ start: 1, duration: 3 }]
            },
            {
              id: 'P2',
              arrivalTime: 0,
              burstTime: 2,
              priority: 2
            },
            {
              id: 'P3',
              arrivalTime: 2,
              burstTime: 3,
              priority: 3
            }
          ]
        }
      }
    ];
  }

  /**
   * Validate process inputs.
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

      if (p.priority !== undefined && (typeof p.priority !== 'number' || isNaN(p.priority))) {
        return { isValid: false, error: `Process "${idStr}" has an invalid priority value` };
      }

      if (p.ioBursts !== undefined) {
        if (!Array.isArray(p.ioBursts)) {
          return { isValid: false, error: `Process "${idStr}" ioBursts must be an array` };
        }

        let lastStart = 0;
        for (let j = 0; j < p.ioBursts.length; j++) {
          const io = p.ioBursts[j];
          if (!io || typeof io !== 'object') {
            return { isValid: false, error: `Process "${idStr}" I/O burst at index ${j} must be an object` };
          }
          if (typeof io.start !== 'number' || isNaN(io.start) || io.start < 1 || io.start >= p.burstTime) {
            return { isValid: false, error: `Process "${idStr}" I/O start must be between 1 and burstTime - 1 (${p.burstTime - 1})` };
          }
          if (typeof io.duration !== 'number' || isNaN(io.duration) || io.duration < 1) {
            return { isValid: false, error: `Process "${idStr}" I/O duration must be a positive integer (>= 1)` };
          }
          if (j > 0 && io.start <= lastStart) {
            return { isValid: false, error: `Process "${idStr}" multiple I/O bursts must have strictly ascending start times` };
          }
          lastStart = io.start;
        }
      }
    }

    return { isValid: true };
  }

  /**
   * Initialize educational Process Control Blocks (PCBs).
   */
  initializePcbs(inputProcesses) {
    return inputProcesses.map((p, idx) => {
      const id = String(p.id).trim();
      const arrivalTime = Number(p.arrivalTime);
      const burstTime = Number(p.burstTime);
      const priority = p.priority !== undefined ? Number(p.priority) : idx + 1;

      const ioBursts = Array.isArray(p.ioBursts)
        ? p.ioBursts.map(io => ({
            start: Number(io.start),
            duration: Number(io.duration),
            remainingDuration: Number(io.duration),
            completed: false
          })).sort((a, b) => a.start - b.start)
        : [];

      return {
        id,
        pid: 100 + idx + 1, // Educational PID e.g. 101, 102
        parentPid: 1,       // Simulated init/systemd root process
        state: 'NEW',       // 'NEW' | 'READY' | 'RUNNING' | 'WAITING' | 'TERMINATED'
        programCounter: 0,
        registers: {
          AX: 0,
          BX: priority * 10,
          IP: 0
        },
        arrivalTime,
        burstTime,
        remainingTime: burstTime,
        executedTime: 0,
        priority,
        ioBursts,
        inputOrder: idx,
        firstStartTime: null,
        completionTime: null,
        waitingTime: 0,
        turnaroundTime: 0,
        responseTime: 0
      };
    });
  }

  /**
   * Execute deterministic process lifecycle simulation.
   */
  run(inputs) {
    const validation = this.validate(inputs);
    if (!validation.isValid) {
      throw new Error(validation.error);
    }

    const pcbs = this.initializePcbs(inputs.processes);
    const totalProcesses = pcbs.length;

    const readyQueue = [];
    const waitingQueue = [];
    const terminatedProcesses = [];
    const snapshots = [];
    const eventsLog = [];

    let currentTime = 0;
    let currentRunning = null;
    let totalBusyTime = 0;
    let contextSwitches = 0;
    let lastRunningProcessId = null;
    let stepIndex = 0;

    while (terminatedProcesses.length < totalProcesses) {
      // 1. Process Arrivals: NEW -> READY
      const arriving = pcbs.filter(
        p => p.arrivalTime === currentTime && p.state === 'NEW'
      );
      arriving.sort((a, b) => a.inputOrder - b.inputOrder);

      for (const p of arriving) {
        p.state = 'READY';
        readyQueue.push(p);
        eventsLog.push(`t=${currentTime}: ${p.id} arrived and transitioned NEW → READY (PID: ${p.pid}).`);
      }

      // 2. Dispatch / CPU Scheduling (Deterministic FCFS within Ready Queue)
      if (!currentRunning && readyQueue.length > 0) {
        currentRunning = readyQueue.shift();
        currentRunning.state = 'RUNNING';

        if (currentRunning.firstStartTime === null) {
          currentRunning.firstStartTime = currentTime;
        }

        // Context switch accounting:
        // A context switch occurs when the CPU transitions from one process directly or indirectly to another process.
        // Initial dispatch from idle at simulation start is not counted as a context switch.
        if (lastRunningProcessId !== null && lastRunningProcessId !== currentRunning.id) {
          contextSwitches += 1;
          eventsLog.push(`t=${currentTime}: Context switch: ${lastRunningProcessId} → ${currentRunning.id}.`);
        }

        eventsLog.push(`t=${currentTime}: ${currentRunning.id} dispatched to CPU (READY → RUNNING).`);
      }

      // 3. Generate Snapshot for current time step (Deep copy state)
      let actionLog = '';
      let educationalNote = '';

      if (currentRunning) {
        actionLog = `Process ${currentRunning.id} (PID: ${currentRunning.pid}) executing on CPU. PC: ${currentRunning.programCounter}, Remaining: ${currentRunning.remainingTime}.`;
        educationalNote = `Process ${currentRunning.id} is in RUNNING state. Its PCB updates program counter and simulated registers at each clock tick.`;
      } else {
        actionLog = 'CPU is idle. No processes ready in queue.';
        educationalNote = waitingQueue.length > 0
          ? `${waitingQueue.length} process(es) are in WAITING state pending I/O completion.`
          : 'CPU idle cycles occur when no processes have arrived or all arrived processes are blocked.';
      }

      snapshots.push(
        this.createSnapshot({
          stepIndex: stepIndex++,
          timeUnit: currentTime,
          activeUnit: currentRunning ? currentRunning.id : null,
          state: {
            processes: pcbs.map(p => ({
              id: p.id,
              pid: p.pid,
              parentPid: p.parentPid,
              state: p.state,
              programCounter: p.programCounter,
              registers: { ...p.registers },
              arrivalTime: p.arrivalTime,
              burstTime: p.burstTime,
              remainingTime: p.remainingTime,
              executedTime: p.executedTime,
              priority: p.priority,
              ioBursts: p.ioBursts.map(io => ({ ...io }))
            })),
            readyQueue: readyQueue.map(p => p.id),
            waitingQueue: waitingQueue.map(p => p.id),
            runningProcess: currentRunning ? currentRunning.id : null,
            terminatedProcesses: terminatedProcesses.map(p => p.id),
            contextSwitches
          },
          actionLog,
          educationalNote
        })
      );

      // 4. Execute 1 time unit [currentTime, currentTime + 1)
      // 4a. CPU execution
      if (currentRunning) {
        totalBusyTime += 1;
        currentRunning.remainingTime -= 1;
        currentRunning.executedTime += 1;
        currentRunning.programCounter += 4; // Simulated 4-byte instruction step
        currentRunning.registers.AX += 1;
        currentRunning.registers.IP = currentRunning.programCounter;

        lastRunningProcessId = currentRunning.id;
      }

      // 4b. I/O execution for waiting queue processes during this tick
      const stillWaiting = [];
      const completedIo = [];
      for (const p of waitingQueue) {
        const activeIo = p.ioBursts.find(io => !io.completed && io.remainingDuration > 0);
        if (activeIo) {
          activeIo.remainingDuration -= 1;
          if (activeIo.remainingDuration === 0) {
            activeIo.completed = true;
            p.state = 'READY';
            completedIo.push(p);
            eventsLog.push(`t=${currentTime + 1}: ${p.id} finished I/O and transitioned WAITING → READY.`);
          } else {
            stillWaiting.push(p);
          }
        } else {
          p.state = 'READY';
          completedIo.push(p);
          eventsLog.push(`t=${currentTime + 1}: ${p.id} transitioned WAITING → READY.`);
        }
      }
      waitingQueue.length = 0;
      waitingQueue.push(...stillWaiting);

      // 4c. Post-execution transitions for currently running process
      if (currentRunning) {
        const pendingIo = currentRunning.ioBursts.find(
          io => !io.completed && io.start === currentRunning.executedTime
        );

        if (pendingIo && currentRunning.remainingTime > 0) {
          currentRunning.state = 'WAITING';
          waitingQueue.push(currentRunning);
          eventsLog.push(`t=${currentTime + 1}: ${currentRunning.id} initiated I/O and transitioned RUNNING → WAITING.`);
          currentRunning = null;
        } else if (currentRunning.remainingTime === 0) {
          // Process Completion: RUNNING -> TERMINATED
          currentRunning.completionTime = currentTime + 1;
          currentRunning.state = 'TERMINATED';
          terminatedProcesses.push(currentRunning);
          eventsLog.push(`t=${currentTime + 1}: ${currentRunning.id} finished execution and transitioned RUNNING → TERMINATED.`);
          currentRunning = null;
        }
      }

      // 4d. Re-enqueue completed I/O processes into ready queue for next tick
      readyQueue.push(...completedIo);

      currentTime += 1;
    }

    // 5. Final Completion Snapshot
    snapshots.push(
      this.createSnapshot({
        stepIndex: stepIndex++,
        timeUnit: currentTime,
        activeUnit: null,
        state: {
          processes: pcbs.map(p => ({
            id: p.id,
            pid: p.pid,
            parentPid: p.parentPid,
            state: 'TERMINATED',
            programCounter: p.programCounter,
            registers: { ...p.registers },
            arrivalTime: p.arrivalTime,
            burstTime: p.burstTime,
            remainingTime: 0,
            executedTime: p.executedTime,
            priority: p.priority,
            ioBursts: p.ioBursts.map(io => ({ ...io }))
          })),
          readyQueue: [],
          waitingQueue: [],
          runningProcess: null,
          terminatedProcesses: terminatedProcesses.map(p => p.id),
          contextSwitches
        },
        actionLog: `All ${totalProcesses} processes reached TERMINATED state at time ${currentTime}.`,
        educationalNote: 'Simulation complete. All PCB resources released and process life cycles concluded.'
      })
    );

    // 6. Calculate Metrics
    const earliestArrivalTime = Math.min(...pcbs.map(p => p.arrivalTime));
    const elapsedSimulationTime = currentTime - earliestArrivalTime;
    const safeElapsedTime = elapsedSimulationTime > 0 ? elapsedSimulationTime : 1;

    let totalTAT = 0;
    let totalWT = 0;
    let totalRT = 0;

    const processMetrics = pcbs.map(p => {
      const turnaroundTime = p.completionTime - p.arrivalTime;
      const totalIoTime = p.ioBursts.reduce((sum, io) => sum + io.duration, 0);
      // Waiting time strictly excludes I/O time: WT = TAT - burstTime - totalIoTime
      const waitingTime = turnaroundTime - p.burstTime - totalIoTime;
      const responseTime = p.firstStartTime - p.arrivalTime;

      totalTAT += turnaroundTime;
      totalWT += waitingTime;
      totalRT += responseTime;

      return {
        id: p.id,
        pid: p.pid,
        arrivalTime: p.arrivalTime,
        burstTime: p.burstTime,
        priority: p.priority,
        totalIoTime,
        firstStartTime: p.firstStartTime,
        completionTime: p.completionTime,
        turnaroundTime,
        waitingTime,
        responseTime
      };
    });

    const cpuUtilization = Math.round(((totalBusyTime / safeElapsedTime) * 100) * 100) / 100;
    const throughput = Math.round((terminatedProcesses.length / safeElapsedTime) * 100) / 100;
    const averageTurnaroundTime = Math.round((totalTAT / totalProcesses) * 100) / 100;
    const averageWaitingTime = Math.round((totalWT / totalProcesses) * 100) / 100;
    const averageResponseTime = Math.round((totalRT / totalProcesses) * 100) / 100;

    const metrics = {
      totalProcesses,
      completedProcesses: terminatedProcesses.length,
      contextSwitches,
      totalExecutionTime: currentTime,
      earliestArrivalTime,
      elapsedSimulationTime,
      cpuBusyTime: totalBusyTime,
      cpuIdleTime: currentTime - totalBusyTime,
      cpuUtilization,
      throughput,
      averageTurnaroundTime,
      averageWaitingTime,
      averageResponseTime,
      processMetrics,
      eventsLog
    };

    return this.formatResult({
      parameters: { model: '5-state-pcb' },
      snapshots,
      metrics
    });
  }
}
