import { describe, it, expect, beforeEach } from 'vitest';
import { Kernel } from '../../../public/js/os/kernel/Kernel.js';
import { APIContext } from '../../../public/js/os/api/APIContext.js';
import { AdityyaOSAPI } from '../../../public/js/os/api/AdityyaOSAPI.js';
import { PackagePermissions } from '../../../public/js/os/packages/PackagePermissions.js';
import { ExperimentState } from '../../../public/js/os/experiments/ExperimentState.js';

describe('Phase 29 — Experiment Diff & Atomic Apply', () => {
  let kernel;

  beforeEach(() => {
    kernel = new Kernel();
    kernel.boot();

    // Prepare initial files in home
    kernel.fileSystemManager.createFile('/home/user/file1.txt', 'version 1');
    kernel.fileSystemManager.createFile('/home/user/file2.txt', 'to be deleted');
  });

  it('computes accurate diff between sandbox and base snapshot', () => {
    const context = new APIContext({
      appId: 'diff-app',
      instanceId: 'inst-1',
      pid: 10,
      permissions: [PackagePermissions.EXPERIMENT_READ, PackagePermissions.EXPERIMENT_WRITE]
    });
    const api = new AdityyaOSAPI({ kernel, context });

    const expMeta = api.experiments.create({ name: 'diff-test' });
    const exp = kernel.experimentManager.experiments.get(expMeta.id);

    // Modify file1.txt, delete file2.txt, create file3.txt in sandbox
    exp.sandbox.writeFile('/home/user/file1.txt', 'version 2');
    exp.sandbox.deleteFile('/home/user/file2.txt');
    exp.sandbox.writeFile('/home/user/file3.txt', 'brand new');

    const diff = api.experiments.diff(expMeta.id);

    expect(diff.created).toContain('/home/user/file3.txt');
    expect(diff.modified).toContain('/home/user/file1.txt');
    expect(diff.deleted).toContain('/home/user/file2.txt');
    expect(diff.summary.totalChanges).toBe(3);

    // Verify real FS remains unchanged
    expect(kernel.fileSystemManager.readFile('/home/user/file1.txt').data.content).toBe('version 1');
    expect(kernel.fileSystemManager.exists('/home/user/file2.txt')).toBe(true);
    expect(kernel.fileSystemManager.exists('/home/user/file3.txt')).toBe(false);
  });

  it('requires experiment.apply permission to request apply', () => {
    const readWriteContext = new APIContext({
      appId: 'no-apply-app',
      instanceId: 'inst-1',
      pid: 10,
      permissions: [PackagePermissions.EXPERIMENT_READ, PackagePermissions.EXPERIMENT_WRITE]
    });
    const api = new AdityyaOSAPI({ kernel, context: readWriteContext });
    const expMeta = api.experiments.create({ name: 'apply-test' });

    expect(() => api.experiments.requestApply(expMeta.id)).toThrowError(/Permission denied.*experiment\.apply/);
  });

  it('applies diff atomically to real FS upon user approval', () => {
    const context = new APIContext({
      appId: 'apply-app',
      instanceId: 'inst-1',
      pid: 10,
      permissions: [
        PackagePermissions.EXPERIMENT_READ,
        PackagePermissions.EXPERIMENT_WRITE,
        PackagePermissions.EXPERIMENT_APPLY
      ]
    });
    const api = new AdityyaOSAPI({ kernel, context });

    const expMeta = api.experiments.create({ name: 'apply-test' });
    const exp = kernel.experimentManager.experiments.get(expMeta.id);

    // Mutate in sandbox
    exp.sandbox.writeFile('/home/user/file1.txt', 'version 2 applied');
    exp.sandbox.writeFile('/home/user/file3.txt', 'created file');
    exp.sandbox.deleteFile('/home/user/file2.txt');

    // 1. Request apply
    const applyReq = api.experiments.requestApply(expMeta.id);
    expect(applyReq.approvalId).toBeDefined();
    expect(applyReq.requiresApproval).toBe(true);
    expect(applyReq.diff.summary.totalChanges).toBe(3);

    // 2. Approve apply
    const approveResult = api.experiments.approveApply(applyReq.approvalId);
    expect(approveResult.success).toBe(true);
    expect(approveResult.experimentId).toBe(expMeta.id);

    // 3. Verify changes were applied to real FS
    expect(kernel.fileSystemManager.readFile('/home/user/file1.txt').data.content).toBe('version 2 applied');
    expect(kernel.fileSystemManager.readFile('/home/user/file3.txt').data.content).toBe('created file');
    expect(kernel.fileSystemManager.exists('/home/user/file2.txt')).toBe(false);

    // 4. Experiment state is now COMPLETED
    const completedExp = api.experiments.get(expMeta.id);
    expect(completedExp.status).toBe(ExperimentState.COMPLETED);

    // Approval cannot be reused
    expect(() => api.experiments.approveApply(applyReq.approvalId)).toThrowError();
  });

  it('detects base conflicts if real FS changed before apply', () => {
    const context = new APIContext({
      appId: 'apply-app',
      instanceId: 'inst-1',
      pid: 10,
      permissions: [
        PackagePermissions.EXPERIMENT_READ,
        PackagePermissions.EXPERIMENT_WRITE,
        PackagePermissions.EXPERIMENT_APPLY
      ]
    });
    const api = new AdityyaOSAPI({ kernel, context });

    const expMeta = api.experiments.create({ name: 'conflict-test' });
    const exp = kernel.experimentManager.experiments.get(expMeta.id);

    // Edit file1 in sandbox
    exp.sandbox.writeFile('/home/user/file1.txt', 'sandbox edit');

    const applyReq = api.experiments.requestApply(expMeta.id);

    // Concurrently mutate file1.txt on the real filesystem
    kernel.fileSystemManager.writeFile('/home/user/file1.txt', 'external concurrent edit');

    // Attempt to approve apply -> should reject with EBASECONFLICT
    expect(() => api.experiments.approveApply(applyReq.approvalId)).toThrowError(/Base file.*was modified after experiment snapshot/);
  });

  it('handles denial of apply requests', () => {
    const context = new APIContext({
      appId: 'apply-app',
      instanceId: 'inst-1',
      pid: 10,
      permissions: [
        PackagePermissions.EXPERIMENT_READ,
        PackagePermissions.EXPERIMENT_WRITE,
        PackagePermissions.EXPERIMENT_APPLY
      ]
    });
    const api = new AdityyaOSAPI({ kernel, context });

    const expMeta = api.experiments.create({ name: 'deny-test' });
    const applyReq = api.experiments.requestApply(expMeta.id);

    const denyResult = api.experiments.denyApply(applyReq.approvalId, 'User changed mind');
    expect(denyResult.status).toBe('DENIED');
    expect(denyResult.reason).toBe('User changed mind');

    // Real FS remains unchanged
    expect(kernel.fileSystemManager.readFile('/home/user/file1.txt').data.content).toBe('version 1');
  });
});

