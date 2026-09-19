import { describe, it, expect, beforeEach } from 'vitest';
import { simulationRegistry } from '../../public/js/core/simulationRegistry.js';
import { BankersSafetyEngine, BankersRequestEngine } from '../../public/js/engines/deadlock/bankers.js';
import { BaseDeadlockEngine } from '../../public/js/engines/deadlock/baseDeadlock.js';
import { DeadlockRenderer } from '../../public/js/visualizers/deadlockRenderer.js';
import '../../public/js/engines/deadlock/index.js'; // Ensure auto-registration

describe('Deadlock Management Module', () => {
  let safetyEngine;
  let requestEngine;

  // Classic Silberschatz textbook scenario
  const classicState = {
    processes: ['P0', 'P1', 'P2', 'P3', 'P4'],
    available: [3, 3, 2],
    max: [
      [7, 5, 3],
      [3, 2, 2],
      [9, 0, 2],
      [2, 2, 2],
      [4, 3, 3]
    ],
    allocation: [
      [0, 1, 0],
      [2, 0, 0],
      [3, 0, 2],
      [2, 1, 1],
      [0, 0, 2]
    ]
  };

  beforeEach(() => {
    safetyEngine = new BankersSafetyEngine();
    requestEngine = new BankersRequestEngine();
  });

  describe('Simulation Registry & Registration', () => {
    it('registers both Banker safety and request engines under deadlock module', () => {
      const engines = simulationRegistry.getAlgorithmsByModule('deadlock');
      expect(engines.length).toBeGreaterThanOrEqual(2);

      const registeredSafety = simulationRegistry.get('deadlock', 'deadlock_bankers_safety');
      expect(registeredSafety).toBeDefined();
      expect(registeredSafety.name).toBe("Banker's Safety Algorithm");

      const registeredRequest = simulationRegistry.get('deadlock', 'deadlock_bankers_request');
      expect(registeredRequest).toBeDefined();
      expect(registeredRequest.name).toBe("Banker's Resource Request Algorithm");
    });

    it('provides standard presets with valid structure', () => {
      const presets = safetyEngine.getPresets();
      expect(presets.length).toBeGreaterThanOrEqual(5);

      for (const preset of presets) {
        expect(preset.name).toBeDefined();
        expect(preset.description).toBeDefined();
        expect(preset.data).toBeDefined();
        expect(Array.isArray(preset.data.processes)).toBe(true);
        expect(Array.isArray(preset.data.available)).toBe(true);
        expect(Array.isArray(preset.data.max)).toBe(true);
        expect(Array.isArray(preset.data.allocation)).toBe(true);
      }
    });
  });

  describe('Validation & Need Matrix Calculation', () => {
    it('rejects non-object or null input', () => {
      expect(safetyEngine.validate(null).isValid).toBe(false);
      expect(safetyEngine.validate(undefined).isValid).toBe(false);
      expect(safetyEngine.validate('string').isValid).toBe(false);
    });

    it('rejects empty or invalid processes array', () => {
      expect(safetyEngine.validate({ ...classicState, processes: [] }).isValid).toBe(false);
      expect(safetyEngine.validate({ ...classicState, processes: ['P0', ''] }).isValid).toBe(false);
      expect(safetyEngine.validate({ ...classicState, processes: ['P0', 'P0'] }).isValid).toBe(false); // duplicate
    });

    it('rejects invalid available vector', () => {
      expect(safetyEngine.validate({ ...classicState, available: [] }).isValid).toBe(false);
      expect(safetyEngine.validate({ ...classicState, available: [1, -1, 2] }).isValid).toBe(false);
      expect(safetyEngine.validate({ ...classicState, available: [1, 2.5, 2] }).isValid).toBe(false);
      expect(safetyEngine.validate({ ...classicState, available: [1, NaN, 2] }).isValid).toBe(false);
    });

    it('rejects dimension mismatches in max and allocation matrices', () => {
      // Wrong number of rows
      expect(safetyEngine.validate({ ...classicState, max: [[7, 5, 3]] }).isValid).toBe(false);
      // Wrong number of columns
      expect(safetyEngine.validate({
        ...classicState,
        max: [[7, 5], [3, 2], [9, 0], [2, 2], [4, 3]]
      }).isValid).toBe(false);
      // Allocation row mismatch
      expect(safetyEngine.validate({ ...classicState, allocation: [[0, 1, 0]] }).isValid).toBe(false);
    });

    it('rejects when Allocation exceeds Max for any process/resource', () => {
      const invalidAlloc = classicState.allocation.map(r => [...r]);
      invalidAlloc[0][0] = 8; // Max[0][0] is 7
      const res = safetyEngine.validate({ ...classicState, allocation: invalidAlloc });
      expect(res.isValid).toBe(false);
      expect(res.error).toContain('exceeds Max');
    });

    it('calculates Need matrix correctly (Need = Max - Allocation)', () => {
      const need = safetyEngine.calculateNeed(classicState.max, classicState.allocation);
      expect(need).toEqual([
        [7, 4, 3], // P0: [7-0, 5-1, 3-0]
        [1, 2, 2], // P1: [3-2, 2-0, 2-0]
        [6, 0, 0], // P2: [9-3, 0-0, 2-2]
        [0, 1, 1], // P3: [2-2, 2-1, 2-1]
        [4, 3, 1]  // P4: [4-0, 3-0, 3-2]
      ]);
    });
  });

  describe("Banker's Safety Algorithm", () => {
    it('determines safe state and exact safe sequence for classic textbook problem', () => {
      const result = safetyEngine.run(classicState);

      expect(result.safe).toBe(true);
      // Under deterministic lowest-index tie-breaking, at step 2, P0 has Need [7,4,3] <= Work [7,4,3]
      // and is selected before P2 and P4: <P1, P3, P0, P2, P4>
      expect(result.safeSequence).toEqual(['P1', 'P3', 'P0', 'P2', 'P4']);
      expect(result.unfinishedProcesses).toEqual([]);
      expect(result.metrics.finalWork).toEqual([10, 5, 7]);
      expect(result.snapshots.length).toBe(7); // Step 0 (init) + 5 process steps + 1 final completion
      expect(result.snapshots[result.snapshots.length - 1].phase).toBe('safe_complete');
    });

    it('breaks ties deterministically using the lowest process index', () => {
      // Both P0 and P1 have Need [1, 1] <= Work [5, 5] at step 0
      const tieState = {
        processes: ['P0', 'P1'],
        available: [5, 5],
        max: [
          [2, 2],
          [2, 2]
        ],
        allocation: [
          [1, 1],
          [1, 1]
        ]
      };

      const result = safetyEngine.run(tieState);
      expect(result.safe).toBe(true);
      expect(result.safeSequence[0]).toBe('P0'); // P0 chosen before P1 because index 0 < 1
      expect(result.safeSequence[1]).toBe('P1');
    });

    it('detects unsafe state when available cannot satisfy any pending process', () => {
      const unsafeState = {
        processes: ['P0', 'P1', 'P2'],
        available: [1, 0, 0],
        max: [
          [3, 2, 2],
          [2, 2, 2],
          [2, 1, 3]
        ],
        allocation: [
          [1, 1, 1],
          [1, 0, 1],
          [1, 1, 1]
        ]
      };

      const result = safetyEngine.run(unsafeState);
      expect(result.safe).toBe(false);
      expect(result.unfinishedProcesses.length).toBeGreaterThan(0);
      expect(result.snapshots[result.snapshots.length - 1].phase).toBe('unsafe_deadlock');
    });

    it('does not mutate caller inputs during execution', () => {
      const availClone = [...classicState.available];
      const allocClone = classicState.allocation.map(r => [...r]);
      const maxClone = classicState.max.map(r => [...r]);

      safetyEngine.run(classicState);

      expect(classicState.available).toEqual(availClone);
      expect(classicState.allocation).toEqual(allocClone);
      expect(classicState.max).toEqual(maxClone);
    });
  });

  describe("Banker's Resource Request Algorithm", () => {
    it('validates request format and properties', () => {
      expect(requestEngine.validate({ ...classicState, request: null }).isValid).toBe(false);
      expect(requestEngine.validate({ ...classicState, request: { process: 'P99', resources: [1, 0, 2] } }).isValid).toBe(false);
      expect(requestEngine.validate({ ...classicState, request: { process: 'P1', resources: [1, 0] } }).isValid).toBe(false); // length 2 instead of 3
      expect(requestEngine.validate({ ...classicState, request: { process: 'P1', resources: [1, -1, 2] } }).isValid).toBe(false);
    });

    it('Case 1: GRANTS request when Request <= Need, Request <= Available, and tentative state is safe', () => {
      // In classic state, P1 requests [1, 0, 2]
      const input = {
        ...classicState,
        request: { process: 'P1', resources: [1, 0, 2] }
      };

      const result = requestEngine.run(input);
      expect(result.granted).toBe(true);
      expect(result.status).toBe('granted');
      expect(result.tentativeState).toBeDefined();
      expect(result.tentativeState.available).toEqual([2, 3, 0]); // [3-1, 3-0, 2-2]
      expect(result.tentativeState.allocation[1]).toEqual([3, 0, 2]); // [2+1, 0+0, 0+2]
      expect(result.tentativeState.need[1]).toEqual([0, 2, 0]); // [1-1, 2-0, 2-2]
      expect(result.safetyResult.safe).toBe(true);
    });

    it('Case 2: REJECTS request when Request exceeds maximum claim (Request > Need)', () => {
      // P1 Need is [1, 2, 2]. Request [2, 3, 1] exceeds Need in R0 (2 > 1) and R1 (3 > 2)
      const input = {
        ...classicState,
        request: { process: 'P1', resources: [2, 3, 1] }
      };

      const result = requestEngine.run(input);
      expect(result.granted).toBe(false);
      expect(result.status).toBe('error_exceeds_claim');
      expect(result.tentativeState).toBeNull();
      expect(result.reason).toContain('exceeded its maximum claim');
    });

    it('Case 3: DENIES request (MUST WAIT) when Request exceeds Available resources', () => {
      // Available is [3, 3, 2]. P0 requests [0, 4, 0] which is <= Need [7, 4, 3] but > Available (4 > 3)
      const input = {
        ...classicState,
        request: { process: 'P0', resources: [0, 4, 0] }
      };

      const result = requestEngine.run(input);
      expect(result.granted).toBe(false);
      expect(result.status).toBe('must_wait');
      expect(result.tentativeState).toBeNull();
      expect(result.reason).toContain('must wait');
    });

    it('Case 4: DENIES request when tentative state leads to an unsafe state (deadlock potential)', () => {
      // P4 requests [3, 3, 0]. Need is [4, 3, 1] (<= Need). Available is [3, 3, 2] (<= Avail).
      // Tentative Available becomes [0, 0, 2], leaving no process able to execute.
      const input = {
        ...classicState,
        request: { process: 'P4', resources: [3, 3, 0] }
      };

      const result = requestEngine.run(input);
      expect(result.granted).toBe(false);
      expect(result.status).toBe('denied_unsafe');
      expect(result.tentativeState).toBeDefined();
      expect(result.safetyResult.safe).toBe(false);
      expect(result.reason).toContain('unsafe state');
    });

    it('does not mutate original inputs during request simulation', () => {
      const input = {
        ...classicState,
        request: { process: 'P1', resources: [1, 0, 2] }
      };
      const availClone = [...input.available];
      const allocClone = input.allocation.map(r => [...r]);

      requestEngine.run(input);

      expect(input.available).toEqual(availClone);
      expect(input.allocation).toEqual(allocClone);
    });
  });

  describe('Resource Allocation Graph (RAG) & Cycle Detection', () => {
    it('detects a cycle in a cyclic RAG', () => {
      // P0 holds R0 and requests R1
      // P1 holds R1 and requests R0
      // Cycle: P0 -> R1 -> P1 -> R0 -> P0
      const procs = ['P0', 'P1'];
      const numRes = 2;
      const alloc = [
        [1, 0], // P0 holds R0
        [0, 1]  // P1 holds R1
      ];
      const need = [
        [0, 1], // P0 requests R1
        [1, 0]  // P1 requests R0
      ];

      const cycleInfo = DeadlockRenderer.detectRagCycle(procs, numRes, alloc, need);
      expect(cycleInfo.hasCycle).toBe(true);
      expect(cycleInfo.cycleNodes.length).toBeGreaterThan(0);
      expect(cycleInfo.cycleEdges.size).toBeGreaterThan(0);
    });

    it('reports no cycle for an acyclic RAG', () => {
      // P0 holds R0 and requests R1
      // P1 holds nothing and requests R0
      const procs = ['P0', 'P1'];
      const numRes = 2;
      const alloc = [
        [1, 0],
        [0, 0]
      ];
      const need = [
        [0, 1],
        [1, 0]
      ];

      const cycleInfo = DeadlockRenderer.detectRagCycle(procs, numRes, alloc, need);
      expect(cycleInfo.hasCycle).toBe(false);
      expect(cycleInfo.cycleNodes).toEqual([]);
    });

    it('renders RAG SVG markup with process nodes and resource nodes', () => {
      const container = { innerHTML: '' };
      const need = safetyEngine.calculateNeed(classicState.max, classicState.allocation);

      DeadlockRenderer.renderRag(container, {
        processes: classicState.processes,
        available: classicState.available,
        allocation: classicState.allocation,
        need
      });

      expect(container.innerHTML).toContain('rag-svg');
      expect(container.innerHTML).toContain('P0');
      expect(container.innerHTML).toContain('R0');
      expect(container.innerHTML).toContain('rag-cycle-banner');
    });

    it('renders matrix tables with correct dimensions', () => {
      const container = { innerHTML: '' };
      const need = safetyEngine.calculateNeed(classicState.max, classicState.allocation);

      DeadlockRenderer.renderMatrixTables(container, {
        processes: classicState.processes,
        available: classicState.available,
        max: classicState.max,
        allocation: classicState.allocation,
        need
      });

      expect(container.innerHTML).toContain('available-table');
      expect(container.innerHTML).toContain('Allocation Matrix');
      expect(container.innerHTML).toContain('Max Matrix');
      expect(container.innerHTML).toContain('Need Matrix');
    });
  });
});
