/**
 * tests/os/hardwareKernelIntegration.test.js
 * Automated integration tests for AdityyaOS Kernel ↔ Virtual Hardware Layer.
 * Validates transactional boot/shutdown lifecycle, reboot without duplicate devices,
 * subsystem adapter connections, hardware system calls, and snapshot safety.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Kernel } from '../../public/js/os/kernel/Kernel.js';
import { SystemStatus } from '../../public/js/os/kernel/OSState.js';
import { OSEvents } from '../../public/js/os/kernel/OSEventEmitter.js';
import { DeviceStatus } from '../../public/js/os/hardware/HardwareState.js';
import { HardwareDevice } from '../../public/js/os/hardware/HardwareDevice.js';

describe('Phase 15: Kernel & Hardware Integration Tests', () => {
  let k;

  beforeEach(() => {
    k = new Kernel();
  });

  /* =========================================================================
   * Boot & Shutdown Lifecycle Integration
   * ========================================================================= */
  describe('Kernel Boot & Shutdown Lifecycle with Hardware', () => {
    it('initializes hardware layer before reaching READY and RUNNING', () => {
      const events = [];
      k.events.on(OSEvents.HARDWARE_INITIALIZING, () => events.push('HW_INIT'));
      k.events.on(OSEvents.HARDWARE_READY, () => events.push('HW_READY'));
      k.events.on(OSEvents.SYSTEM_READY, () => events.push('SYS_READY'));
      k.events.on(OSEvents.SYSTEM_RUNNING, () => events.push('SYS_RUNNING'));

      const res = k.boot();
      expect(res.success).toBe(true);
      expect(res.status).toBe(SystemStatus.RUNNING);

      // Verify sequence: HW_INIT -> HW_READY -> SYS_READY -> SYS_RUNNING
      expect(events).toEqual(['HW_INIT', 'HW_READY', 'SYS_READY', 'SYS_RUNNING']);
      expect(k.hardware.isInitialized).toBe(true);

      const allReady = k.hardware.getDevices().every(d => d.status === DeviceStatus.READY);
      expect(allReady).toBe(true);
    });

    it('shuts down hardware layer when Kernel is shut down', () => {
      k.boot();
      expect(k.hardware.isInitialized).toBe(true);

      const events = [];
      k.events.on(OSEvents.SYSTEM_SHUTTING_DOWN, () => events.push('SHUTTING_DOWN'));
      k.events.on(OSEvents.HARDWARE_SHUTDOWN, () => events.push('HW_SHUTDOWN'));
      k.events.on(OSEvents.SYSTEM_STOPPED, () => events.push('STOPPED'));

      const res = k.shutdown();
      expect(res.success).toBe(true);
      expect(res.status).toBe(SystemStatus.STOPPED);

      expect(events).toEqual(['SHUTTING_DOWN', 'HW_SHUTDOWN', 'STOPPED']);
      expect(k.hardware.isInitialized).toBe(false);

      const allOffline = k.hardware.getDevices().every(d => d.status === DeviceStatus.OFFLINE);
      expect(allOffline).toBe(true);
    });

    it('fails boot transactionally and halts in STOPPED if a device fails initialization', () => {
      const brokenDevice = new HardwareDevice({ id: 'broken_chip', type: 'chip' });
      brokenDevice.initialize = () => ({ success: false, error: 'Hardware POST failure' });
      k.hardware.registerDevice(brokenDevice);

      let hwError = null;
      k.events.on(OSEvents.HARDWARE_ERROR, p => { hwError = p; });

      const res = k.boot();
      expect(res.success).toBe(false);
      expect(res.status).toBe(SystemStatus.STOPPED);
      expect(res.error).toContain('Hardware POST failure');
      expect(k.getStatus()).toBe(SystemStatus.STOPPED);
      expect(hwError).not.toBeNull();

      // Ensure other devices were cleanly rolled back to OFFLINE
      expect(k.hardware.getDevice('cpu0').status).toBe(DeviceStatus.OFFLINE);
      expect(k.hardware.isInitialized).toBe(false);
    });
  });

  /* =========================================================================
   * Reboot & Persistence Semantics Tests
   * ========================================================================= */
  describe('Reboot & Persistence Semantics', () => {
    it('reboots without duplicate device registration (boot -> shutdown -> boot)', () => {
      k.boot();
      const initialCount = k.hardware.devices.size;
      expect(initialCount).toBe(6);

      k.shutdown();
      expect(k.hardware.devices.size).toBe(initialCount);

      k.boot();
      expect(k.hardware.devices.size).toBe(initialCount);
      expect(k.hardware.isInitialized).toBe(true);
      expect(k.hardware.getDevice('cpu0')).toBeDefined();
    });

    it('resets volatile RAM but preserves persistent storage across reboot', () => {
      k.boot();

      // 1. Allocate memory and write to storage
      k.syscall('memory.allocate', { pid: 1, size: 64 });
      const disk = k.hardware.getDevice('disk0');
      disk.write(3, 'SavedDocumentData');

      const ram = k.hardware.getDevice('ram0');
      expect(ram.usedBytes).toBe(64);
      expect(disk.read(3).data.data).toBe('SavedDocumentData');

      // 2. Reboot (shutdown -> boot)
      k.shutdown();
      k.boot();

      // 3. RAM must be reset, storage must persist!
      const rebootedRam = k.hardware.getDevice('ram0');
      const rebootedDisk = k.hardware.getDevice('disk0');

      expect(rebootedRam.usedBytes).toBe(0);
      expect(rebootedRam.freeBytes).toBe(rebootedRam.totalBytes);
      expect(rebootedDisk.read(3).data.data).toBe('SavedDocumentData');
    });

    it('clears storage only on explicit reset with clearStorage option', () => {
      k.boot();
      const disk = k.hardware.getDevice('disk0');
      disk.write(0, 'ImportantData');

      // Normal reset
      k.reset();
      expect(disk.read(0).data.data).toBe('ImportantData');

      // Explicit clear
      k.reset({ clearStorage: true });
      expect(disk.read(0).data.data).toBeNull();
    });
  });

  /* =========================================================================
   * Subsystem ↔ Hardware Adapter Tests
   * ========================================================================= */
  describe('Subsystem ↔ Hardware Adapter Coordination', () => {
    beforeEach(() => {
      k.boot();
    });

    it('coordinates CPU device on process execution and scheduler runs', () => {
      const cpu = k.hardware.getDevice('cpu0');

      // 1. Create process and set state to RUNNING
      const p = k.syscall('process.create', { name: 'AppProcess' }).data;
      k.processManager.setProcessState(p.pid, 'RUNNING');
      expect(cpu.currentProcess).toBe(p.pid);

      // 2. Run scheduler -> updates CPU utilization
      k.schedulerManager.schedule([{ id: p.pid, arrivalTime: 0, burstTime: 5 }]);
      expect(cpu.utilization).toBeGreaterThan(0);
      expect(cpu.instructionsExecuted).toBeGreaterThan(0);

      // 3. Terminate process -> releases CPU
      k.syscall('process.terminate', { pid: p.pid });
      expect(cpu.currentProcess).toBeNull();
    });

    it('coordinates Memory device on memory allocation and free', () => {
      const ram = k.hardware.getDevice('ram0');

      // Allocate via memory manager
      k.memoryManager.allocate(1, 128);
      expect(ram.usedBytes).toBe(128);
      expect(ram.freeBytes).toBe(ram.totalBytes - 128);

      // Free via memory manager
      k.memoryManager.free(1);
      expect(ram.usedBytes).toBe(0);
      expect(ram.freeBytes).toBe(ram.totalBytes);
    });

    it('coordinates Storage device on disk schedule seek', () => {
      const disk = k.hardware.getDevice('disk0');
      expect(disk.headPosition).toBe(0);

      // Schedule disk requests
      k.diskManager.addRequest(88);
      k.diskManager.schedule();

      // Final head position should be mirrored on virtual drive
      expect(disk.headPosition).toBe(k.diskManager.headPosition);
    });
  });

  /* =========================================================================
   * Hardware System Calls & Diagnostics Tests
   * ========================================================================= */
  describe('Hardware System Calls & Diagnostics', () => {
    beforeEach(() => {
      k.boot();
    });

    it('dispatches hardware.info syscall returning complete hardware snapshot', () => {
      const res = k.syscall('hardware.info');
      expect(res.success).toBe(true);
      expect(res.data.initialized).toBe(true);
      expect(res.data.deviceCount).toBe(6);
      expect(res.data.devices.cpu0).toBeDefined();
      expect(res.data.devices.ram0).toBeDefined();
    });

    it('dispatches hardware.device.get syscall for specific device', () => {
      const res = k.syscall('hardware.device.get', { deviceId: 'display0' });
      expect(res.success).toBe(true);
      expect(res.data.id).toBe('display0');
      expect(res.data.type).toBe('display');
      expect(res.data.width).toBe(1920);

      const badRes = k.syscall('hardware.device.get', { deviceId: 'nonexistent' });
      expect(badRes.success).toBe(false);
      expect(badRes.error).toContain('not found');
    });

    it('dispatches hardware.diagnostics syscall returning structured subsystem info', () => {
      const res = k.syscall('hardware.diagnostics');
      expect(res.success).toBe(true);
      expect(res.data.cpu.id).toBe('cpu0');
      expect(res.data.memory.id).toBe('ram0');
      expect(res.data.storage.id).toBe('disk0');
      expect(res.data.display.id).toBe('display0');
      expect(res.data.input.id).toBe('input0');
      expect(res.data.clock.id).toBe('clock0');
    });

    it('dispatches restricted hardware.bus.request enforcing allowlist', () => {
      // Allowed operation: setUtilization on cpu0
      const okRes = k.syscall('hardware.bus.request', {
        deviceId: 'cpu0',
        operation: 'setUtilization',
        payload: { utilization: 60 }
      });
      expect(okRes.success).toBe(true);
      expect(k.hardware.getDevice('cpu0').utilization).toBe(60);

      // Disallowed operation: arbitrary function
      const badRes = k.syscall('hardware.bus.request', {
        deviceId: 'cpu0',
        operation: 'evalScript',
        payload: 'alert(1)'
      });
      expect(badRes.success).toBe(false);
      expect(badRes.error).toContain('not permitted');
    });

    it('protects hardware state from external mutation via getHardwareState()', () => {
      const state = k.hardware.getHardwareState();
      state.devices.cpu0.frequencyMHz = 999999;
      state.devices.ram0.totalBytes = 0;

      const fresh = k.hardware.getHardwareState();
      expect(fresh.devices.cpu0.frequencyMHz).toBe(2400);
      expect(fresh.devices.ram0.totalBytes).toBe(1024);
    });
  });
});
