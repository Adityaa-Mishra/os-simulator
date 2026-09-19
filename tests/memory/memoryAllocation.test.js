import { describe, it, expect, beforeEach } from 'vitest';
import { simulationRegistry } from '../../public/js/core/simulationRegistry.js';
import {
  FirstFitEngine,
  BestFitEngine,
  WorstFitEngine,
  firstFitEngine,
  bestFitEngine,
  worstFitEngine
} from '../../public/js/engines/memory/index.js';

describe('Phase 4: Memory Allocation Simulation Engines', () => {
  let ffEngine, bfEngine, wfEngine;

  beforeEach(() => {
    ffEngine = new FirstFitEngine();
    bfEngine = new BestFitEngine();
    wfEngine = new WorstFitEngine();
  });

  describe('Registry Registration & Metadata', () => {
    it('should register all 3 allocation algorithms in simulationRegistry under module "memory"', () => {
      expect(simulationRegistry.get('memory', 'memory_first_fit')).toBe(firstFitEngine);
      expect(simulationRegistry.get('memory', 'memory_best_fit')).toBe(bestFitEngine);
      expect(simulationRegistry.get('memory', 'memory_worst_fit')).toBe(worstFitEngine);
    });

    it('should list all memory algorithms when queried by module', () => {
      const algos = simulationRegistry.getAlgorithmsByModule('memory');
      expect(algos.length).toBeGreaterThanOrEqual(3);
      const ids = algos.map(a => a.id);
      expect(ids).toContain('memory_first_fit');
      expect(ids).toContain('memory_best_fit');
      expect(ids).toContain('memory_worst_fit');
    });

    it('should return complexity metadata and presets for each engine', () => {
      [ffEngine, bfEngine, wfEngine].forEach(engine => {
        const comp = engine.getComplexity();
        expect(comp.time).toBeDefined();
        expect(comp.space).toBeDefined();

        const presets = engine.getPresets();
        expect(Array.isArray(presets)).toBe(true);
        expect(presets.length).toBeGreaterThanOrEqual(3);
      });
    });
  });

  describe('Input Validation', () => {
    it('should reject non-object or null inputs', () => {
      expect(ffEngine.validate(null).isValid).toBe(false);
      expect(ffEngine.validate(undefined).isValid).toBe(false);
      expect(ffEngine.validate('invalid').isValid).toBe(false);
    });

    it('should reject empty or missing blocks array', () => {
      expect(ffEngine.validate({ blocks: [], processes: [{ id: 'P1', size: 100 }] }).isValid).toBe(false);
      expect(ffEngine.validate({ processes: [{ id: 'P1', size: 100 }] }).isValid).toBe(false);
    });

    it('should reject empty or missing processes array', () => {
      expect(ffEngine.validate({ blocks: [{ id: 'B1', size: 100 }], processes: [] }).isValid).toBe(false);
      expect(ffEngine.validate({ blocks: [{ id: 'B1', size: 100 }] }).isValid).toBe(false);
    });

    it('should reject invalid or duplicate block IDs', () => {
      const res1 = ffEngine.validate({
        blocks: [{ id: '', size: 100 }],
        processes: [{ id: 'P1', size: 50 }]
      });
      expect(res1.isValid).toBe(false);
      expect(res1.error).toMatch(/invalid or missing ID/i);

      const res2 = ffEngine.validate({
        blocks: [{ id: 'B1', size: 100 }, { id: 'B1', size: 200 }],
        processes: [{ id: 'P1', size: 50 }]
      });
      expect(res2.isValid).toBe(false);
      expect(res2.error).toMatch(/duplicate block ID/i);
    });

    it('should reject non-positive block sizes', () => {
      const res = ffEngine.validate({
        blocks: [{ id: 'B1', size: 0 }],
        processes: [{ id: 'P1', size: 50 }]
      });
      expect(res.isValid).toBe(false);
      expect(res.error).toMatch(/positive size/i);
    });

    it('should reject invalid or duplicate process IDs', () => {
      const res1 = ffEngine.validate({
        blocks: [{ id: 'B1', size: 100 }],
        processes: [{ id: '', size: 50 }]
      });
      expect(res1.isValid).toBe(false);

      const res2 = ffEngine.validate({
        blocks: [{ id: 'B1', size: 100 }],
        processes: [{ id: 'P1', size: 50 }, { id: 'P1', size: 60 }]
      });
      expect(res2.isValid).toBe(false);
      expect(res2.error).toMatch(/duplicate process ID/i);
    });

    it('should reject non-positive process sizes', () => {
      const res = ffEngine.validate({
        blocks: [{ id: 'B1', size: 100 }],
        processes: [{ id: 'P1', size: -10 }]
      });
      expect(res.isValid).toBe(false);
    });
  });

  describe('First Fit Algorithm Execution', () => {
    it('should allocate to the first available block with sufficient capacity', () => {
      // Classic Textbook:
      // Blocks: B1:100, B2:500, B3:200, B4:300, B5:600
      // Processes: P1:212, P2:417, P3:112, P4:426
      // First Fit allocation:
      // P1 (212) -> B2 (500) (first fitting block)
      // P2 (417) -> B5 (600) (first fitting free block)
      // P3 (112) -> B3 (200) (first fitting free block)
      // P4 (426) -> None (B1:100, B4:300 remaining) -> Fails!
      const inputs = {
        blocks: [
          { id: 'B1', size: 100 },
          { id: 'B2', size: 500 },
          { id: 'B3', size: 200 },
          { id: 'B4', size: 300 },
          { id: 'B5', size: 600 }
        ],
        processes: [
          { id: 'P1', size: 212 },
          { id: 'P2', size: 417 },
          { id: 'P3', size: 112 },
          { id: 'P4', size: 426 }
        ]
      };

      const result = ffEngine.run(inputs);
      const procs = result.metrics.processMetrics;

      expect(procs.find(p => p.id === 'P1').allocatedBlockId).toBe('B2');
      expect(procs.find(p => p.id === 'P2').allocatedBlockId).toBe('B5');
      expect(procs.find(p => p.id === 'P3').allocatedBlockId).toBe('B3');
      expect(procs.find(p => p.id === 'P4').status).toBe('failed');

      expect(result.metrics.successfulAllocations).toBe(3);
      expect(result.metrics.failedAllocations).toBe(1);

      // Verify internal fragmentation for allocated processes:
      // P1 in B2 (500 - 212 = 288)
      // P2 in B5 (600 - 417 = 183)
      // P3 in B3 (200 - 112 = 88)
      // Total Internal Frag = 288 + 183 + 88 = 559
      expect(result.metrics.totalInternalFragmentation).toBe(559);
    });
  });

  describe('Best Fit Algorithm Execution', () => {
    it('should allocate to the smallest block that fits the process', () => {
      // Classic Textbook:
      // Blocks: B1:100, B2:500, B3:200, B4:300, B5:600
      // Processes: P1:212, P2:417, P3:112, P4:426
      // Best Fit allocation:
      // P1 (212) -> B4 (300) (smallest fitting block)
      // P2 (417) -> B2 (500) (smallest fitting block)
      // P3 (112) -> B3 (200) (smallest fitting block)
      // P4 (426) -> B5 (600) (smallest fitting block)
      // ALL processes successfully allocated!
      const inputs = {
        blocks: [
          { id: 'B1', size: 100 },
          { id: 'B2', size: 500 },
          { id: 'B3', size: 200 },
          { id: 'B4', size: 300 },
          { id: 'B5', size: 600 }
        ],
        processes: [
          { id: 'P1', size: 212 },
          { id: 'P2', size: 417 },
          { id: 'P3', size: 112 },
          { id: 'P4', size: 426 }
        ]
      };

      const result = bfEngine.run(inputs);
      const procs = result.metrics.processMetrics;

      expect(procs.find(p => p.id === 'P1').allocatedBlockId).toBe('B4');
      expect(procs.find(p => p.id === 'P2').allocatedBlockId).toBe('B2');
      expect(procs.find(p => p.id === 'P3').allocatedBlockId).toBe('B3');
      expect(procs.find(p => p.id === 'P4').allocatedBlockId).toBe('B5');

      expect(result.metrics.successfulAllocations).toBe(4);
      expect(result.metrics.failedAllocations).toBe(0);

      // Total Internal Frag:
      // P1 in B4 (300 - 212 = 88)
      // P2 in B2 (500 - 417 = 83)
      // P3 in B3 (200 - 112 = 88)
      // P4 in B5 (600 - 426 = 174)
      // Sum = 88 + 83 + 88 + 174 = 433
      expect(result.metrics.totalInternalFragmentation).toBe(433);
    });

    it('should break ties by picking the lowest block index', () => {
      const inputs = {
        blocks: [
          { id: 'B1', size: 200 },
          { id: 'B2', size: 200 }
        ],
        processes: [
          { id: 'P1', size: 150 }
        ]
      };

      const result = bfEngine.run(inputs);
      expect(result.metrics.processMetrics[0].allocatedBlockId).toBe('B1');
    });
  });

  describe('Worst Fit Algorithm Execution', () => {
    it('should allocate to the largest block that fits the process', () => {
      // Classic Textbook:
      // Blocks: B1:100, B2:500, B3:200, B4:300, B5:600
      // Processes: P1:212, P2:417, P3:112, P4:426
      // Worst Fit allocation:
      // P1 (212) -> B5 (600) (largest block)
      // P2 (417) -> B2 (500) (largest free block)
      // P3 (112) -> B4 (300) (largest free block)
      // P4 (426) -> None (only B1:100 and B3:200 left) -> Fails!
      const inputs = {
        blocks: [
          { id: 'B1', size: 100 },
          { id: 'B2', size: 500 },
          { id: 'B3', size: 200 },
          { id: 'B4', size: 300 },
          { id: 'B5', size: 600 }
        ],
        processes: [
          { id: 'P1', size: 212 },
          { id: 'P2', size: 417 },
          { id: 'P3', size: 112 },
          { id: 'P4', size: 426 }
        ]
      };

      const result = wfEngine.run(inputs);
      const procs = result.metrics.processMetrics;

      expect(procs.find(p => p.id === 'P1').allocatedBlockId).toBe('B5');
      expect(procs.find(p => p.id === 'P2').allocatedBlockId).toBe('B2');
      expect(procs.find(p => p.id === 'P3').allocatedBlockId).toBe('B4');
      expect(procs.find(p => p.id === 'P4').status).toBe('failed');

      expect(result.metrics.successfulAllocations).toBe(3);
      expect(result.metrics.failedAllocations).toBe(1);
    });

    it('should break ties by picking the lowest block index', () => {
      const inputs = {
        blocks: [
          { id: 'B1', size: 500 },
          { id: 'B2', size: 500 }
        ],
        processes: [
          { id: 'P1', size: 200 }
        ]
      };

      const result = wfEngine.run(inputs);
      expect(result.metrics.processMetrics[0].allocatedBlockId).toBe('B1');
    });
  });

  describe('Exact Fit & Fragmentation Metrics', () => {
    it('should yield 0 internal fragmentation for exact size match', () => {
      const inputs = {
        blocks: [
          { id: 'B1', size: 300 }
        ],
        processes: [
          { id: 'P1', size: 300 }
        ]
      };

      const result = ffEngine.run(inputs);
      expect(result.metrics.totalInternalFragmentation).toBe(0);
      expect(result.metrics.memoryUtilization).toBe(100);
      expect(result.metrics.totalFreeMemory).toBe(0);
    });

    it('should detect external fragmentation when process fails despite total free memory >= requested size', () => {
      // Free blocks: B1 (100) + B2 (150) = 250 free memory
      // Process P1 needs 200
      // Neither block can fit 200, so P1 fails
      // External fragmentation = 250!
      const inputs = {
        blocks: [
          { id: 'B1', size: 100 },
          { id: 'B2', size: 150 }
        ],
        processes: [
          { id: 'P1', size: 200 }
        ]
      };

      const result = ffEngine.run(inputs);
      expect(result.metrics.failedAllocations).toBe(1);
      expect(result.metrics.externalFragmentation).toBe(250);
    });
  });

  describe('Presets & Determinism', () => {
    it('should execute all built-in presets successfully across all allocation engines', () => {
      [ffEngine, bfEngine, wfEngine].forEach(engine => {
        const presets = engine.getPresets();
        presets.forEach(preset => {
          const val = engine.validate(preset.data);
          expect(val.isValid).toBe(true);

          const result = engine.run(preset.data);
          expect(result.snapshots.length).toBe(preset.data.processes.length + 1);
          expect(result.metrics.totalMemory).toBeGreaterThan(0);
        });
      });
    });

    it('should produce identical results across repeated runs with identical input', () => {
      const inputs = {
        blocks: [
          { id: 'B1', size: 200 },
          { id: 'B2', size: 400 },
          { id: 'B3', size: 300 }
        ],
        processes: [
          { id: 'P1', size: 250 },
          { id: 'P2', size: 150 }
        ]
      };

      const run1 = bfEngine.run(inputs);
      const run2 = bfEngine.run(inputs);

      expect(JSON.stringify(run1.snapshots)).toBe(JSON.stringify(run2.snapshots));
      expect(JSON.stringify(run1.metrics)).toBe(JSON.stringify(run2.metrics));
    });
  });
});
