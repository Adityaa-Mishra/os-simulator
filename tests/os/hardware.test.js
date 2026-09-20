/**
 * tests/os/hardware.test.js
 * Automated unit tests for AdityyaOS HardwareManager, HardwareBus, and HardwareState.
 * Validates device registration, lifecycle coordination, structured bus requests,
 * allowlist enforcement, error isolation, and snapshot safety.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { HardwareManager } from '../../public/js/os/hardware/HardwareManager.js';
import { HardwareBus, ALLOWED_BUS_OPERATIONS } from '../../public/js/os/hardware/HardwareBus.js';
import { HardwareDevice } from '../../public/js/os/hardware/HardwareDevice.js';
import { DeviceStatus, DeviceType } from '../../public/js/os/hardware/HardwareState.js';
import { OSEventEmitter, OSEvents } from '../../public/js/os/kernel/OSEventEmitter.js';

describe('Phase 15: HardwareManager & HardwareBus Tests', () => {
  let mockKernel;
  let hwManager;

  beforeEach(() => {
    mockKernel = {
      events: new OSEventEmitter(),
      state: {}
    };
    hwManager = new HardwareManager(mockKernel);
  });

  /* =========================================================================
   * HardwareManager Registry & Lookup Tests
   * ========================================================================= */
  describe('HardwareManager Registry', () => {
    it('initializes default virtual hardware devices from profile', () => {
      expect(hwManager.devices.size).toBe(6);
      expect(hwManager.getDevice('cpu0')).toBeDefined();
      expect(hwManager.getDevice('ram0')).toBeDefined();
      expect(hwManager.getDevice('disk0')).toBeDefined();
      expect(hwManager.getDevice('input0')).toBeDefined();
      expect(hwManager.getDevice('display0')).toBeDefined();
      expect(hwManager.getDevice('clock0')).toBeDefined();
    });

    it('registers a new custom device successfully', () => {
      const customDev = new HardwareDevice({
        id: 'nic0',
        type: 'network',
        name: 'Virtual Network Interface'
      });

      const res = hwManager.registerDevice(customDev);
      expect(res.success).toBe(true);
      expect(hwManager.getDevice('nic0')).toBe(customDev);
    });

    it('rejects duplicate device registration without corrupting registry', () => {
      const duplicateDev = new HardwareDevice({ id: 'cpu0', type: DeviceType.CPU });
      const res = hwManager.registerDevice(duplicateDev);

      expect(res.success).toBe(false);
      expect(res.error).toContain('already registered');
      expect(hwManager.getDevice('cpu0').name).toBe('Adityya-64 Virtual Processor');
    });

    it('rejects devices with missing or invalid ID', () => {
      const badDev = new HardwareDevice({ id: '' });
      const res = hwManager.registerDevice(badDev);
      expect(res.success).toBe(false);
      expect(res.error).toContain('valid non-empty id');
    });

    it('unregisters an existing device and shuts it down', () => {
      const customDev = new HardwareDevice({ id: 'temp0', type: 'test' });
      hwManager.registerDevice(customDev);
      customDev.initialize();
      expect(customDev.status).toBe(DeviceStatus.READY);

      let removedEvent = null;
      mockKernel.events.on(OSEvents.DEVICE_REMOVED, p => { removedEvent = p; });

      const res = hwManager.unregisterDevice('temp0');
      expect(res.success).toBe(true);
      expect(hwManager.getDevice('temp0')).toBeNull();
      expect(customDev.status).toBe(DeviceStatus.OFFLINE);
      expect(removedEvent).toEqual({ id: 'temp0' });
    });

    it('returns error when unregistering an unknown device', () => {
      const res = hwManager.unregisterDevice('ghost0');
      expect(res.success).toBe(false);
      expect(res.error).toContain('not found');
    });

    it('filters devices by type and status', () => {
      const cpus = hwManager.getDevices({ type: DeviceType.CPU });
      expect(cpus.length).toBe(1);
      expect(cpus[0].id).toBe('cpu0');

      const offlines = hwManager.getDevices({ status: DeviceStatus.OFFLINE });
      expect(offlines.length).toBe(6); // Before initialize()
    });
  });

  /* =========================================================================
   * HardwareManager Lifecycle Tests
   * ========================================================================= */
  describe('HardwareManager Lifecycle', () => {
    it('initializes all registered devices and emits lifecycle events', () => {
      const events = [];
      mockKernel.events.on(OSEvents.HARDWARE_INITIALIZING, () => events.push('INITIALIZING'));
      mockKernel.events.on(OSEvents.DEVICE_READY, p => events.push(`READY:${p.id}`));
      mockKernel.events.on(OSEvents.HARDWARE_READY, () => events.push('HARDWARE_READY'));

      const res = hwManager.initialize();
      expect(res.success).toBe(true);
      expect(hwManager.isInitialized).toBe(true);
      expect(events[0]).toBe('INITIALIZING');
      expect(events).toContain('READY:cpu0');
      expect(events).toContain('READY:ram0');
      expect(events[events.length - 1]).toBe('HARDWARE_READY');

      const allReady = hwManager.getDevices().every(d => d.status === DeviceStatus.READY);
      expect(allReady).toBe(true);
    });

    it('transactionally rolls back on device initialization failure', () => {
      const faultyDev = new HardwareDevice({ id: 'faulty0', type: 'broken' });
      faultyDev.initialize = () => ({ success: false, error: 'Hardware fault' });
      hwManager.registerDevice(faultyDev);

      let hwError = null;
      let devError = null;
      mockKernel.events.on(OSEvents.HARDWARE_ERROR, p => { hwError = p; });
      mockKernel.events.on(OSEvents.DEVICE_ERROR, p => { devError = p; });

      const res = hwManager.initialize();
      expect(res.success).toBe(false);
      expect(res.error).toContain('Hardware fault');
      expect(hwManager.isInitialized).toBe(false);
      expect(hwError).not.toBeNull();
      expect(devError).not.toBeNull();
      expect(faultyDev.status).toBe(DeviceStatus.ERROR);

      // Previously initialized devices must have been cleanly shut down
      const clock = hwManager.getDevice('clock0');
      expect(clock.status).toBe(DeviceStatus.OFFLINE);
    });

    it('shuts down all devices in reverse order and emits HARDWARE_SHUTDOWN', () => {
      hwManager.initialize();
      expect(hwManager.isInitialized).toBe(true);

      let shutdownEmitted = false;
      mockKernel.events.on(OSEvents.HARDWARE_SHUTDOWN, () => { shutdownEmitted = true; });

      const res = hwManager.shutdown();
      expect(res.success).toBe(true);
      expect(hwManager.isInitialized).toBe(false);
      expect(shutdownEmitted).toBe(true);

      const allOffline = hwManager.getDevices().every(d => d.status === DeviceStatus.OFFLINE);
      expect(allOffline).toBe(true);
    });

    it('resets all devices and preserves persistent storage by default', () => {
      hwManager.initialize();

      // Write to storage and allocate RAM
      const disk = hwManager.getDevice('disk0');
      disk.write(5, 'Persistent sector data');
      const ram = hwManager.getDevice('ram0');
      ram.allocate(1, 100);

      let resetEmitted = false;
      mockKernel.events.on(OSEvents.DEVICE_RESET, () => { resetEmitted = true; });

      hwManager.reset();
      expect(resetEmitted).toBe(true);

      // RAM is volatile -> reset clears it
      expect(ram.usedBytes).toBe(0);
      // Storage is persistent -> sector data retained
      expect(disk.read(5).data.data).toBe('Persistent sector data');
    });
  });

  /* =========================================================================
   * HardwareBus Tests
   * ========================================================================= */
  describe('HardwareBus', () => {
    beforeEach(() => {
      hwManager.initialize();
    });

    it('dispatches valid request across the bus and returns structured result', () => {
      const res = hwManager.bus.request('cpu0', 'setUtilization', 45);
      expect(res.success).toBe(true);
      expect(res.data.utilization).toBe(45);
      expect(hwManager.getDevice('cpu0').utilization).toBe(45);
    });

    it('fails safely when requesting an unknown device', () => {
      const res = hwManager.bus.request('unknown_dev', 'getState');
      expect(res.success).toBe(false);
      expect(res.error).toContain('not found');
    });

    it('enforces operation allowlist and rejects unpermitted operations', () => {
      const res = hwManager.bus.request('cpu0', 'reformatDrive', {});
      expect(res.success).toBe(false);
      expect(res.error).toContain('not permitted');
    });

    it('fails safely when device is disabled', () => {
      const dev = hwManager.getDevice('display0');
      dev.enabled = false;

      const res = hwManager.bus.request('display0', 'getResolution');
      expect(res.success).toBe(false);
      expect(res.error).toContain('disabled');
    });

    it('isolates device execution errors without crashing bus', () => {
      const res = hwManager.bus.request('ram0', 'read', { address: 999999, length: 10 });
      expect(res.success).toBe(false);
      expect(res.error).toContain('out of bounds');
    });
  });

  /* =========================================================================
   * Snapshot Safety & Immutability Tests
   * ========================================================================= */
  describe('Hardware State Snapshot Safety', () => {
    it('returns a safe snapshot of all hardware from getHardwareState()', () => {
      hwManager.initialize();
      const snapshot = hwManager.getHardwareState();

      expect(snapshot.initialized).toBe(true);
      expect(snapshot.deviceCount).toBe(6);
      expect(snapshot.devices.cpu0.utilization).toBe(0);

      // Mutate returned snapshot
      snapshot.devices.cpu0.utilization = 99;
      snapshot.devices.newDev = { hack: true };
      delete snapshot.devices.ram0;

      // Verify internal state is untouched
      const fresh = hwManager.getHardwareState();
      expect(fresh.devices.cpu0.utilization).toBe(0);
      expect(fresh.devices.newDev).toBeUndefined();
      expect(fresh.devices.ram0).toBeDefined();
    });

    it('returns a safe snapshot of a single device from getDeviceInfo()', () => {
      hwManager.initialize();
      const info = hwManager.getDeviceInfo('cpu0');
      expect(info.id).toBe('cpu0');

      info.architecture = 'HackedArch';
      info.cores = 999;

      const freshInfo = hwManager.getDeviceInfo('cpu0');
      expect(freshInfo.architecture).toBe('Adityya64');
      expect(freshInfo.cores).toBe(1);
    });

    it('provides clean read-oriented diagnostics', () => {
      hwManager.initialize();
      const diag = hwManager.getDiagnostics();

      expect(diag.cpu.id).toBe('cpu0');
      expect(diag.memory.id).toBe('ram0');
      expect(diag.storage.id).toBe('disk0');
      expect(diag.display.id).toBe('display0');
      expect(diag.input.id).toBe('input0');
      expect(diag.clock.id).toBe('clock0');
    });
  });
});
