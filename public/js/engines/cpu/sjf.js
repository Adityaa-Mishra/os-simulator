/**
 * Shortest Job First (SJF) CPU Scheduling Engine
 * Non-preemptive algorithm that associates with each process the length of its next CPU burst.
 * When the CPU is available, it is assigned to the process that has the smallest CPU burst.
 */

import { BaseCpuEngine } from './baseCpuEngine.js';

export class SjfEngine extends BaseCpuEngine {
  constructor() {
    super('sjf', 'Shortest Job First (SJF - Non-preemptive)', { isPreemptive: false });
  }

  getComplexity() {
    return {
      time: 'O(n^2)',
      space: 'O(n)',
      description: 'Selecting the minimum burst time among ready processes takes O(n) per scheduling decision, yielding O(n^2) overall without a priority queue.'
    };
  }

  getPresets() {
    return [
      {
        name: 'Standard SJF Workload',
        description: 'Demonstrates optimal waiting time among non-preemptive algorithms.',
        data: {
          processes: [
            { id: 'P1', arrivalTime: 0, burstTime: 7 },
            { id: 'P2', arrivalTime: 2, burstTime: 4 },
            { id: 'P3', arrivalTime: 4, burstTime: 1 },
            { id: 'P4', arrivalTime: 5, burstTime: 4 }
          ]
        }
      },
      {
        name: 'Simultaneous Arrivals with Ties',
        description: 'All processes arrive at t=0, testing burst time ordering and tie-breaking.',
        data: {
          processes: [
            { id: 'P1', arrivalTime: 0, burstTime: 6 },
            { id: 'P2', arrivalTime: 0, burstTime: 2 },
            { id: 'P3', arrivalTime: 0, burstTime: 8 },
            { id: 'P4', arrivalTime: 0, burstTime: 2 }
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
      // 1. Collect newly arrived processes
      const newlyArrived = processes.filter(
        p => p.arrivalTime === currentTime && p.state === 'NOT_ARRIVED'
      );
      newlyArrived.sort((a, b) => a.inputOrder - b.inputOrder);

      for (const p of newlyArrived) {
        p.state = 'READY';
        readyQueue.push(p);
      }

      // 2. If CPU is idle, select process with shortest burst time from readyQueue
      if (!currentRunning && readyQueue.length > 0) {
        // Sort ready queue: shortest burstTime, then earliest arrivalTime, then inputOrder
        readyQueue.sort((a, b) => {
          if (a.burstTime !== b.burstTime) {
            return a.burstTime - b.burstTime;
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

      // 3. Create snapshot
      let actionLog = '';
      let educationalNote = '';

      if (currentRunning) {
        actionLog = `Process ${currentRunning.id} (Burst: ${currentRunning.burstTime}) executing on CPU.`;
        educationalNote = `Non-preemptive SJF selected ${currentRunning.id} as it had the shortest total burst time (${currentRunning.burstTime}) when CPU became available.`;
      } else {
        actionLog = 'CPU is idle. No processes ready to execute.';
        educationalNote = 'CPU remains idle until the next process arrival.';
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
            state: 'TERMINATED'
          }))
        },
        actionLog: `All ${totalProcesses} processes completed at time ${currentTime}.`,
        educationalNote: 'Simulation complete. Notice minimal average waiting time for this non-preemptive workload.'
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
