import { describe, it, expect, beforeEach } from 'vitest';
import { Kernel } from '../../../public/js/os/kernel/Kernel.js';
import { APIContext } from '../../../public/js/os/api/APIContext.js';
import { AdityyaOSAPI } from '../../../public/js/os/api/AdityyaOSAPI.js';
import { PackagePermissions } from '../../../public/js/os/packages/PackagePermissions.js';
import { Shell } from '../../../public/js/os/terminal/Shell.js';

describe('Phase 28 — Terminal Mutating AI Action Approvals', () => {
  let kernel;
  let api;
  let shell;

  beforeEach(() => {
    kernel = new Kernel();
    kernel.boot();

    const context = new APIContext({
      appId: 'terminal-app',
      instanceId: 'term-inst-1',
      pid: 10,
      permissions: [
        PackagePermissions.FILESYSTEM_READ,
        PackagePermissions.FILESYSTEM_WRITE,
        PackagePermissions.SYSTEM_READ,
        PackagePermissions.PROCESS_READ,
        PackagePermissions.NETWORK_READ
      ]
    });

    api = new AdityyaOSAPI({ kernel, context });
    shell = new Shell({ kernel, api });
  });

  it('creates a diff/preview and asks for confirmation on mutating file creation', async () => {
    const promptRes = await shell.execute('AI: create /home/generated.js console.log("generated");');
    expect(promptRes.exitCode).toBe(0);
    expect(promptRes.stdout).toContain('Action Proposed:');
    expect(promptRes.stdout).toContain('create /home/generated.js');
    expect(promptRes.stdout).toContain('Type "yes" to confirm, or "no" to cancel:');

    // File should NOT exist yet
    expect(api.fs.exists('/home/generated.js')).toBe(false);

    // Confirm with "yes"
    const confirmRes = await shell.execute('yes');
    expect(confirmRes.exitCode).toBe(0);
    expect(confirmRes.stdout).toContain('Action executed successfully');

    // File now exists!
    expect(api.fs.exists('/home/generated.js')).toBe(true);
    expect(api.fs.readFile('/home/generated.js').content).toBe('console.log("generated");');
  });

  it('cancels the proposed action when user enters "no"', async () => {
    const promptRes = await shell.execute('AI: create /home/cancelled.js content');
    expect(promptRes.stdout).toContain('Type "yes" to confirm');

    const cancelRes = await shell.execute('no');
    expect(cancelRes.exitCode).toBe(0);
    expect(cancelRes.stdout).toContain('Action cancelled by user.');

    // File should NOT exist
    expect(api.fs.exists('/home/cancelled.js')).toBe(false);
  });

  it('supports confirmation for rename and delete operations', async () => {
    // Write test file
    api.fs.writeFile('/home/old_name.txt', 'test data');

    // Propose rename
    const renamePrompt = await shell.execute('AI: rename /home/old_name.txt /home/new_name.txt');
    expect(renamePrompt.stdout).toContain('rename /home/old_name.txt -> /home/new_name.txt');

    await shell.execute('yes');
    expect(api.fs.exists('/home/old_name.txt')).toBe(false);
    expect(api.fs.exists('/home/new_name.txt')).toBe(true);

    // Propose delete
    const deletePrompt = await shell.execute('AI: delete /home/new_name.txt');
    expect(deletePrompt.stdout).toContain('delete /home/new_name.txt');

    await shell.execute('yes');
    expect(api.fs.exists('/home/new_name.txt')).toBe(false);
  });

  it('treats "yes" and "no" as regular commands when no action is pending', async () => {
    // When no action is pending, "yes" should fall through to standard command lookup (command not found or registered command)
    const res = await shell.execute('yes');
    // Default shell without yes command will return 127 command not found
    expect(res.exitCode).toBe(127);
    expect(res.stderr).toContain('yes: command not found');
  });

  it('isolates pending confirmations per terminal/shell instance', async () => {
    const shell2 = new Shell({ kernel, api });

    // Propose on shell 1
    await shell.execute('AI: create /home/iso.txt data');

    // shell 2 should have NO pending action
    const shell2Res = await shell2.execute('yes');
    expect(shell2Res.exitCode).toBe(127);
    expect(api.fs.exists('/home/iso.txt')).toBe(false);

    // shell 1 can still confirm
    const shell1Res = await shell.execute('yes');
    expect(shell1Res.exitCode).toBe(0);
    expect(api.fs.exists('/home/iso.txt')).toBe(true);
  });

  it('stale "yes" after cancellation does nothing and falls through to normal shell', async () => {
    await shell.execute('AI: create /home/stale.txt data');
    expect(api.fs.exists('/home/stale.txt')).toBe(false);

    // Cancel proposed action
    const cancelRes = await shell.execute('no');
    expect(cancelRes.exitCode).toBe(0);
    expect(cancelRes.stdout).toContain('Action cancelled by user');

    // Stale "yes" must not execute the cancelled action
    const staleRes = await shell.execute('yes');
    expect(staleRes.exitCode).toBe(127);
    expect(staleRes.stderr).toContain('yes: command not found');
    expect(api.fs.exists('/home/stale.txt')).toBe(false);
  });

  it('denied action makes no filesystem change', async () => {
    api.fs.writeFile('/home/protected.txt', 'do not delete');

    // Propose deletion
    await shell.execute('AI: delete /home/protected.txt');

    // Deny deletion
    const denyRes = await shell.execute('no');
    expect(denyRes.exitCode).toBe(0);
    expect(denyRes.stdout).toContain('Action cancelled by user');

    // Verify file still exists with original content
    expect(api.fs.exists('/home/protected.txt')).toBe(true);
    expect(api.fs.readFile('/home/protected.txt').content).toBe('do not delete');
  });

  it('approved action executes exactly once', async () => {
    await shell.execute('AI: create /home/once.txt unique_content');

    // First confirmation executes the action
    const firstRes = await shell.execute('yes');
    expect(firstRes.exitCode).toBe(0);
    expect(firstRes.stdout).toContain('Action executed successfully');
    expect(api.fs.exists('/home/once.txt')).toBe(true);

    // Second confirmation falls through to normal shell command lookup
    const secondRes = await shell.execute('yes');
    expect(secondRes.exitCode).toBe(127);
    expect(secondRes.stderr).toContain('yes: command not found');
  });

  it('detects and prevents execution if proposed arguments are tampered with', async () => {
    await shell.execute('AI: create /home/safe.txt safe_content');

    const pending = shell.aiHandler.pendingRecord;
    expect(pending).toBeDefined();

    // Attempting to mutate frozen args directly in strict mode would throw;
    // simulating an attacker replacing the args object with malicious arguments:
    pending.args = { path: '/home/malicious.txt', content: 'malicious' };

    const confirmRes = await shell.execute('yes');
    expect(confirmRes.exitCode).toBe(1);
    expect(confirmRes.stderr).toContain('Security violation: Action arguments were mutated after proposal.');

    // Neither file should have been created
    expect(api.fs.exists('/home/safe.txt')).toBe(false);
    expect(api.fs.exists('/home/malicious.txt')).toBe(false);
  });

  it('does nothing when "yes" is sent after process termination or shell destruction', async () => {
    // 1. Process termination
    const proc = kernel.processManager.createProcess({ name: 'term-proc' }).data;
    const termContext = new APIContext({
      appId: 'terminal-term',
      instanceId: 'term-inst-2',
      pid: proc.pid,
      permissions: [
        PackagePermissions.FILESYSTEM_READ,
        PackagePermissions.FILESYSTEM_WRITE,
        PackagePermissions.PROCESS_SELF
      ]
    });
    const termApi = new AdityyaOSAPI({ kernel, context: termContext });
    const termShell = new Shell({ kernel, api: termApi });

    await termShell.execute('AI: create /home/terminated.txt data');
    expect(termApi.fs.exists('/home/terminated.txt')).toBe(false);

    // Terminate the process in ProcessManager
    kernel.processManager.terminateProcess(proc.pid);

    // "yes" after process termination falls through to normal shell command lookup
    const postTermRes = await termShell.execute('yes');
    expect(postTermRes.exitCode).toBe(127);
    expect(termApi.fs.exists('/home/terminated.txt')).toBe(false);

    // 2. Shell destruction
    await shell.execute('AI: create /home/destruct.txt data');
    shell.destroy();

    // After shell destruction, aiHandler is null/cleared
    const postDestroyRes = await shell.execute('yes');
    expect(postDestroyRes.exitCode).toBe(127);
    expect(api.fs.exists('/home/destruct.txt')).toBe(false);
  });
});

