import { describe, it, expect, beforeEach } from 'vitest';
import { Kernel } from '../../../public/js/os/kernel/Kernel.js';
import { APIContext } from '../../../public/js/os/api/APIContext.js';
import { AdityyaOSAPI } from '../../../public/js/os/api/AdityyaOSAPI.js';
import { PackagePermissions } from '../../../public/js/os/packages/PackagePermissions.js';

describe('Phase 30 — Cloud State & Sync Simulation', () => {
  let kernel;

  beforeEach(() => {
    kernel = new Kernel();
    kernel.boot();

    // Prepare home files
    kernel.fileSystemManager.createFile('/home/user/doc.txt', 'cloud document content');
  });

  it('enforces cloud.write permission to create cloud snapshot', () => {
    const readOnlyContext = new APIContext({
      appId: 'cloud-app',
      instanceId: 'inst-1',
      pid: 10,
      permissions: [PackagePermissions.CLOUD_READ]
    });
    const api = new AdityyaOSAPI({ kernel, context: readOnlyContext });

    expect(() => api.cloud.createSnapshot()).toThrowError(/Permission denied.*cloud\.write/);
  });

  it('creates and lists cloud snapshots scoped to the caller profile', () => {
    const context = new APIContext({
      appId: 'cloud-app',
      instanceId: 'inst-1',
      pid: 10,
      profileId: 'default',
      username: 'user',
      permissions: [PackagePermissions.CLOUD_READ, PackagePermissions.CLOUD_WRITE]
    });
    const api = new AdityyaOSAPI({ kernel, context });

    const snap = api.cloud.createSnapshot({ description: 'Backup 1' });
    expect(snap.id).toBeDefined();
    expect(snap.profileId).toBe('default');
    expect(snap.filesCount).toBeGreaterThanOrEqual(1);

    const list = api.cloud.listSnapshots();
    expect(list.length).toBe(1);
    expect(list[0].id).toBe(snap.id);

    const fetched = api.cloud.getSnapshot(snap.id);
    expect(fetched.id).toBe(snap.id);
    expect(fetched.description).toBe('Backup 1');
  });

  it('isolates cloud snapshots across profiles', () => {
    // Create snapshot for default user
    const userContext = new APIContext({
      appId: 'user-app',
      instanceId: 'inst-1',
      pid: 10,
      profileId: 'default',
      username: 'user',
      permissions: [PackagePermissions.CLOUD_READ, PackagePermissions.CLOUD_WRITE]
    });
    const userApi = new AdityyaOSAPI({ kernel, context: userContext });
    const userSnap = userApi.cloud.createSnapshot({ description: 'User backup' });

    // Create profile 'eve'
    kernel.profileManager.createProfile({ username: 'eve' });
    const eveContext = new APIContext({
      appId: 'eve-app',
      instanceId: 'inst-2',
      pid: 11,
      profileId: 'eve-id',
      username: 'eve',
      permissions: [PackagePermissions.CLOUD_READ, PackagePermissions.CLOUD_WRITE]
    });
    const eveApi = new AdityyaOSAPI({ kernel, context: eveContext });

    // Eve cannot see user's snapshot
    const eveList = eveApi.cloud.listSnapshots();
    expect(eveList.length).toBe(0);

    expect(() => eveApi.cloud.getSnapshot(userSnap.id)).toThrowError(/not found or access denied/);
  });

  it('restores snapshot upon user approval with conflict detection and keep-cloud resolution', () => {
    const context = new APIContext({
      appId: 'cloud-app',
      instanceId: 'inst-1',
      pid: 10,
      profileId: 'default',
      username: 'user',
      permissions: [
        PackagePermissions.CLOUD_READ,
        PackagePermissions.CLOUD_WRITE,
        PackagePermissions.CLOUD_RESTORE
      ]
    });
    const api = new AdityyaOSAPI({ kernel, context });

    const snap = api.cloud.createSnapshot({ description: 'Pre-edit backup' });

    // Mutate local file
    kernel.fileSystemManager.writeFile('/home/user/doc.txt', 'locally modified content');

    // Request restore
    const restoreReq = api.cloud.requestRestore(snap.id);
    expect(restoreReq.approvalId).toBeDefined();
    expect(restoreReq.hasConflict).toBe(true);
    expect(restoreReq.conflicts.length).toBe(1);

    // Resolve conflict with 'keep-cloud'
    const resolveResult = api.cloud.resolveConflict(restoreReq.approvalId, 'keep-cloud');
    expect(resolveResult.success).toBe(true);

    // Verify local file was restored from cloud snapshot
    expect(kernel.fileSystemManager.readFile('/home/user/doc.txt').data.content).toBe('cloud document content');
  });

  it('restores snapshot with keep-local conflict resolution', () => {
    const context = new APIContext({
      appId: 'cloud-app',
      instanceId: 'inst-1',
      pid: 10,
      profileId: 'default',
      username: 'user',
      permissions: [
        PackagePermissions.CLOUD_READ,
        PackagePermissions.CLOUD_WRITE,
        PackagePermissions.CLOUD_RESTORE
      ]
    });
    const api = new AdityyaOSAPI({ kernel, context });

    const snap = api.cloud.createSnapshot({ description: 'Pre-edit backup' });

    // Mutate local file
    kernel.fileSystemManager.writeFile('/home/user/doc.txt', 'locally modified content');

    const restoreReq = api.cloud.requestRestore(snap.id);
    expect(restoreReq.hasConflict).toBe(true);

    // Resolve conflict with 'keep-local'
    const resolveResult = api.cloud.resolveConflict(restoreReq.approvalId, 'keep-local');
    expect(resolveResult.success).toBe(true);

    // Verify local file retained its modified content
    expect(kernel.fileSystemManager.readFile('/home/user/doc.txt').data.content).toBe('locally modified content');
  });

  it('handles denial and cancellation of restore actions', () => {
    const context = new APIContext({
      appId: 'cloud-app',
      instanceId: 'inst-1',
      pid: 10,
      profileId: 'default',
      username: 'user',
      permissions: [
        PackagePermissions.CLOUD_READ,
        PackagePermissions.CLOUD_WRITE,
        PackagePermissions.CLOUD_RESTORE
      ]
    });
    const api = new AdityyaOSAPI({ kernel, context });

    const snap = api.cloud.createSnapshot({ description: 'Pre-edit backup' });
    const restoreReq = api.cloud.requestRestore(snap.id);

    const denyResult = api.cloud.denyAction(restoreReq.approvalId, 'Cancelled');
    expect(denyResult.status).toBe('DENIED');

    // Trying to approve or resolve after denial throws
    expect(() => api.cloud.approveAction(restoreReq.approvalId)).toThrowError();
  });
});

