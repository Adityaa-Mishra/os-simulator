import { describe, it, expect, beforeEach } from 'vitest';
import { Kernel } from '../../../public/js/os/kernel/Kernel.js';
import { APIContext } from '../../../public/js/os/api/APIContext.js';
import { AdityyaOSAPI } from '../../../public/js/os/api/AdityyaOSAPI.js';
import { PackagePermissions } from '../../../public/js/os/packages/PackagePermissions.js';
import { AIDeveloperTools } from '../../../public/js/os/ai-tools/AIDeveloperTools.js';
import { AITerminalHandler } from '../../../public/js/os/terminal/AITerminalHandler.js';

describe('Phase 30 — Profile Isolation & Security Safeguards', () => {
  let kernel;

  beforeEach(() => {
    kernel = new Kernel();
    kernel.boot();

    // Create user profiles 'alice' and 'bob'
    kernel.profileManager.createProfile({ username: 'alice', displayName: 'Alice' });
    kernel.profileManager.createProfile({ username: 'bob', displayName: 'Bob' });

    // Seed files in alice's and bob's home directories
    kernel.fileSystemManager.createFile('/home/alice/secret.txt', 'alice secret');
    kernel.fileSystemManager.createFile('/home/bob/secret.txt', 'bob secret');
  });

  it('prevents Profile A from reading or writing Profile B home directory', () => {
    const aliceContext = new APIContext({
      appId: 'alice-app',
      instanceId: 'inst-1',
      pid: 10,
      profileId: 'alice-id',
      username: 'alice',
      permissions: [PackagePermissions.FILESYSTEM_READ, PackagePermissions.FILESYSTEM_WRITE]
    });
    const aliceApi = new AdityyaOSAPI({ kernel, context: aliceContext });

    // Alice can read her own file
    const ownContent = aliceApi.fs.readFile('/home/alice/secret.txt');
    expect(ownContent.content).toBe('alice secret');

    // Alice cannot read Bob's file
    expect(() => aliceApi.fs.readFile('/home/bob/secret.txt')).toThrowError(/Cannot access profile directory/);

    // Alice cannot write to Bob's directory
    expect(() => aliceApi.fs.writeFile('/home/bob/hack.txt', 'bad')).toThrowError(/Cannot access profile directory/);

    // Alice cannot delete Bob's file
    expect(() => aliceApi.fs.deleteFile('/home/bob/secret.txt')).toThrowError(/Cannot access profile directory/);
  });

  it('prevents profile discovery by masking /home directory listing', () => {
    const aliceContext = new APIContext({
      appId: 'alice-app',
      instanceId: 'inst-1',
      pid: 10,
      profileId: 'alice-id',
      username: 'alice',
      permissions: [PackagePermissions.FILESYSTEM_READ]
    });
    const aliceApi = new AdityyaOSAPI({ kernel, context: aliceContext });

    const homeEntries = aliceApi.fs.listDirectory('/home');
    const names = homeEntries.map(e => e.name);

    // Only 'alice' is visible. 'bob' and 'user' are masked out.
    expect(names).toContain('alice');
    expect(names).not.toContain('bob');
    expect(names).not.toContain('user');
  });

  it('prevents probing other profile existence via exists()', () => {
    const aliceContext = new APIContext({
      appId: 'alice-app',
      instanceId: 'inst-1',
      pid: 10,
      profileId: 'alice-id',
      username: 'alice',
      permissions: [PackagePermissions.FILESYSTEM_READ]
    });
    const aliceApi = new AdityyaOSAPI({ kernel, context: aliceContext });

    // Exists on foreign home returns false without leaking existence
    expect(aliceApi.fs.exists('/home/bob')).toBe(false);
    expect(aliceApi.fs.exists('/home/bob/secret.txt')).toBe(false);
    expect(aliceApi.fs.exists('/home/nonexistent')).toBe(false);

    // Exists on own home works normally
    expect(aliceApi.fs.exists('/home/alice')).toBe(true);
    expect(aliceApi.fs.exists('/home/alice/secret.txt')).toBe(true);
  });

  it('resolves ~ in AIDeveloperTools to caller profile home directory', () => {
    const bobContext = new APIContext({
      appId: 'bob-ai',
      instanceId: 'inst-1',
      pid: 12,
      profileId: 'bob-id',
      username: 'bob',
      permissions: [PackagePermissions.FILESYSTEM_READ, PackagePermissions.FILESYSTEM_WRITE]
    });

    const devTools = new AIDeveloperTools({
      fs: kernel.fileSystemManager,
      context: bobContext
    });

    const resolved = devTools._resolvePath('~/project');
    expect(resolved).toBe('/home/bob/project');
  });

  it('enforces profile binding on AITerminalHandler confirmations', async () => {
    const aliceContext = new APIContext({
      appId: 'alice-term',
      instanceId: 'inst-1',
      pid: 10,
      profileId: 'alice-id',
      username: 'alice',
      permissions: [PackagePermissions.FILESYSTEM_READ, PackagePermissions.FILESYSTEM_WRITE]
    });
    const aliceApi = new AdityyaOSAPI({ kernel, context: aliceContext });
    const aliceHandler = new AITerminalHandler({ api: aliceApi, shell: { state: { cwd: '/home/alice' } } });

    // Set a pending record for alice
    const record = {
      actionId: 'act-1',
      sessionId: aliceHandler.sessionId,
      pid: aliceHandler.pid,
      appId: aliceHandler.appId,
      profileId: 'alice-id',
      username: 'alice',
      actionType: 'createFile',
      args: { path: '/home/alice/test.txt', content: 'test' },
      argsSnapshotStr: JSON.stringify({ path: '/home/alice/test.txt', content: 'test' }),
      preview: 'Create file /home/alice/test.txt',
      approval: {
        status: 'PENDING',
        executed: false,
        approve: () => {},
        markExecuted: () => {}
      },
      action: {
        status: 'WAITING_FOR_APPROVAL',
        transition: () => {}
      }
    };

    aliceHandler.pendingRecord = record;

    // Bob tries to handle confirmation using bobHandler
    const bobContext = new APIContext({
      appId: 'bob-term',
      instanceId: 'inst-2',
      pid: 11,
      profileId: 'bob-id',
      username: 'bob',
      permissions: [PackagePermissions.FILESYSTEM_READ, PackagePermissions.FILESYSTEM_WRITE]
    });
    const bobApi = new AdityyaOSAPI({ kernel, context: bobContext });
    const bobHandler = new AITerminalHandler({ api: bobApi, shell: { state: { cwd: '/home/bob' } } });
    bobHandler.pendingRecord = record; // Inherited or shared foreign record

    const bobResult = await bobHandler.handleConfirmation('yes');
    expect(bobResult.handled).toBe(false); // Rejected due to profile/session mismatch
  });

  it('prevents foreign profile discovery via api.profile.list()', () => {
    const aliceContext = new APIContext({
      appId: 'alice-app',
      instanceId: 'inst-1',
      pid: 10,
      profileId: 'alice-id',
      username: 'alice',
      permissions: [PackagePermissions.PROFILE_READ]
    });
    const aliceApi = new AdityyaOSAPI({ kernel, context: aliceContext });

    const profiles = aliceApi.profile.list();
    expect(profiles.length).toBe(1);
    expect(profiles[0].username).toBe('alice');
    expect(profiles.map(p => p.username)).not.toContain('bob');
    expect(profiles.map(p => p.username)).not.toContain('user');
  });

  it('prevents foreign profile inspection and existence-probing via api.profile.getProfile()', () => {
    const aliceContext = new APIContext({
      appId: 'alice-app',
      instanceId: 'inst-1',
      pid: 10,
      profileId: 'alice-id',
      username: 'alice',
      permissions: [PackagePermissions.PROFILE_READ]
    });
    const aliceApi = new AdityyaOSAPI({ kernel, context: aliceContext });

    // Alice can inspect her own profile
    const own = aliceApi.profile.getProfile('alice');
    expect(own.username).toBe('alice');

    // Alice cannot inspect existing Profile 'bob' -> uniform ENOENT
    let bobError;
    try {
      aliceApi.profile.getProfile('bob');
    } catch (err) {
      bobError = err;
    }
    expect(bobError).toBeDefined();
    expect(bobError.code).toBe('ENOENT');
    expect(bobError.message).toBe('Profile "bob" not found or access denied');

    // Alice cannot inspect non-existent Profile 'charlie' -> identical uniform ENOENT
    let charlieError;
    try {
      aliceApi.profile.getProfile('charlie');
    } catch (err) {
      charlieError = err;
    }
    expect(charlieError).toBeDefined();
    expect(charlieError.code).toBe('ENOENT');
    expect(charlieError.message).toBe('Profile "charlie" not found or access denied');
  });
});

