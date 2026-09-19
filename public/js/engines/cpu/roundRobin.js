/**
 * Round Robin (RR) CPU Scheduling Engine
 * Preemptive scheduling algorithm designed especially for time-sharing systems.
 * A small unit of time (time quantum) is allocated to each process in FIFO order.
 */

import { BaseCpuEngine } from './baseCpuEngine.js';

export class RoundRobinEngine extends BaseCpuEngine {
  constructor() {
    super('round_robin', 'Round Robin (RR)', {
      isPreemptive: true,
      requiresQuantum: true
    });
  }

  getComplexity() {
    return {
      time: 'O(n * (max_burst / quantum))',
      space: 'O(n)',
      description: 'Each process is enqueued and dequeued multiple times depending on its burst time and the time quantum.'
    };
  }

  getPresets() {
    return [
      {
        name: 'Standard Round Robin (Q=2)',
        description: 'Classic time sharing with time quantum of 2.',
        data: {
          quantum: 2,
          processes: [
            { id: 'P1', arrivalTime: 0, burstTime: 5 },
            { id: 'P2', arrivalTime: 1, burstTime: 3 },
            { id: 'P3', arrivalTime: 2, burstTime: 1 }
          ]
        }
      },
      {
        name: 'Small Quantum (High Context Switching)',
        description: 'Time quantum of 1, maximizing responsiveness at the expense of frequent preemptions.',
        data: {
          quantum: 1,
          processes: [
            { id: 'P1', arrivalTime: 0, burstTime: 4 },
            { id: 'P2', arrivalTime: 0, burstTime: 4 },
            { id: 'P3', arrivalTime: 0, burstTime: 4 }
          ]
        }
      },
      {
        name: 'Large Quantum (Approaching FCFS)',
        description: 'Time quantum of 10, where all processes finish within their first quantum.',
        data: {
          quantum: 10,
          processes: [
            { id: 'P1', arrivalTime: 0, burstTime: 4 },
            { id: 'P2', arrivalTime: 1, burstTime: 3 },
            { id: 'P3', arrivalTime: 2, burstTime: 1 }
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

    const quantum = Number(inputs.quantum);
    const processes = this.initializeProcesses(inputs.processes);
    const totalProcesses = processes.length;

    const readyQueue = [];
    const completedProcesses = [];
    const snapshots = [];
    const ganttChart = [];

    let currentTime = 0;
    let currentRunning = null;
    let currentQuantumUsed = 0;
    let totalBusyTime = 0;
    let stepIndex = 0;

    while (completedProcesses.length < totalProcesses) {
      // 1. Newly arrived processes at currentTime enter ready queue
      const newlyArrived = processes.filter(
        p => p.arrivalTime === currentTime && p.state === 'NOT_ARRIVED'
      );
      newlyArrived.sort((a, b) => a.inputOrder - b.inputOrder);

      for (const p of newlyArrived) {
        p.state = 'READY';
        readyQueue.push(p);
      }

      // 2. Quantum expiration check:
      // If current process ran for full quantum and still needs time, preempt it.
      // Newly arrived processes at this time unit are already in readyQueue,
      // so the preempted process is appended to the tail behind them.
      if (currentRunning && currentQuantumUsed === quantum) {
        if (currentRunning.remainingTime > 0) {
          currentRunning.state = 'READY';
          readyQueue.push(currentRunning);
          currentRunning = null;
          currentQuantumUsed = 0;
        }
      }

      // 3. If CPU is idle, dispatch head of readyQueue
      if (!currentRunning && readyQueue.length > 0) {
        currentRunning = readyQueue.shift();
        currentRunning.state = 'RUNNING';
        currentQuantumUsed = 0;
        if (currentRunning.firstStartTime === null) {
          currentRunning.firstStartTime = currentTime;
        }
      }

      // 4. Record snapshot for currentTime
      let actionLog = '';
      let educationalNote = '';

      if (currentRunning) {
        actionLog = `Process ${currentRunning.id} running (Quantum: ${currentQuantumUsed + 1}/${quantum}, Remaining: ${currentRunning.remainingTime}).`;
        educationalNote = `Round Robin grants a maximum time quantum of ${quantum}. Process ${currentRunning.id} has used ${currentQuantumUsed} time units so far in this slice.`;
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
              state: p.state
            }))
          },
          actionLog,
          educationalNote
        })
      );

      // 5. Advance execution by 1 time unit
      if (currentRunning) {
        totalBusyTime += 1;
        currentRunning.remainingTime -= 1;
        currentQuantumUsed += 1;

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
          currentQuantumUsed = 0;
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
        educationalNote: `Round Robin simulation finished with Quantum=${quantum}.`
      })
    );

    const metrics = this.calculateMetrics(processes, currentTime, totalBusyTime, ganttChart);

    return this.formatResult({
      parameters: { isPreemptive: true, quantum },
      snapshots,
      metrics
    });
  }
}
