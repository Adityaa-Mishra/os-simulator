/**
 * tests/os/processManager.test.js
 * Automated tests for AdityyaOS ProcessManager:
 * PID generation, reset semantics, state transitions, validation, and error isolation.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Kernel } from '../../public/js/os/kernel/Kernel.js';
import { ProcessState } from '../../public/js/os/kernel/ProcessManager.js';
import { OSEvents } from '../../public/js/os/kernel/OSEventEmitter.js';

describe('Phase 12: ProcessManager & PID Semantics Tests', () => {
  let k;
  let pm;

  beforeEach(() => {
    k = new Kernel();
    k.boot();
    pm = k.processManager;
  });

  describe('Explicit PID Generation & Reset Semantics', () => {
    it('assigns PID 1 to the first created process after boot', () => {
      const res = pm.createProcess({ name: 'Init' });
      expect(res.success).toBe(true);
      expect(res.data.pid).toBe(1);
    });

    it('increments PIDs sequentially for subsequent processes', () => {
      const p1 = pm.createProcess({ name: 'Proc-A' });
      const p2 = pm.createProcess({ name: 'Proc-B' });
      const p3 = pm.createProcess({ name: 'Proc-C' });

      expect(p1.data.pid).toBe(1);
      expect(p2.data.pid).toBe(2);
      expect(p3.data.pid).toBe(3);
    });

    it('returns PID sequence to 1 when kernel/manager is reset', () => {
      pm.createProcess({ name: 'Old-1' });
      pm.createProcess({ name: 'Old-2' });
      expect(pm.getProcesses().length).toBe(2);

      // Reset kernel
      k.reset();

      expect(pm.getProcesses().length).toBe(0);

      // Next process after reset must receive PID 1
      const resAfterReset = pm.createProcess({ name: 'New-1' });
      expect(resAfterReset.success).toBe(true);
      expect(resAfterReset.data.pid).toBe(1);
    });
  });

  describe('Process Creation & Validation', () => {
    it('creates a process with valid fields and sets state to READY', () => {
      let createdPayload = null;
      k.events.on(OSEvents.PROCESS_CREATED, p => {
        createdPayload = p;
      });

      const res = pm.createProcess({
        name: 'Worker',
        priority: 2,
        burstTime: 5,
        arrivalTime: 1,
        memoryRequired: 128
      });

      expect(res.success).toBe(true);
      expect(res.data.name).toBe('Worker');
      expect(res.data.priority).toBe(2);
      expect(res.data.burstTime).toBe(5);
      expect(res.data.remainingTime).toBe(5);
      expect(res.data.arrivalTime).toBe(1);
      expect(res.data.memoryRequired).toBe(128);
      expect(res.data.state).toBe(ProcessState.READY);

      // Verify event was emitted with relevant data
      expect(createdPayload).not.toBeNull();
      expect(createdPayload.pid).toBe(res.data.pid);
      expect(createdPayload.process.name).toBe('Worker');
    });

    it('fails when name is missing or empty, and does NOT corrupt state or emit event', () => {
      let eventEmitted = false;
      k.events.on(OSEvents.PROCESS_CREATED, () => {
        eventEmitted = true;
      });

      const res1 = pm.createProcess({ name: '' });
      expect(res1.success).toBe(false);
      expect(res1.error).toContain('name');

      const res2 = pm.createProcess({});
      expect(res2.success).toBe(false);

      expect(eventEmitted).toBe(false);
      expect(pm.getProcesses().length).toBe(0);
      expect(k.getState().processes.length).toBe(0);
    });

    it('fails when burstTime is <= 0 and does not allocate PID or emit event', () => {
      let eventEmitted = false;
      k.events.on(OSEvents.PROCESS_CREATED, () => {
        eventEmitted = true;
      });

      const res = pm.createProcess({ name: 'BadBurst', burstTime: 0 });
      expect(res.success).toBe(false);
      expect(res.error).toContain('burstTime');
      expect(eventEmitted).toBe(false);
      expect(pm.getProcesses().length).toBe(0);
    });
  });

  describe('Process State Transitions & Invariants', () => {
    it('supports transitioning to RUNNING and updates CPU currentProcess', () => {
      const p = pm.createProcess({ name: 'Active' }).data;
      expect(k.getState().cpu.currentProcess).toBeNull();

      const res = pm.setProcessState(p.pid, ProcessState.RUNNING);
      expect(res.success).toBe(true);
      expect(pm.getProcess(p.pid).state).toBe(ProcessState.RUNNING);
      expect(k.getState().cpu.currentProcess).toBe(p.pid);
    });

    it('ensures terminated processes CANNOT remain RUNNING', () => {
      const p = pm.createProcess({ name: 'Runner' }).data;
      pm.setProcessState(p.pid, ProcessState.RUNNING);
      expect(k.getState().cpu.currentProcess).toBe(p.pid);

      // Terminate process
      const termRes = pm.terminateProcess(p.pid);
      expect(termRes.success).toBe(true);

      const terminatedProc = pm.getProcess(p.pid);
      expect(terminatedProc.state).toBe(ProcessState.TERMINATED);
      // Critical invariant check:
      expect(k.getState().cpu.currentProcess).toBeNull();
    });

    it('suspends process to WAITING and resumes back to READY', () => {
      const p = pm.createProcess({ name: 'Worker' }).data;
      pm.setProcessState(p.pid, ProcessState.RUNNING);

      // Suspend
      const suspRes = pm.suspendProcess(p.pid);
      expect(suspRes.success).toBe(true);
      expect(pm.getProcess(p.pid).state).toBe(ProcessState.WAITING);
      expect(k.getState().cpu.currentProcess).toBeNull();

      // Resume
      const resumeRes = pm.resumeProcess(p.pid);
      expect(resumeRes.success).toBe(true);
      expect(pm.getProcess(p.pid).state).toBe(ProcessState.READY);
    });

    it('rejects suspending or resuming non-existent or terminated processes', () => {
      const p = pm.createProcess({ name: 'ToTerminate' }).data;
      pm.terminateProcess(p.pid);

      const suspRes = pm.suspendProcess(p.pid);
      expect(suspRes.success).toBe(false);
      expect(suspRes.error).toContain('terminated');

      const nonExistentRes = pm.resumeProcess(9999);
      expect(nonExistentRes.success).toBe(false);
      expect(nonExistentRes.error).toContain('not found');
    });

    it('cannot double-terminate an already terminated process', () => {
      const p = pm.createProcess({ name: 'Once' }).data;
      pm.terminateProcess(p.pid);

      const secondRes = pm.terminateProcess(p.pid);
      expect(secondRes.success).toBe(false);
      expect(secondRes.error).toContain('already terminated');
    });
  });

  describe('Process Querying & Filtering', () => {
    it('returns filtered process lists by state', () => {
      const p1 = pm.createProcess({ name: 'P1' }).data;
      const p2 = pm.createProcess({ name: 'P2' }).data;
      const p3 = pm.createProcess({ name: 'P3' }).data;

      pm.setProcessState(p1.pid, ProcessState.RUNNING);
      pm.suspendProcess(p2.pid);

      const readyList = pm.getProcesses({ state: ProcessState.READY });
      const runningList = pm.getProcesses({ state: ProcessState.RUNNING });
      const waitingList = pm.getProcesses({ state: ProcessState.WAITING });

      expect(readyList.length).toBe(1);
      expect(readyList[0].pid).toBe(p3.pid);
      expect(runningList.length).toBe(1);
      expect(runningList[0].pid).toBe(p1.pid);
      expect(waitingList.length).toBe(1);
      expect(waitingList[0].pid).toBe(p2.pid);
    });
  });
});
