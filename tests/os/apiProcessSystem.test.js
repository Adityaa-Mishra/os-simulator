/**
 * tests/os/apiProcessSystem.test.js
 * Unit and integration tests for SystemAPI, ProcessAPI, MemoryAPI, EventAPI, WindowAPI, and AdityyaOSAPI.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Kernel } from '../../public/js/os/kernel/Kernel.js';
import { WindowManager } from '../../public/js/os/shell/WindowManager.js';
import { APIContext } from '../../public/js/os/api/APIContext.js';
import { SystemAPI } from '../../public/js/os/api/SystemAPI.js';
import { ProcessAPI } from '../../public/js/os/api/ProcessAPI.js';
import { MemoryAPI } from '../../public/js/os/api/MemoryAPI.js';
import { EventAPI } from '../../public/js/os/api/EventAPI.js';
import { WindowAPI } from '../../public/js/os/api/WindowAPI.js';
import { AdityyaOSAPI } from '../../public/js/os/api/AdityyaOSAPI.js';
import { APIError } from '../../public/js/os/api/APIError.js';
import { WindowState } from '../../public/js/os/shell/WindowState.js';

describe('Phase 19: System, Process, Memory, Event & Window APIs', () => {
  let kernel;
  let windowManager;
  let context;
  let proc;

  beforeEach(() => {
    kernel = new Kernel();
    kernel.boot();

    windowManager = new WindowManager({ events: kernel.events });

    const procRes = kernel.processManager.createProcess({ name: 'calc-proc' });
    proc = procRes.data;

    context = new APIContext({
      appId: 'calc-app',
      instanceId: 'calc-app-1',
      pid: proc.pid,
      username: 'testuser'
    });
  });

  afterEach(() => {
    kernel.shutdown();
  });

  describe('SystemAPI', () => {
    it('returns safe system info and uptime', () => {
      const sysApi = new SystemAPI({ kernel, context });
      const info = sysApi.getInfo();

      expect(info.name).toBe('AdityyaOS');
      expect(info.status).toBe('RUNNING');
      expect(info.user).toBe('testuser');
      expect(typeof info.uptime).toBe('number');
      expect(sysApi.getStatus()).toBe('RUNNING');
    });
  });

  describe('ProcessAPI', () => {
    it('returns calling process info and PID', () => {
      const procApi = new ProcessAPI({ kernel, context });
      expect(procApi.getPid()).toBe(proc.pid);

      const current = procApi.getCurrent();
      expect(current.pid).toBe(proc.pid);
      expect(current.name).toBe('calc-proc');
      expect(current.state).toBe('READY');

      const info = procApi.getInfo(proc.pid);
      expect(info.pid).toBe(proc.pid);
    });

    it('strictly forbids inspecting foreign processes with EPERM APIError', () => {
      const otherRes = kernel.processManager.createProcess({ name: 'other-proc' });
      const otherPid = otherRes.data.pid;

      const procApi = new ProcessAPI({ kernel, context });

      try {
        procApi.getInfo(otherPid);
        expect.fail('Should have thrown APIError');
      } catch (err) {
        expect(err).toBeInstanceOf(APIError);
        expect(err.code).toBe('EPERM');
        expect(err.operation).toBe('process.getInfo');
        expect(err.appId).toBe('calc-app');
      }
    });

    it('rejects invalid PID with EINVAL APIError', () => {
      const procApi = new ProcessAPI({ kernel, context });
      expect(() => procApi.getInfo(-1)).toThrow(APIError);
      expect(() => procApi.getInfo('1')).toThrow(APIError);
    });
  });

  describe('MemoryAPI', () => {
    it('returns valid memory usage metrics', () => {
      const memApi = new MemoryAPI({ kernel, context });
      const usage = memApi.getUsage();

      expect(usage.totalMemory).toBeGreaterThan(0);
      expect(usage.usedMemory).toBeGreaterThanOrEqual(0);
      expect(usage.freeMemory).toBeGreaterThanOrEqual(0);
      expect(usage.processAllocated).toBeGreaterThanOrEqual(0);
    });
  });

  describe('EventAPI', () => {
    it('subscribes, emits, and unsubscribes events with application scoping', () => {
      const eventApi = new EventAPI({ events: kernel.events, context });
      let received = null;

      const handler = (data) => {
        received = data;
      };

      eventApi.on('test:event', handler);
      eventApi.emit('test:event', { value: 123 });

      expect(received).toBeDefined();
      expect(received.value).toBe(123);
      expect(received.appId).toBe('calc-app');
      expect(received.pid).toBe(proc.pid);

      // Unsubscribe
      received = null;
      eventApi.off('test:event', handler);
      eventApi.emit('test:event', { value: 456 });
      expect(received).toBeNull();
    });

    it('guarantees 100% listener cleanup on destroy()', () => {
      const eventApi = new EventAPI({ events: kernel.events, context });
      let callCount = 0;

      eventApi.on('app:ping', () => callCount++);
      eventApi.on('app:pong', () => callCount++);

      kernel.events.emit('app:ping', {});
      expect(callCount).toBe(1);

      eventApi.destroy();

      kernel.events.emit('app:ping', {});
      kernel.events.emit('app:pong', {});
      expect(callCount).toBe(1); // No new invocations
    });
  });

  describe('WindowAPI', () => {
    it('allows window title updates, focus, minimize, maximize, and restore', () => {
      const winModel = windowManager.createWindow({
        appId: 'calc-app',
        title: 'Calculator'
      });

      const winApi = new WindowAPI({
        windowManager,
        windowModel: winModel,
        context
      });

      expect(winApi.getId()).toBe(winModel.id);
      expect(winApi.getState().title).toBe('Calculator');

      winApi.setTitle('Scientific Calculator');
      expect(winModel.title).toBe('Scientific Calculator');

      winApi.focus();
      expect(winModel.focused).toBe(true);

      winApi.minimize();
      expect(winModel.state).toBe(WindowState.MINIMIZED);

      winApi.restore();
      expect(winModel.state).toBe(WindowState.NORMAL);

      winApi.maximize();
      expect(winModel.state).toBe(WindowState.MAXIMIZED);

      winApi.close();
      expect(winModel.state).toBe(WindowState.CLOSED);
    });
  });

  describe('AdityyaOSAPI Facade', () => {
    it('instantiates all sub-APIs and cleans up upon destroy()', () => {
      const winModel = windowManager.createWindow({ appId: 'calc-app' });
      const api = new AdityyaOSAPI({
        kernel,
        context,
        windowManager,
        windowModel: winModel
      });

      expect(api.system).toBeInstanceOf(SystemAPI);
      expect(api.process).toBeInstanceOf(ProcessAPI);
      expect(api.fs).toBeDefined();
      expect(api.memory).toBeInstanceOf(MemoryAPI);
      expect(api.events).toBeInstanceOf(EventAPI);
      expect(api.window).toBeInstanceOf(WindowAPI);
      expect(api.app).toBeDefined();

      let eventCalled = false;
      api.events.on('facade:test', () => { eventCalled = true; });
      api.destroy();

      kernel.events.emit('facade:test', {});
      expect(eventCalled).toBe(false);
    });
  });
});
