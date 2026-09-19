/**
 * Shortest Remaining Time First (SRTF) CPU Scheduling Engine
 * Preemptive variant of SJF where the currently executing process can be preempted
 * if a new process arrives with a shorter remaining CPU burst time.
 */

import { BaseCpuEngine } from './baseCpuEngine.js';

export class SrtfEngine extends BaseCpuEngine {
  constructor() {
    super('srtf', 'Shortest Remaining Time First (SRTF - Preemptive)', { isPreemptive: true });
  }

  getComplexity() {
    return {
      time: 'O(n^2)',
      space: 'O(n)',
      description: 'At each scheduling event or arrival, scanning for the minimum remaining time takes O(n), giving O(n^2) or O(n log n) with a min-heap.'
    };
  }

  getPresets() {
    return [
      {
        name: 'Preemption in Action',
        description: 'P1 arrives first with a long burst, but is immediately preempted by shorter incoming jobs.',
        data: {
          processes: [
            { id: 'P1', arrivalTime: 0, burstTime: 8 },
            { id: 'P2', arrivalTime: 1, burstTime: 4 },
            { id: 'P3', arrivalTime: 2, burstTime: 9 },
            { id: 'P4', arrivalTime: 3, burstTime: 5 }
          ]
        }
      },
      {
        name: 'High Frequency Preemption',
        description: 'Processes arriving in descending order of burst time causing repeated preemptions.',
        data: {
          processes: [
            { id: 'P1', arrivalTime: 0, burstTime: 10 },
            { id: 'P2', arrivalTime: 2, burstTime: 5 },
            { id: 'P3', arrivalTime: 4, burstTime: 2 }
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
      newlyArrived.sort((a, b) => a.inputOrder - b.inputOrder);

      for (const p of newlyArrived) {
        p.state = 'READY';
        readyQueue.push(p);
      }

      // 2. Preemption evaluation & process dispatch:
      // A newly arrived process preempts the currently running process ONLY when its
      // remainingTime is strictly smaller than the current process's remainingTime.
      // If remaining times are equal, the currently running process remains running.
      if (currentRunning) {
        let bestPreemptor = null;
        for (const p of readyQueue) {
          if (p.remainingTime < currentRunning.remainingTime) {
            if (
              !bestPreemptor ||
              p.remainingTime < bestPreemptor.remainingTime ||
              (p.remainingTime === bestPreemptor.remainingTime && p.arrivalTime < bestPreemptor.arrivalTime) ||
              (p.remainingTime === bestPreemptor.remainingTime && p.arrivalTime === bestPreemptor.arrivalTime && p.inputOrder < bestPreemptor.inputOrder)
            ) {
              bestPreemptor = p;
            }
          }
        }

        if (bestPreemptor) {
          currentRunning.state = 'READY';
          readyQueue.push(currentRunning);

          const idx = readyQueue.findIndex(p => p.id === bestPreemptor.id);
          readyQueue.splice(idx, 1);

          currentRunning = bestPreemptor;
          currentRunning.state = 'RUNNING';
          if (currentRunning.firstStartTime === null) {
            currentRunning.firstStartTime = currentTime;
          }
        }
      } else if (readyQueue.length > 0) {
        // CPU was idle: select candidate with minimum remainingTime from readyQueue
        readyQueue.sort((a, b) => {
          if (a.remainingTime !== b.remainingTime) {
            return a.remainingTime - b.remainingTime;
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
        actionLog = `Process ${currentRunning.id} running on CPU (Remaining: ${currentRunning.remainingTime}).`;
        educationalNote = `SRTF selects ${currentRunning.id} because it has the shortest remaining burst time (${currentRunning.remainingTime}).`;
      } else {
        actionLog = 'CPU is idle. No processes ready to execute.';
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
        educationalNote: 'Simulation complete. Preemption minimized waiting time for short jobs.'
      })
    );

    const metrics = this.calculateMetrics(processes, currentTime, totalBusyTime, ganttChart);

    return this.formatResult({
      parameters: { isPreemptive: true },
      snapshots,
      metrics
    });
  }
}
