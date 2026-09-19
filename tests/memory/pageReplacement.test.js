import { describe, it, expect, beforeEach } from 'vitest';
import { simulationRegistry } from '../../public/js/core/simulationRegistry.js';
import {
  FifoPageReplacementEngine,
  LruPageReplacementEngine,
  OptimalPageReplacementEngine,
  fifoPageReplacementEngine,
  lruPageReplacementEngine,
  optimalPageReplacementEngine
} from '../../public/js/engines/memory/pageReplacement/index.js';

describe('Phase 4: Page Replacement Simulation Engines', () => {
  let fifoEngine, lruEngine, optEngine;

  beforeEach(() => {
    fifoEngine = new FifoPageReplacementEngine();
    lruEngine = new LruPageReplacementEngine();
    optEngine = new OptimalPageReplacementEngine();
  });

  describe('Registry Registration & Metadata', () => {
    it('should register all 3 page replacement algorithms in simulationRegistry under module "page_replacement"', () => {
      expect(simulationRegistry.get('page_replacement', 'page_replacement_fifo')).toBe(fifoPageReplacementEngine);
      expect(simulationRegistry.get('page_replacement', 'page_replacement_lru')).toBe(lruPageReplacementEngine);
      expect(simulationRegistry.get('page_replacement', 'page_replacement_optimal')).toBe(optimalPageReplacementEngine);
    });

    it('should return algorithm list for module "page_replacement"', () => {
      const algos = simulationRegistry.getAlgorithmsByModule('page_replacement');
      expect(algos.length).toBeGreaterThanOrEqual(3);
      const ids = algos.map(a => a.id);
      expect(ids).toContain('page_replacement_fifo');
      expect(ids).toContain('page_replacement_lru');
      expect(ids).toContain('page_replacement_optimal');
    });

    it('should provide complexity info and presets', () => {
      [fifoEngine, lruEngine, optEngine].forEach(engine => {
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
      expect(fifoEngine.validate(null).isValid).toBe(false);
      expect(fifoEngine.validate(undefined).isValid).toBe(false);
      expect(fifoEngine.validate('invalid').isValid).toBe(false);
    });

    it('should reject empty or missing referenceString', () => {
      expect(fifoEngine.validate({ referenceString: [], frameCount: 3 }).isValid).toBe(false);
      expect(fifoEngine.validate({ frameCount: 3 }).isValid).toBe(false);
    });

    it('should reject invalid page references within string', () => {
      const res = fifoEngine.validate({
        referenceString: [1, null, 2],
        frameCount: 3
      });
      expect(res.isValid).toBe(false);
      expect(res.error).toMatch(/invalid page reference/i);
    });

    it('should reject frameCount < 1 or non-integer', () => {
      expect(fifoEngine.validate({ referenceString: [1, 2], frameCount: 0 }).isValid).toBe(false);
      expect(fifoEngine.validate({ referenceString: [1, 2], frameCount: -2 }).isValid).toBe(false);
      expect(fifoEngine.validate({ referenceString: [1, 2], frameCount: 2.5 }).isValid).toBe(false);
      expect(fifoEngine.validate({ referenceString: [1, 2], frameCount: NaN }).isValid).toBe(false);
    });

    it('should accept valid inputs with numbers or strings', () => {
      expect(fifoEngine.validate({ referenceString: [7, 0, 1, 2], frameCount: 3 }).isValid).toBe(true);
      expect(fifoEngine.validate({ referenceString: ['A', 'B', 'C', 'A'], frameCount: 2 }).isValid).toBe(true);
    });
  });

  describe('Textbook Reference String Benchmark', () => {
    // Reference String: [7, 0, 1, 2, 0, 3, 0, 4, 2, 3, 0, 3, 2, 1, 2, 0, 1, 7, 0, 1]
    // Frames: 3
    const textbookData = {
      referenceString: [7, 0, 1, 2, 0, 3, 0, 4, 2, 3, 0, 3, 2, 1, 2, 0, 1, 7, 0, 1],
      frameCount: 3
    };

    it('should execute FIFO with exactly 15 page faults', () => {
      const result = fifoEngine.run(textbookData);
      expect(result.metrics.pageFaults).toBe(15);
      expect(result.metrics.pageHits).toBe(5);
      expect(result.metrics.totalReferences).toBe(20);
      expect(result.metrics.hitRatio).toBe(25);
      expect(result.metrics.faultRatio).toBe(75);
    });

    it('should execute LRU with exactly 12 page faults', () => {
      const result = lruEngine.run(textbookData);
      expect(result.metrics.pageFaults).toBe(12);
      expect(result.metrics.pageHits).toBe(8);
      expect(result.metrics.totalReferences).toBe(20);
      expect(result.metrics.hitRatio).toBe(40);
      expect(result.metrics.faultRatio).toBe(60);
    });

    it('should execute Optimal with exactly 9 page faults', () => {
      const result = optEngine.run(textbookData);
      expect(result.metrics.pageFaults).toBe(9);
      expect(result.metrics.pageHits).toBe(11);
      expect(result.metrics.totalReferences).toBe(20);
      expect(result.metrics.hitRatio).toBe(55);
      expect(result.metrics.faultRatio).toBe(45);
    });
  });

  describe("Belady's Anomaly Demonstration", () => {
    // String: [1, 2, 3, 4, 1, 2, 5, 1, 2, 3, 4, 5]
    // FIFO with 3 frames -> 9 faults
    // FIFO with 4 frames -> 10 faults (Anomaly: more frames result in more faults!)
    const anomalyString = [1, 2, 3, 4, 1, 2, 5, 1, 2, 3, 4, 5];

    it('should demonstrate Belady Anomaly where 4 frames produce more faults than 3 frames in FIFO', () => {
      const res3 = fifoEngine.run({ referenceString: anomalyString, frameCount: 3 });
      const res4 = fifoEngine.run({ referenceString: anomalyString, frameCount: 4 });

      expect(res3.metrics.pageFaults).toBe(9);
      expect(res4.metrics.pageFaults).toBe(10);
      expect(res4.metrics.pageFaults).toBeGreaterThan(res3.metrics.pageFaults);
    });
  });

  describe('Edge Cases', () => {
    it('should handle frameCount = 1 correctly', () => {
      const inputs = {
        referenceString: [1, 2, 3, 2, 1],
        frameCount: 1
      };

      const result = fifoEngine.run(inputs);
      expect(result.metrics.pageFaults).toBe(5); // Every distinct consecutive reference faults
      expect(result.metrics.pageHits).toBe(0);
      expect(result.metrics.replacementCount).toBe(4); // 1 cold load + 4 replacements
    });

    it('should handle frameCount >= unique pages without replacements after cold loads', () => {
      const inputs = {
        referenceString: [1, 2, 1, 3, 2, 1],
        frameCount: 4 // Only 3 unique pages: 1, 2, 3
      };

      const result = lruEngine.run(inputs);
      expect(result.metrics.pageFaults).toBe(3); // Initial loads for 1, 2, 3
      expect(result.metrics.pageHits).toBe(3);
      expect(result.metrics.replacementCount).toBe(0); // Zero evictions
    });

    it('should break ties deterministically in Optimal when multiple pages never reappear', () => {
      // Frames: 3
      // References: 1, 2, 3 (cold loads into F0, F1, F2)
      // Reference 4: neither 1, 2, nor 3 ever appear again (all distance = Infinity)
      // Tie-breaker: lowest frame index (Frame 0, which holds page 1)
      const inputs = {
        referenceString: [1, 2, 3, 4],
        frameCount: 3
      };

      const result = optEngine.run(inputs);
      const snap4 = result.snapshots.find(s => s.timeUnit === 4);
      expect(snap4.state.replacedPage).toBe(1);
      expect(snap4.state.frameIndexModified).toBe(0);
    });
  });

  describe('Presets & Determinism', () => {
    it('should run all built-in presets successfully across all page replacement engines', () => {
      [fifoEngine, lruEngine, optEngine].forEach(engine => {
        const presets = engine.getPresets();
        presets.forEach(preset => {
          const val = engine.validate(preset.data);
          expect(val.isValid).toBe(true);

          const result = engine.run(preset.data);
          expect(result.snapshots.length).toBe(preset.data.referenceString.length + 1);
          expect(result.metrics.totalReferences).toBe(preset.data.referenceString.length);
        });
      });
    });

    it('should produce strictly deterministic output across repeated runs', () => {
      const inputs = {
        referenceString: [2, 3, 2, 1, 5, 2, 4, 5, 3, 2, 5, 2],
        frameCount: 3
      };

      const run1 = lruEngine.run(inputs);
      const run2 = lruEngine.run(inputs);

      expect(JSON.stringify(run1.snapshots)).toBe(JSON.stringify(run2.snapshots));
      expect(JSON.stringify(run1.metrics)).toBe(JSON.stringify(run2.metrics));
    });
  });
});
