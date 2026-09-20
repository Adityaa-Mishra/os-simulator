/**
 * tests/os/store/storeLifecycle.test.js
 * End-to-end application lifecycle tests through the Store, Runtime, and OS (Phase 22).
 * Verifies: Discover -> Install -> Verify Not Running -> Launch -> Execute -> Terminate / Uninstall.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Kernel } from '../../../public/js/os/kernel/Kernel.js';
import { WindowManager } from '../../../public/js/os/shell/WindowManager.js';
import { ApplicationLoader } from '../../../public/js/os/runtime/ApplicationLoader.js';
import { ApplicationRuntime } from '../../../public/js/os/runtime/ApplicationRuntime.js';
import { ApplicationState } from '../../../public/js/os/runtime/ApplicationState.js';
import { PackageRegistry } from '../../../public/js/os/packages/PackageRegistry.js';
import { StoreCatalog } from '../../../public/js/os/store/StoreCatalog.js';
import { StoreService } from '../../../public/js/os/store/StoreService.js';
import { APIError } from '../../../public/js/os/api/APIError.js';

describe('Phase 22: Store & Application Lifecycle End-to-End', () => {
  let kernel;
  let windowManager;
  let loader;
  let runtime;
  let packageRegistry;
  let catalog;
  let store;

  beforeEach(() => {
    // 1. Boot Kernel
    kernel = new Kernel();
    kernel.boot();
    kernel.fileSystemManager.createDirectory('/home');
    kernel.fileSystemManager.createDirectory('/home/user');

    // 2. Initialize WindowManager
    windowManager = new WindowManager();

    // 3. Initialize Loader and Runtime
    loader = new ApplicationLoader();
    runtime = new ApplicationRuntime({
      kernel,
      windowManager,
      loader,
      events: kernel.events
    });

    // 4. Initialize PackageRegistry and Store
    packageRegistry = new PackageRegistry({
      applicationLoader: loader,
      applicationRuntime: runtime
    });
    catalog = new StoreCatalog();
    store = new StoreService({
      packageRegistry,
      catalog,
      events: kernel.events
    });
  });

  afterEach(() => {
    if (kernel) {
      kernel.shutdown();
    }
  });

  it('completes the entire lifecycle: list -> install -> launch -> run with permissions -> uninstall', () => {
    // Step 1: Discover in Store
    const available = store.list();
    expect(available.length).toBeGreaterThanOrEqual(3);
    const notesApp = store.get('example.notes');
    expect(notesApp).toBeDefined();
    expect(notesApp.isInstalled).toBe(false);

    // Verify nothing is running initially
    expect(runtime.getInstancesByAppId('example.notes')).toHaveLength(0);

    // Step 2: Install from Store
    const installResult = store.install('example.notes');
    expect(installResult.isInstalled).toBe(true);
    expect(store.isInstalled('example.notes')).toBe(true);
    expect(packageRegistry.has('example.notes')).toBe(true);
    expect(loader.has('example.notes')).toBe(true);

    // CRITICAL: Verify app is NOT automatically launched
    expect(runtime.getInstancesByAppId('example.notes')).toHaveLength(0);

    // Step 3: Launch explicitly via ApplicationRuntime
    const instance = runtime.launch('example.notes');
    expect(instance).toBeDefined();
    expect(instance.appId).toBe('example.notes');
    expect(instance.state).toBe(ApplicationState.RUNNING);
    expect(instance.pid).toBeGreaterThan(0);
    expect(instance.windowModel).toBeDefined();
    expect(instance.context.api).toBeDefined();

    // Verify running instances
    const activeInstances = runtime.getInstancesByAppId('example.notes');
    expect(activeInstances).toHaveLength(1);
    expect(activeInstances[0].instanceId).toBe(instance.instanceId);

    // Step 4: Verify permissions in running application
    // 'example.notes' has: filesystem.read, filesystem.write, window.control, application.lifecycle
    // It DOES NOT have: memory.read, process.self
    const api = instance.context.api;

    // Allowed: filesystem operations
    expect(() => {
      api.fs.createFile('/home/user/note.txt');
      api.fs.writeFile('/home/user/note.txt', 'My first note');
    }).not.toThrow();

    const readNote = api.fs.readFile('/home/user/note.txt');
    expect(readNote.content).toBe('My first note');

    // Denied: memory.getUsage (throws EPERM)
    expect(() => api.memory.getUsage()).toThrow(APIError);
    try {
      api.memory.getUsage();
    } catch (err) {
      expect(err.code).toBe('EPERM');
      expect(err.operation).toBe('memory.getUsage');
    }

    // Denied: process.getCurrent (throws EPERM)
    expect(() => api.process.getCurrent()).toThrow(APIError);
    try {
      api.process.getCurrent();
    } catch (err) {
      expect(err.code).toBe('EPERM');
      expect(err.operation).toBe('process.getCurrent');
    }

    // Step 5: Uninstall while running
    // Uninstall should terminate active instances and remove registrations
    const uninstalled = store.uninstall('example.notes');
    expect(uninstalled).toBe(true);
    expect(store.isInstalled('example.notes')).toBe(false);
    expect(packageRegistry.has('example.notes')).toBe(false);
    expect(loader.has('example.notes')).toBe(false);

    // Verify instance was terminated
    expect(instance.state).toBe(ApplicationState.TERMINATED);

    // Verify launching again fails because it's no longer registered
    expect(() => runtime.launch('example.notes')).toThrow();
  });

  it('allows multiple distinct applications to be installed, launched, and isolated', () => {
    // Install both Calculator and Notes
    store.install('example.calculator');
    store.install('example.notes');

    expect(store.isInstalled('example.calculator')).toBe(true);
    expect(store.isInstalled('example.notes')).toBe(true);

    // Neither is running yet
    expect(runtime.getInstancesByAppId('example.calculator')).toHaveLength(0);
    expect(runtime.getInstancesByAppId('example.notes')).toHaveLength(0);

    // Launch Calculator
    const calcInst = runtime.launch('example.calculator');
    expect(calcInst.state).toBe(ApplicationState.RUNNING);

    // Launch Notes
    const notesInst = runtime.launch('example.notes');
    expect(notesInst.state).toBe(ApplicationState.RUNNING);

    // Calculator does NOT have filesystem permissions
    expect(() => calcInst.context.api.fs.readFile('/home/user/test')).toThrow(APIError);
    expect(() => calcInst.context.api.fs.writeFile('/home/user/test', 'x')).toThrow(APIError);

    // Notes DOES have filesystem permissions
    expect(() => notesInst.context.api.fs.createFile('/home/user/notes.txt')).not.toThrow();

    // Terminate Calculator
    runtime.terminate(calcInst.instanceId, 0);
    expect(calcInst.state).toBe(ApplicationState.TERMINATED);
    expect(notesInst.state).toBe(ApplicationState.RUNNING);

    // Notes still running and works
    expect(notesInst.context.api.fs.exists('/home/user/notes.txt')).toBe(true);

    // Clean up
    runtime.terminate(notesInst.instanceId, 0);
  });
});
