/**
 * tests/os/kernelLifecycle.test.js
 * Automated tests for AdityyaOS Kernel initialization, lifecycle (boot, shutdown, reset),
 * event emission, and OS state isolation.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Kernel, kernel } from '../../public/js/os/kernel/Kernel.js';
import { SystemStatus } from '../../public/js/os/kernel/OSState.js';
import { OSEvents } from '../../public/js/os/kernel/OSEventEmitter.js';

describe('Phase 12: Kernel Lifecycle & OS State Tests', () => {
  let k;

  beforeEach(() => {
    k = new Kernel();
  });

  describe('Kernel Instantiation & Isolation', () => {
    it('creates a fresh kernel instance with default stopped state', () => {
      expect(k.getStatus()).toBe(SystemStatus.STOPPED);
      const state = k.getState();
      expect(state.system.status).toBe(SystemStatus.STOPPED);
      expect(state.system.hostname).toBe('adityya-os');
      expect(state.system.version).toBe('1.0.0');
      expect(state.cpu.cores).toBe(1);
      expect(state.cpu.activeAlgorithm).toBe('FCFS');
      expect(state.memory.total).toBe(1024);
      expect(state.memory.used).toBe(0);
      expect(state.processes).toEqual([]);
      expect(state.disks[0].id).toBe('disk0');
    });

    it('supports custom configuration parameters', () => {
      const customKernel = new Kernel({
        hostname: 'test-lab-pc',
        cores: 4,
        totalMemory: 2048
      });
      const state = customKernel.getState();
      expect(state.system.hostname).toBe('test-lab-pc');
      expect(state.cpu.cores).toBe(4);
      expect(state.memory.total).toBe(2048);
      expect(state.memory.free).toBe(2048);
    });

    it('keeps multiple kernel instances strictly isolated from each other', () => {
      const k1 = new Kernel();
      const k2 = new Kernel();

      k1.boot();
      k1.syscall('process.create', { name: 'Proc-1' });

      expect(k1.getStatus()).toBe(SystemStatus.RUNNING);
      expect(k1.getState().processes.length).toBe(1);

      expect(k2.getStatus()).toBe(SystemStatus.STOPPED);
      expect(k2.getState().processes.length).toBe(0);
    });

    it('provides a valid singleton export without crashing', () => {
      expect(kernel).toBeInstanceOf(Kernel);
      expect(typeof kernel.boot).toBe('function');
      expect(typeof kernel.syscall).toBe('function');
    });
  });

  describe('Boot Lifecycle', () => {
    it('transitions through BOOTING, READY, and RUNNING states', () => {
      const recordedEvents = [];
      k.events.on(OSEvents.SYSTEM_BOOTING, p => recordedEvents.push({ event: 'BOOTING', p }));
      k.events.on(OSEvents.SYSTEM_READY, p => recordedEvents.push({ event: 'READY', p }));
      k.events.on(OSEvents.SYSTEM_RUNNING, p => recordedEvents.push({ event: 'RUNNING', p }));

      const res = k.boot();
      expect(res.success).toBe(true);
      expect(res.status).toBe(SystemStatus.RUNNING);
      expect(k.getStatus()).toBe(SystemStatus.RUNNING);

      expect(recordedEvents.length).toBe(3);
      expect(recordedEvents[0].event).toBe('BOOTING');
      expect(recordedEvents[1].event).toBe('READY');
      expect(recordedEvents[2].event).toBe('RUNNING');
      expect(recordedEvents[0].p.timestamp).toBeDefined();
    });

    it('initializes all subsystem managers on boot', () => {
      k.boot();
      const state = k.getState();
      expect(state.filesystem.currentPath).toBe('/');
      expect(state.filesystem.totalBlocks).toBe(32);
      expect(state.filesystem.allocatedBlocks).toBe(0);
      expect(state.disks[0].headPosition).toBe(53);
      expect(state.memory.used).toBe(0);
      expect(state.memory.free).toBe(1024);
    });
  });

  describe('Shutdown Lifecycle', () => {
    it('transitions to SHUTTING_DOWN then STOPPED', () => {
      k.boot();
      const recorded = [];
      k.events.on(OSEvents.SYSTEM_SHUTTING_DOWN, () => recorded.push('SHUTTING_DOWN'));
      k.events.on(OSEvents.SYSTEM_STOPPED, () => recorded.push('STOPPED'));

      const res = k.shutdown();
      expect(res.success).toBe(true);
      expect(res.status).toBe(SystemStatus.STOPPED);
      expect(k.getStatus()).toBe(SystemStatus.STOPPED);
      expect(recorded).toEqual(['SHUTTING_DOWN', 'STOPPED']);
    });

    it('terminates all active processes upon shutdown', () => {
      k.boot();
      k.syscall('process.create', { name: 'P1' });
      k.syscall('process.create', { name: 'P2' });

      expect(k.processManager.getProcesses().length).toBe(2);
      expect(k.processManager.getProcesses().every(p => p.state === 'READY')).toBe(true);

      k.shutdown();

      const processes = k.processManager.getProcesses();
      expect(processes.every(p => p.state === 'TERMINATED')).toBe(true);
      expect(k.getState().cpu.currentProcess).toBeNull();
    });
  });

  describe('Reset Lifecycle', () => {
    it('resets all subsystem state and emits SYSTEM_RESET', () => {
      k.boot();
      k.syscall('process.create', { name: 'Temp' });
      k.syscall('fs.create_file', { path: '/test.txt', size: 10 });
      k.syscall('disk.add_request', { cylinder: 100 });

      let resetEmitted = false;
      k.events.on(OSEvents.SYSTEM_RESET, () => {
        resetEmitted = true;
      });

      const res = k.reset();
      expect(res.success).toBe(true);
      expect(res.status).toBe(SystemStatus.STOPPED);
      expect(resetEmitted).toBe(true);

      const state = k.getState();
      expect(state.processes.length).toBe(0);
      expect(state.disks[0].pendingRequests.length).toBe(0);
      expect(state.filesystem.allocatedBlocks).toBe(0);
      expect(state.system.status).toBe(SystemStatus.STOPPED);
    });
  });

  describe('State Snapshot Immutability (getState())', () => {
    it('protects internal kernel state from mutations of returned snapshots', () => {
      k.boot();
      k.syscall('process.create', { name: 'ProtectedProc' });

      const snapshot = k.getState();
      expect(snapshot.processes.length).toBe(1);

      // Mutate the returned snapshot directly
      snapshot.processes[0].name = 'HackedName';
      snapshot.processes.push({ pid: 999, name: 'Injected' });
      snapshot.system.status = 'COMPROMISED';
      snapshot.memory.used = 999999;

      // Verify internal kernel state remained completely unchanged
      const freshSnapshot = k.getState();
      expect(freshSnapshot.processes.length).toBe(1);
      expect(freshSnapshot.processes[0].name).toBe('ProtectedProc');
      expect(freshSnapshot.system.status).toBe(SystemStatus.RUNNING);
      expect(freshSnapshot.memory.used).toBe(0);
    });
  });
});
