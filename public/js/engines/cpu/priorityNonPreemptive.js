/**
 * Priority Scheduling (Non-preemptive) CPU Engine
 * A priority is associated with each process, and the CPU is allocated to the process
 * with the highest priority (lowest integer value = highest priority).
 * Non-preemptive: once a process starts executing, it runs to completion.
 */

import { BaseCpuEngine } from './baseCpuEngine.js';

export class PriorityNonPreemptiveEngine extends BaseCpuEngine {
  constructor() {
    super('priority_non_preemptive', 'Priority Scheduling (Non-preemptive)', {
      isPreemptive: false,
      requiresPriority: true
    });
  }

  getComplexity() {
    return {
      time: 'O(n^2)',
      space: 'O(n)',
      description: 'Finding the maximum priority (lowest integer) among ready processes takes O(n) per scheduling decision.'
    };
  }

  getPresets() {
    return [
      {
        name: 'Standard Priority (Lower number = Higher Priority)',
        description: 'Processes with varying priorities and arrival times.',
        data: {
          processes: [
            { id: 'P1', arrivalTime: 0, burstTime: 4, priority: 3 },
            { id: 'P2', arrivalTime: 1, burstTime: 3, priority: 1 },
            { id: 'P3', arrivalTime: 2, burstTime: 2, priority: 2 }
          ]
        }
      },
      {
        name: 'Simultaneous Arrivals with Priority Inversion Risk',
        description: 'All processes arrive at t=0 with contrasting priorities and burst times.',
        data: {
          processes: [
            { id: 'P1', arrivalTime: 0, burstTime: 10, priority: 4 },
            { id: 'P2', arrivalTime: 0, burstTime: 2, priority: 1 },
            { id: 'P3', arrivalTime: 0, burstTime: 3, priority: 2 }
          ]
        }
      }
    ];
  }

  run(inputs) {
    const validation = this.validate(inputs);
    if (!validation.isValid) {
      throw new Error(validation.error);
    }

    const processes = this.initializeProcesses(inputs.processes);
    const totalProcesses = processes.length;

    const readyQueue = [];
    const completedProcesses = [];
    const snapshots = [];
    const ganttChart = [];

    let currentTime = 0;
    let currentRunning = null;
    let totalBusyTime = 0;
    let stepIndex = 0;

    while (completedProcesses.length < totalProcesses) {
      // 1. Newly arrived processes at currentTime
      const newlyArrived = processes.filter(
        p => p.arrivalTime === currentTime && p.state === 'NOT_ARRIVED'
      );
      newlyArrived.sort((a, b) => a.inputOrder - b.inputOrder);

      for (const p of newlyArrived) {
        p.state = 'READY';
        readyQueue.push(p);
      }

      // 2. If CPU is idle, select highest priority (lowest integer) from readyQueue
      if (!currentRunning && readyQueue.length > 0) {
        readyQueue.sort((a, b) => {
          if (a.priority !== b.priority) {
            return a.priority - b.priority;
          }
          if (a.arrivalTime !== b.arrivalTime) {
            return a.arrivalTime - b.arrivalTime;
          }
          return a.inputOrder - b.inputOrder;
        });

        currentRunning = readyQueue.shift();
        currentRunning.state = 'RUNNING';
        if (currentRunning.firstStartTime === null) {
          currentRunning.firstStartTime = currentTime;
        }
      }

      // 3. Snapshot for currentTime
      let actionLog = '';
      let educationalNote = '';

      if (currentRunning) {
        actionLog = `Process ${currentRunning.id} (Priority: ${currentRunning.priority}) running on CPU.`;
        educationalNote = `Non-preemptive Priority scheduled ${currentRunning.id} because it had the highest priority (${currentRunning.priority}, lower integer = higher priority).`;
      } else {
        actionLog = 'CPU is idle. Ready queue is empty.';
        educationalNote = 'CPU remains idle until the next arrival.';
      }

      snapshots.push(
        this.createSnapshot({
          stepIndex: stepIndex++,
          timeUnit: currentTime,
          activeUnit: currentRunning ? currentRunning.id : null,
          state: {
            readyQueue: readyQueue.map(p => p.id),
            runningProcess: currentRunning ? currentRunning.id : null,
            completedProcesses: completedProcesses.map(p => p.id),
            processes: processes.map(p => ({
              id: p.id,
              arrivalTime: p.arrivalTime,
              burstTime: p.burstTime,
              remainingTime: p.remainingTime,
              priority: p.priority,
              state: p.state
            }))
          },
          actionLog,
          educationalNote
        })
      );

      // 4. Advance execution by 1 time unit
      if (currentRunning) {
        totalBusyTime += 1;
        currentRunning.remainingTime -= 1;

        const lastGantt = ganttChart[ganttChart.length - 1];
        if (lastGantt && lastGantt.processId === currentRunning.id && lastGantt.end === currentTime) {
          lastGantt.end += 1;
        } else {
          ganttChart.push({ processId: currentRunning.id, start: currentTime, end: currentTime + 1 });
        }

        if (currentRunning.remainingTime === 0) {
          currentRunning.completionTime = currentTime + 1;
          currentRunning.state = 'TERMINATED';
          completedProcesses.push(currentRunning);
          currentRunning = null;
        }
      } else {
        const lastGantt = ganttChart[ganttChart.length - 1];
        if (lastGantt && lastGantt.processId === null && lastGantt.end === currentTime) {
          lastGantt.end += 1;
        } else {
          ganttChart.push({ processId: null, start: currentTime, end: currentTime + 1 });
        }
      }

      currentTime += 1;
    }

    // Final completion snapshot
    snapshots.push(
      this.createSnapshot({
        stepIndex: stepIndex++,
        timeUnit: currentTime,
        activeUnit: null,
        state: {
          readyQueue: [],
          runningProcess: null,
          completedProcesses: completedProcesses.map(p => p.id),
          processes: processes.map(p => ({
            id: p.id,
            arrivalTime: p.arrivalTime,
            burstTime: p.burstTime,
            remainingTime: 0,
            priority: p.priority,
            state: 'TERMINATED'
          }))
        },
        actionLog: `All ${totalProcesses} processes completed at time ${currentTime}.`,
        educationalNote: 'Simulation complete. Processes executed strictly according to assigned priorities.'
      })
    );

    const metrics = this.calculateMetrics(processes, currentTime, totalBusyTime, ganttChart);

    return this.formatResult({
      parameters: { isPreemptive: false },
      snapshots,
      metrics
    });
  }
}
