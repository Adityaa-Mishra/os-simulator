/**
 * tests/os/runtimeIsolation.test.js
 * Failure containment, resource isolation, descriptor reclamation, and static host isolation tests for Phase 19/20.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Kernel } from '../../public/js/os/kernel/Kernel.js';
import { WindowManager } from '../../public/js/os/shell/WindowManager.js';
import { ApplicationRuntime } from '../../public/js/os/runtime/ApplicationRuntime.js';
import { ApplicationState } from '../../public/js/os/runtime/ApplicationState.js';
import { RuntimeEvents } from '../../public/js/os/runtime/RuntimeEvents.js';
import { WindowState } from '../../public/js/os/shell/WindowState.js';
import fs from 'fs';
import path from 'path';

describe('Phase 19 & 20: Isolation, Failure Containment & Host Safety', () => {
  let kernel;
  let windowManager;
  let runtime;

  beforeEach(() => {
    kernel = new Kernel();
    kernel.boot();
    windowManager = new WindowManager({ events: kernel.events });
    runtime = new ApplicationRuntime({ kernel, windowManager });
  });

  afterEach(() => {
    kernel.shutdown();
  });

  describe('Static Host Isolation & Zero-Arbitrary-Execution Verification', () => {
    it('verifies that no API or Runtime code contains host execution or host filesystem access', () => {
      const targetDirs = [
        path.resolve(process.cwd(), 'public/js/os/api'),
        path.resolve(process.cwd(), 'public/js/os/runtime')
      ];

      const getFilesRecursively = (dir) => {
        let results = [];
        const list = fs.readdirSync(dir);
        for (const file of list) {
          const filePath = path.join(dir, file);
          const stat = fs.statSync(filePath);
          if (stat && stat.isDirectory()) {
            results = results.concat(getFilesRecursively(filePath));
          } else if (file.endsWith('.js')) {
            results.push(filePath);
          }
        }
        return results;
      };

      const allFiles = targetDirs.flatMap(getFilesRecursively);
      expect(allFiles.length).toBeGreaterThanOrEqual(15);

      const forbiddenPatterns = [
        /child_process/,
        /\bexec\s*\(/,
        /\bspawn\s*\(/,
        /\bexecSync\s*\(/,
        /\bspawnSync\s*\(/,
        /from\s+['"]fs['"]/,
        /require\(['"]fs['"]\)/,
        /from\s+['"]node:/,
        /\beval\s*\(/,
        /new\s+Function\s*\(/,
        /powershell/i,
        /\bcmd\.exe/i
      ];

      for (const filePath of allFiles) {
        const content = fs.readFileSync(filePath, 'utf8');
        for (const pattern of forbiddenPatterns) {
          expect(content).not.toMatch(pattern);
        }
      }
    });
  });

  describe('Synchronous Failure Containment', () => {
    it('contains a crashing application without affecting Kernel or healthy applications', () => {
      // 1. Launch healthy app
      runtime.registerApplication({
        id: 'healthy-app',
        name: 'Healthy App',
        version: '1.0.0',
        entry: () => {}
      });
      const healthyInstance = runtime.launch('healthy-app');

      // 2. Launch crashing app that throws synchronously
      let errorEvent = null;
      let failedEvent = null;
      runtime.events.on(RuntimeEvents.APP_ERROR, (e) => { errorEvent = e; });
      runtime.events.on(RuntimeEvents.APP_FAILED, (e) => { failedEvent = e; });

      runtime.registerApplication({
        id: 'crashing-app',
        name: 'Crashing App',
        version: '1.0.0',
        entry: () => {
          throw new Error('Fatal application bug!');
        }
      });

      const crashInstance = runtime.launch('crashing-app');

      // Verify crash containment
      expect(crashInstance.state).toBe(ApplicationState.FAILED);
      expect(crashInstance.error.message).toBe('Fatal application bug!');
      expect(errorEvent).toBeDefined();
      expect(failedEvent).toBeDefined();

      // Process of crashing app is terminated
      expect(kernel.processManager.getProcess(crashInstance.pid).state).toBe('TERMINATED');

      // Window of crashing app is closed
      expect(crashInstance.windowModel.state).toBe(WindowState.CLOSED);

      // CRITICAL: Kernel remains RUNNING and unaffected
      expect(kernel.state.system.status).toBe('RUNNING');

      // CRITICAL: Healthy app remains RUNNING and unaffected
      expect(healthyInstance.state).toBe(ApplicationState.RUNNING);
      expect(kernel.processManager.getProcess(healthyInstance.pid).state).toBe('READY');
    });
  });

  describe('Asynchronous Failure Containment', () => {
    it('contains an asynchronously rejecting application', async () => {
      let failedEvent = null;
      runtime.events.on(RuntimeEvents.APP_FAILED, (e) => { failedEvent = e; });

      runtime.registerApplication({
        id: 'async-fail-app',
        name: 'Async Fail App',
        version: '1.0.0',
        entry: async () => {
          await Promise.resolve();
          throw new Error('Async rejection!');
        }
      });

      const instance = runtime.launch('async-fail-app');
      expect(instance.state).toBe(ApplicationState.RUNNING);

      // Wait for next tick
      await new Promise(resolve => setTimeout(resolve, 20));

      expect(instance.state).toBe(ApplicationState.FAILED);
      expect(instance.error.message).toBe('Async rejection!');
      expect(failedEvent).toBeDefined();
      expect(kernel.processManager.getProcess(instance.pid).state).toBe('TERMINATED');
      expect(kernel.state.system.status).toBe('RUNNING');
    });
  });

  describe('File Descriptor and Event Listener Reclamation', () => {
    it('automatically reclaims file descriptors opened by a terminated application', () => {
      kernel.fileSystemManager.createDirectory('/home');
      kernel.fileSystemManager.createDirectory('/home/user');
      kernel.fileSystemManager.createFile('/home/user/leak.txt');

      let openedFd = null;
      runtime.registerApplication({
        id: 'fd-app',
        name: 'FD App',
        version: '1.0.0',
        entry: (api) => {
          const res = api.fs.open('leak.txt', ['READ', 'WRITE']);
          openedFd = res.fd;
        }
      });

      const instance = runtime.launch('fd-app');
      expect(openedFd).toBeDefined();

      // Verify descriptor is currently open in FileSystem
      expect(kernel.fileSystemManager.fs.descriptors.has(openedFd)).toBe(true);

      // Terminate application
      runtime.terminate(instance.instanceId, 0);

      // Descriptor MUST be closed automatically
      expect(kernel.fileSystemManager.fs.descriptors.has(openedFd)).toBe(false);
    });
  });
});
