/**
 * First-Come, First-Served (FCFS) CPU Scheduling Engine
 * Non-preemptive scheduling where the process that requests the CPU first
 * is allocated the CPU first.
 */

import { BaseCpuEngine } from './baseCpuEngine.js';

export class FcfsEngine extends BaseCpuEngine {
  constructor() {
    super('fcfs', 'First-Come, First-Served (FCFS)', { isPreemptive: false });
  }

  getComplexity() {
    return {
      time: 'O(n log n)',
      space: 'O(n)',
      description: 'Sorting processes by arrival time takes O(n log n); execution and queue management run in O(n) time.'
    };
  }

  getPresets() {
    return [
      {
        name: 'Standard Workload',
        description: 'Three processes arriving closely with varying burst times.',
        data: {
          processes: [
            { id: 'P1', arrivalTime: 0, burstTime: 4 },
            { id: 'P2', arrivalTime: 1, burstTime: 3 },
            { id: 'P3', arrivalTime: 2, burstTime: 1 }
          ]
        }
      },
      {
        name: 'Convoy Effect',
        description: 'A long burst process arrives first, delaying subsequent shorter processes.',
        data: {
          processes: [
            { id: 'P1', arrivalTime: 0, burstTime: 12 },
            { id: 'P2', arrivalTime: 1, burstTime: 2 },
            { id: 'P3', arrivalTime: 2, burstTime: 1 }
          ]
        }
      },
      {
        name: 'CPU Idle Periods',
        description: 'Arrival times with gaps producing idle CPU cycles.',
        data: {
          processes: [
            { id: 'P1', arrivalTime: 2, burstTime: 2 },
            { id: 'P2', arrivalTime: 6, burstTime: 3 }
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
      // 1. Check newly arrived processes at currentTime
      const newlyArrived = processes.filter(
        p => p.arrivalTime === currentTime && p.state === 'NOT_ARRIVED'
      );
      // Sort simultaneous arrivals by input order
      newlyArrived.sort((a, b) => a.inputOrder - b.inputOrder);

      for (const p of newlyArrived) {
        p.state = 'READY';
        readyQueue.push(p);
      }

      // 2. If CPU is idle, pick next process from head of readyQueue
      if (!currentRunning && readyQueue.length > 0) {
        currentRunning = readyQueue.shift();
        currentRunning.state = 'RUNNING';
        if (currentRunning.firstStartTime === null) {
          currentRunning.firstStartTime = currentTime;
        }
      }

      // 3. Generate snapshot for current state at currentTime
      let actionLog = '';
      let educationalNote = '';

      if (currentRunning) {
        actionLog = `Process ${currentRunning.id} running on CPU (Remaining: ${currentRunning.remainingTime}).`;
        educationalNote = `FCFS schedules processes strictly in order of arrival. ${currentRunning.id} retains CPU until completion.`;
      } else {
        actionLog = 'CPU is idle. Waiting for incoming process arrivals.';
        educationalNote = 'No processes are in the ready queue at this time unit.';
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

        // Record in Gantt chart
        const lastGantt = ganttChart[ganttChart.length - 1];
        if (lastGantt && lastGantt.processId === currentRunning.id && lastGantt.end === currentTime) {
          lastGantt.end += 1;
        } else {
          ganttChart.push({ processId: currentRunning.id, start: currentTime, end: currentTime + 1 });
        }

        // Check if process finished
        if (currentRunning.remainingTime === 0) {
          currentRunning.completionTime = currentTime + 1;
          currentRunning.state = 'TERMINATED';
          completedProcesses.push(currentRunning);
          currentRunning = null;
        }
      } else {
        // Record Idle in Gantt chart
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
        educationalNote: 'Simulation complete. Review turnaround and waiting time metrics.'
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
