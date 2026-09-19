  /**
   * Priority Scheduling (Preemptive) CPU Engine
   * Preemptive priority algorithm where an executing process is preempted
   * if a new process arrives with a higher priority (lower integer value).
   */

  import { BaseCpuEngine } from './baseCpuEngine.js';

  export class PriorityPreemptiveEngine extends BaseCpuEngine {
    constructor() {
      super('priority_preemptive', 'Priority Scheduling (Preemptive)', {
        isPreemptive: true,
        requiresPriority: true
      });
    }

    getComplexity() {
      return {
        time: 'O(n^2)',
        space: 'O(n)',
        description: 'At each arrival, candidate comparison takes O(n), yielding O(n^2) or O(n log n) with a priority queue.'
      };
    }

    getPresets() {
      return [
        {
          name: 'Preemption by High Priority Job',
          description: 'P1 starts running, but is immediately preempted when higher-priority P2 arrives.',
          data: {
            processes: [
              { id: 'P1', arrivalTime: 0, burstTime: 4, priority: 3 },
              { id: 'P2', arrivalTime: 1, burstTime: 3, priority: 1 },
              { id: 'P3', arrivalTime: 2, burstTime: 2, priority: 2 }
            ]
          }
        },
        {
          name: 'Cascade of Preemptions',
          description: 'Processes arriving with monotonically increasing priorities (decreasing numbers).',
          data: {
            processes: [
              { id: 'P1', arrivalTime: 0, burstTime: 8, priority: 5 },
              { id: 'P2', arrivalTime: 1, burstTime: 4, priority: 4 },
              { id: 'P3', arrivalTime: 2, burstTime: 2, priority: 2 },
              { id: 'P4', arrivalTime: 3, burstTime: 1, priority: 1 }
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

        // 2. Preemption evaluation: compare currentRunning against ready candidates
        const allCandidates = [...readyQueue];
        if (currentRunning) {
          allCandidates.push(currentRunning);
        }

        if (allCandidates.length > 0) {
          allCandidates.sort((a, b) => {
            if (a.priority !== b.priority) {
              return a.priority - b.priority;
            }
            if (a.arrivalTime !== b.arrivalTime) {
              return a.arrivalTime - b.arrivalTime;
            }
            return a.inputOrder - b.inputOrder;
          });

          const bestCandidate = allCandidates[0];

          // If best candidate is not currentRunning, preempt currentRunning
          if (currentRunning && bestCandidate.id !== currentRunning.id) {
            currentRunning.state = 'READY';
            readyQueue.push(currentRunning);
            currentRunning = null;
          }

          if (!currentRunning) {
            const idx = readyQueue.findIndex(p => p.id === bestCandidate.id);
            if (idx !== -1) {
              readyQueue.splice(idx, 1);
            }
            currentRunning = bestCandidate;
            currentRunning.state = 'RUNNING';
            if (currentRunning.firstStartTime === null) {
              currentRunning.firstStartTime = currentTime;
            }
          }
        }

        // 3. Snapshot for currentTime
        let actionLog = '';
        let educationalNote = '';

        if (currentRunning) {
          actionLog = `Process ${currentRunning.id} (Priority: ${currentRunning.priority}) running on CPU (Remaining: ${currentRunning.remainingTime}).`;
          educationalNote = `Preemptive Priority selected ${currentRunning.id} because it had the highest priority (${currentRunning.priority}, lower integer = higher priority).`;
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
          educationalNote: 'Simulation complete. Higher priority jobs preempted lower priority jobs in real time.'
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
