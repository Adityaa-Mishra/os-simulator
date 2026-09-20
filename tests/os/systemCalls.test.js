/**
 * tests/os/systemCalls.test.js
 * Automated tests for AdityyaOS System Calls:
 * Structured API, consistent return format, error isolation, and event logging.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Kernel } from '../../public/js/os/kernel/Kernel.js';
import { OSEvents } from '../../public/js/os/kernel/OSEventEmitter.js';

describe('Phase 12: System Call Layer Tests', () => {
  let k;

  beforeEach(() => {
    k = new Kernel();
    k.boot();
  });

  describe('Structured Syscall API & Result Format Consistency', () => {
    it('returns consistent { success, data } format on successful system calls', () => {
      // Process create
      const pRes = k.syscall('process.create', { name: 'SysProc' });
      expect(pRes).toHaveProperty('success', true);
      expect(pRes).toHaveProperty('data');
      expect(pRes.data.pid).toBe(1);

      // Memory allocate
      const mRes = k.syscall('memory.allocate', { pid: 1, size: 50 });
      expect(mRes).toHaveProperty('success', true);
      expect(mRes.data.blockId).toBeDefined();

      // FS create
      const fRes = k.syscall('fs.create_file', { path: '/sys.log', size: 20 });
      expect(fRes).toHaveProperty('success', true);
      expect(fRes.data.id).toBeDefined();

      // System info
      const sRes = k.syscall('system.info', {});
      expect(sRes).toHaveProperty('success', true);
      expect(sRes.data.hostname).toBe('adityya-os');
      expect(sRes.data.status).toBe('RUNNING');
    });

    it('returns consistent { success: false, error } format on failed system calls', () => {
      // Missing process name
      const pFail = k.syscall('process.create', { name: '' });
      expect(pFail).toHaveProperty('success', false);
      expect(pFail).toHaveProperty('error');
      expect(typeof pFail.error).toBe('string');

      // Excessive memory request
      const mFail = k.syscall('memory.allocate', { pid: 1, size: 99999 });
      expect(mFail).toHaveProperty('success', false);
      expect(mFail.error).toContain('Insufficient');

      // Non-existent file read
      const fFail = k.syscall('fs.read_file', { path: '/does_not_exist.txt' });
      expect(fFail).toHaveProperty('success', false);
      expect(fFail.error).toContain('not found');
    });

    it('handles unknown system calls gracefully and returns a clear error', () => {
      let errorEvent = null;
      k.events.on(OSEvents.SYSCALL_ERROR, p => { errorEvent = p; });

      const badCall = k.syscall('kernel.hack_root', { payload: 'exploit' });
      expect(badCall.success).toBe(false);
      expect(badCall.error).toContain('Unknown system call');
      expect(errorEvent).not.toBeNull();
      expect(errorEvent.call).toBe('kernel.hack_root');
    });
  });

  describe('Transactional Behavior & Error Isolation', () => {
    it('does NOT emit SYSCALL_SUCCESS or corrupt subsystem state on failure', () => {
      let successEmitted = false;
      let errorEmitted = false;

      k.events.on(OSEvents.SYSCALL_SUCCESS, () => { successEmitted = true; });
      k.events.on(OSEvents.SYSCALL_ERROR, () => { errorEmitted = true; });

      const res = k.syscall('fs.delete_file', { path: '/ghost_file.txt' });
      expect(res.success).toBe(false);
      expect(successEmitted).toBe(false);
      expect(errorEmitted).toBe(true);

      // Verify file system state was untouched
      expect(k.getState().filesystem.allocatedBlocks).toBe(0);
    });

    it('emits SYSCALL_DISPATCHED and SYSCALL_SUCCESS on valid execution', () => {
      let dispatched = null;
      let succeeded = null;

      k.events.on(OSEvents.SYSCALL_DISPATCHED, p => { dispatched = p; });
      k.events.on(OSEvents.SYSCALL_SUCCESS, p => { succeeded = p; });

      const res = k.syscall('cpu.set_algorithm', { algorithm: 'SRTF' });
      expect(res.success).toBe(true);

      expect(dispatched).not.toBeNull();
      expect(dispatched.call).toBe('cpu.set_algorithm');
      expect(dispatched.payload.algorithm).toBe('SRTF');

      expect(succeeded).not.toBeNull();
      expect(succeeded.call).toBe('cpu.set_algorithm');
      expect(succeeded.data.algorithm).toBe('SRTF');
    });
  });

  describe('Subsystem Integration via Syscalls', () => {
    it('coordinates process creation, memory allocation, and termination cleanly via syscalls', () => {
      // 1. Create process
      const p1 = k.syscall('process.create', { name: 'App1' }).data;
      expect(p1.pid).toBe(1);

      // 2. Allocate memory
      const m1 = k.syscall('memory.allocate', { pid: p1.pid, size: 80 }).data;
      expect(m1.blockId).toBe('B1');
      expect(k.getState().memory.used).toBe(80);

      // 3. Terminate process -> must auto-free memory and set state to TERMINATED
      const tRes = k.syscall('process.terminate', { pid: p1.pid });
      expect(tRes.success).toBe(true);

      expect(k.getState().memory.used).toBe(0);
      expect(k.syscall('process.get', { pid: p1.pid }).data.state).toBe('TERMINATED');
    });

    it('executes disk and resource operations via syscalls', () => {
      // Disk
      k.syscall('disk.add_request', { cylinder: 85, pid: 1 });
      const diskState = k.syscall('disk.get_state', {}).data;
      expect(diskState.pendingRequests).toEqual([85]);

      // Resource
      k.syscall('resource.register', { resources: { CPU: 4, GPU: 2 } });
      k.syscall('resource.declare_max', { pid: 1, max: { CPU: 2, GPU: 1 } });
      const reqRes = k.syscall('resource.request', { pid: 1, request: { CPU: 1, GPU: 1 } });
      expect(reqRes.success).toBe(true);

      const safetyRes = k.syscall('resource.check_safety', {});
      expect(safetyRes.success).toBe(true);
      expect(safetyRes.data.isSafe).toBe(true);
    });
  });
});
