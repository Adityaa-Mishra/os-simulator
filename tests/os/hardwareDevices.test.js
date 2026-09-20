/**
 * tests/os/hardwareDevices.test.js
 * Automated unit tests for all virtual hardware devices in AdityyaOS:
 * CPUDevice, MemoryDevice, StorageDevice, InputDevice, DisplayDevice, and ClockDevice.
 * Validates device capabilities, bounds, validation, volatile/persistent semantics,
 * and snapshot safety for every device.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CPUDevice } from '../../public/js/os/hardware/CPUDevice.js';
import { MemoryDevice } from '../../public/js/os/hardware/MemoryDevice.js';
import { StorageDevice } from '../../public/js/os/hardware/StorageDevice.js';
import { InputDevice } from '../../public/js/os/hardware/InputDevice.js';
import { DisplayDevice } from '../../public/js/os/hardware/DisplayDevice.js';
import { ClockDevice } from '../../public/js/os/hardware/ClockDevice.js';
import { DeviceStatus } from '../../public/js/os/hardware/HardwareState.js';

describe('Phase 15: Hardware Devices Tests', () => {

  /* =========================================================================
   * CPUDevice Tests
   * ========================================================================= */
  describe('CPUDevice', () => {
    let cpu;

    beforeEach(() => {
      cpu = new CPUDevice({ cores: 2, frequencyMHz: 3200 });
      cpu.initialize();
    });

    it('initializes with configured parameters and ready status', () => {
      expect(cpu.status).toBe(DeviceStatus.READY);
      expect(cpu.cores).toBe(2);
      expect(cpu.frequencyMHz).toBe(3200);
      expect(cpu.architecture).toBe('Adityya64');
      expect(cpu.utilization).toBe(0);
      expect(cpu.currentProcess).toBeNull();
    });

    it('clamps utilization within 0 to 100', () => {
      cpu.setUtilization(45.5);
      expect(cpu.utilization).toBe(45.5);

      cpu.setUtilization(150);
      expect(cpu.utilization).toBe(100);

      cpu.setUtilization(-20);
      expect(cpu.utilization).toBe(0);

      const badRes = cpu.setUtilization('fifty');
      expect(badRes.success).toBe(false);
    });

    it('assigns and releases processes', () => {
      const aRes = cpu.assignProcess(101);
      expect(aRes.success).toBe(true);
      expect(cpu.currentProcess).toBe(101);

      const rRes = cpu.releaseProcess();
      expect(rRes.success).toBe(true);
      expect(cpu.currentProcess).toBeNull();

      const nullRes = cpu.assignProcess(null);
      expect(nullRes.success).toBe(false);
    });

    it('executes simulation-only workloads and updates counters safely', () => {
      const res = cpu.executeWorkload({
        cycles: 50,
        instructionCount: 120,
        pid: 2,
        utilization: 35
      });

      expect(res.success).toBe(true);
      expect(res.data.executedCycles).toBe(50);
      expect(res.data.instructionsExecuted).toBe(120);
      expect(res.data.totalInstructions).toBe(120);
      expect(cpu.currentProcess).toBe(2);
      expect(cpu.utilization).toBe(35);

      // Execute additional workload
      cpu.executeWorkload({ instructionCount: 80 });
      expect(cpu.instructionsExecuted).toBe(200);
    });

    it('resets utilization, process, and counters to pristine state', () => {
      cpu.setUtilization(80);
      cpu.assignProcess(5);
      cpu.executeWorkload({ instructionCount: 50 });

      cpu.reset();
      expect(cpu.utilization).toBe(0);
      expect(cpu.currentProcess).toBeNull();
      expect(cpu.instructionsExecuted).toBe(0);
      expect(cpu.status).toBe(DeviceStatus.READY);
    });

    it('ensures CPUDevice snapshot safety', () => {
      const state = cpu.getState();
      state.utilization = 999;
      state.cores = 128;
      state.currentProcess = 999;

      const fresh = cpu.getState();
      expect(fresh.utilization).toBe(0);
      expect(fresh.cores).toBe(2);
      expect(fresh.currentProcess).toBeNull();
    });
  });

  /* =========================================================================
   * MemoryDevice Tests
   * ========================================================================= */
  describe('MemoryDevice', () => {
    let ram;

    beforeEach(() => {
      ram = new MemoryDevice({ totalBytes: 512 });
      ram.initialize();
    });

    it('initializes with bounded capacity and zero allocations', () => {
      expect(ram.totalBytes).toBe(512);
      expect(ram.usedBytes).toBe(0);
      expect(ram.freeBytes).toBe(512);
      expect(ram.utilization).toBe(0);
    });

    it('allocates memory and enforces capacity limits', () => {
      const res = ram.allocate(1, 100);
      expect(res.success).toBe(true);
      expect(res.data.pid).toBe(1);
      expect(res.data.size).toBe(100);
      expect(ram.usedBytes).toBe(100);
      expect(ram.freeBytes).toBe(412);
      expect(ram.utilization).toBe(19.53);

      // Excessive allocation
      const overRes = ram.allocate(2, 500);
      expect(overRes.success).toBe(false);
      expect(overRes.error).toContain('Insufficient memory');
    });

    it('rejects invalid allocation parameters', () => {
      expect(ram.allocate(null, 50).success).toBe(false);
      expect(ram.allocate(1, -10).success).toBe(false);
      expect(ram.allocate(1, 0).success).toBe(false);
      expect(ram.allocate(1, 'many').success).toBe(false);
    });

    it('releases allocated memory and updates free space', () => {
      ram.allocate(1, 150);
      const res = ram.release(1);

      expect(res.success).toBe(true);
      expect(res.data.releasedSize).toBe(150);
      expect(ram.usedBytes).toBe(0);
      expect(ram.freeBytes).toBe(512);

      // Release non-existent process
      const badRelease = ram.release(999);
      expect(badRelease.success).toBe(false);
    });

    it('reads and writes bytes to virtual physical memory address space', () => {
      // Write string
      const wRes = ram.write(10, 'HELLO');
      expect(wRes.success).toBe(true);
      expect(wRes.data.bytesWritten).toBe(5);

      // Read back
      const rRes = ram.read(10, 5);
      expect(rRes.success).toBe(true);
      expect(rRes.data.bytes).toEqual([72, 69, 76, 76, 79]); // ASCII for 'HELLO'

      // Write byte array
      ram.write(20, [1, 2, 3, 4]);
      expect(ram.read(20, 4).data.bytes).toEqual([1, 2, 3, 4]);
    });

    it('rejects out-of-bounds read and write operations', () => {
      expect(ram.write(510, [1, 2, 3, 4]).success).toBe(false);
      expect(ram.read(510, 10).success).toBe(false);
      expect(ram.read(-1, 1).success).toBe(false);
    });

    it('enforces volatile reset semantics on shutdown and reset', () => {
      ram.allocate(1, 200);
      ram.write(0, 'SECRET');

      // Volatile shutdown
      ram.shutdown();
      expect(ram.usedBytes).toBe(0);
      expect(ram.freeBytes).toBe(512);
      expect(ram.status).toBe(DeviceStatus.OFFLINE);
      expect(ram.read(0, 6).data.bytes).toEqual([0, 0, 0, 0, 0, 0]);

      // Re-initialize and allocate
      ram.initialize();
      ram.allocate(2, 50);
      expect(ram.usedBytes).toBe(50);

      // Volatile reset
      ram.reset();
      expect(ram.usedBytes).toBe(0);
      expect(ram.freeBytes).toBe(512);
    });

    it('ensures MemoryDevice snapshot safety', () => {
      ram.allocate(1, 100);
      const state = ram.getState();

      state.totalBytes = 999999;
      state.usedBytes = 0;
      state.allocations[1].size = 999;

      const fresh = ram.getState();
      expect(fresh.totalBytes).toBe(512);
      expect(fresh.usedBytes).toBe(100);
      expect(fresh.allocations[1].size).toBe(100);
    });
  });

  /* =========================================================================
   * StorageDevice Tests
   * ========================================================================= */
  describe('StorageDevice', () => {
    let disk;

    beforeEach(() => {
      disk = new StorageDevice({ capacityBytes: 2048, sectorSize: 512, totalCylinders: 100 });
      disk.initialize();
    });

    it('initializes with configured parameters', () => {
      expect(disk.capacityBytes).toBe(2048);
      expect(disk.sectorSize).toBe(512);
      expect(disk.totalSectors).toBe(4);
      expect(disk.totalCylinders).toBe(100);
      expect(disk.headPosition).toBe(0);
    });

    it('seeks cylinder within boundaries', () => {
      const res = disk.seek(42);
      expect(res.success).toBe(true);
      expect(disk.headPosition).toBe(42);

      expect(disk.seek(150).success).toBe(false);
      expect(disk.seek(-5).success).toBe(false);
    });

    it('reads and writes sector data', () => {
      const wRes = disk.write(2, { file: 'kernel.bin', size: 128 });
      expect(wRes.success).toBe(true);
      expect(wRes.data.bytesWritten).toBe(512);
      expect(disk.usedBytes).toBe(512);

      const rRes = disk.read(2);
      expect(rRes.success).toBe(true);
      expect(JSON.parse(rRes.data.data)).toEqual({ file: 'kernel.bin', size: 128 });

      // Out of bounds
      expect(disk.write(10, 'fail').success).toBe(false);
      expect(disk.read(10).success).toBe(false);
    });

    it('persists sector data across shutdown and re-initialization', () => {
      disk.write(0, 'bootloader_signature');
      disk.write(1, 'system_config');

      // Normal shutdown
      disk.shutdown();
      expect(disk.status).toBe(DeviceStatus.OFFLINE);

      // Re-initialize (boot)
      disk.initialize();
      expect(disk.status).toBe(DeviceStatus.READY);

      // Data must persist!
      expect(disk.read(0).data.data).toBe('bootloader_signature');
      expect(disk.read(1).data.data).toBe('system_config');
      expect(disk.usedBytes).toBe(1024);
    });

    it('clears storage only on explicit reset with clearStorage or format', () => {
      disk.write(0, 'data');

      // Normal reset: preserves storage
      disk.reset();
      expect(disk.read(0).data.data).toBe('data');

      // Explicit format/clear
      disk.reset({ clearStorage: true });
      expect(disk.read(0).data.data).toBeNull();
      expect(disk.usedBytes).toBe(0);
    });

    it('ensures StorageDevice snapshot safety', () => {
      disk.write(0, 'data');
      const state = disk.getState();

      state.capacityBytes = 0;
      state.headPosition = 999;

      const fresh = disk.getState();
      expect(fresh.capacityBytes).toBe(2048);
      expect(fresh.headPosition).toBe(0);
    });
  });

  /* =========================================================================
   * InputDevice Tests
   * ========================================================================= */
  describe('InputDevice', () => {
    let input;

    beforeEach(() => {
      input = new InputDevice({ maxHistory: 5 });
      input.initialize();
    });

    it('normalizes keyboard events into standard OS structure', () => {
      const raw = { type: 'keydown', key: 'Enter', code: 'Enter', ctrlKey: true };
      const norm = input.normalizeKeyboardEvent(raw);

      expect(norm.type).toBe('keyboard');
      expect(norm.event).toBe('keydown');
      expect(norm.key).toBe('Enter');
      expect(norm.code).toBe('Enter');
      expect(norm.ctrlKey).toBe(true);
      expect(norm.altKey).toBe(false);
      expect(norm.timestamp).toBeDefined();
    });

    it('normalizes mouse events into standard OS structure', () => {
      const raw = { type: 'click', x: 250, y: 180, button: 0 };
      const norm = input.normalizeMouseEvent(raw);

      expect(norm.type).toBe('mouse');
      expect(norm.event).toBe('click');
      expect(norm.x).toBe(250);
      expect(norm.y).toBe(180);
      expect(norm.button).toBe(0);
      expect(norm.timestamp).toBeDefined();
    });

    it('accepts simulated input and caps history buffer', () => {
      for (let i = 0; i < 7; i++) {
        input.sendInput({ type: 'keyboard', key: `Key${i}` });
      }

      const events = input.getRecentEvents();
      expect(events.length).toBe(5);
      expect(events[0].key).toBe('Key2');
      expect(events[4].key).toBe('Key6');
    });

    it('rejects unsupported input events', () => {
      const res = input.sendInput({ invalid: true });
      expect(res.success).toBe(false);
      expect(res.error).toContain('Unsupported input event');
    });

    it('resets event history', () => {
      input.sendInput({ type: 'keyboard', key: 'A' });
      expect(input.recentEvents.length).toBe(1);

      input.reset();
      expect(input.recentEvents.length).toBe(0);
    });

    it('ensures InputDevice snapshot safety', () => {
      input.sendInput({ type: 'keyboard', key: 'A' });
      const state = input.getState();

      state.supportedInputs.push('gamepad');
      state.recentEvents[0].key = 'Z';

      const fresh = input.getState();
      expect(fresh.supportedInputs).toEqual(['keyboard', 'mouse']);
      expect(fresh.recentEvents[0].key).toBe('A');
    });
  });

  /* =========================================================================
   * DisplayDevice Tests
   * ========================================================================= */
  describe('DisplayDevice', () => {
    let display;

    beforeEach(() => {
      display = new DisplayDevice({ width: 1920, height: 1080, refreshRate: 60 });
      display.initialize();
    });

    it('initializes with configured resolution', () => {
      const res = display.getResolution();
      expect(res.width).toBe(1920);
      expect(res.height).toBe(1080);
      expect(res.refreshRate).toBe(60);
      expect(res.colorDepth).toBe(24);
    });

    it('sets valid resolution and validates positive integers', () => {
      const res = display.setResolution(2560, 1440);
      expect(res.success).toBe(true);
      expect(display.width).toBe(2560);
      expect(display.height).toBe(1440);

      expect(display.setResolution(-100, 1080).success).toBe(false);
      expect(display.setResolution(1920, 0).success).toBe(false);
      expect(display.setResolution('auto', 'auto').success).toBe(false);
    });

    it('resets to default resolution', () => {
      display.setResolution(800, 600);
      expect(display.width).toBe(800);

      display.reset();
      expect(display.width).toBe(1920);
      expect(display.height).toBe(1080);
    });

    it('ensures DisplayDevice snapshot safety', () => {
      const state = display.getState();
      state.width = 9999;
      state.height = 9999;

      const fresh = display.getState();
      expect(fresh.width).toBe(1920);
      expect(fresh.height).toBe(1080);
    });
  });

  /* =========================================================================
   * ClockDevice Tests
   * ========================================================================= */
  describe('ClockDevice', () => {
    let clock;

    beforeEach(() => {
      clock = new ClockDevice({ frequencyHz: 1000 });
      clock.initialize();
    });

    it('initializes with zero ticks and 1000 Hz frequency', () => {
      expect(clock.getTicks()).toBe(0);
      expect(clock.frequencyHz).toBe(1000);
      expect(typeof clock.getTime()).toBe('number');
    });

    it('increments simulated clock ticks', () => {
      clock.tick(5);
      expect(clock.getTicks()).toBe(5);

      clock.tick();
      expect(clock.getTicks()).toBe(6);
    });

    it('resets tick count', () => {
      clock.tick(100);
      expect(clock.getTicks()).toBe(100);

      clock.reset();
      expect(clock.getTicks()).toBe(0);
    });

    it('ensures ClockDevice snapshot safety', () => {
      clock.tick(10);
      const state = clock.getState();

      state.tickCount = 999;
      state.frequencyHz = 99999;

      const fresh = clock.getState();
      expect(fresh.tickCount).toBe(10);
      expect(fresh.frequencyHz).toBe(1000);
    });
  });
});
