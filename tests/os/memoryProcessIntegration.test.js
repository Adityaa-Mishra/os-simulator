/**
 * tests/os/memoryProcessIntegration.test.js
 * Automated tests for Process ↔ MemoryManager ↔ MemoryDevice integration in AdityyaOS.
 * Validates logical allocation linked to physical RAM, process-relative memory addressing,
 * out-of-bounds rejection, cross-process isolation, transactional rollback, and termination cleanup.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Kernel } from '../../public/js/os/kernel/Kernel.js';
import { OSEvents } from '../../public/js/os/kernel/OSEventEmitter.js';

describe('Phase 16: Process ↔ Memory Integration Tests', () => {
  let k;

  beforeEach(() => {
    k = new Kernel();
    k.boot();
  });

  describe('Logical Allocation Linked to Physical RAM', () => {
    it('links logical partition allocation to physical MemoryDevice address', () => {
      const p1 = k.processManager.createProcess({ name: 'Worker-1' }).data;
      const res = k.memoryManager.allocate(p1.pid, 64);

      expect(res.success).toBe(true);
      expect(res.data.address).toBeTypeOf('number');
      expect(res.data.size).toBe(64);

      // Verify MemoryManager tracks the allocation
      const allocs = k.memoryManager.getAllocations(p1.pid);
      expect(allocs).toHaveLength(1);
      expect(allocs[0].address).toBe(res.data.address);
      expect(allocs[0].size).toBe(64);

      // Verify physical MemoryDevice (ram0) tracks the allocation
      const ram = k.hardware.getDevice('ram0');
      const physicalAllocs = ram.getAllocations(p1.pid);
      expect(physicalAllocs).toHaveLength(1);
      expect(physicalAllocs[0].address).toBe(res.data.address);
      expect(physicalAllocs[0].size).toBe(64);

      // Verify PCB is synced
      const pcb = k.processManager.getProcess(p1.pid);
      expect(pcb.allocatedMemory).toBe(64);
      expect(pcb.allocations).toHaveLength(1);
      expect(pcb.allocations[0].address).toBe(res.data.address);
    });

    it('emits PROCESS_MEMORY_ALLOCATED event on successful allocation', () => {
      let eventPayload = null;
      k.events.on(OSEvents.PROCESS_MEMORY_ALLOCATED, (payload) => {
        eventPayload = payload;
      });

      const p1 = k.processManager.createProcess({ name: 'Worker-1' }).data;
      const res = k.memoryManager.allocate(p1.pid, 128);

      expect(res.success).toBe(true);
      expect(eventPayload).not.toBeNull();
      expect(eventPayload.pid).toBe(p1.pid);
      expect(eventPayload.size).toBe(128);
      expect(eventPayload.address).toBe(res.data.address);
    });
  });

  describe('Process-Relative Memory Addressing (Read & Write)', () => {
    it('writes and reads data at process-relative offsets mapped to physical RAM', () => {
      const p1 = k.processManager.createProcess({ name: 'Worker-1' }).data;
      k.memoryManager.allocate(p1.pid, 64);

      // Write at relative offset 0
      const writeRes1 = k.memoryManager.writeProcessMemory(p1.pid, 0, [10, 20, 30, 40]);
      expect(writeRes1.success).toBe(true);
      expect(writeRes1.data.processOffset).toBe(0);
      expect(writeRes1.data.bytesWritten).toBe(4);

      // Read back at relative offset 0
      const readRes1 = k.memoryManager.readProcessMemory(p1.pid, 0, 4);
      expect(readRes1.success).toBe(true);
      expect(readRes1.data.bytes).toEqual([10, 20, 30, 40]);

      // Write at relative offset 10
      const writeRes2 = k.memoryManager.writeProcessMemory(p1.pid, 10, [99, 100]);
      expect(writeRes2.success).toBe(true);

      // Read at relative offset 10
      const readRes2 = k.memoryManager.readProcessMemory(p1.pid, 10, 2);
      expect(readRes2.success).toBe(true);
      expect(readRes2.data.bytes).toEqual([99, 100]);

      // Verify the physical address matches base + offset
      const alloc = k.memoryManager.getAllocations(p1.pid)[0];
      const ram = k.hardware.getDevice('ram0');
      const directPhysicalRead = ram.read(alloc.address + 10, 2);
      expect(directPhysicalRead.data.bytes).toEqual([99, 100]);
    });

    it('supports string data writing and reading through process memory', () => {
      const p1 = k.processManager.createProcess({ name: 'Worker-1' }).data;
      k.memoryManager.allocate(p1.pid, 64);

      const writeRes = k.memoryManager.writeProcessMemory(p1.pid, 0, 'HELLO');
      expect(writeRes.success).toBe(true);

      const readRes = k.memoryManager.readProcessMemory(p1.pid, 0, 5);
      expect(readRes.success).toBe(true);
      // 'H' = 72, 'E' = 69, 'L' = 76, 'L' = 76, 'O' = 79
      expect(readRes.data.bytes).toEqual([72, 69, 76, 76, 79]);
    });

    it('works via structured system calls', () => {
      const p1 = k.processManager.createProcess({ name: 'SyscallWorker' }).data;
      
      const allocSyscall = k.syscall('process.memory.allocate', { pid: p1.pid, size: 32 });
      expect(allocSyscall.success).toBe(true);

      const writeSyscall = k.syscall('process.memory.write', { pid: p1.pid, offset: 4, data: [1, 2, 3] });
      expect(writeSyscall.success).toBe(true);

      const readSyscall = k.syscall('process.memory.read', { pid: p1.pid, offset: 4, length: 3 });
      expect(readSyscall.success).toBe(true);
      expect(readSyscall.data.bytes).toEqual([1, 2, 3]);

      const releaseSyscall = k.syscall('process.memory.release', { pid: p1.pid });
      expect(releaseSyscall.success).toBe(true);
    });
  });

  describe('Out-of-Bounds & Access Violation Checks', () => {
    it('rejects writes exceeding allocated process memory size', () => {
      const p1 = k.processManager.createProcess({ name: 'Worker-1' }).data;
      k.memoryManager.allocate(p1.pid, 32);

      // Offset 30 + length 4 = 34 > 32
      const writeRes = k.memoryManager.writeProcessMemory(p1.pid, 30, [1, 2, 3, 4]);
      expect(writeRes.success).toBe(false);
      expect(writeRes.error).toMatch(/exceeds allocated/i);
    });

    it('rejects reads exceeding allocated process memory size', () => {
      const p1 = k.processManager.createProcess({ name: 'Worker-1' }).data;
      k.memoryManager.allocate(p1.pid, 32);

      const readRes = k.memoryManager.readProcessMemory(p1.pid, 30, 5);
      expect(readRes.success).toBe(false);
      expect(readRes.error).toMatch(/exceeds allocated/i);
    });

    it('rejects negative offsets or invalid arguments', () => {
      const p1 = k.processManager.createProcess({ name: 'Worker-1' }).data;
      k.memoryManager.allocate(p1.pid, 32);

      expect(k.memoryManager.readProcessMemory(p1.pid, -1, 4).success).toBe(false);
      expect(k.memoryManager.writeProcessMemory(p1.pid, -5, [1]).success).toBe(false);
      expect(k.memoryManager.readProcessMemory(p1.pid, 0, 0).success).toBe(false);
    });

    it('rejects access for process with no memory allocated', () => {
      const p1 = k.processManager.createProcess({ name: 'Worker-NoMem' }).data;
      const readRes = k.memoryManager.readProcessMemory(p1.pid, 0, 4);
      expect(readRes.success).toBe(false);
      expect(readRes.error).toMatch(/no memory allocated/i);
    });
  });

  describe('Cross-Process Isolation', () => {
    it('isolates process memory spaces even if relative offsets are identical', () => {
      const p1 = k.processManager.createProcess({ name: 'Proc-1' }).data;
      const p2 = k.processManager.createProcess({ name: 'Proc-2' }).data;

      k.memoryManager.allocate(p1.pid, 64);
      k.memoryManager.allocate(p2.pid, 64);

      // Both write to process-relative offset 0
      k.memoryManager.writeProcessMemory(p1.pid, 0, [42, 42]);
      k.memoryManager.writeProcessMemory(p2.pid, 0, [99, 99]);

      // Each process reads only its own memory
      const read1 = k.memoryManager.readProcessMemory(p1.pid, 0, 2);
      const read2 = k.memoryManager.readProcessMemory(p2.pid, 0, 2);

      expect(read1.data.bytes).toEqual([42, 42]);
      expect(read2.data.bytes).toEqual([99, 99]);
    });
  });

  describe('Transactional Rollback on Allocation Failure', () => {
    it('aborts logical allocation and leaves state untouched if physical RAM fails', () => {
      const ram = k.hardware.getDevice('ram0');
      const initialUsed = k.memoryManager.used;
      const initialFreeBlocks = k.memoryManager.blocks.filter(b => b.isFree).length;

      // Mock ram.allocate to simulate physical RAM failure (e.g. out of physical memory)
      const origAllocate = ram.allocate.bind(ram);
      ram.allocate = () => ({ success: false, error: 'Simulated RAM exhaustion' });

      const p1 = k.processManager.createProcess({ name: 'FailProc' }).data;
      const res = k.memoryManager.allocate(p1.pid, 64);

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/physical memory allocation failed/i);

      // Verify logical state is unchanged
      expect(k.memoryManager.used).toBe(initialUsed);
      expect(k.memoryManager.blocks.filter(b => b.isFree).length).toBe(initialFreeBlocks);
      expect(k.memoryManager.getAllocations(p1.pid)).toHaveLength(0);

      // Restore ram.allocate
      ram.allocate = origAllocate;
    });
  });

  describe('Process Termination Memory Cleanup', () => {
    it('automatically frees both logical partitions and physical RAM on process termination', () => {
      let releasedEvent = null;
      k.events.on(OSEvents.PROCESS_MEMORY_RELEASED, (payload) => {
        releasedEvent = payload;
      });

      const p1 = k.processManager.createProcess({ name: 'TerminatingProc' }).data;
      k.memoryManager.allocate(p1.pid, 64);

      const ram = k.hardware.getDevice('ram0');
      expect(k.memoryManager.getAllocations(p1.pid)).toHaveLength(1);
      expect(ram.getAllocations(p1.pid)).toHaveLength(1);

      // Terminate process
      k.processManager.terminateProcess(p1.pid);

      // Verify logical memory freed
      expect(k.memoryManager.getAllocations(p1.pid)).toHaveLength(0);
      const allocatedBlock = k.memoryManager.blocks.find(b => b.allocatedProcessId === p1.pid);
      expect(allocatedBlock).toBeUndefined();

      // Verify physical RAM freed
      expect(ram.getAllocations(p1.pid)).toHaveLength(0);

      // Verify event was fired
      expect(releasedEvent).not.toBeNull();
      expect(releasedEvent.pid).toBe(p1.pid);
    });
  });
});
