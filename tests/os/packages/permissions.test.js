/**
 * tests/os/packages/permissions.test.js
 * Unit and integration tests for Phase 21 permission enforcement across all OS APIs.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Kernel } from '../../../public/js/os/kernel/Kernel.js';
import { APIContext } from '../../../public/js/os/api/APIContext.js';
import { APIError } from '../../../public/js/os/api/APIError.js';
import { AdityyaOSAPI } from '../../../public/js/os/api/AdityyaOSAPI.js';
import { WindowAPI } from '../../../public/js/os/api/WindowAPI.js';
import { PackagePermissions, isValidPermission } from '../../../public/js/os/packages/PackagePermissions.js';

describe('Phase 21: Package Permission Enforcement', () => {
  let kernel;

  beforeEach(() => {
    kernel = new Kernel();
    kernel.boot();
    kernel.fileSystemManager.createDirectory('/home');
    kernel.fileSystemManager.createDirectory('/home/user');
  });

  afterEach(() => {
    kernel.shutdown();
  });

  describe('PackagePermissions Constants', () => {
    it('defines all required permission constants', () => {
      expect(PackagePermissions.FILESYSTEM_READ).toBe('filesystem.read');
      expect(PackagePermissions.FILESYSTEM_WRITE).toBe('filesystem.write');
      expect(PackagePermissions.PROCESS_SELF).toBe('process.self');
      expect(PackagePermissions.MEMORY_READ).toBe('memory.read');
      expect(PackagePermissions.EVENTS_SUBSCRIBE).toBe('events.subscribe');
      expect(PackagePermissions.EVENTS_EMIT).toBe('events.emit');
      expect(PackagePermissions.WINDOW_CONTROL).toBe('window.control');
      expect(PackagePermissions.APPLICATION_LIFECYCLE).toBe('application.lifecycle');
    });

    it('validates permission strings via isValidPermission', () => {
      expect(isValidPermission('filesystem.read')).toBe(true);
      expect(isValidPermission('filesystem.write')).toBe(true);
      expect(isValidPermission('process.self')).toBe(true);
      expect(isValidPermission('memory.read')).toBe(true);
      expect(isValidPermission('events.subscribe')).toBe(true);
      expect(isValidPermission('events.emit')).toBe(true);
      expect(isValidPermission('window.control')).toBe(true);
      expect(isValidPermission('application.lifecycle')).toBe(true);

      expect(isValidPermission('network.connect')).toBe(false);
      expect(isValidPermission('')).toBe(false);
      expect(isValidPermission(null)).toBe(false);
      expect(isValidPermission(123)).toBe(false);
    });
  });

  describe('APIContext Permission Mechanics', () => {
    it('freezes permissions array to prevent runtime tampering', () => {
      const perms = [PackagePermissions.FILESYSTEM_READ];
      const ctx = new APIContext({
        appId: 'test.app',
        instanceId: 'test.app-1',
        pid: 10,
        permissions: perms
      });

      expect(Object.isFrozen(ctx.permissions)).toBe(true);
      expect(() => {
        ctx.permissions.push(PackagePermissions.FILESYSTEM_WRITE);
      }).toThrow();
    });

    it('Case A (legacy): preserves Phase 19 behavior and grants unrestricted permissions when permissions is undefined', () => {
      const ctx = new APIContext({
        appId: 'legacy.app',
        instanceId: 'legacy.app-1',
        pid: 10
        // permissions omitted (undefined)
      });

      expect(ctx.permissions).toEqual([]);
      expect(Object.isFrozen(ctx.permissions)).toBe(true);
      expect(ctx.hasPermission(PackagePermissions.FILESYSTEM_READ)).toBe(true);
      expect(ctx.hasPermission(PackagePermissions.FILESYSTEM_WRITE)).toBe(true);
      expect(ctx.hasPermission(PackagePermissions.PROCESS_SELF)).toBe(true);
      expect(ctx.hasPermission(PackagePermissions.MEMORY_READ)).toBe(true);
      expect(ctx.hasPermission(PackagePermissions.EVENTS_SUBSCRIBE)).toBe(true);
      expect(ctx.hasPermission(PackagePermissions.EVENTS_EMIT)).toBe(true);
      expect(ctx.hasPermission(PackagePermissions.WINDOW_CONTROL)).toBe(true);
      expect(ctx.hasPermission(PackagePermissions.APPLICATION_LIFECYCLE)).toBe(true);
    });

    it('Case B (explicit empty permissions): denies all capabilities when permissions is []', () => {
      const ctx = new APIContext({
        appId: 'empty.app',
        instanceId: 'empty.app-1',
        pid: 10,
        permissions: []
      });

      expect(ctx.permissions).toEqual([]);
      expect(ctx.hasPermission(PackagePermissions.FILESYSTEM_READ)).toBe(false);
      expect(ctx.hasPermission(PackagePermissions.FILESYSTEM_WRITE)).toBe(false);
      expect(ctx.hasPermission(PackagePermissions.PROCESS_SELF)).toBe(false);
      expect(ctx.hasPermission(PackagePermissions.MEMORY_READ)).toBe(false);
      expect(ctx.hasPermission(PackagePermissions.EVENTS_SUBSCRIBE)).toBe(false);
      expect(ctx.hasPermission(PackagePermissions.EVENTS_EMIT)).toBe(false);
      expect(ctx.hasPermission(PackagePermissions.WINDOW_CONTROL)).toBe(false);
      expect(ctx.hasPermission(PackagePermissions.APPLICATION_LIFECYCLE)).toBe(false);

      expect(() => ctx.assertPermission(PackagePermissions.FILESYSTEM_READ, 'fs.readFile')).toThrow(APIError);
    });

    it('Case C (explicit permissions): grants only declared permissions and denies others', () => {
      const ctx = new APIContext({
        appId: 'reader.app',
        instanceId: 'reader.app-1',
        pid: 10,
        permissions: [PackagePermissions.FILESYSTEM_READ]
      });

      expect(ctx.permissions).toEqual([PackagePermissions.FILESYSTEM_READ]);
      expect(ctx.hasPermission(PackagePermissions.FILESYSTEM_READ)).toBe(true);
      expect(ctx.hasPermission(PackagePermissions.FILESYSTEM_WRITE)).toBe(false);
      expect(ctx.hasPermission(PackagePermissions.PROCESS_SELF)).toBe(false);
      expect(ctx.hasPermission(PackagePermissions.MEMORY_READ)).toBe(false);
      expect(ctx.hasPermission(PackagePermissions.WINDOW_CONTROL)).toBe(false);
      expect(ctx.hasPermission(PackagePermissions.APPLICATION_LIFECYCLE)).toBe(false);

      expect(() => ctx.assertPermission(PackagePermissions.FILESYSTEM_READ, 'fs.readFile')).not.toThrow();
      expect(() => ctx.assertPermission(PackagePermissions.FILESYSTEM_WRITE, 'fs.writeFile')).toThrow(APIError);
    });

    it('treats permissions: null as NOT legacy (denies all permissions)', () => {
      const ctx = new APIContext({
        appId: 'null-perms.app',
        instanceId: 'null-perms.app-1',
        pid: 10,
        permissions: null
      });

      expect(ctx.permissions).toEqual([]);
      expect(ctx.hasPermission(PackagePermissions.FILESYSTEM_READ)).toBe(false);
      expect(ctx.hasPermission(PackagePermissions.FILESYSTEM_WRITE)).toBe(false);
      expect(ctx.hasPermission(PackagePermissions.PROCESS_SELF)).toBe(false);
      expect(() => ctx.assertPermission(PackagePermissions.FILESYSTEM_READ, 'fs.readFile')).toThrow(APIError);
    });

    it('assertPermission throws EPERM with structured details on failure', () => {
      const ctx = new APIContext({
        appId: 'unprivileged.app',
        instanceId: 'unprivileged.app-1',
        pid: 10,
        permissions: []
      });

      try {
        ctx.assertPermission(PackagePermissions.FILESYSTEM_READ, 'fs.readFile');
        expect.unreachable('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(APIError);
        expect(err.code).toBe('EPERM');
        expect(err.operation).toBe('fs.readFile');
        expect(err.appId).toBe('unprivileged.app');
        expect(err.message).toContain('filesystem.read');
      }
    });
  });

  describe('Filesystem Permissions (filesystem.read, filesystem.write)', () => {
    it('blocks fs.readFile, fs.exists, fs.stat, fs.listDirectory without filesystem.read', () => {
      const ctx = new APIContext({
        appId: 'no-read.app',
        instanceId: 'inst-1',
        pid: 10,
        permissions: [PackagePermissions.FILESYSTEM_WRITE]
      });
      const api = new AdityyaOSAPI({ kernel, context: ctx });

      expect(() => api.fs.readFile('/home/user/file.txt')).toThrow(APIError);
      expect(() => api.fs.exists('/home/user/file.txt')).toThrow(APIError);
      expect(() => api.fs.stat('/home/user')).toThrow(APIError);
      expect(() => api.fs.listDirectory('/home/user')).toThrow(APIError);

      try {
        api.fs.readFile('/home/user/file.txt');
      } catch (err) {
        expect(err.code).toBe('EPERM');
        expect(err.operation).toBe('fs.readFile');
      }
    });

    it('allows fs.readFile, fs.exists, fs.stat, fs.listDirectory with filesystem.read', () => {
      kernel.fileSystemManager.createFile('/home/user/test.txt', 5);
      kernel.fileSystemManager.writeFile('/home/user/test.txt', 'hello');

      const ctx = new APIContext({
        appId: 'reader.app',
        instanceId: 'inst-1',
        pid: 10,
        permissions: [PackagePermissions.FILESYSTEM_READ]
      });
      const api = new AdityyaOSAPI({ kernel, context: ctx });

      expect(api.fs.exists('/home/user/test.txt')).toBe(true);
      const readResult = api.fs.readFile('/home/user/test.txt');
      expect(readResult.content).toBe('hello');
      expect(api.fs.stat('/home/user/test.txt')).toBeDefined();
      const entries = api.fs.listDirectory('/home/user');
      expect(entries.some(e => e.name === 'test.txt')).toBe(true);
    });

    it('blocks fs.writeFile, fs.createFile, fs.deleteFile, fs.createDirectory, fs.deleteDirectory without filesystem.write', () => {
      const ctx = new APIContext({
        appId: 'read-only.app',
        instanceId: 'inst-1',
        pid: 10,
        permissions: [PackagePermissions.FILESYSTEM_READ]
      });
      const api = new AdityyaOSAPI({ kernel, context: ctx });

      expect(() => api.fs.writeFile('/home/user/new.txt', 'data')).toThrow(APIError);
      expect(() => api.fs.createFile('/home/user/new.txt')).toThrow(APIError);
      expect(() => api.fs.deleteFile('/home/user/test.txt')).toThrow(APIError);
      expect(() => api.fs.createDirectory('/home/user/newdir')).toThrow(APIError);
      expect(() => api.fs.deleteDirectory('/home/user/newdir')).toThrow(APIError);

      try {
        api.fs.writeFile('/home/user/new.txt', 'data');
      } catch (err) {
        expect(err.code).toBe('EPERM');
        expect(err.operation).toBe('fs.writeFile');
      }
    });

    it('allows fs.writeFile, fs.createFile, fs.deleteFile, fs.createDirectory, fs.deleteDirectory with filesystem.write', () => {
      const ctx = new APIContext({
        appId: 'writer.app',
        instanceId: 'inst-1',
        pid: 10,
        permissions: [PackagePermissions.FILESYSTEM_WRITE, PackagePermissions.FILESYSTEM_READ]
      });
      const api = new AdityyaOSAPI({ kernel, context: ctx });

      const created = api.fs.createFile('/home/user/new.txt');
      expect(created).toBeDefined();
      const written = api.fs.writeFile('/home/user/new.txt', 'data');
      expect(written).toBeDefined();
      const dir = api.fs.createDirectory('/home/user/newdir');
      expect(dir).toBeDefined();
      expect(api.fs.deleteFile('/home/user/new.txt')).toBeDefined();
      expect(api.fs.deleteDirectory('/home/user/newdir')).toBeDefined();
    });

    it('blocks fs.open with READ flag without filesystem.read, and WRITE/APPEND without filesystem.write', () => {
      kernel.fileSystemManager.createFile('/home/user/test.txt', 5);

      // Context with only write permission
      const writeOnlyCtx = new APIContext({
        appId: 'write-only.app',
        instanceId: 'inst-1',
        pid: 10,
        permissions: [PackagePermissions.FILESYSTEM_WRITE]
      });
      const writeApi = new AdityyaOSAPI({ kernel, context: writeOnlyCtx });
      expect(() => writeApi.fs.open('/home/user/test.txt', ['READ'])).toThrow(APIError);

      // Context with only read permission
      const readOnlyCtx = new APIContext({
        appId: 'read-only.app',
        instanceId: 'inst-2',
        pid: 11,
        permissions: [PackagePermissions.FILESYSTEM_READ]
      });
      const readApi = new AdityyaOSAPI({ kernel, context: readOnlyCtx });
      expect(() => readApi.fs.open('/home/user/test.txt', ['WRITE'])).toThrow(APIError);
      expect(() => readApi.fs.open('/home/user/test.txt', ['APPEND'])).toThrow(APIError);
    });

    it('allows fs.open when appropriate permission is granted', () => {
      kernel.fileSystemManager.createFile('/home/user/test.txt', 5);

      const ctx = new APIContext({
        appId: 'full-fs.app',
        instanceId: 'inst-1',
        pid: 10,
        permissions: [PackagePermissions.FILESYSTEM_READ, PackagePermissions.FILESYSTEM_WRITE]
      });
      const api = new AdityyaOSAPI({ kernel, context: ctx });

      const readFd = api.fs.open('/home/user/test.txt', ['READ']);
      expect(readFd).toBeDefined();
      expect(typeof readFd.fd).toBe('number');
      api.fs.close(readFd.fd);

      const writeFd = api.fs.open('/home/user/test.txt', ['WRITE']);
      expect(writeFd).toBeDefined();
      expect(typeof writeFd.fd).toBe('number');
      api.fs.close(writeFd.fd);
    });
  });

  describe('Process Permissions (process.self)', () => {
    it('blocks process.getCurrent and process.getInfo without process.self', () => {
      const ctx = new APIContext({
        appId: 'no-proc.app',
        instanceId: 'inst-1',
        pid: 10,
        permissions: []
      });
      const api = new AdityyaOSAPI({ kernel, context: ctx });

      expect(() => api.process.getCurrent()).toThrow(APIError);
      expect(() => api.process.getInfo(10)).toThrow(APIError);

      try {
        api.process.getCurrent();
      } catch (err) {
        expect(err.code).toBe('EPERM');
        expect(err.operation).toBe('process.getCurrent');
      }
    });

    it('allows process.getCurrent and process.getInfo with process.self', () => {
      const p = kernel.processManager.createProcess({ name: 'proc.app', priority: 1 });
      const ctx = new APIContext({
        appId: 'proc.app',
        instanceId: 'inst-1',
        pid: p.data.pid,
        permissions: [PackagePermissions.PROCESS_SELF]
      });
      const api = new AdityyaOSAPI({ kernel, context: ctx });

      expect(api.process.getPid()).toBe(p.data.pid);
      const current = api.process.getCurrent();
      expect(current).toBeDefined();
      expect(current.pid).toBe(p.data.pid);
      expect(current.name).toBe('proc.app');

      const info = api.process.getInfo(p.data.pid);
      expect(info.pid).toBe(p.data.pid);
    });

    it('blocks inspecting other processes even with process.self', () => {
      const p1 = kernel.processManager.createProcess({ name: 'proc1', priority: 1 });
      const p2 = kernel.processManager.createProcess({ name: 'proc2', priority: 1 });

      const ctx = new APIContext({
        appId: 'proc1.app',
        instanceId: 'inst-1',
        pid: p1.data.pid,
        permissions: [PackagePermissions.PROCESS_SELF]
      });
      const api = new AdityyaOSAPI({ kernel, context: ctx });

      expect(() => api.process.getInfo(p2.data.pid)).toThrow(APIError);
    });
  });

  describe('Memory Permissions (memory.read)', () => {
    it('blocks memory.getUsage without memory.read', () => {
      const ctx = new APIContext({
        appId: 'no-mem.app',
        instanceId: 'inst-1',
        pid: 10,
        permissions: []
      });
      const api = new AdityyaOSAPI({ kernel, context: ctx });

      expect(() => api.memory.getUsage()).toThrow(APIError);

      try {
        api.memory.getUsage();
      } catch (err) {
        expect(err.code).toBe('EPERM');
        expect(err.operation).toBe('memory.getUsage');
      }
    });

    it('allows memory.getUsage with memory.read', () => {
      const ctx = new APIContext({
        appId: 'mem.app',
        instanceId: 'inst-1',
        pid: 10,
        permissions: [PackagePermissions.MEMORY_READ]
      });
      const api = new AdityyaOSAPI({ kernel, context: ctx });

      const usage = api.memory.getUsage();
      expect(usage).toBeDefined();
      expect(typeof usage.totalMemory).toBe('number');
      expect(typeof usage.usedMemory).toBe('number');
      expect(typeof usage.freeMemory).toBe('number');
    });
  });

  describe('Event Permissions (events.subscribe, events.emit)', () => {
    it('blocks events.on without events.subscribe', () => {
      const ctx = new APIContext({
        appId: 'no-sub.app',
        instanceId: 'inst-1',
        pid: 10,
        permissions: [PackagePermissions.EVENTS_EMIT]
      });
      const api = new AdityyaOSAPI({ kernel, context: ctx });

      expect(() => api.events.on('test-event', () => {})).toThrow(APIError);

      try {
        api.events.on('test', () => {});
      } catch (err) {
        expect(err.code).toBe('EPERM');
        expect(err.operation).toBe('events.on');
      }
    });

    it('blocks events.emit without events.emit', () => {
      const ctx = new APIContext({
        appId: 'no-emit.app',
        instanceId: 'inst-1',
        pid: 10,
        permissions: [PackagePermissions.EVENTS_SUBSCRIBE]
      });
      const api = new AdityyaOSAPI({ kernel, context: ctx });

      expect(() => api.events.emit('custom-event', { val: 1 })).toThrow(APIError);

      try {
        api.events.emit('custom-event');
      } catch (err) {
        expect(err.code).toBe('EPERM');
        expect(err.operation).toBe('events.emit');
      }
    });

    it('allows events operations when respective permissions granted', () => {
      const ctx = new APIContext({
        appId: 'events.app',
        instanceId: 'inst-1',
        pid: 10,
        permissions: [PackagePermissions.EVENTS_SUBSCRIBE, PackagePermissions.EVENTS_EMIT]
      });
      const api = new AdityyaOSAPI({ kernel, context: ctx });

      let received = null;
      api.events.on('my-event', (data) => {
        received = data;
      });

      api.events.emit('my-event', { hello: 'world' });
      expect(received).toBeDefined();
      expect(received.hello).toBe('world');
      expect(received.appId).toBe('events.app');
      expect(received.pid).toBe(10);
    });
  });

  describe('Window Permissions (window.control)', () => {
    it('blocks window methods without window.control', () => {
      const ctx = new APIContext({
        appId: 'no-win.app',
        instanceId: 'inst-1',
        pid: 10,
        permissions: []
      });
      const mockWin = { id: 'win-1', title: 'Original', x: 0, y: 0, width: 640, height: 480, state: 'normal' };
      const winApi = new WindowAPI({ windowManager: null, windowModel: mockWin, context: ctx });

      expect(() => winApi.setTitle('New Title')).toThrow(APIError);
      expect(() => winApi.focus()).toThrow(APIError);
      expect(() => winApi.minimize()).toThrow(APIError);
      expect(() => winApi.maximize()).toThrow(APIError);
      expect(() => winApi.close()).toThrow(APIError);
      expect(() => winApi.restore()).toThrow(APIError);

      try {
        winApi.setTitle('Title');
      } catch (err) {
        expect(err.code).toBe('EPERM');
        expect(err.operation).toBe('window.setTitle');
      }
    });

    it('allows window methods with window.control', () => {
      const ctx = new APIContext({
        appId: 'win.app',
        instanceId: 'inst-1',
        pid: 10,
        permissions: [PackagePermissions.WINDOW_CONTROL]
      });
      const mockWin = { id: 'win-1', title: 'Original', x: 0, y: 0, width: 640, height: 480, state: 'normal' };
      const mockWm = {
        renderedWindows: new Map(),
        focusWindow: vi.fn(),
        minimizeWindow: vi.fn(),
        maximizeWindow: vi.fn(),
        restoreWindow: vi.fn(),
        closeWindow: vi.fn()
      };
      const winApi = new WindowAPI({ windowManager: mockWm, windowModel: mockWin, context: ctx });

      winApi.setTitle('Updated Title');
      expect(mockWin.title).toBe('Updated Title');

      winApi.focus();
      expect(mockWm.focusWindow).toHaveBeenCalledWith('win-1');

      winApi.minimize();
      expect(mockWm.minimizeWindow).toHaveBeenCalledWith('win-1');

      winApi.maximize();
      expect(mockWm.maximizeWindow).toHaveBeenCalledWith('win-1');

      winApi.restore();
      expect(mockWm.restoreWindow).toHaveBeenCalledWith('win-1');

      winApi.close();
      expect(mockWm.closeWindow).toHaveBeenCalledWith('win-1');
    });
  });

  describe('Application Lifecycle Permissions (application.lifecycle)', () => {
    it('blocks app.exit without application.lifecycle', () => {
      const ctx = new APIContext({
        appId: 'no-life.app',
        instanceId: 'inst-1',
        pid: 10,
        permissions: []
      });
      const api = new AdityyaOSAPI({ kernel, context: ctx });

      expect(() => api.app.exit(0)).toThrow(APIError);

      try {
        api.app.exit(0);
      } catch (err) {
        expect(err.code).toBe('EPERM');
        expect(err.operation).toBe('app.exit');
      }
    });

    it('allows app.exit with application.lifecycle', () => {
      const ctx = new APIContext({
        appId: 'life.app',
        instanceId: 'inst-1',
        pid: 10,
        permissions: [PackagePermissions.APPLICATION_LIFECYCLE]
      });
      const mockRuntime = { terminate: vi.fn() };
      const api = new AdityyaOSAPI({ kernel, context: ctx, runtime: mockRuntime });

      api.app.exit(0);
      expect(mockRuntime.terminate).toHaveBeenCalledWith('inst-1', 0);
    });
  });

  describe('Cross-App Permission Isolation', () => {
    it('maintains strict isolation between two app contexts', () => {
      const ctx1 = new APIContext({
        appId: 'reader.app',
        instanceId: 'reader-1',
        pid: 11,
        permissions: [PackagePermissions.FILESYSTEM_READ]
      });

      const ctx2 = new APIContext({
        appId: 'writer.app',
        instanceId: 'writer-1',
        pid: 12,
        permissions: [PackagePermissions.FILESYSTEM_WRITE]
      });

      const api1 = new AdityyaOSAPI({ kernel, context: ctx1 });
      const api2 = new AdityyaOSAPI({ kernel, context: ctx2 });

      // ctx1 can read but not write
      expect(api1.context.hasPermission(PackagePermissions.FILESYSTEM_READ)).toBe(true);
      expect(api1.context.hasPermission(PackagePermissions.FILESYSTEM_WRITE)).toBe(false);
      expect(() => api1.fs.writeFile('/home/user/file.txt', 'test')).toThrow(APIError);

      // ctx2 can write but not read
      expect(api2.context.hasPermission(PackagePermissions.FILESYSTEM_READ)).toBe(false);
      expect(api2.context.hasPermission(PackagePermissions.FILESYSTEM_WRITE)).toBe(true);
      expect(() => api2.fs.readFile('/home/user/file.txt')).toThrow(APIError);
    });
  });
});
