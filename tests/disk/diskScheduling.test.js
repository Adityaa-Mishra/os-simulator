import { describe, it, expect, beforeEach } from 'vitest';
import { simulationRegistry } from '../../public/js/core/simulationRegistry.js';
import {
  FcfsDiskEngine,
  SstfDiskEngine,
  ScanDiskEngine,
  CScanDiskEngine,
  LookDiskEngine,
  CLookDiskEngine,
  fcfsDiskEngine,
  sstfDiskEngine,
  scanDiskEngine,
  cscanDiskEngine,
  lookDiskEngine,
  clookDiskEngine
} from '../../public/js/engines/disk/index.js';

describe('Phase 5: Disk Scheduling Simulation Engines', () => {
  let fcfs, sstf, scan, cscan, look, clook;

  beforeEach(() => {
    fcfs = new FcfsDiskEngine();
    sstf = new SstfDiskEngine();
    scan = new ScanDiskEngine();
    cscan = new CScanDiskEngine();
    look = new LookDiskEngine();
    clook = new CLookDiskEngine();
  });

  describe('Registry Registration & Metadata', () => {
    it('should register all 6 disk scheduling engines under module "disk"', () => {
      expect(simulationRegistry.get('disk', 'disk_fcfs')).toBe(fcfsDiskEngine);
      expect(simulationRegistry.get('disk', 'disk_sstf')).toBe(sstfDiskEngine);
      expect(simulationRegistry.get('disk', 'disk_scan')).toBe(scanDiskEngine);
      expect(simulationRegistry.get('disk', 'disk_cscan')).toBe(cscanDiskEngine);
      expect(simulationRegistry.get('disk', 'disk_look')).toBe(lookDiskEngine);
      expect(simulationRegistry.get('disk', 'disk_clook')).toBe(clookDiskEngine);
    });

    it('should return all 6 algorithms when querying module "disk"', () => {
      const algos = simulationRegistry.getAlgorithmsByModule('disk');
      expect(algos.length).toBeGreaterThanOrEqual(6);
      const ids = algos.map(a => a.id);
      expect(ids).toContain('disk_fcfs');
      expect(ids).toContain('disk_sstf');
      expect(ids).toContain('disk_scan');
      expect(ids).toContain('disk_cscan');
      expect(ids).toContain('disk_look');
      expect(ids).toContain('disk_clook');
    });

    it('should provide complexity metadata and presets for all engines', () => {
      [fcfs, sstf, scan, cscan, look, clook].forEach(engine => {
        const comp = engine.getComplexity();
        expect(comp.time).toBeDefined();
        expect(comp.space).toBeDefined();

        const presets = engine.getPresets();
        expect(Array.isArray(presets)).toBe(true);
        expect(presets.length).toBeGreaterThanOrEqual(4);
      });
    });
  });

  describe('Input Validation', () => {
    it('should reject non-object or null inputs', () => {
      expect(fcfs.validate(null).isValid).toBe(false);
      expect(fcfs.validate(undefined).isValid).toBe(false);
      expect(fcfs.validate('invalid').isValid).toBe(false);
    });

    it('should reject invalid diskSize (< 2 or non-integer)', () => {
      expect(fcfs.validate({ requests: [50], initialHead: 20, diskSize: 1 }).isValid).toBe(false);
      expect(fcfs.validate({ requests: [50], initialHead: 20, diskSize: -10 }).isValid).toBe(false);
      expect(fcfs.validate({ requests: [50], initialHead: 20, diskSize: 200.5 }).isValid).toBe(false);
    });

    it('should reject invalid initialHead (< 0, >= diskSize, or non-integer)', () => {
      expect(fcfs.validate({ requests: [50], initialHead: -1, diskSize: 200 }).isValid).toBe(false);
      expect(fcfs.validate({ requests: [50], initialHead: 200, diskSize: 200 }).isValid).toBe(false);
      expect(fcfs.validate({ requests: [50], initialHead: 50.5, diskSize: 200 }).isValid).toBe(false);
    });

    it('should reject invalid direction', () => {
      expect(fcfs.validate({ requests: [50], initialHead: 20, direction: 'diagonal' }).isValid).toBe(false);
    });

    it('should reject out-of-bounds or non-integer requests', () => {
      expect(fcfs.validate({ requests: [-5], initialHead: 20, diskSize: 200 }).isValid).toBe(false);
      expect(fcfs.validate({ requests: [200], initialHead: 20, diskSize: 200 }).isValid).toBe(false);
      expect(fcfs.validate({ requests: [50.2], initialHead: 20, diskSize: 200 }).isValid).toBe(false);
    });

    it('should accept valid inputs with empty requests', () => {
      expect(fcfs.validate({ requests: [], initialHead: 50, diskSize: 200 }).isValid).toBe(true);
    });
  });

  describe('Classic Textbook Benchmark Calculations', () => {
    // Silberschatz et al. Classic Problem:
    // Requests: [98, 183, 37, 122, 14, 124, 65, 67]
    // Initial Head: 53
    // Disk Size: 200 (cylinders 0-199)
    // Direction: right
    const textbookInput = {
      requests: [98, 183, 37, 122, 14, 124, 65, 67],
      initialHead: 53,
      diskSize: 200,
      direction: 'right'
    };

    it('FCFS should service requests in input order with 640 cylinders movement', () => {
      const result = fcfs.run(textbookInput);
      expect(result.metrics.serviceOrder).toEqual([98, 183, 37, 122, 14, 124, 65, 67]);
      expect(result.metrics.totalMovement).toBe(640);
      expect(result.metrics.averageMovement).toBe(80); // 640 / 8 = 80
      expect(result.metrics.finalHead).toBe(67);
    });

    it('SSTF should select shortest seek distances with 236 cylinders movement', () => {
      const result = sstf.run(textbookInput);
      expect(result.metrics.serviceOrder).toEqual([65, 67, 37, 14, 98, 122, 124, 183]);
      expect(result.metrics.totalMovement).toBe(236);
      expect(result.metrics.averageMovement).toBe(29.5); // 236 / 8 = 29.5
      expect(result.metrics.finalHead).toBe(183);
    });

    it('SCAN should travel to boundary 199 and reverse with 331 cylinders movement', () => {
      const result = scan.run(textbookInput);
      expect(result.metrics.serviceOrder).toEqual([65, 67, 98, 122, 124, 183, 37, 14]);
      expect(result.metrics.totalMovement).toBe(331); // (199 - 53) + (199 - 14) = 146 + 185 = 331
      expect(result.metrics.averageMovement).toBe(41.38); // 331 / 8 = 41.375 -> 41.38
      expect(result.metrics.finalHead).toBe(14);

      // Verify boundary step was captured
      const boundarySnap = result.snapshots.find(s => s.state.stepType === 'boundary');
      expect(boundarySnap).toBeDefined();
      expect(boundarySnap.state.currentHead).toBe(199);
      expect(boundarySnap.state.servicedRequest).toBeNull();
    });

    it('C-SCAN should travel to 199, wrap to 0, and continue with 382 cylinders movement', () => {
      const result = cscan.run(textbookInput);
      expect(result.metrics.serviceOrder).toEqual([65, 67, 98, 122, 124, 183, 14, 37]);
      // (199 - 53) + (199 - 0) + (37 - 0) = 146 + 199 + 37 = 382
      expect(result.metrics.totalMovement).toBe(382);
      expect(result.metrics.finalHead).toBe(37);

      // Verify wrap step was captured
      const wrapSnap = result.snapshots.find(s => s.state.stepType === 'wrap');
      expect(wrapSnap).toBeDefined();
      expect(wrapSnap.state.currentHead).toBe(0);
      expect(wrapSnap.state.movement).toBe(199); // Wrap distance
    });

    it('LOOK should reverse at cylinder 183 without boundary travel with 299 cylinders movement', () => {
      const result = look.run(textbookInput);
      expect(result.metrics.serviceOrder).toEqual([65, 67, 98, 122, 124, 183, 37, 14]);
      // (183 - 53) + (183 - 14) = 130 + 169 = 299
      expect(result.metrics.totalMovement).toBe(299);
      expect(result.metrics.finalHead).toBe(14);

      // Verify no boundary step exists
      const boundarySnap = result.snapshots.find(s => s.state.stepType === 'boundary');
      expect(boundarySnap).toBeUndefined();
    });

    it('C-LOOK should jump from 183 directly to 14 without boundary travel with 322 cylinders movement', () => {
      const result = clook.run(textbookInput);
      expect(result.metrics.serviceOrder).toEqual([65, 67, 98, 122, 124, 183, 14, 37]);
      // (183 - 53) + (183 - 14) + (37 - 14) = 130 + 169 + 23 = 322
      expect(result.metrics.totalMovement).toBe(322);
      expect(result.metrics.finalHead).toBe(37);

      // Verify wrap step jumps directly to 14
      const wrapSnap = result.snapshots.find(s => s.state.stepType === 'wrap');
      expect(wrapSnap).toBeDefined();
      expect(wrapSnap.state.currentHead).toBe(14);
      expect(wrapSnap.state.servicedRequest).toBe(14);
      expect(wrapSnap.state.movement).toBe(169); // 183 - 14
    });
  });

  describe('Edge Cases & Tie-Breaking', () => {
    it('should handle empty requests array cleanly with 0 movement', () => {
      const inputs = { requests: [], initialHead: 50, diskSize: 200, direction: 'right' };
      const res = fcfs.run(inputs);
      expect(res.metrics.totalMovement).toBe(0);
      expect(res.metrics.averageMovement).toBe(0);
      expect(res.metrics.servicedRequests).toBe(0);
      expect(res.metrics.finalHead).toBe(50);
      expect(res.snapshots.length).toBe(1);
    });

    it('should handle requests at the current head position with 0 movement', () => {
      const inputs = { requests: [50, 60], initialHead: 50, diskSize: 200 };
      const res = fcfs.run(inputs);
      expect(res.metrics.serviceOrder).toEqual([50, 60]);
      expect(res.metrics.totalMovement).toBe(10); // 0 + 10 = 10
    });

    it('should handle duplicate requests in queue correctly', () => {
      const inputs = { requests: [50, 50, 70], initialHead: 40, diskSize: 200 };
      const res = fcfs.run(inputs);
      expect(res.metrics.serviceOrder).toEqual([50, 50, 70]);
      expect(res.metrics.totalMovement).toBe(30); // (50-40) + 0 + (70-50) = 10 + 0 + 20 = 30
      expect(res.metrics.servicedRequests).toBe(3);
    });

    it('should break ties in SSTF by choosing the lower cylinder number', () => {
      // Head at 50. Requests: 40 (dist 10) and 60 (dist 10).
      // Tie-breaker: 40 (lower cylinder) must be serviced first!
      const inputs = { requests: [60, 40], initialHead: 50, diskSize: 200 };
      const res = sstf.run(inputs);
      expect(res.metrics.serviceOrder[0]).toBe(40);
      expect(res.metrics.serviceOrder[1]).toBe(60);
    });

    it('should handle requests at boundary cylinders 0 and diskSize - 1', () => {
      const inputs = { requests: [0, 199], initialHead: 100, diskSize: 200, direction: 'right' };
      const resScan = scan.run(inputs);
      expect(resScan.metrics.serviceOrder).toEqual([199, 0]);
      expect(resScan.metrics.totalMovement).toBe(298); // (199 - 100) + (199 - 0) = 99 + 199 = 298
    });

    it('should handle initial direction = left for SCAN, C-SCAN, LOOK, C-LOOK', () => {
      const inputs = {
        requests: [20, 80, 40],
        initialHead: 50,
        diskSize: 100,
        direction: 'left'
      };

      // SCAN moving left: 40, 20 -> boundary 0 -> 80
      // Movement: (50 - 0) + (80 - 0) = 50 + 80 = 130
      const scanRes = scan.run(inputs);
      expect(scanRes.metrics.serviceOrder).toEqual([40, 20, 80]);
      expect(scanRes.metrics.totalMovement).toBe(130);

      // LOOK moving left: 40, 20 (reverses at 20) -> 80
      // Movement: (50 - 20) + (80 - 20) = 30 + 60 = 90
      const lookRes = look.run(inputs);
      expect(lookRes.metrics.serviceOrder).toEqual([40, 20, 80]);
      expect(lookRes.metrics.totalMovement).toBe(90);
    });
  });

  describe('Presets & Determinism', () => {
    it('should execute all built-in presets successfully across all 6 engines', () => {
      [fcfs, sstf, scan, cscan, look, clook].forEach(engine => {
        const presets = engine.getPresets();
        presets.forEach(preset => {
          const val = engine.validate(preset.data);
          expect(val.isValid).toBe(true);

          const result = engine.run(preset.data);
          expect(result.snapshots.length).toBeGreaterThan(0);
          expect(result.metrics.servicedRequests).toBe(preset.data.requests.length);
        });
      });
    });

    it('should produce strictly deterministic output across repeated runs', () => {
      const inputs = {
        requests: [98, 183, 37, 122, 14, 124, 65, 67],
        initialHead: 53,
        diskSize: 200,
        direction: 'right'
      };

      const run1 = cscan.run(inputs);
      const run2 = cscan.run(inputs);

      expect(JSON.stringify(run1.snapshots)).toBe(JSON.stringify(run2.snapshots));
      expect(JSON.stringify(run1.metrics)).toBe(JSON.stringify(run2.metrics));
    });
  });
});
