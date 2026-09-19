import { describe, it, expect } from 'vitest';
import { simulationRegistry } from '../../public/js/core/simulationRegistry.js';
import '../../public/js/engines/cpu/index.js'; // Registers all CPU engines

// Helper to verify mathematical consistency across all process metrics
function verifyMetricsConsistency(metrics) {
  const { processMetrics, totalTime, earliestArrivalTime, elapsedSimulationTime, totalBusyTime, idleTime, cpuUtilization } = metrics;

  expect(totalTime).toBe(totalBusyTime + idleTime);
  expect(elapsedSimulationTime).toBe(totalTime - earliestArrivalTime);
  expect(cpuUtilization).toBeCloseTo((totalBusyTime / elapsedSimulationTime) * 100, 2);

  for (const p of processMetrics) {
    // 1. Completion Time must be at least Arrival Time + Burst Time
    expect(p.completionTime).toBeGreaterThanOrEqual(p.arrivalTime + p.burstTime);

    // 2. Turnaround Time = Completion Time - Arrival Time
    expect(p.turnaroundTime).toBe(p.completionTime - p.arrivalTime);

    // 3. Waiting Time = Turnaround Time - Burst Time
    expect(p.waitingTime).toBe(p.turnaroundTime - p.burstTime);

    // 4. Waiting Time must be non-negative
    expect(p.waitingTime).toBeGreaterThanOrEqual(0);

    // 5. Response Time = First Start Time - Arrival Time
    expect(p.responseTime).toBe(p.firstStartTime - p.arrivalTime);

    // 6. Response Time must be <= Waiting Time
    expect(p.responseTime).toBeLessThanOrEqual(p.waitingTime);
    expect(p.responseTime).toBeGreaterThanOrEqual(0);
  }
}

describe('CPU Scheduling Engine Suite (Phase 2A)', () => {

  // =========================================================================
  // 1. Central Registry & Metadata
  // =========================================================================
  describe('Simulation Registry Integration', () => {
    it('should have all 6 CPU algorithms registered in simulationRegistry', () => {
      const algorithms = simulationRegistry.getAlgorithmsByModule('cpu');
      const registeredIds = algorithms.map(a => a.id);

      expect(registeredIds).toContain('fcfs');
      expect(registeredIds).toContain('sjf');
      expect(registeredIds).toContain('srtf');
      expect(registeredIds).toContain('round_robin');
      expect(registeredIds).toContain('priority_non_preemptive');
      expect(registeredIds).toContain('priority_preemptive');
      expect(registeredIds.length).toBe(6);
    });

    it('should return theoretical complexities for all CPU engines', () => {
      const algorithms = simulationRegistry.getAlgorithmsByModule('cpu');
      for (const { engine } of algorithms) {
        const complexity = engine.getComplexity();
        expect(complexity).toHaveProperty('time');
        expect(complexity).toHaveProperty('space');
        expect(complexity).toHaveProperty('description');
      }
    });

    it('should return presets for all CPU engines', () => {
      const algorithms = simulationRegistry.getAlgorithmsByModule('cpu');
      for (const { engine } of algorithms) {
        const presets = engine.getPresets();
        expect(Array.isArray(presets)).toBe(true);
        expect(presets.length).toBeGreaterThan(0);
      }
    });
  });

  // =========================================================================
  // 2. Input Validation & Error Handling
  // =========================================================================
  describe('Input Validation across CPU Engines', () => {
    const fcfs = simulationRegistry.get('cpu', 'fcfs');
    const rr = simulationRegistry.get('cpu', 'round_robin');
    const priority = simulationRegistry.get('cpu', 'priority_non_preemptive');

    it('should reject non-object or null input', () => {
      expect(fcfs.validate(null).isValid).toBe(false);
      expect(fcfs.validate('invalid').isValid).toBe(false);
    });

    it('should reject empty processes array', () => {
      expect(fcfs.validate({ processes: [] }).isValid).toBe(false);
    });

    it('should reject missing or empty process IDs', () => {
      const res = fcfs.validate({ processes: [{ id: '', arrivalTime: 0, burstTime: 2 }] });
      expect(res.isValid).toBe(false);
      expect(res.error).toContain('invalid or missing ID');
    });

    it('should reject duplicate process IDs', () => {
      const res = fcfs.validate({
        processes: [
          { id: 'P1', arrivalTime: 0, burstTime: 2 },
          { id: 'P1', arrivalTime: 1, burstTime: 3 }
        ]
      });
      expect(res.isValid).toBe(false);
      expect(res.error).toContain('Duplicate process ID');
    });

    it('should reject negative arrival time', () => {
      const res = fcfs.validate({
        processes: [{ id: 'P1', arrivalTime: -1, burstTime: 2 }]
      });
      expect(res.isValid).toBe(false);
      expect(res.error).toContain('non-negative arrivalTime');
    });

    it('should reject zero or negative burst time', () => {
      expect(fcfs.validate({ processes: [{ id: 'P1', arrivalTime: 0, burstTime: 0 }] }).isValid).toBe(false);
      expect(fcfs.validate({ processes: [{ id: 'P1', arrivalTime: 0, burstTime: -5 }] }).isValid).toBe(false);
    });

    it('should require numeric priority for priority algorithms', () => {
      const res = priority.validate({
        processes: [{ id: 'P1', arrivalTime: 0, burstTime: 2 }]
      });
      expect(res.isValid).toBe(false);
      expect(res.error).toContain('requires a numeric priority');
    });

    it('should require positive time quantum for Round Robin', () => {
      expect(rr.validate({ processes: [{ id: 'P1', arrivalTime: 0, burstTime: 2 }] }).isValid).toBe(false);
      expect(rr.validate({ processes: [{ id: 'P1', arrivalTime: 0, burstTime: 2 }], quantum: 0 }).isValid).toBe(false);
      expect(rr.validate({ processes: [{ id: 'P1', arrivalTime: 0, burstTime: 2 }], quantum: -2 }).isValid).toBe(false);
      expect(rr.validate({ processes: [{ id: 'P1', arrivalTime: 0, burstTime: 2 }], quantum: 2 }).isValid).toBe(true);
    });
  });

  // =========================================================================
  // 3. FCFS (First-Come, First-Served)
  // =========================================================================
  describe('FCFS Scheduling Algorithm', () => {
    const fcfs = simulationRegistry.get('cpu', 'fcfs');

    it('should correctly schedule a standard workload (manually calculated)', () => {
      const inputs = {
        processes: [
          { id: 'P1', arrivalTime: 0, burstTime: 4 },
          { id: 'P2', arrivalTime: 1, burstTime: 3 },
          { id: 'P3', arrivalTime: 2, burstTime: 1 }
        ]
      };

      const result = fcfs.run(inputs);
      const { processMetrics, metrics } = { processMetrics: result.metrics.processMetrics, metrics: result.metrics };

      verifyMetricsConsistency(result.metrics);

      // P1: 0..4 (CT=4, TAT=4, WT=0, RT=0)
      expect(processMetrics[0]).toMatchObject({
        id: 'P1',
        completionTime: 4,
        turnaroundTime: 4,
        waitingTime: 0,
        responseTime: 0
      });

      // P2: 4..7 (CT=7, TAT=6, WT=3, RT=3)
      expect(processMetrics[1]).toMatchObject({
        id: 'P2',
        completionTime: 7,
        turnaroundTime: 6,
        waitingTime: 3,
        responseTime: 3
      });

      // P3: 7..8 (CT=8, TAT=6, WT=5, RT=5)
      expect(processMetrics[2]).toMatchObject({
        id: 'P3',
        completionTime: 8,
        turnaroundTime: 6,
        waitingTime: 5,
        responseTime: 5
      });

      // Averages: TAT = 16/3 = 5.33, WT = 8/3 = 2.67, RT = 8/3 = 2.67
      expect(metrics.averageTurnaroundTime).toBe(5.33);
      expect(metrics.averageWaitingTime).toBe(2.67);
      expect(metrics.averageResponseTime).toBe(2.67);
      expect(metrics.totalTime).toBe(8);
      expect(metrics.totalBusyTime).toBe(8);
      expect(metrics.cpuUtilization).toBe(100);
      expect(metrics.throughput).toBe(0.375);
    });

    it('should handle CPU idle periods at start and between processes', () => {
      const inputs = {
        processes: [
          { id: 'P1', arrivalTime: 2, burstTime: 2 },
          { id: 'P2', arrivalTime: 6, burstTime: 3 }
        ]
      };

      const result = fcfs.run(inputs);
      const { processMetrics, metrics } = { processMetrics: result.metrics.processMetrics, metrics: result.metrics };

      verifyMetricsConsistency(result.metrics);

      // t=0..2: IDLE
      // t=2..4: P1 (CT=4, TAT=2, WT=0, RT=0)
      expect(processMetrics[0]).toMatchObject({
        id: 'P1',
        firstStartTime: 2,
        completionTime: 4,
        turnaroundTime: 2,
        waitingTime: 0,
        responseTime: 0
      });

      // t=4..6: IDLE
      // t=6..9: P2 (CT=9, TAT=3, WT=0, RT=0)
      expect(processMetrics[1]).toMatchObject({
        id: 'P2',
        firstStartTime: 6,
        completionTime: 9,
        turnaroundTime: 3,
        waitingTime: 0,
        responseTime: 0
      });

      expect(metrics.totalTime).toBe(9);
      expect(metrics.earliestArrivalTime).toBe(2);
      expect(metrics.elapsedSimulationTime).toBe(7);
      expect(metrics.totalBusyTime).toBe(5);
      expect(metrics.idleTime).toBe(4);
      // Under convention: elapsed = 9 - 2 = 7; cpuUtilization = (5/7)*100 = 71.43%
      expect(metrics.cpuUtilization).toBe(71.43);
      // Throughput: 2 processes / 7 time units = 0.286
      expect(metrics.throughput).toBe(0.286);
    });

    it('should correctly calculate elapsed simulation time, utilization, and throughput when earliest arrival > 0', () => {
      const inputs = {
        processes: [
          { id: 'P1', arrivalTime: 5, burstTime: 3 },
          { id: 'P2', arrivalTime: 8, burstTime: 2 }
        ]
      };

      const result = fcfs.run(inputs);
      verifyMetricsConsistency(result.metrics);

      // P1: arrives at 5, runs 5..8 (CT=8, TAT=3, WT=0, RT=0)
      // P2: arrives at 8, runs 8..10 (CT=10, TAT=2, WT=0, RT=0)
      // Earliest arrival = 5, final completion = 10 -> elapsed simulation time = 5
      // Total busy time = 5 -> CPU utilization = (5 / 5) * 100 = 100%
      // Throughput = 2 processes / 5 units = 0.4
      expect(result.metrics.totalTime).toBe(10);
      expect(result.metrics.earliestArrivalTime).toBe(5);
      expect(result.metrics.elapsedSimulationTime).toBe(5);
      expect(result.metrics.totalBusyTime).toBe(5);
      expect(result.metrics.cpuUtilization).toBe(100);
      expect(result.metrics.throughput).toBe(0.4);
    });

    it('should handle a single process', () => {
      const result = fcfs.run({ processes: [{ id: 'P1', arrivalTime: 3, burstTime: 5 }] });
      verifyMetricsConsistency(result.metrics);
      expect(result.metrics.processMetrics[0]).toMatchObject({
        id: 'P1',
        firstStartTime: 3,
        completionTime: 8,
        turnaroundTime: 5,
        waitingTime: 0,
        responseTime: 0
      });
      expect(result.metrics.totalTime).toBe(8);
      expect(result.metrics.earliestArrivalTime).toBe(3);
      expect(result.metrics.elapsedSimulationTime).toBe(5);
      expect(result.metrics.totalBusyTime).toBe(5);
      expect(result.metrics.idleTime).toBe(3);
      expect(result.metrics.cpuUtilization).toBe(100);
      expect(result.metrics.throughput).toBe(0.2);
    });
  });

  // =========================================================================
  // 4. SJF (Shortest Job First - Non-preemptive)
  // =========================================================================
  describe('SJF Non-preemptive Scheduling Algorithm', () => {
    const sjf = simulationRegistry.get('cpu', 'sjf');

    it('should correctly schedule shortest burst jobs first when CPU is available', () => {
      // Manually calculated test case:
      // P1: AT=0, BT=7
      // P2: AT=2, BT=4
      // P3: AT=4, BT=1
      // P4: AT=5, BT=4
      const inputs = {
        processes: [
          { id: 'P1', arrivalTime: 0, burstTime: 7 },
          { id: 'P2', arrivalTime: 2, burstTime: 4 },
          { id: 'P3', arrivalTime: 4, burstTime: 1 },
          { id: 'P4', arrivalTime: 5, burstTime: 4 }
        ]
      };

      const result = sjf.run(inputs);
      const { processMetrics, metrics } = { processMetrics: result.metrics.processMetrics, metrics: result.metrics };

      verifyMetricsConsistency(result.metrics);

      // P1 runs 0..7
      expect(processMetrics.find(p => p.id === 'P1')).toMatchObject({
        completionTime: 7,
        turnaroundTime: 7,
        waitingTime: 0,
        responseTime: 0
      });

      // At t=7, ready are P3(BT=1), P2(BT=4), P4(BT=4) -> P3 runs 7..8
      expect(processMetrics.find(p => p.id === 'P3')).toMatchObject({
        firstStartTime: 7,
        completionTime: 8,
        turnaroundTime: 4,
        waitingTime: 3,
        responseTime: 3
      });

      // At t=8, P2 and P4 both have BT=4 -> P2 arrived earlier (AT=2 vs 5) -> P2 runs 8..12
      expect(processMetrics.find(p => p.id === 'P2')).toMatchObject({
        firstStartTime: 8,
        completionTime: 12,
        turnaroundTime: 10,
        waitingTime: 6,
        responseTime: 6
      });

      // At t=12, P4 runs 12..16
      expect(processMetrics.find(p => p.id === 'P4')).toMatchObject({
        firstStartTime: 12,
        completionTime: 16,
        turnaroundTime: 11,
        waitingTime: 7,
        responseTime: 7
      });

      // Avg TAT = 32/4 = 8.0, Avg WT = 16/4 = 4.0, Avg RT = 16/4 = 4.0
      expect(metrics.averageTurnaroundTime).toBe(8.0);
      expect(metrics.averageWaitingTime).toBe(4.0);
      expect(metrics.averageResponseTime).toBe(4.0);
    });

    it('should break ties using arrival time then input order for simultaneous arrivals', () => {
      const inputs = {
        processes: [
          { id: 'P1', arrivalTime: 0, burstTime: 4 },
          { id: 'P2', arrivalTime: 0, burstTime: 2 },
          { id: 'P3', arrivalTime: 0, burstTime: 2 }
        ]
      };

      const result = sjf.run(inputs);
      const { processMetrics } = { processMetrics: result.metrics.processMetrics };

      // P2 and P3 have BT=2. P2 was first in input order -> P2 runs 0..2, then P3 2..4, then P1 4..8
      expect(processMetrics.find(p => p.id === 'P2').completionTime).toBe(2);
      expect(processMetrics.find(p => p.id === 'P3').completionTime).toBe(4);
      expect(processMetrics.find(p => p.id === 'P1').completionTime).toBe(8);
    });
  });

  // =========================================================================
  // 5. SRTF (Shortest Remaining Time First - Preemptive SJF)
  // =========================================================================
  describe('SRTF Preemptive Scheduling Algorithm', () => {
    const srtf = simulationRegistry.get('cpu', 'srtf');

    it('should preempt currently running process when a shorter job arrives', () => {
      // Manually calculated test case:
      // P1: AT=0, BT=8
      // P2: AT=1, BT=4
      // P3: AT=2, BT=9
      // P4: AT=3, BT=5
      const inputs = {
        processes: [
          { id: 'P1', arrivalTime: 0, burstTime: 8 },
          { id: 'P2', arrivalTime: 1, burstTime: 4 },
          { id: 'P3', arrivalTime: 2, burstTime: 9 },
          { id: 'P4', arrivalTime: 3, burstTime: 5 }
        ]
      };

      const result = srtf.run(inputs);
      const { processMetrics, metrics } = { processMetrics: result.metrics.processMetrics, metrics: result.metrics };

      verifyMetricsConsistency(result.metrics);

      // P1 runs 0..1, preempted by P2 at t=1. Later resumes at 10..17.
      expect(processMetrics.find(p => p.id === 'P1')).toMatchObject({
        firstStartTime: 0,
        completionTime: 17,
        turnaroundTime: 17,
        waitingTime: 9,
        responseTime: 0
      });

      // P2 runs 1..5 and finishes
      expect(processMetrics.find(p => p.id === 'P2')).toMatchObject({
        firstStartTime: 1,
        completionTime: 5,
        turnaroundTime: 4,
        waitingTime: 0,
        responseTime: 0
      });

      // P4 runs 5..10 and finishes
      expect(processMetrics.find(p => p.id === 'P4')).toMatchObject({
        firstStartTime: 5,
        completionTime: 10,
        turnaroundTime: 7,
        waitingTime: 2,
        responseTime: 2
      });

      // P3 runs 17..26 and finishes
      expect(processMetrics.find(p => p.id === 'P3')).toMatchObject({
        firstStartTime: 17,
        completionTime: 26,
        turnaroundTime: 24,
        waitingTime: 15,
        responseTime: 15
      });

      // Avg TAT = 52/4 = 13.0, Avg WT = 26/4 = 6.5, Avg RT = 17/4 = 4.25
      expect(metrics.averageTurnaroundTime).toBe(13.0);
      expect(metrics.averageWaitingTime).toBe(6.5);
      expect(metrics.averageResponseTime).toBe(4.25);
    });

    it('should NOT preempt currently running process when a newly arrived process has equal remaining time (regression)', () => {
      // P1: arrivalTime=0, burstTime=5
      // P2: arrivalTime=2, burstTime=3
      // At time 2, P1 has 3 units remaining, so P2 must NOT preempt P1.
      const inputs = {
        processes: [
          { id: 'P1', arrivalTime: 0, burstTime: 5 },
          { id: 'P2', arrivalTime: 2, burstTime: 3 }
        ]
      };

      const result = srtf.run(inputs);
      const { processMetrics, metrics } = { processMetrics: result.metrics.processMetrics, metrics: result.metrics };

      verifyMetricsConsistency(result.metrics);

      // P1 runs uninterrupted from 0 to 5
      expect(processMetrics.find(p => p.id === 'P1')).toMatchObject({
        firstStartTime: 0,
        completionTime: 5,
        turnaroundTime: 5,
        waitingTime: 0,
        responseTime: 0
      });

      // P2 runs from 5 to 8
      expect(processMetrics.find(p => p.id === 'P2')).toMatchObject({
        firstStartTime: 5,
        completionTime: 8,
        turnaroundTime: 6,
        waitingTime: 3,
        responseTime: 3
      });

      // Verify Gantt chart has only 2 contiguous blocks, no preemption occurred at t=2
      expect(metrics.ganttChart).toEqual([
        { processId: 'P1', start: 0, end: 5 },
        { processId: 'P2', start: 5, end: 8 }
      ]);

      expect(metrics.averageTurnaroundTime).toBe(5.5);
      expect(metrics.averageWaitingTime).toBe(1.5);
      expect(metrics.averageResponseTime).toBe(1.5);
    });
  });

  // =========================================================================
  // 6. Round Robin (RR)
  // =========================================================================
  describe('Round Robin (RR) Scheduling Algorithm', () => {
    const rr = simulationRegistry.get('cpu', 'round_robin');

    it('should respect time quantum and correct ready queue ordering on quantum expiration', () => {
      // Manually calculated test case:
      // P1: AT=0, BT=5
      // P2: AT=1, BT=3
      // P3: AT=2, BT=1
      // Quantum = 2
      const inputs = {
        quantum: 2,
        processes: [
          { id: 'P1', arrivalTime: 0, burstTime: 5 },
          { id: 'P2', arrivalTime: 1, burstTime: 3 },
          { id: 'P3', arrivalTime: 2, burstTime: 1 }
        ]
      };

      const result = rr.run(inputs);
      const { processMetrics, metrics } = { processMetrics: result.metrics.processMetrics, metrics: result.metrics };

      verifyMetricsConsistency(result.metrics);

      // P1: CT=9, TAT=9, WT=4, RT=0
      expect(processMetrics.find(p => p.id === 'P1')).toMatchObject({
        firstStartTime: 0,
        completionTime: 9,
        turnaroundTime: 9,
        waitingTime: 4,
        responseTime: 0
      });

      // P2: CT=8, TAT=7, WT=4, RT=1
      expect(processMetrics.find(p => p.id === 'P2')).toMatchObject({
        firstStartTime: 2,
        completionTime: 8,
        turnaroundTime: 7,
        waitingTime: 4,
        responseTime: 1
      });

      // P3: CT=5, TAT=3, WT=2, RT=2
      expect(processMetrics.find(p => p.id === 'P3')).toMatchObject({
        firstStartTime: 4,
        completionTime: 5,
        turnaroundTime: 3,
        waitingTime: 2,
        responseTime: 2
      });

      // Avg TAT = 19/3 = 6.33, Avg WT = 10/3 = 3.33, Avg RT = 3/3 = 1.0
      expect(metrics.averageTurnaroundTime).toBe(6.33);
      expect(metrics.averageWaitingTime).toBe(3.33);
      expect(metrics.averageResponseTime).toBe(1.0);
    });

    it('should behave like FCFS when quantum is larger than all burst times', () => {
      const inputs = {
        quantum: 20,
        processes: [
          { id: 'P1', arrivalTime: 0, burstTime: 4 },
          { id: 'P2', arrivalTime: 1, burstTime: 3 },
          { id: 'P3', arrivalTime: 2, burstTime: 1 }
        ]
      };

      const resultRR = rr.run(inputs);
      const fcfs = simulationRegistry.get('cpu', 'fcfs');
      const resultFCFS = fcfs.run({ processes: inputs.processes });

      expect(resultRR.metrics.averageTurnaroundTime).toBe(resultFCFS.metrics.averageTurnaroundTime);
      expect(resultRR.metrics.averageWaitingTime).toBe(resultFCFS.metrics.averageWaitingTime);
      expect(resultRR.metrics.processMetrics[0].completionTime).toBe(4);
      expect(resultRR.metrics.processMetrics[1].completionTime).toBe(7);
      expect(resultRR.metrics.processMetrics[2].completionTime).toBe(8);
    });
  });

  // =========================================================================
  // 7. Priority Scheduling (Non-preemptive & Preemptive)
  // =========================================================================
  describe('Priority Scheduling Algorithms', () => {
    const priorityNP = simulationRegistry.get('cpu', 'priority_non_preemptive');
    const priorityP = simulationRegistry.get('cpu', 'priority_preemptive');

    const testProcesses = [
      { id: 'P1', arrivalTime: 0, burstTime: 4, priority: 3 },
      { id: 'P2', arrivalTime: 1, burstTime: 3, priority: 1 },
      { id: 'P3', arrivalTime: 2, burstTime: 2, priority: 2 }
    ];

    it('should run non-preemptively when configured as non-preemptive', () => {
      // P1 runs 0..4 non-preemptively (CT=4, TAT=4, WT=0, RT=0)
      // At t=4, P2 (prio 1) and P3 (prio 2) are ready -> P2 runs 4..7 (CT=7, TAT=6, WT=3, RT=3)
      // P3 runs 7..9 (CT=9, TAT=7, WT=5, RT=5)
      const result = priorityNP.run({ processes: testProcesses });
      const { processMetrics, metrics } = { processMetrics: result.metrics.processMetrics, metrics: result.metrics };

      verifyMetricsConsistency(result.metrics);

      expect(processMetrics.find(p => p.id === 'P1')).toMatchObject({
        completionTime: 4,
        turnaroundTime: 4,
        waitingTime: 0,
        responseTime: 0
      });

      expect(processMetrics.find(p => p.id === 'P2')).toMatchObject({
        firstStartTime: 4,
        completionTime: 7,
        turnaroundTime: 6,
        waitingTime: 3,
        responseTime: 3
      });

      expect(processMetrics.find(p => p.id === 'P3')).toMatchObject({
        firstStartTime: 7,
        completionTime: 9,
        turnaroundTime: 7,
        waitingTime: 5,
        responseTime: 5
      });

      expect(metrics.averageTurnaroundTime).toBe(5.67);
      expect(metrics.averageWaitingTime).toBe(2.67);
      expect(metrics.averageResponseTime).toBe(2.67);
    });

    it('should preempt lower priority process when configured as preemptive', () => {
      // P1 runs 0..1, then P2 arrives with priority 1 (higher than P1 priority 3) -> PREEMPTS!
      // P2 runs 1..4 (CT=4, TAT=3, WT=0, RT=0)
      // Ready: P3 (prio 2), P1 (prio 3) -> P3 runs 4..6 (CT=6, TAT=4, WT=2, RT=2)
      // P1 resumes at 6..9 (CT=9, TAT=9, WT=5, RT=0)
      const result = priorityP.run({ processes: testProcesses });
      const { processMetrics, metrics } = { processMetrics: result.metrics.processMetrics, metrics: result.metrics };

      verifyMetricsConsistency(result.metrics);

      expect(processMetrics.find(p => p.id === 'P2')).toMatchObject({
        firstStartTime: 1,
        completionTime: 4,
        turnaroundTime: 3,
        waitingTime: 0,
        responseTime: 0
      });

      expect(processMetrics.find(p => p.id === 'P3')).toMatchObject({
        firstStartTime: 4,
        completionTime: 6,
        turnaroundTime: 4,
        waitingTime: 2,
        responseTime: 2
      });

      expect(processMetrics.find(p => p.id === 'P1')).toMatchObject({
        firstStartTime: 0,
        completionTime: 9,
        turnaroundTime: 9,
        waitingTime: 5,
        responseTime: 0
      });

      expect(metrics.averageTurnaroundTime).toBe(5.33);
      expect(metrics.averageWaitingTime).toBe(2.33);
      expect(metrics.averageResponseTime).toBe(0.67);
    });
  });

  // =========================================================================
  // 8. Snapshot Structure Verification
  // =========================================================================
  describe('Snapshot Structure Verification for Playback Controller', () => {
    const fcfs = simulationRegistry.get('cpu', 'fcfs');

    it('should generate detailed snapshots at each time unit', () => {
      const result = fcfs.run({
        processes: [
          { id: 'P1', arrivalTime: 0, burstTime: 2 },
          { id: 'P2', arrivalTime: 1, burstTime: 1 }
        ]
      });

      expect(result.snapshots.length).toBeGreaterThanOrEqual(3);

      for (let i = 0; i < result.snapshots.length; i++) {
        const snap = result.snapshots[i];
        expect(snap).toHaveProperty('stepIndex');
        expect(snap).toHaveProperty('timeUnit');
        expect(snap).toHaveProperty('activeUnit');
        expect(snap).toHaveProperty('state');
        expect(snap.state).toHaveProperty('readyQueue');
        expect(snap.state).toHaveProperty('runningProcess');
        expect(snap.state).toHaveProperty('completedProcesses');
        expect(snap.state).toHaveProperty('processes');
        expect(snap).toHaveProperty('actionLog');
        expect(snap).toHaveProperty('educationalNote');
      }

      // Check final snapshot
      const finalSnap = result.snapshots[result.snapshots.length - 1];
      expect(finalSnap.state.completedProcesses).toEqual(['P1', 'P2']);
      expect(finalSnap.state.runningProcess).toBeNull();
    });
  });
});
