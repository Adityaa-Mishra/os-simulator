import { describe, it, expect, beforeEach } from 'vitest';
import { Kernel } from '../../../public/js/os/kernel/Kernel.js';
import { APIContext } from '../../../public/js/os/api/APIContext.js';
import { AdityyaOSAPI } from '../../../public/js/os/api/AdityyaOSAPI.js';
import { PackagePermissions } from '../../../public/js/os/packages/PackagePermissions.js';
import { ExperimentState } from '../../../public/js/os/experiments/ExperimentState.js';

describe('Phase 29 — Experiments Sandbox Lifecycle & API', () => {
  let kernel;

  beforeEach(() => {
    kernel = new Kernel();
    kernel.boot();
  });

  it('enforces experiment.write permission to create an experiment', () => {
    const unpermittedContext = new APIContext({
      appId: 'unpermitted',
      instanceId: 'inst-1',
      pid: 10,
      permissions: [PackagePermissions.EXPERIMENT_READ] // Missing experiment.write
    });
    const api = new AdityyaOSAPI({ kernel, context: unpermittedContext });

    expect(() => api.experiments.create({ name: 'sandbox-1' })).toThrowError(/Permission denied.*experiment\.write/);
  });

  it('creates an experiment with isolated sandbox and counts operations', () => {
    // Seed a file in home
    kernel.fileSystemManager.createFile('/home/user/base.txt', 'base content');

    const context = new APIContext({
      appId: 'exp-app',
      instanceId: 'inst-1',
      pid: 10,
      permissions: [PackagePermissions.EXPERIMENT_READ, PackagePermissions.EXPERIMENT_WRITE]
    });
    const api = new AdityyaOSAPI({ kernel, context });

    const expMeta = api.experiments.create({
      name: 'sandbox-1',
      description: 'Testing new feature'
    });

    expect(expMeta.id).toBeDefined();
    expect(expMeta.name).toBe('sandbox-1');
    expect(expMeta.status).toBe(ExperimentState.READY);

    // Fetch experiment object directly from manager to test sandbox operations
    const exp = kernel.experimentManager.experiments.get(expMeta.id);
    expect(exp).toBeDefined();

    // Verify sandbox has base snapshot
    expect(exp.sandbox.exists('/home/user/base.txt')).toBe(true);

    // Perform sandbox modifications
    exp.recordOperation();
    exp.sandbox.writeFile('/home/user/new.txt', 'sandbox new content');
    expect(exp.operationsCount).toBe(1);

    // Verify real FS was NOT touched
    expect(kernel.fileSystemManager.exists('/home/user/new.txt')).toBe(false);
  });

  it('enforces experiment.read to inspect and list experiments', () => {
    const writeContext = new APIContext({
      appId: 'exp-app',
      instanceId: 'inst-1',
      pid: 10,
      permissions: [PackagePermissions.EXPERIMENT_WRITE]
    });
    const writeApi = new AdityyaOSAPI({ kernel, context: writeContext });
    const expMeta = writeApi.experiments.create({ name: 'test-exp' });

    const unpermittedContext = new APIContext({
      appId: 'reader',
      instanceId: 'inst-2',
      pid: 11,
      permissions: []
    });
    const unpermittedApi = new AdityyaOSAPI({ kernel, context: unpermittedContext });

    expect(() => unpermittedApi.experiments.get(expMeta.id)).toThrowError(/Permission denied.*experiment\.read/);
    expect(() => unpermittedApi.experiments.list()).toThrowError(/Permission denied.*experiment\.read/);

    const readContext = new APIContext({
      appId: 'reader-ok',
      instanceId: 'inst-3',
      pid: 10, // Same PID as owner
      permissions: [PackagePermissions.EXPERIMENT_READ]
    });
    const readApi = new AdityyaOSAPI({ kernel, context: readContext });

    const fetched = readApi.experiments.get(expMeta.id);
    expect(fetched.id).toBe(expMeta.id);
    const list = readApi.experiments.list();
    expect(list.length).toBe(1);
    expect(list[0].id).toBe(expMeta.id);
  });

  it('discards an experiment and cleans up resources', () => {
    const context = new APIContext({
      appId: 'exp-app',
      instanceId: 'inst-1',
      pid: 10,
      permissions: [PackagePermissions.EXPERIMENT_READ, PackagePermissions.EXPERIMENT_WRITE]
    });
    const api = new AdityyaOSAPI({ kernel, context });

    const expMeta = api.experiments.create({ name: 'to-discard' });
    const discardResult = api.experiments.discard(expMeta.id);

    expect(discardResult.success).toBe(true);
    expect(discardResult.status).toBe(ExperimentState.DISCARDED);

    const exp = kernel.experimentManager.experiments.get(expMeta.id);
    expect(exp.sandbox.files.size).toBe(0);
  });

  it('cleans up process experiments on process termination', () => {
    const pid = 20;
    const context = new APIContext({
      appId: 'exp-app',
      instanceId: 'inst-1',
      pid,
      permissions: [PackagePermissions.EXPERIMENT_READ, PackagePermissions.EXPERIMENT_WRITE]
    });
    const api = new AdityyaOSAPI({ kernel, context });

    const expMeta = api.experiments.create({ name: 'proc-exp' });
    expect(kernel.experimentManager.experiments.get(expMeta.id).status).toBe(ExperimentState.READY);

    // Simulate process termination via kernel event
    kernel.events.emit('process:terminated', { pid });

    const exp = kernel.experimentManager.experiments.get(expMeta.id);
    expect(exp.status).toBe(ExperimentState.DISCARDED);
    expect(exp.sandbox.files.size).toBe(0);
  });

  it('cleans up profile experiments upon profile switch', () => {
    kernel.profileManager.createProfile({ username: 'bob' });

    const context = new APIContext({
      appId: 'exp-app',
      instanceId: 'inst-1',
      pid: 10,
      profileId: 'default',
      username: 'user',
      permissions: [
        PackagePermissions.EXPERIMENT_READ,
        PackagePermissions.EXPERIMENT_WRITE,
        PackagePermissions.PROFILE_SWITCH
      ]
    });
    const api = new AdityyaOSAPI({ kernel, context });

    const expMeta = api.experiments.create({ name: 'profile-exp' });

    // Switch profile to bob
    const req = api.profile.switch('bob');
    api.profile.approveSwitch(req.approvalId || req.id);

    // The experiment owned by 'default' profile should be discarded
    const exp = kernel.experimentManager.experiments.get(expMeta.id);
    expect(exp.status).toBe(ExperimentState.DISCARDED);
  });

});
