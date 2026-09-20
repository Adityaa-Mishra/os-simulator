/**
 * tests/os/subsystemManagers.test.js
 * Automated tests for AdityyaOS subsystem managers:
 * SchedulerManager, MemoryManager, FileSystemManager, DiskManager, and ResourceManager.
 * Confirms existing engine adaptation, transactional state updates, and error isolation.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Kernel } from '../../public/js/os/kernel/Kernel.js';
import { SchedulerAlgorithm } from '../../public/js/os/kernel/SchedulerManager.js';
import { MemoryStrategy } from '../../public/js/os/kernel/MemoryManager.js';
import { DiskAlgorithm } from '../../public/js/os/kernel/DiskManager.js';
import { OSEvents } from '../../public/js/os/kernel/OSEventEmitter.js';

describe('Phase 12: Subsystem Managers Tests', () => {
  let k;

  beforeEach(() => {
    k = new Kernel();
    k.boot();
  });

  /* =========================================================================
   * SchedulerManager Tests
   * ========================================================================= */
  describe('SchedulerManager', () => {
    it('initializes with FCFS as default algorithm', () => {
      const info = k.schedulerManager.getAlgorithm();
      expect(info.algorithm).toBe('FCFS');
      expect(info.engineName).toBe('First-Come, First-Served (FCFS)');
      expect(k.getState().cpu.activeAlgorithm).toBe('FCFS');
    });

    it('sets valid algorithms (SJF, SRTF, RR, Priority) and syncs state', () => {
      let emitted = null;
      k.events.on(OSEvents.CPU_ALGORITHM_CHANGED, p => {
        emitted = p;
      });

      const res = k.schedulerManager.setAlgorithm(SchedulerAlgorithm.SRTF);
      expect(res.success).toBe(true);
      expect(res.data.algorithm).toBe('SRTF');
      expect(k.schedulerManager.getAlgorithm().algorithm).toBe('SRTF');
      expect(k.getState().cpu.activeAlgorithm).toBe('SRTF');
      expect(emitted).toEqual({ algorithm: 'SRTF', options: {} });

      // Round Robin with quantum option
      const rrRes = k.schedulerManager.setAlgorithm(SchedulerAlgorithm.RR, { quantum: 3 });
      expect(rrRes.success).toBe(true);
      expect(rrRes.data.options.quantum).toBe(3);
    });

    it('rejects unknown algorithm without changing state or emitting event', () => {
      let emitted = false;
      k.events.on(OSEvents.CPU_ALGORITHM_CHANGED, () => {
        emitted = true;
      });

      const res = k.schedulerManager.setAlgorithm('MAGIC_ALGO');
      expect(res.success).toBe(false);
      expect(res.error).toContain('MAGIC_ALGO');
      expect(emitted).toBe(false);
      expect(k.schedulerManager.getAlgorithm().algorithm).toBe('FCFS');
    });

    it('runs active engine and computes CPU scheduling metrics', () => {
      let scheduledPayload = null;
      k.events.on(OSEvents.CPU_SCHEDULED, p => {
        scheduledPayload = p;
      });

      const processes = [
        { id: 'P1', arrivalTime: 0, burstTime: 4 },
        { id: 'P2', arrivalTime: 1, burstTime: 3 }
      ];

      const res = k.schedulerManager.schedule(processes);
      expect(res.success).toBe(true);
      expect(res.data.metrics).toBeDefined();
      expect(res.data.metrics.cpuUtilization).toBeGreaterThan(0);
      expect(res.data.metrics.ganttChart.length).toBeGreaterThan(0);
      expect(scheduledPayload).not.toBeNull();
      expect(scheduledPayload.algorithm).toBe('FCFS');
    });
  });

  /* =========================================================================
   * MemoryManager Tests
   * ========================================================================= */
  describe('MemoryManager', () => {
    it('initializes default partitions totaling 1024 bytes', () => {
      const mem = k.memoryManager.getMemoryState();
      expect(mem.total).toBe(1024);
      expect(mem.used).toBe(0);
      expect(mem.free).toBe(1024);
      expect(mem.blocks.length).toBe(4);
    });

    it('allocates memory using First Fit and updates state transactionally', () => {
      let allocatedPayload = null;
      k.events.on(OSEvents.MEMORY_ALLOCATED, p => {
        allocatedPayload = p;
      });

      const res = k.memoryManager.allocate(1, 150, MemoryStrategy.FIRST_FIT);
      expect(res.success).toBe(true);
      expect(res.data.blockId).toBe('B2'); // B1 is 100, B2 is 200 -> B2 fits 150
      expect(res.data.internalFragmentation).toBe(50); // 200 - 150

      const state = k.getState().memory;
      expect(state.used).toBe(150);
      expect(state.free).toBe(1024 - 150);

      expect(allocatedPayload).not.toBeNull();
      expect(allocatedPayload.pid).toBe(1);
      expect(allocatedPayload.size).toBe(150);
    });

    it('fails when requesting more memory than available partition, leaving state clean', () => {
      let eventEmitted = false;
      k.events.on(OSEvents.MEMORY_ALLOCATED, () => {
        eventEmitted = true;
      });

      const res = k.memoryManager.allocate(1, 9999);
      expect(res.success).toBe(false);
      expect(res.error).toContain('Insufficient');
      expect(eventEmitted).toBe(false);

      const state = k.getState().memory;
      expect(state.used).toBe(0);
      expect(state.free).toBe(1024);
    });

    it('frees allocated memory and restores partition state', () => {
      k.memoryManager.allocate(1, 80);
      expect(k.getState().memory.used).toBe(80);

      let freedPayload = null;
      k.events.on(OSEvents.MEMORY_FREED, p => {
        freedPayload = p;
      });

      const freeRes = k.memoryManager.free(1);
      expect(freeRes.success).toBe(true);
      expect(freeRes.data.freedBlocks).toContain('B1');
      expect(freeRes.data.totalFreedSize).toBe(80);

      const state = k.getState().memory;
      expect(state.used).toBe(0);
      expect(state.free).toBe(1024);
      expect(freedPayload.pid).toBe(1);
    });

    it('fails when freeing a process with no allocations', () => {
      const res = k.memoryManager.free(999);
      expect(res.success).toBe(false);
      expect(res.error).toContain('No memory allocated');
    });
  });

  /* =========================================================================
   * FileSystemManager Tests
   * ========================================================================= */
  describe('FileSystemManager', () => {
    it('creates files and directories and syncs block allocation', () => {
      let fileEvent = null;
      let dirEvent = null;
      k.events.on(OSEvents.FILE_CREATED, p => { fileEvent = p; });
      k.events.on(OSEvents.DIRECTORY_CREATED, p => { dirEvent = p; });

      const dirRes = k.fileSystemManager.createDirectory('/docs');
      expect(dirRes.success).toBe(true);
      expect(dirEvent.path).toBe('/docs');

      const fileRes = k.fileSystemManager.createFile('/docs/notes.txt', 200, 'rw-');
      expect(fileRes.success).toBe(true);
      expect(fileRes.data.size).toBe(200);
      expect(fileEvent.path).toBe('/docs/notes.txt');

      const state = k.getState().filesystem;
      expect(state.allocatedBlocks).toBeGreaterThan(0);
    });

    it('reads and writes files properly', () => {
      k.fileSystemManager.createFile('/readme.txt', 100);

      const readRes = k.fileSystemManager.readFile('/readme.txt');
      expect(readRes.success).toBe(true);
      expect(readRes.data.size).toBe(100);

      const writeRes = k.fileSystemManager.writeFile('/readme.txt', 250);
      expect(writeRes.success).toBe(true);
      expect(writeRes.data.size).toBe(250);
    });

    it('fails when creating duplicate file and does NOT emit success event', () => {
      k.fileSystemManager.createFile('/test.txt', 50);

      let successEvent = false;
      k.events.on(OSEvents.FILE_CREATED, () => { successEvent = true; });

      const dupRes = k.fileSystemManager.createFile('/test.txt', 50);
      expect(dupRes.success).toBe(false);
      expect(dupRes.error).toContain('already exists');
      expect(successEvent).toBe(false);
    });

    it('protects open files from deletion until closed', () => {
      k.fileSystemManager.createFile('/active.log', 10);
      k.fileSystemManager.openFile('/active.log');

      const delRes = k.fileSystemManager.deleteFile('/active.log');
      expect(delRes.success).toBe(false);
      expect(delRes.error).toContain('open');

      // Close and retry
      k.fileSystemManager.closeFile('/active.log');
      const delSuccessRes = k.fileSystemManager.deleteFile('/active.log');
      expect(delSuccessRes.success).toBe(true);
    });
  });

  /* =========================================================================
   * DiskManager Tests
   * ========================================================================= */
  describe('DiskManager', () => {
    it('queues requests and validates bounds', () => {
      let eventPayload = null;
      k.events.on(OSEvents.DISK_REQUEST_ADDED, p => { eventPayload = p; });

      const res = k.diskManager.addRequest(120, 1);
      expect(res.success).toBe(true);
      expect(res.data.cylinder).toBe(120);
      expect(eventPayload.cylinder).toBe(120);

      expect(k.getState().disks[0].pendingRequests).toEqual([120]);

      // Out of bounds cylinder
      const badRes = k.diskManager.addRequest(999);
      expect(badRes.success).toBe(false);
      expect(badRes.error).toContain('out of bounds');
      expect(k.getState().disks[0].pendingRequests).toEqual([120]);
    });

    it('schedules disk requests using active engine and updates head position', () => {
      k.diskManager.addRequest(98);
      k.diskManager.addRequest(183);
      k.diskManager.addRequest(37);

      let scheduledEvent = null;
      k.events.on(OSEvents.DISK_SCHEDULED, p => { scheduledEvent = p; });

      const res = k.diskManager.schedule({ initialHead: 53 });
      expect(res.success).toBe(true);
      expect(res.data.metrics.totalMovement).toBeGreaterThan(0);
      expect(scheduledEvent).not.toBeNull();

      // Head position updated to last serviced request
      const diskState = k.getState().disks[0];
      expect(diskState.pendingRequests.length).toBe(0);
      expect(diskState.headPosition).toBe(37); // In FCFS, 37 is last
    });
  });

  /* =========================================================================
   * ResourceManager Tests (Banker's Safety & Deadlock Avoidance)
   * ========================================================================= */
  describe('ResourceManager', () => {
    it('registers resources and declares process claims', () => {
      const regRes = k.resourceManager.registerResources({ R1: 10, R2: 5, R3: 7 });
      expect(regRes.success).toBe(true);
      expect(k.getState().resources.names).toEqual(['R1', 'R2', 'R3']);

      const declRes = k.resourceManager.declareMax(1, { R1: 7, R2: 5, R3: 3 });
      expect(declRes.success).toBe(true);
      expect(k.getState().resources.max['1']).toEqual({ R1: 7, R2: 5, R3: 3 });
    });

    it('grants safe resource requests and updates state transactionally', () => {
      k.resourceManager.registerResources({ R1: 10, R2: 5, R3: 7 });
      k.resourceManager.declareMax(1, { R1: 5, R2: 2, R3: 2 });

      let allocEvent = null;
      k.events.on(OSEvents.RESOURCE_ALLOCATED, p => { allocEvent = p; });

      const reqRes = k.resourceManager.request(1, { R1: 2, R2: 1, R3: 1 });
      expect(reqRes.success).toBe(true);
      expect(reqRes.data.safeSequence).toBeDefined();

      const resState = k.getState().resources;
      expect(resState.available.R1).toBe(8);
      expect(resState.allocated['1'].R1).toBe(2);
      expect(allocEvent.pid).toBe(1);
    });

    it('rejects requests that would cause an unsafe state and rolls back completely', () => {
      // Setup classical Banker's scenario with 2 processes
      k.resourceManager.registerResources({ R1: 3 });
      k.resourceManager.declareMax(1, { R1: 3 });
      k.resourceManager.declareMax(2, { R1: 3 });

      // Process 1 gets 2 instances (1 left)
      k.resourceManager.request(1, { R1: 2 });
      expect(k.getState().resources.available.R1).toBe(1);

      let allocEventEmitted = false;
      k.events.on(OSEvents.RESOURCE_ALLOCATED, () => { allocEventEmitted = true; });

      // Process 2 requests 1 instance -> would leave 0 available while both need more -> Unsafe!
      const unsafeRes = k.resourceManager.request(2, { R1: 1 });
      expect(unsafeRes.success).toBe(false);
      expect(unsafeRes.error).toContain('unsafe state');
      expect(allocEventEmitted).toBe(false);

      // Verify complete rollback: available still 1, P2 allocation still 0
      const resState = k.getState().resources;
      expect(resState.available.R1).toBe(1);
      expect(resState.allocated['2'].R1).toBe(0);
    });

    it('releases allocated resources properly', () => {
      k.resourceManager.registerResources({ R1: 10 });
      k.resourceManager.declareMax(1, { R1: 5 });
      k.resourceManager.request(1, { R1: 4 });

      const relRes = k.resourceManager.release(1, { R1: 2 });
      expect(relRes.success).toBe(true);
      expect(k.getState().resources.available.R1).toBe(8);
      expect(k.getState().resources.allocated['1'].R1).toBe(2);
    });
  });
});
