/**
 * tests/os/apps/apiBoundaries.test.js
 * Unit and integration tests validating strict API boundaries, capability enforcement,
 * and filesystem rename/usage primitives for Phase 23 & Phase 24.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Kernel } from '../../../public/js/os/kernel/Kernel.js';
import { APIContext } from '../../../public/js/os/api/APIContext.js';
import { APIError } from '../../../public/js/os/api/APIError.js';
import { AdityyaOSAPI } from '../../../public/js/os/api/AdityyaOSAPI.js';
import { PackagePermissions, isValidPermission } from '../../../public/js/os/packages/PackagePermissions.js';

describe('Phase 23/24: API Boundaries & Permission Enforcement', () => {
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

  describe('ProcessAPI Capabilities (process.read & process.terminate)', () => {
    it('PackagePermissions includes PROCESS_READ and PROCESS_TERMINATE', () => {
      expect(PackagePermissions.PROCESS_READ).toBe('process.read');
      expect(PackagePermissions.PROCESS_TERMINATE).toBe('process.terminate');
      expect(isValidPermission('process.read')).toBe(true);
      expect(isValidPermission('process.terminate')).toBe(true);
    });

    it('api.process.list() requires process.read permission', () => {
      // Context without process.read
      const unprivilegedCtx = new APIContext({
        appId: 'unprivileged.app',
        instanceId: 'inst-1',
        pid: 10,
        permissions: [PackagePermissions.PROCESS_SELF]
      });
      const unprivilegedApi = new AdityyaOSAPI({ kernel, context: unprivilegedCtx });

      expect(() => unprivilegedApi.process.list()).toThrow(APIError);
      try {
        unprivilegedApi.process.list();
      } catch (err) {
        expect(err.code).toBe('EPERM');
        expect(err.operation).toBe('process.list');
      }

      // Create an initial process
      kernel.processManager.createProcess({ name: 'init' });

      // Context with process.read
      const readerCtx = new APIContext({
        appId: 'reader.app',
        instanceId: 'inst-2',
        pid: 11,
        permissions: [PackagePermissions.PROCESS_READ]
      });
      const readerApi = new AdityyaOSAPI({ kernel, context: readerCtx });

      const list = readerApi.process.list();
      expect(Array.isArray(list)).toBe(true);
      expect(list.length).toBeGreaterThan(0);
      expect(list[0]).toHaveProperty('pid');
      expect(list[0]).toHaveProperty('name');
      expect(list[0]).toHaveProperty('state');
    });

    it('api.process.getInfo() allows foreign process inspection only with process.read', () => {
      const targetProc = kernel.processManager.createProcess({ name: 'target-worker' });
      const targetPid = targetProc.data.pid;

      // Caller with only process.self cannot inspect targetPid
      const selfOnlyCtx = new APIContext({
        appId: 'self.app',
        instanceId: 'inst-1',
        pid: 10,
        permissions: [PackagePermissions.PROCESS_SELF]
      });
      const selfApi = new AdityyaOSAPI({ kernel, context: selfOnlyCtx });

      expect(() => selfApi.process.getInfo(targetPid)).toThrow(APIError);
      try {
        selfApi.process.getInfo(targetPid);
      } catch (err) {
        expect(err.code).toBe('EPERM');
      }

      // Caller with process.read can inspect targetPid
      const readCtx = new APIContext({
        appId: 'taskmanager.app',
        instanceId: 'inst-2',
        pid: 11,
        permissions: [PackagePermissions.PROCESS_READ]
      });
      const readApi = new AdityyaOSAPI({ kernel, context: readCtx });

      const info = readApi.process.getInfo(targetPid);
      expect(info).toBeDefined();
      expect(info.pid).toBe(targetPid);
      expect(info.name).toBe('target-worker');
    });

    it('api.process.terminate() requires process.terminate permission', () => {
      kernel.processManager.createProcess({ name: 'init' }); // PID 1 (system)
      const victim = kernel.processManager.createProcess({ name: 'victim-proc' }); // PID 2 (user)
      const victimPid = victim.data.pid;

      // Caller without process.terminate
      const noKillCtx = new APIContext({
        appId: 'no-kill.app',
        instanceId: 'inst-1',
        pid: 10,
        permissions: [PackagePermissions.PROCESS_READ]
      });
      const noKillApi = new AdityyaOSAPI({ kernel, context: noKillCtx });

      expect(() => noKillApi.process.terminate(victimPid)).toThrow(APIError);
      try {
        noKillApi.process.terminate(victimPid);
      } catch (err) {
        expect(err.code).toBe('EPERM');
        expect(err.operation).toBe('process.terminate');
      }

      // Caller with process.terminate
      const killCtx = new APIContext({
        appId: 'taskmanager.app',
        instanceId: 'inst-2',
        pid: 11,
        permissions: [PackagePermissions.PROCESS_TERMINATE]
      });
      const killApi = new AdityyaOSAPI({ kernel, context: killCtx });

      const res = killApi.process.terminate(victimPid);
      expect(res.success).toBe(true);
      expect(res.pid).toBe(victimPid);

      const pcb = kernel.processManager.getProcess(victimPid);
      expect(pcb.state).toBe('TERMINATED');
    });

    it('api.process.terminate() strictly protects system-critical processes (PID 0, PID 1, idle, init)', () => {
      const killCtx = new APIContext({
        appId: 'taskmanager.app',
        instanceId: 'inst-1',
        pid: 10,
        permissions: [PackagePermissions.PROCESS_TERMINATE]
      });
      const killApi = new AdityyaOSAPI({ kernel, context: killCtx });

      // PID 0 (idle) and PID 1 (init)
      expect(() => killApi.process.terminate(0)).toThrow(APIError);
      expect(() => killApi.process.terminate(1)).toThrow(APIError);

      try {
        killApi.process.terminate(1);
      } catch (err) {
        expect(err.code).toBe('EPERM');
        expect(err.message).toMatch(/system-critical/i);
      }
    });
  });

  describe('FileSystemAPI Rename & Storage Usage Primitives', () => {
    it('api.fs.rename() requires filesystem.write permission', () => {
      kernel.fileSystemManager.createFile('/home/user/orig.txt', 5);

      const readOnlyCtx = new APIContext({
        appId: 'reader.app',
        instanceId: 'inst-1',
        pid: 10,
        permissions: [PackagePermissions.FILESYSTEM_READ],
        cwd: '/home/user'
      });
      const readApi = new AdityyaOSAPI({ kernel, context: readOnlyCtx });

      expect(() => readApi.fs.rename('orig.txt', 'renamed.txt')).toThrow(APIError);
      try {
        readApi.fs.rename('orig.txt', 'renamed.txt');
      } catch (err) {
        expect(err.code).toBe('EPERM');
        expect(err.operation).toBe('fs.rename');
      }
    });

    it('api.fs.rename() successfully moves/renames files using genuine filesystem primitive', () => {
      kernel.fileSystemManager.createFile('/home/user/alpha.txt', 10);
      kernel.fileSystemManager.writeFile('/home/user/alpha.txt', 'test-alpha');

      const statBefore = kernel.fileSystemManager.stat('/home/user/alpha.txt');
      const inodeIdBefore = statBefore.data.inodeId;

      const writeCtx = new APIContext({
        appId: 'files.app',
        instanceId: 'inst-1',
        pid: 10,
        permissions: [PackagePermissions.FILESYSTEM_WRITE, PackagePermissions.FILESYSTEM_READ],
        cwd: '/home/user'
      });
      const api = new AdityyaOSAPI({ kernel, context: writeCtx });

      const renameRes = api.fs.rename('alpha.txt', 'beta.txt');
      expect(renameRes).toBeDefined();

      expect(api.fs.exists('alpha.txt')).toBe(false);
      expect(api.fs.exists('beta.txt')).toBe(true);

      // Metadata & Inode preservation
      const statAfter = kernel.fileSystemManager.stat('/home/user/beta.txt');
      expect(statAfter.data.inodeId).toBe(inodeIdBefore);
      const content = api.fs.readFile('beta.txt');
      expect(content.content).toBe('test-alpha');
    });

    it('api.fs.rename() successfully renames directories', () => {
      kernel.fileSystemManager.createDirectory('/home/user/my-docs');
      kernel.fileSystemManager.createFile('/home/user/my-docs/doc.txt', 4);

      const writeCtx = new APIContext({
        appId: 'files.app',
        instanceId: 'inst-1',
        pid: 10,
        permissions: [PackagePermissions.FILESYSTEM_WRITE, PackagePermissions.FILESYSTEM_READ],
        cwd: '/home/user'
      });
      const api = new AdityyaOSAPI({ kernel, context: writeCtx });

      api.fs.rename('my-docs', 'documents');

      expect(api.fs.exists('my-docs')).toBe(false);
      expect(api.fs.exists('documents')).toBe(true);
      expect(api.fs.exists('documents/doc.txt')).toBe(true);
    });

    it('api.fs.rename() rejects destination collision with EEXIST', () => {
      kernel.fileSystemManager.createFile('/home/user/file1.txt', 5);
      kernel.fileSystemManager.createFile('/home/user/file2.txt', 5);

      const writeCtx = new APIContext({
        appId: 'files.app',
        instanceId: 'inst-1',
        pid: 10,
        permissions: [PackagePermissions.FILESYSTEM_WRITE],
        cwd: '/home/user'
      });
      const api = new AdityyaOSAPI({ kernel, context: writeCtx });

      expect(() => api.fs.rename('file1.txt', 'file2.txt')).toThrow(APIError);
      try {
        api.fs.rename('file1.txt', 'file2.txt');
      } catch (err) {
        expect(err.code).toBe('EEXIST');
      }
    });

    it('api.fs.getUsage() returns real filesystem telemetry', () => {
      const readCtx = new APIContext({
        appId: 'sysmon.app',
        instanceId: 'inst-1',
        pid: 10,
        permissions: [PackagePermissions.FILESYSTEM_READ]
      });
      const api = new AdityyaOSAPI({ kernel, context: readCtx });

      const usage = api.fs.getUsage();
      expect(usage).toBeDefined();
      expect(usage.totalBlocks).toBeGreaterThan(0);
      expect(usage.usedBlocks).toBeGreaterThanOrEqual(0);
      expect(usage.freeBlocks).toBeGreaterThanOrEqual(0);
      expect(usage.blockSize).toBeGreaterThan(0);
      expect(usage.totalBytes).toBe(usage.totalBlocks * usage.blockSize);
    });
  });
});
