/**
 * tests/os/store/storeIntegration.test.js
 * Comprehensive integration tests and security audits for Phase 21 + 22.
 * Validates:
 * 1. Zero dynamic code execution (eval, new Function, child_process, exec, spawn, Node vm/fs)
 * 2. Seamless coexistence with Phase 18 Terminal and Shell
 * 3. Package serialization / deserialization round-trip integrity
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { Kernel } from '../../../public/js/os/kernel/Kernel.js';
import { WindowManager } from '../../../public/js/os/shell/WindowManager.js';
import { Shell } from '../../../public/js/os/terminal/Shell.js';
import { TerminalState } from '../../../public/js/os/terminal/TerminalState.js';
import { ApplicationLoader } from '../../../public/js/os/runtime/ApplicationLoader.js';
import { ApplicationRuntime } from '../../../public/js/os/runtime/ApplicationRuntime.js';
import { PackageRegistry } from '../../../public/js/os/packages/PackageRegistry.js';
import { AppPackage } from '../../../public/js/os/packages/AppPackage.js';
import { StoreCatalog } from '../../../public/js/os/store/StoreCatalog.js';
import { StoreService } from '../../../public/js/os/store/StoreService.js';

describe('Phase 21 + 22: Integration & Security Audit', () => {
  describe('Static Security Audit: Zero Dynamic Code Execution', () => {
    const targetDirs = [
      path.resolve(__dirname, '../../../public/js/os/packages'),
      path.resolve(__dirname, '../../../public/js/os/store')
    ];

    it('contains no forbidden dynamic execution primitives', () => {
      const forbiddenPatterns = [
        /\beval\s*\(/,
        /\bnew\s+Function\s*\(/,
        /\bFunction\s*\(/,
        /\bchild_process\b/,
        /\bexec\s*\(/,
        /\bspawn\s*\(/,
        /['"]vm['"]/,
        /\brequire\s*\(\s*['"]fs['"]\s*\)/
      ];

      for (const dir of targetDirs) {
        const files = fs.readdirSync(dir).filter(f => f.endsWith('.js'));
        for (const file of files) {
          const content = fs.readFileSync(path.join(dir, file), 'utf-8');

          for (const pattern of forbiddenPatterns) {
            expect(
              pattern.test(content),
              `File ${file} must not match forbidden pattern: ${pattern.toString()}`
            ).toBe(false);
          }
        }
      }
    });
  });

  describe('Terminal Shell & Store Coexistence', () => {
    let kernel;
    let windowManager;
    let loader;
    let runtime;
    let packageRegistry;
    let catalog;
    let store;
    let shell;
    let terminalState;

    beforeEach(() => {
      kernel = new Kernel();
      kernel.boot();
      kernel.fileSystemManager.createDirectory('/home');
      kernel.fileSystemManager.createDirectory('/home/user');

      windowManager = new WindowManager();
      loader = new ApplicationLoader();
      runtime = new ApplicationRuntime({
        kernel,
        windowManager,
        loader
      });

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

      terminalState = new TerminalState({ cwd: '/home/user', username: 'user', hostname: 'adityyaos' });
      shell = new Shell({
        kernel,
        state: terminalState
      });
    });

    afterEach(() => {
      if (kernel) kernel.shutdown();
    });

    it('allows Shell command execution alongside Store operations', async () => {
      // 1. Run command in Terminal Shell
      const res1 = await shell.execute('echo "hello from shell"');
      expect(res1.success).toBe(true);
      expect(res1.stdout).toContain('hello from shell');

      // 2. Install application from Store
      const installRes = store.install('example.notes');
      expect(installRes.isInstalled).toBe(true);

      // Verify app is not in process table yet
      expect(kernel.processManager.getProcesses().some(p => p.name === 'Notes')).toBe(false);

      // 3. Launch application
      const inst = runtime.launch('example.notes');
      expect(inst).toBeDefined();

      // Verify app appears in process table
      const proc = kernel.processManager.getProcess(inst.pid);
      expect(proc).toBeDefined();
      expect(proc.name).toBe('Notes');

      // 4. App creates a file through its API
      inst.context.api.fs.createFile('/home/user/from_app.txt');
      inst.context.api.fs.writeFile('/home/user/from_app.txt', 'written by notes app');

      // 5. Terminal can list and read the file via ls and cat
      const lsRes = await shell.execute('ls /home/user');
      expect(lsRes.success).toBe(true);
      expect(lsRes.stdout).toContain('from_app.txt');

      const catRes = await shell.execute('cat /home/user/from_app.txt');
      expect(catRes.success).toBe(true);
      expect(catRes.stdout).toContain('written by notes app');

      // 6. Terminate the app
      runtime.terminate(inst.instanceId, 0);

      // 7. Verify process is no longer running in process table
      const deadProc = kernel.processManager.getProcess(inst.pid);
      expect(deadProc.state).toBe('TERMINATED');
    });
  });

  describe('Package Serialization Round-Trip Integrity', () => {
    it('serializes to JSON, deserializes without code execution, and installs cleanly', () => {
      const catalog = new StoreCatalog();
      const originalStoreApp = catalog.getApp('example.calculator');
      const originalPkg = originalStoreApp.package;

      // JSON stringify and parse
      const serialized = JSON.stringify(originalPkg.toJSON());
      const rawJson = JSON.parse(serialized);

      // Reconstruct package from JSON data
      const deserializedPkg = AppPackage.fromJSON(rawJson);

      expect(deserializedPkg.manifest.id).toBe('example.calculator');
      expect(deserializedPkg.manifest.version).toBe('1.0.0');
      expect(deserializedPkg.hasFile('app.js')).toBe(true);
      expect(deserializedPkg.getFile('app.js')).toContain('Calculator loaded');

      // Install in a fresh registry
      const loader = new ApplicationLoader();
      const registry = new PackageRegistry({ applicationLoader: loader });

      const installResult = registry.install(deserializedPkg, originalStoreApp.trustedEntry);
      expect(installResult.appId).toBe('example.calculator');
      expect(registry.has('example.calculator')).toBe(true);
      expect(loader.has('example.calculator')).toBe(true);
    });
  });
});
