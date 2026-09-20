/**
 * tests/os/runtimeLifecycle.test.js
 * Unit and lifecycle tests for ApplicationValidator, ApplicationLoader, ApplicationState, and ApplicationRuntime.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Kernel } from '../../public/js/os/kernel/Kernel.js';
import { WindowManager } from '../../public/js/os/shell/WindowManager.js';
import { ApplicationRuntime } from '../../public/js/os/runtime/ApplicationRuntime.js';
import { ApplicationValidator } from '../../public/js/os/runtime/ApplicationValidator.js';
import { ApplicationLoader } from '../../public/js/os/runtime/ApplicationLoader.js';
import { ApplicationState, isValidApplicationTransition } from '../../public/js/os/runtime/ApplicationState.js';
import { RuntimeEvents } from '../../public/js/os/runtime/RuntimeEvents.js';
import { WindowState } from '../../public/js/os/shell/WindowState.js';

describe('Phase 20: Application Runtime Lifecycle', () => {
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

  describe('ApplicationValidator', () => {
    it('validates a correct application definition', () => {
      const def = {
        id: 'valid-app',
        name: 'Valid Application',
        version: '1.0.0',
        entry: (api) => {},
        window: { title: 'App', width: 500, height: 300, singleton: true },
        permissions: ['fs:read'],
        memoryRequired: 100
      };

      const result = ApplicationValidator.validate(def);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('rejects invalid application definitions', () => {
      expect(ApplicationValidator.validate(null).valid).toBe(false);
      expect(ApplicationValidator.validate({}).valid).toBe(false);
      expect(ApplicationValidator.validate({ id: 'bad app', name: 'Bad', version: '1.0', entry: () => {} }).valid).toBe(false);
      expect(ApplicationValidator.validate({ id: 'app', name: '', version: '1.0', entry: () => {} }).valid).toBe(false);
      expect(ApplicationValidator.validate({ id: 'app', name: 'App', version: '', entry: () => {} }).valid).toBe(false);
      expect(ApplicationValidator.validate({ id: 'app', name: 'App', version: '1.0', entry: 'not-a-func' }).valid).toBe(false);
      expect(ApplicationValidator.validate({ id: 'app', name: 'App', version: '1.0', entry: () => {}, window: { width: -5 } }).valid).toBe(false);
    });
  });

  describe('ApplicationLoader', () => {
    it('registers, queries, and unregisters application definitions', () => {
      const loader = new ApplicationLoader();
      const def = {
        id: 'notes-app',
        name: 'Notes',
        version: '1.0.0',
        entry: () => {}
      };

      expect(loader.register(def)).toBe(true);
      expect(loader.has('notes-app')).toBe(true);
      expect(loader.get('notes-app').name).toBe('Notes');
      expect(loader.getAll().length).toBe(1);

      expect(loader.unregister('notes-app')).toBe(true);
      expect(loader.has('notes-app')).toBe(false);
    });
  });

  describe('ApplicationState Transitions', () => {
    it('allows valid state transitions', () => {
      expect(isValidApplicationTransition(ApplicationState.REGISTERED, ApplicationState.LOADING)).toBe(true);
      expect(isValidApplicationTransition(ApplicationState.LOADING, ApplicationState.READY)).toBe(true);
      expect(isValidApplicationTransition(ApplicationState.READY, ApplicationState.RUNNING)).toBe(true);
      expect(isValidApplicationTransition(ApplicationState.RUNNING, ApplicationState.SUSPENDED)).toBe(true);
      expect(isValidApplicationTransition(ApplicationState.SUSPENDED, ApplicationState.RUNNING)).toBe(true);
      expect(isValidApplicationTransition(ApplicationState.RUNNING, ApplicationState.TERMINATING)).toBe(true);
      expect(isValidApplicationTransition(ApplicationState.TERMINATING, ApplicationState.TERMINATED)).toBe(true);
    });

    it('disallows illegal transitions', () => {
      expect(isValidApplicationTransition(ApplicationState.TERMINATED, ApplicationState.RUNNING)).toBe(false);
      expect(isValidApplicationTransition(ApplicationState.FAILED, ApplicationState.READY)).toBe(false);
      expect(isValidApplicationTransition(ApplicationState.REGISTERED, ApplicationState.TERMINATED)).toBe(false);
    });
  });

  describe('ApplicationRuntime Lifecycle Execution', () => {
    it('executes full lifecycle: register -> launch -> suspend -> resume -> terminate', () => {
      let launched = false;
      const def = {
        id: 'demo-app',
        name: 'Demo App',
        version: '1.0.0',
        entry: (api) => {
          launched = true;
        }
      };

      runtime.registerApplication(def);

      const eventsFired = [];
      runtime.events.on(RuntimeEvents.APP_STARTED, (e) => eventsFired.push(e));
      runtime.events.on(RuntimeEvents.APP_SUSPENDED, (e) => eventsFired.push(e));
      runtime.events.on(RuntimeEvents.APP_RESUMED, (e) => eventsFired.push(e));
      runtime.events.on(RuntimeEvents.APP_TERMINATED, (e) => eventsFired.push(e));

      // 1. Launch
      const instance = runtime.launch('demo-app');
      expect(launched).toBe(true);
      expect(instance.state).toBe(ApplicationState.RUNNING);
      expect(instance.pid).toBeGreaterThan(0);
      expect(instance.windowModel).toBeDefined();

      // Verify Process in ProcessManager
      const proc = kernel.processManager.getProcess(instance.pid);
      expect(proc).toBeDefined();

      // 2. Suspend
      runtime.suspend(instance.instanceId);
      expect(instance.state).toBe(ApplicationState.SUSPENDED);
      expect(kernel.processManager.getProcess(instance.pid).state).toBe('WAITING');

      // 3. Resume
      runtime.resume(instance.instanceId);
      expect(instance.state).toBe(ApplicationState.RUNNING);
      expect(kernel.processManager.getProcess(instance.pid).state).toBe('READY');

      // 4. Terminate
      runtime.terminate(instance.instanceId, 0);
      expect(instance.state).toBe(ApplicationState.TERMINATED);
      expect(instance.exitCode).toBe(0);
      expect(kernel.processManager.getProcess(instance.pid).state).toBe('TERMINATED');
      expect(instance.windowModel.state).toBe(WindowState.CLOSED);

      expect(eventsFired.length).toBe(4);
    });

    it('enforces singleton application behavior by default', () => {
      runtime.registerApplication({
        id: 'settings-app',
        name: 'Settings',
        version: '1.0.0',
        entry: () => {}
      });

      const inst1 = runtime.launch('settings-app');
      const inst2 = runtime.launch('settings-app');

      expect(inst1.instanceId).toBe(inst2.instanceId);
      expect(inst1.pid).toBe(inst2.pid);
      expect(runtime.getInstancesByAppId('settings-app').length).toBe(1);
    });

    it('supports multi-instance applications when singleton is false', () => {
      runtime.registerApplication({
        id: 'doc-viewer',
        name: 'Document Viewer',
        version: '1.0.0',
        entry: () => {},
        window: { singleton: false }
      });

      const inst1 = runtime.launch('doc-viewer');
      const inst2 = runtime.launch('doc-viewer');

      expect(inst1.instanceId).not.toBe(inst2.instanceId);
      expect(inst1.pid).not.toBe(inst2.pid);
      expect(runtime.getInstancesByAppId('doc-viewer').length).toBe(2);
    });
  });
});
