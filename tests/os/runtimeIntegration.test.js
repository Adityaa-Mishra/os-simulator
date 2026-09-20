/**
 * tests/os/runtimeIntegration.test.js
 * End-to-end integration tests for ApplicationRuntime, AdityyaOSAPI, and Phase 18 Terminal compatibility.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Kernel } from '../../public/js/os/kernel/Kernel.js';
import { WindowManager } from '../../public/js/os/shell/WindowManager.js';
import { ApplicationRuntime } from '../../public/js/os/runtime/ApplicationRuntime.js';
import { ApplicationState } from '../../public/js/os/runtime/ApplicationState.js';
import { WindowState } from '../../public/js/os/shell/WindowState.js';
import { Shell } from '../../public/js/os/terminal/Shell.js';

describe('Phase 19 & 20: End-to-End Integration & Terminal Compatibility', () => {
  let kernel;
  let windowManager;
  let runtime;
  let shell;

  beforeEach(() => {
    kernel = new Kernel();
    kernel.boot();
    windowManager = new WindowManager({ events: kernel.events });
    runtime = new ApplicationRuntime({ kernel, windowManager });
    shell = new Shell({ kernel });

    kernel.fileSystemManager.createDirectory('/home');
    kernel.fileSystemManager.createDirectory('/home/user');
  });

  afterEach(() => {
    kernel.shutdown();
  });

  it('runs an application that uses fs, window, events, and voluntary exit', () => {
    let capturedApi = null;

    runtime.registerApplication({
      id: 'notes-app',
      name: 'Adityya Notes',
      version: '1.0.0',
      entry: (api) => {
        capturedApi = api;
        // Use FileSystemAPI
        api.fs.writeFile('todo.txt', '- Buy milk\n- Finish OS');

        // Use WindowAPI
        api.window.setTitle('Adityya Notes (Saved)');
      }
    });

    const instance = runtime.launch('notes-app');
    expect(instance.state).toBe(ApplicationState.RUNNING);
    expect(capturedApi).toBeDefined();

    // Verify file created by app is accessible in OS filesystem
    expect(kernel.fileSystemManager.exists('/home/user/todo.txt')).toBe(true);
    const read = kernel.fileSystemManager.readFile('/home/user/todo.txt');
    expect(read.data.content).toContain('Finish OS');

    // Verify window title was updated by WindowAPI
    expect(instance.windowModel.title).toBe('Adityya Notes (Saved)');

    // App calls voluntary exit
    capturedApi.app.exit(0);

    expect(instance.state).toBe(ApplicationState.TERMINATED);
    expect(instance.exitCode).toBe(0);
    expect(kernel.processManager.getProcess(instance.pid).state).toBe('TERMINATED');
    expect(instance.windowModel.state).toBe(WindowState.CLOSED);
  });

  it('verifies Phase 18 Terminal continues to function flawlessly concurrently with ApplicationRuntime', async () => {
    // 1. Launch a runtime app
    runtime.registerApplication({
      id: 'background-task',
      name: 'Background Task',
      version: '1.0.0',
      entry: (api) => {
        api.fs.writeFile('bg.log', 'Running...');
      }
    });
    const appInstance = runtime.launch('background-task');
    expect(appInstance.state).toBe(ApplicationState.RUNNING);

    // 2. Execute Phase 18 Terminal commands concurrently
    const pwdRes = await shell.execute('pwd');
    expect(pwdRes.exitCode).toBe(0);

    const writeRes = await shell.execute('echo "Terminal Active" > /home/user/term.txt');
    expect(writeRes.exitCode).toBe(0);

    const catRes = await shell.execute('cat /home/user/term.txt');
    expect(catRes.exitCode).toBe(0);
    expect(catRes.stdout).toContain('Terminal Active');

    // Verify both files exist
    expect(kernel.fileSystemManager.exists('/home/user/bg.log')).toBe(true);
    expect(kernel.fileSystemManager.exists('/home/user/term.txt')).toBe(true);

    // Cleanly terminate app
    runtime.terminate(appInstance.instanceId);
    expect(appInstance.state).toBe(ApplicationState.TERMINATED);

    // Terminal still functions
    const lsRes = await shell.execute('ls /home/user');
    expect(lsRes.exitCode).toBe(0);
    expect(lsRes.stdout).toContain('term.txt');
  });
});
