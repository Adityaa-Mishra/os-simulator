/**
 * tests/os/processHardwareIntegration.test.js
 * Automated tests for ProcessManager ↔ SchedulerManager ↔ CPUDevice integration in AdityyaOS.
 * Validates running process reflection on hardware CPU, CPU utilization updates,
 * process preemption/suspension/release, and zero stale PID on termination.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Kernel } from '../../public/js/os/kernel/Kernel.js';
import { ProcessState } from '../../public/js/os/kernel/ProcessManager.js';
import { OSEvents } from '../../public/js/os/kernel/OSEventEmitter.js';

describe('Phase 16: Process ↔ CPU Integration Tests', () => {
  let k;

  beforeEach(() => {
    k = new Kernel();
    k.boot();
  });

  describe('Process Running State & CPU Assignment', () => {
    it('assigns running process to CPUDevice and emits PROCESS_CPU_ASSIGNED', () => {
      let assignedPid = null;
      k.events.on(OSEvents.PROCESS_CPU_ASSIGNED, ({ pid }) => {
        assignedPid = pid;
      });

      const p1 = k.processManager.createProcess({ name: 'Task-1' }).data;
      const cpu = k.hardware.getDevice('cpu0');

      expect(cpu.currentProcess).toBeNull();

      k.processManager.setProcessState(p1.pid, ProcessState.RUNNING);

      expect(cpu.currentProcess).toBe(p1.pid);
      expect(k.getState().cpu.currentProcess).toBe(p1.pid);
      expect(assignedPid).toBe(p1.pid);
    });

    it('releases CPU when process is suspended (WAITING) and emits PROCESS_CPU_RELEASED', () => {
      let releasedPid = null;
      k.events.on(OSEvents.PROCESS_CPU_RELEASED, ({ pid }) => {
        releasedPid = pid;
      });

      const p1 = k.processManager.createProcess({ name: 'Task-1' }).data;
      const cpu = k.hardware.getDevice('cpu0');

      k.processManager.setProcessState(p1.pid, ProcessState.RUNNING);
      expect(cpu.currentProcess).toBe(p1.pid);

      k.processManager.suspendProcess(p1.pid);
      expect(cpu.currentProcess).toBeNull();
      expect(k.getState().cpu.currentProcess).toBeNull();
      expect(releasedPid).toBe(p1.pid);
    });

    it('releases CPU when process is preempted (RUNNING -> READY)', () => {
      const p1 = k.processManager.createProcess({ name: 'Task-1' }).data;
      const cpu = k.hardware.getDevice('cpu0');

      k.processManager.setProcessState(p1.pid, ProcessState.RUNNING);
      expect(cpu.currentProcess).toBe(p1.pid);

      k.processManager.setProcessState(p1.pid, ProcessState.READY);
      expect(cpu.currentProcess).toBeNull();
      expect(k.getState().cpu.currentProcess).toBeNull();
    });

    it('releases CPU when process is terminated', () => {
      const p1 = k.processManager.createProcess({ name: 'Task-1' }).data;
      const cpu = k.hardware.getDevice('cpu0');

      k.processManager.setProcessState(p1.pid, ProcessState.RUNNING);
      expect(cpu.currentProcess).toBe(p1.pid);

      k.processManager.terminateProcess(p1.pid);
      expect(cpu.currentProcess).toBeNull();
      expect(k.getState().cpu.currentProcess).toBeNull();
    });
  });

  describe('SchedulerManager ↔ CPUDevice Workload Reflection', () => {
    it('updates CPUDevice utilization and instruction counts from scheduler runs', () => {
      const p1 = k.processManager.createProcess({ name: 'Proc-A', burstTime: 5 }).data;
      const p2 = k.processManager.createProcess({ name: 'Proc-B', burstTime: 3 }).data;

      const cpu = k.hardware.getDevice('cpu0');
      const initialInstructions = cpu.instructionsExecuted;

      const res = k.schedulerManager.schedule([
        { id: p1.pid, arrivalTime: 0, burstTime: 5 },
        { id: p2.pid, arrivalTime: 1, burstTime: 3 }
      ]);

      expect(res.success).toBe(true);
      expect(cpu.utilization).toBeGreaterThan(0);
      expect(cpu.instructionsExecuted).toBeGreaterThan(initialInstructions);
    });

    it('preserves clear ownership: SchedulerManager owns algorithms, CPUDevice is simulated hardware', () => {
      const cpu = k.hardware.getDevice('cpu0');
      expect(typeof cpu.executeWorkload).toBe('function');
      // CPUDevice does not have scheduling engines
      expect(cpu.engines).toBeUndefined();
      expect(k.schedulerManager.engines).toBeDefined();
    });
  });
});
