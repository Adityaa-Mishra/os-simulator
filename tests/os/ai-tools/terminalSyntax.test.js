import { describe, it, expect, beforeEach } from 'vitest';
import { Kernel } from '../../../public/js/os/kernel/Kernel.js';
import { APIContext } from '../../../public/js/os/api/APIContext.js';
import { AdityyaOSAPI } from '../../../public/js/os/api/AdityyaOSAPI.js';
import { PackagePermissions } from '../../../public/js/os/packages/PackagePermissions.js';
import { Shell } from '../../../public/js/os/terminal/Shell.js';

describe('Phase 28 — Terminal AI Syntax Handling', () => {
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

  it('recognizes AI: read <path> syntax and reads virtual AdityyaFS file', async () => {
    api.fs.writeFile('/home/doc.txt', 'Virtual AdityyaOS content');

    const result = await shell.execute('AI: read /home/doc.txt');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Virtual AdityyaOS content');
  });

  it('recognizes AI:- syntax variant', async () => {
    api.fs.writeFile('/home/doc2.txt', 'Variant test content');

    const result = await shell.execute('AI:- read /home/doc2.txt');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Variant test content');
  });

  it('recognizes AI: search <query> [<path>]', async () => {
    api.fs.writeFile('/home/app.js', 'const apiKey = "secret";');

    const result = await shell.execute('AI: search apiKey /home');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('/home/app.js');
  });

  it('recognizes AI: find <pattern> [<path>]', async () => {
    api.fs.writeFile('/home/test.spec.js', 'test()');

    const result = await shell.execute('AI: find *.spec.js /home');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('/home/test.spec.js');
  });

  it('recognizes AI: status / AI: info / AI: help', async () => {
    const helpRes = await shell.execute('AI: help');
    expect(helpRes.exitCode).toBe(0);
    expect(helpRes.stdout).toContain('AI Terminal Commands:');

    const statusRes = await shell.execute('AI: status');
    expect(statusRes.exitCode).toBe(0);
    expect(statusRes.stdout).toContain('OS Status:');
  });

  it('displays error for unknown AI command and does not pass to standard shell command lookup', async () => {
    const res = await shell.execute('AI: doSomethingWild');
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain('Unknown AI command: doSomethingWild');
  });

  it('still executes standard shell commands normally', async () => {
    const echoRes = await shell.execute('echo "Hello standard shell"');
    expect(echoRes.exitCode).toBe(0);
    expect(echoRes.stdout.trim()).toBe('Hello standard shell');
  });
});
