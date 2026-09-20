/**
 * tests/os/resourceLifecycle.test.js
 * Automated end-to-end integration tests for AdityyaOS resource lifecycle across
 * ProcessManager, SchedulerManager, MemoryManager, DiskManager, and Virtual Hardware.
 * Validates unified cross-resource cleanup, zero resource leaks, reboot reset semantics,
 * and snapshot safety of integrated state.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Kernel } from '../../public/js/os/kernel/Kernel.js';
import { ProcessState } from '../../public/js/os/kernel/ProcessManager.js';
import { StorageRequestStatus } from '../../public/js/os/kernel/DiskManager.js';

describe('Phase 16: Multi-Resource Lifecycle & Snapshot Safety Tests', () => {
  let k;

  beforeEach(() => {
    k = new Kernel();
    k.boot();
  });

  describe('End-to-End Multi-Resource Lifecycle', () => {
    it('creates, allocates, queues storage, runs, and cleanly terminates a process with zero resource leaks', () => {
      // 1. Create process
      const createRes = k.processManager.createProcess({ name: 'WorkerApp', priority: 1, burstTime: 10 });
      expect(createRes.success).toBe(true);
      const pid = createRes.data.pid;

      // 2. Allocate memory
      const memRes = k.memoryManager.allocate(pid, 64);
      expect(memRes.success).toBe(true);
      expect(k.memoryManager.getAllocations(pid)).toHaveLength(1);
      const ram = k.hardware.getDevice('ram0');
      expect(ram.getAllocations(pid)).toHaveLength(1);

      // Write data to process memory
      const writeRes = k.memoryManager.writeProcessMemory(pid, 0, [1, 2, 3, 4]);
      expect(writeRes.success).toBe(true);

      // 3. Queue storage requests
      const diskRes = k.diskManager.addRequest(30, pid, { operation: 'read' });
      expect(diskRes.success).toBe(true);
      const reqId = diskRes.data.requestId;
      expect(k.diskManager.getRequest(reqId).status).toBe(StorageRequestStatus.QUEUED);
      expect(k.diskManager.pendingRequests).toContain(30);

      // 4. Run on CPU
      k.processManager.setProcessState(pid, ProcessState.RUNNING);
      const cpu = k.hardware.getDevice('cpu0');
      expect(cpu.currentProcess).toBe(pid);

      // 5. Terminate process (Unified cross-resource cleanup)
      const termRes = k.processManager.terminateProcess(pid);
      expect(termRes.success).toBe(true);

      // Verify CPU released
      expect(cpu.currentProcess).toBeNull();

      // Verify Memory released (both logical and physical)
      expect(k.memoryManager.getAllocations(pid)).toHaveLength(0);
      expect(ram.getAllocations(pid)).toHaveLength(0);
      expect(k.memoryManager.blocks.find(b => b.allocatedProcessId === pid)).toBeUndefined();

      // Verify Storage requests cancelled
      expect(k.diskManager.getRequest(reqId).status).toBe(StorageRequestStatus.CANCELLED);
      expect(k.diskManager.pendingRequests).not.toContain(30);

      // Verify PCB updated
      const pcb = k.processManager.getProcess(pid);
      expect(pcb.state).toBe(ProcessState.TERMINATED);
      expect(pcb.allocatedMemory).toBe(0);
      expect(pcb.allocations).toEqual([]);
    });

    it('manages multiple processes competing for resources without cross-talk or leaks', () => {
      const p1 = k.processManager.createProcess({ name: 'Proc-1' }).data;
      const p2 = k.processManager.createProcess({ name: 'Proc-2' }).data;

      k.memoryManager.allocate(p1.pid, 32);
      k.memoryManager.allocate(p2.pid, 64);

      k.diskManager.addRequest(10, p1.pid);
      k.diskManager.addRequest(20, p2.pid);

      const ram = k.hardware.getDevice('ram0');

      // Terminate p1 only
      k.processManager.terminateProcess(p1.pid);

      // p1 is cleaned up
      expect(k.memoryManager.getAllocations(p1.pid)).toHaveLength(0);
      expect(ram.getAllocations(p1.pid)).toHaveLength(0);

      // p2 resources remain intact
      expect(k.memoryManager.getAllocations(p2.pid)).toHaveLength(1);
      expect(ram.getAllocations(p2.pid)).toHaveLength(1);
      expect(k.diskManager.pendingRequests).toContain(20);
      expect(k.diskManager.pendingRequests).not.toContain(10);
    });
  });

  describe('Reboot & Reset Semantics', () => {
    it('resets volatile resources (RAM, CPU) while preserving persistent storage on shutdown/boot', () => {
      const p1 = k.processManager.createProcess({ name: 'TempProc' }).data;
      k.memoryManager.allocate(p1.pid, 64);
      k.processManager.setProcessState(p1.pid, ProcessState.RUNNING);

      const disk = k.hardware.getDevice('disk0');
      disk.write(99, { persistent: true });

      const ram = k.hardware.getDevice('ram0');
      const cpu = k.hardware.getDevice('cpu0');

      expect(ram.used).toBeGreaterThan(0);
      expect(cpu.currentProcess).toBe(p1.pid);
      expect(JSON.parse(disk.read(99).data.data)).toEqual({ persistent: true });

      // Reboot
      k.shutdown();
      k.boot();

      const newRam = k.hardware.getDevice('ram0');
      const newCpu = k.hardware.getDevice('cpu0');
      const newDisk = k.hardware.getDevice('disk0');

      // Volatile hardware reset
      expect(newRam.used).toBe(0);
      expect(newRam.allocations.size).toBe(0);
      expect(newCpu.currentProcess).toBeNull();

      // Persistent storage preserved
      expect(JSON.parse(newDisk.read(99).data.data)).toEqual({ persistent: true });
    });
  });

  describe('Snapshot Safety & Serialization', () => {
    it('returns an immutable, fully serializable snapshot of integrated OS state', () => {
      const p1 = k.processManager.createProcess({ name: 'SnapshotProc' }).data;
      k.memoryManager.allocate(p1.pid, 32);
      k.diskManager.addRequest(15, p1.pid);
      k.processManager.setProcessState(p1.pid, ProcessState.RUNNING);

      const state1 = k.getState();

      // Verify structure
      expect(state1.system).toBeDefined();
      expect(state1.system.status).toBeDefined();
      expect(state1.processes).toBeDefined();
      expect(state1.memory).toBeDefined();
      expect(state1.disks).toBeDefined();
      expect(state1.hardware).toBeDefined();
      expect(state1.hardware.devices).toBeDefined();

      // Verify JSON serializability
      const serialized = JSON.stringify(state1);
      expect(typeof serialized).toBe('string');
      const parsed = JSON.parse(serialized);
      expect(parsed.processes.length).toBe(1);

      // Verify snapshot isolation: mutating snapshot does not affect kernel
      state1.processes.push({ pid: 999 });
      state1.memory.used = 888888;
      expect(k.getState().processes.length).toBe(1);
      expect(k.getState().memory.used).not.toBe(888888);
    });
  });
});
