import { describe, it, expect, beforeEach, vi } from 'vitest';
import { simulationRegistry } from '../../public/js/core/simulationRegistry.js';
import { PcbSimulatorEngine, pcbSimulatorEngine } from '../../public/js/engines/process/index.js';
import { processView } from '../../public/js/views/processView.js';

// Minimal DOM mock helper for headless testing in Node environment
function createMockContainer() {
  const elements = new Map();

  const container = {
    _innerHTML: '',
    get innerHTML() {
      return this._innerHTML;
    },
    set innerHTML(html) {
      this._innerHTML = html;
    },
    querySelector: (sel) => {
      if (!elements.has(sel)) {
        elements.set(sel, {
          style: {},
          dataset: {},
          value: '',
          textContent: '',
          innerHTML: '',
          addEventListener: vi.fn(),
          closest: () => ({ dataset: { index: '0' } }),
          querySelectorAll: () => [],
          appendChild: vi.fn(),
          remove: vi.fn()
        });
      }
      return elements.get(sel);
    },
    querySelectorAll: (sel) => {
      return [];
    }
  };

  return { container, elements };
}

describe('Phase 3: Process Management Simulation Engine', () => {
  let engine;

  beforeEach(() => {
    engine = new PcbSimulatorEngine();
  });

  describe('Registration & Metadata', () => {
    it('should be registered in the central simulation registry under module "process"', () => {
      const registered = simulationRegistry.get('process', 'process_pcb');
      expect(registered).toBeDefined();
      expect(registered).toBe(pcbSimulatorEngine);
      expect(registered.name).toBe('Process Lifecycle & PCB Management');
    });

    it('should return algorithm list for module "process"', () => {
      const algos = simulationRegistry.getAlgorithmsByModule('process');
      expect(algos.length).toBeGreaterThanOrEqual(1);
      expect(algos.some(a => a.id === 'process_pcb')).toBe(true);
    });

    it('should provide complexity information and presets', () => {
      const complexity = engine.getComplexity();
      expect(complexity.time).toBeDefined();
      expect(complexity.space).toBeDefined();

      const presets = engine.getPresets();
      expect(Array.isArray(presets)).toBe(true);
      expect(presets.length).toBe(3);
    });
  });

  describe('Input Validation', () => {
    it('should reject non-object or null inputs', () => {
      expect(engine.validate(null).isValid).toBe(false);
      expect(engine.validate(undefined).isValid).toBe(false);
      expect(engine.validate('invalid').isValid).toBe(false);
    });

    it('should reject empty or missing processes array', () => {
      expect(engine.validate({}).isValid).toBe(false);
      expect(engine.validate({ processes: [] }).isValid).toBe(false);
    });

    it('should reject missing or empty process IDs', () => {
      const res = engine.validate({
        processes: [{ id: '', arrivalTime: 0, burstTime: 3 }]
      });
      expect(res.isValid).toBe(false);
      expect(res.error).toMatch(/invalid or missing ID/i);
    });

    it('should reject duplicate process IDs', () => {
      const res = engine.validate({
        processes: [
          { id: 'P1', arrivalTime: 0, burstTime: 3 },
          { id: 'P1', arrivalTime: 1, burstTime: 2 }
        ]
      });
      expect(res.isValid).toBe(false);
      expect(res.error).toMatch(/duplicate process ID/i);
    });

    it('should reject negative arrival times', () => {
      const res = engine.validate({
        processes: [{ id: 'P1', arrivalTime: -1, burstTime: 3 }]
      });
      expect(res.isValid).toBe(false);
      expect(res.error).toMatch(/non-negative arrivalTime/i);
    });

    it('should reject non-positive burst times', () => {
      const res1 = engine.validate({
        processes: [{ id: 'P1', arrivalTime: 0, burstTime: 0 }]
      });
      expect(res1.isValid).toBe(false);
      expect(res1.error).toMatch(/positive burstTime/i);

      const res2 = engine.validate({
        processes: [{ id: 'P1', arrivalTime: 0, burstTime: -5 }]
      });
      expect(res2.isValid).toBe(false);
    });

    it('should validate I/O burst bounds (start between 1 and burstTime - 1, duration >= 1)', () => {
      // start = 0 is invalid (must be >= 1)
      const res1 = engine.validate({
        processes: [{ id: 'P1', arrivalTime: 0, burstTime: 4, ioBursts: [{ start: 0, duration: 2 }] }]
      });
      expect(res1.isValid).toBe(false);
      expect(res1.error).toMatch(/I\/O start must be between 1 and burstTime - 1/i);

      // start >= burstTime is invalid
      const res2 = engine.validate({
        processes: [{ id: 'P1', arrivalTime: 0, burstTime: 4, ioBursts: [{ start: 4, duration: 2 }] }]
      });
      expect(res2.isValid).toBe(false);

      // duration < 1 is invalid
      const res3 = engine.validate({
        processes: [{ id: 'P1', arrivalTime: 0, burstTime: 4, ioBursts: [{ start: 2, duration: 0 }] }]
      });
      expect(res3.isValid).toBe(false);
      expect(res3.error).toMatch(/I\/O duration must be a positive integer/i);

      // multiple I/O bursts must have strictly ascending start times
      const res4 = engine.validate({
        processes: [{
          id: 'P1',
          arrivalTime: 0,
          burstTime: 6,
          ioBursts: [
            { start: 3, duration: 1 },
            { start: 2, duration: 1 }
          ]
        }]
      });
      expect(res4.isValid).toBe(false);
      expect(res4.error).toMatch(/strictly ascending start times/i);

      // valid configuration
      const resValid = engine.validate({
        processes: [{
          id: 'P1',
          arrivalTime: 0,
          burstTime: 6,
          ioBursts: [
            { start: 2, duration: 1 },
            { start: 4, duration: 2 }
          ]
        }]
      });
      expect(resValid.isValid).toBe(true);
    });
  });

  describe('5-State Lifecycle & PCB Updates', () => {
    it('should transition a single process through NEW -> READY -> RUNNING -> TERMINATED', () => {
      const inputs = {
        processes: [
          { id: 'P1', arrivalTime: 0, burstTime: 3, priority: 1 }
        ]
      };

      const result = engine.run(inputs);
      expect(result.snapshots.length).toBe(4); // t=0, t=1, t=2, t=3 (completion)

      // t=0: P1 arrives (NEW -> READY -> dispatched to RUNNING)
      const snap0 = result.snapshots[0];
      expect(snap0.timeUnit).toBe(0);
      expect(snap0.activeUnit).toBe('P1');
      const p1Snap0 = snap0.state.processes.find(p => p.id === 'P1');
      expect(p1Snap0.state).toBe('RUNNING');
      expect(p1Snap0.programCounter).toBe(0);
      expect(p1Snap0.registers.AX).toBe(0);
      expect(p1Snap0.registers.BX).toBe(10); // priority * 10
      expect(p1Snap0.remainingTime).toBe(3);

      // t=1: after 1 tick of execution, PC should be 4, AX should be 1
      const snap1 = result.snapshots[1];
      expect(snap1.timeUnit).toBe(1);
      const p1Snap1 = snap1.state.processes.find(p => p.id === 'P1');
      expect(p1Snap1.programCounter).toBe(4);
      expect(p1Snap1.registers.AX).toBe(1);
      expect(p1Snap1.registers.IP).toBe(4);
      expect(p1Snap1.remainingTime).toBe(2);

      // t=3: final completion snapshot
      const snapFinal = result.snapshots[3];
      expect(snapFinal.timeUnit).toBe(3);
      const p1Final = snapFinal.state.processes.find(p => p.id === 'P1');
      expect(p1Final.state).toBe('TERMINATED');
      expect(p1Final.remainingTime).toBe(0);
      expect(p1Final.programCounter).toBe(12);

      // Metrics
      expect(result.metrics.completedProcesses).toBe(1);
      expect(result.metrics.contextSwitches).toBe(0); // initial dispatch does not count
      expect(result.metrics.processMetrics[0].completionTime).toBe(3);
      expect(result.metrics.processMetrics[0].turnaroundTime).toBe(3);
      expect(result.metrics.processMetrics[0].waitingTime).toBe(0);
      expect(result.metrics.processMetrics[0].responseTime).toBe(0);
    });

    it('should transition through WAITING when I/O burst occurs and return to READY on I/O completion', () => {
      const inputs = {
        processes: [
          {
            id: 'P1',
            arrivalTime: 0,
            burstTime: 4,
            priority: 1,
            ioBursts: [{ start: 2, duration: 2 }]
          }
        ]
      };

      const result = engine.run(inputs);

      // Check t=2 snapshot: P1 is in WAITING
      const snap2 = result.snapshots.find(s => s.timeUnit === 2);
      expect(snap2).toBeDefined();
      expect(snap2.activeUnit).toBeNull(); // CPU idle
      expect(snap2.state.waitingQueue).toContain('P1');
      const p1Snap2 = snap2.state.processes.find(p => p.id === 'P1');
      expect(p1Snap2.state).toBe('WAITING');

      // Check metrics
      const p1Metric = result.metrics.processMetrics[0];
      expect(p1Metric.completionTime).toBe(6);
      expect(p1Metric.turnaroundTime).toBe(6);
      expect(p1Metric.totalIoTime).toBe(2);
      // Waiting time strictly excludes I/O time: WT = TAT - burstTime - totalIoTime = 6 - 4 - 2 = 0
      expect(p1Metric.waitingTime).toBe(0);
      expect(result.metrics.cpuBusyTime).toBe(4);
      expect(result.metrics.cpuIdleTime).toBe(2);
    });

    it('should correctly handle multiple processes, context switching, and I/O overlapping', () => {
      const inputs = {
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
          }
        ]
      };

      const result = engine.run(inputs);

      // t=0: P1 dispatches (READY -> RUNNING). P2 in READY queue.
      // P1 executes tick 1 (executed=1 == ioStart) -> blocks and enters WAITING at t=1.
      // t=1: P2 dispatches from READY -> RUNNING.
      // Context switch recorded from P1 -> P2!
      expect(result.metrics.contextSwitches).toBeGreaterThanOrEqual(1);

      // Verify each process completed
      expect(result.metrics.completedProcesses).toBe(2);
      for (const pm of result.metrics.processMetrics) {
        expect(pm.completionTime).toBeGreaterThan(0);
        expect(pm.turnaroundTime).toBe(pm.completionTime - pm.arrivalTime);
        expect(pm.waitingTime).toBe(pm.turnaroundTime - pm.burstTime - pm.totalIoTime);
      }
    });
  });

  describe('CPU Idle Behavior & Staggered Arrivals', () => {
    it('should simulate CPU idle cycles when no process is ready but future arrivals exist', () => {
      const inputs = {
        processes: [
          { id: 'P1', arrivalTime: 3, burstTime: 2, priority: 1 }
        ]
      };

      const result = engine.run(inputs);
      // t=0, t=1, t=2 should be IDLE
      const idleSnapshots = result.snapshots.filter(s => s.timeUnit < 3);
      expect(idleSnapshots.length).toBe(3);
      idleSnapshots.forEach(s => {
        expect(s.activeUnit).toBeNull();
        expect(s.state.runningProcess).toBeNull();
        expect(s.actionLog).toMatch(/CPU is idle/i);
      });

      // Total execution time should be 5 (idle: 3, busy: 2)
      expect(result.metrics.totalExecutionTime).toBe(5);
      expect(result.metrics.cpuBusyTime).toBe(2);
      expect(result.metrics.cpuIdleTime).toBe(3);
    });
  });

  describe('Multiple I/O Bursts Support', () => {
    it('should execute multiple I/O bursts sequentially without issue', () => {
      const inputs = {
        processes: [
          {
            id: 'P1',
            arrivalTime: 0,
            burstTime: 6,
            priority: 1,
            ioBursts: [
              { start: 2, duration: 2 },
              { start: 4, duration: 1 }
            ]
          }
        ]
      };

      const result = engine.run(inputs);
      const pm = result.metrics.processMetrics[0];
      expect(pm.totalIoTime).toBe(3);
      expect(pm.completionTime).toBe(9); // 6 CPU + 3 I/O = 9
      expect(pm.turnaroundTime).toBe(9);
      expect(pm.waitingTime).toBe(0); // TAT(9) - BT(6) - IO(3) = 0
    });
  });

  describe('Presets Execution & Determinism', () => {
    it('should run all built-in presets successfully', () => {
      const presets = engine.getPresets();
      expect(presets.length).toBe(3);

      presets.forEach(preset => {
        const val = engine.validate(preset.data);
        expect(val.isValid).toBe(true);

        const result = engine.run(preset.data);
        expect(result.snapshots.length).toBeGreaterThan(0);
        expect(result.metrics.completedProcesses).toBe(preset.data.processes.length);
      });
    });

    it('should produce strictly deterministic output across repeated runs', () => {
      const inputs = {
        processes: [
          { id: 'P1', arrivalTime: 0, burstTime: 3, priority: 1, ioBursts: [{ start: 1, duration: 2 }] },
          { id: 'P2', arrivalTime: 1, burstTime: 2, priority: 2 }
        ]
      };

      const run1 = engine.run(inputs);
      const run2 = engine.run(inputs);

      expect(run1.snapshots.length).toBe(run2.snapshots.length);
      expect(JSON.stringify(run1.metrics)).toBe(JSON.stringify(run2.metrics));
    });
  });

  describe('Process View Controller Integration', () => {
    it('should mount cleanly in a container and provide scoped DOM querying', () => {
      const { container } = createMockContainer();
      processView.mount(container);

      expect(container.innerHTML).toContain('process-container');
      expect(container.innerHTML).toContain('run-sim-btn');
      expect(container.innerHTML).toContain('preset-select');

      // Test unmount
      processView.unmount();
      expect(processView.playbackController).toBeNull();
    });

    it('should parse I/O bursts string correctly in processView', () => {
      expect(processView.parseIoBursts('', 'P1')).toEqual([]);
      expect(processView.parseIoBursts('  ', 'P1')).toEqual([]);
      expect(processView.parseIoBursts('2:3', 'P1')).toEqual([{ start: 2, duration: 3 }]);
      expect(processView.parseIoBursts('2:3, 5:1', 'P1')).toEqual([
        { start: 2, duration: 3 },
        { start: 5, duration: 1 }
      ]);

      expect(() => processView.parseIoBursts('invalid', 'P1')).toThrow(/Invalid I\/O format/i);
      expect(() => processView.parseIoBursts('2:abc', 'P1')).toThrow(/Non-numeric/i);
    });
  });
});
