/**
 * public/js/os/experiments/ExperimentManager.js
 * Subsystem manager for AdityyaOS Experiments Sandbox.
 * Manages experiment instances, isolated snapshots, deterministic diffs, and approval-gated apply.
 */

import { Experiment } from './Experiment.js';
import { ExperimentSnapshot } from './ExperimentSnapshot.js';
import { ExperimentState } from './ExperimentState.js';
import { ExperimentError } from './ExperimentError.js';
import { ExperimentPolicy } from './ExperimentPolicy.js';
import { ExperimentServicePort } from './ExperimentServicePort.js';

let applyApprovalSeq = 0;

export class ExperimentManager {
  /**
   * Return a restricted facade port for application API access.
   * @returns {ExperimentServicePort}
   */
  getPort() {
    return new ExperimentServicePort(this);
  }

  /**
   * @param {import('../kernel/Kernel.js').Kernel} kernel
   * @param {Object} [config={}]
   */
  constructor(kernel, config = {}) {
    if (!kernel) {
      throw new TypeError('ExperimentManager requires a Kernel instance');
    }
    this.kernel = kernel;
    this.config = config;

    this.experiments = new Map(); // id -> Experiment
    this.pendingApplies = new Map(); // approvalId -> Object
  }

  /**
   * Sync experiment state to central kernel state.
   */
  syncState() {
    if (this.kernel && this.kernel.state) {
      this.kernel.state.experiments = {
        activeExperiments: Array.from(this.experiments.values()).filter(
          e => e.status === ExperimentState.READY || e.status === ExperimentState.RUNNING
        ).length,
        totalCreated: this.experiments.size
      };
    }
  }

  /**
   * Create a new experiment with a scoped base snapshot.
   * @param {Object} params
   * @param {string} params.name
   * @param {string} [params.description]
   * @param {Array<string>} [params.capabilities]
   * @param {Object} [params.limits]
   * @param {import('../api/APIContext.js').APIContext} context
   * @returns {Object} Plain serializable experiment snapshot
   */
  createExperiment({ name, description = '', capabilities = [], limits = {} } = {}, context) {
    if (!context) {
      throw new TypeError('createExperiment requires an APIContext');
    }

    // Check maximum concurrent experiments limit per process
    const activeCount = Array.from(this.experiments.values()).filter(
      e => e.ownerPid === context.pid &&
           (e.status === ExperimentState.READY || e.status === ExperimentState.RUNNING)
    ).length;

    const maxConcurrent = limits.maxConcurrentExperiments || 3;
    if (activeCount >= maxConcurrent) {
      throw new ExperimentError({
        code: 'ELIMITEXCEEDED',
        message: `Maximum concurrent experiments limit (${maxConcurrent}) reached for this process`,
        operation: 'experiments.create'
      });
    }

    // 1. Capture scoped base snapshot
    let userPreferences = {};
    if (this.kernel.profileManager) {
      try {
        userPreferences = this.kernel.profileManager.getPreferences(context.username, context.username);
      } catch {}
    }

    const baseSnapshot = ExperimentSnapshot.capture({
      id: `snap-base-${Date.now()}`,
      username: context.username,
      fsManager: this.kernel.fileSystemManager,
      preferences: userPreferences
    });

    // 2. Instantiate experiment
    const experiment = new Experiment({
      name,
      description,
      ownerPid: context.pid,
      ownerAppId: context.appId,
      ownerProfileId: context.profileId,
      ownerUsername: context.username,
      baseSnapshot,
      allowedCapabilities: capabilities,
      resourceLimits: limits,
      status: ExperimentState.INITIALIZING
    });

    experiment.transition(ExperimentState.READY);

    this.experiments.set(experiment.id, experiment);
    this.syncState();

    return experiment.toJSON();
  }

  /**
   * Get an experiment by ID, strictly enforcing PID and profile ownership.
   * @param {string} id
   * @param {number} requestingPid
   * @param {string} requestingProfileId
   * @returns {Object|null}
   */
  getExperiment(id, requestingPid, requestingProfileId) {
    const exp = this.experiments.get(id);
    if (!exp || exp.ownerPid !== requestingPid || exp.ownerProfileId !== requestingProfileId) {
      return null;
    }
    return exp.toJSON();
  }

  /**
   * List all experiments owned by the requesting PID and profile.
   * @param {number} requestingPid
   * @param {string} requestingProfileId
   * @returns {Array<Object>}
   */
  listExperiments(requestingPid, requestingProfileId) {
    const list = [];
    for (const exp of this.experiments.values()) {
      if (exp.ownerPid === requestingPid && exp.ownerProfileId === requestingProfileId) {
        list.push(exp.toJSON());
      }
    }
    return list;
  }

  /**
   * Compute deterministic diff for an experiment.
   * @param {string} id
   * @param {number} requestingPid
   * @param {string} requestingProfileId
   * @returns {Object}
   */
  diffExperiment(id, requestingPid, requestingProfileId) {
    const exp = this.experiments.get(id);
    if (!exp || exp.ownerPid !== requestingPid || exp.ownerProfileId !== requestingProfileId) {
      throw new ExperimentError({
        code: 'ENOENT',
        message: `Experiment "${id}" not found or access denied`,
        operation: 'experiments.diff',
        experimentId: id
      });
    }

    return exp.computeDiff();
  }

  /**
   * Discard an experiment and clean up all sandbox resources without altering base OS.
   * @param {string} id
   * @param {number} requestingPid
   * @param {string} requestingProfileId
   * @returns {Object}
   */
  discardExperiment(id, requestingPid, requestingProfileId) {
    const exp = this.experiments.get(id);
    if (!exp || exp.ownerPid !== requestingPid || exp.ownerProfileId !== requestingProfileId) {
      throw new ExperimentError({
        code: 'ENOENT',
        message: `Experiment "${id}" not found or access denied`,
        operation: 'experiments.discard',
        experimentId: id
      });
    }

    if (exp.status !== ExperimentState.DISCARDED) {
      exp.transition(ExperimentState.DISCARDED);
    }

    // Free sandbox memory
    exp.sandbox.files.clear();
    exp.baseSnapshot.files.clear();

    // Cancel any pending apply for this experiment
    for (const [apprId, appr] of this.pendingApplies.entries()) {
      if (appr.experimentId === id) {
        appr.status = 'CANCELLED';
        this.pendingApplies.delete(apprId);
      }
    }

    this.syncState();

    return {
      success: true,
      id: exp.id,
      status: ExperimentState.DISCARDED
    };
  }

  /**
   * Request an immutable approval to apply experiment changes to the base OS.
   * @param {string} id
   * @param {import('../api/APIContext.js').APIContext} context
   * @returns {Object} Approval request snapshot
   */
  requestApply(id, context) {
    const exp = this.experiments.get(id);
    if (!exp || exp.ownerPid !== context.pid || exp.ownerProfileId !== context.profileId) {
      throw new ExperimentError({
        code: 'ENOENT',
        message: `Experiment "${id}" not found or access denied`,
        operation: 'experiments.requestApply',
        experimentId: id
      });
    }

    if (exp.status !== ExperimentState.READY && exp.status !== ExperimentState.COMPLETED) {
      throw new ExperimentError({
        code: 'EINVALIDSTATE',
        message: `Experiment "${id}" is in state "${exp.status}", must be READY or COMPLETED to apply`,
        operation: 'experiments.requestApply',
        experimentId: id
      });
    }

    const diff = exp.computeDiff();
    const safetyCheck = ExperimentPolicy.validateApplySafety(diff, context.username);
    if (!safetyCheck.safe) {
      throw new ExperimentError({
        code: 'EAPPLYREJECTED',
        message: safetyCheck.error || 'Changes cannot be applied safely',
        operation: 'experiments.requestApply',
        experimentId: id
      });
    }

    const approvalId = `expappr-${++applyApprovalSeq}`;
    const approval = {
      id: approvalId,
      approvalId,
      actionId: `act-exp-apply-${id}`,
      experimentId: id,
      ownerPid: context.pid,
      ownerAppId: context.appId,
      ownerProfileId: context.profileId,
      ownerUsername: context.username,
      status: 'PENDING',
      requiresApproval: true,
      risk: 'medium',
      target: id,
      requiredPermissions: ['experiment.apply'],
      expectedEffect: `Apply sandbox changes (${diff.summary.created} created, ${diff.summary.modified} modified, ${diff.summary.deleted} deleted) to "/home/${context.username}"`,
      diff: JSON.parse(JSON.stringify(diff)),
      args: Object.freeze({ experimentId: id, diffSummary: diff.summary }),
      argsSnapshotStr: JSON.stringify({ experimentId: id, diffSummary: diff.summary }),
      createdAt: Date.now(),
      executed: false
    };

    this.pendingApplies.set(approvalId, approval);

    return JSON.parse(JSON.stringify(approval));
  }

  /**
   * Approve and execute experiment apply.
   * @param {string} approvalId
   * @param {number} requestingPid
   * @param {string} requestingProfileId
   * @returns {Object}
   */
  approveApply(approvalId, requestingPid, requestingProfileId) {
    const approval = this.pendingApplies.get(approvalId);
    if (!approval || approval.ownerPid !== requestingPid || approval.ownerProfileId !== requestingProfileId) {
      throw new ExperimentError({
        code: 'ENOENT',
        message: `Approval request "${approvalId}" not found or access denied`,
        operation: 'experiments.approveApply'
      });
    }

    if (approval.status !== 'PENDING' || approval.executed) {
      throw new ExperimentError({
        code: 'EINVALIDSTATE',
        message: `Approval request "${approvalId}" is not pending approval`,
        operation: 'experiments.approveApply'
      });
    }

    approval.status = 'APPROVED';
    return this.executeApply(approvalId, requestingPid, requestingProfileId);
  }

  /**
   * Deny an experiment apply request.
   * @param {string} approvalId
   * @param {number} requestingPid
   * @param {string} requestingProfileId
   * @param {string} [reason='User denied']
   * @returns {Object}
   */
  denyApply(approvalId, requestingPid, requestingProfileId, reason = 'User denied') {
    const approval = this.pendingApplies.get(approvalId);
    if (!approval || approval.ownerPid !== requestingPid || approval.ownerProfileId !== requestingProfileId) {
      throw new ExperimentError({
        code: 'ENOENT',
        message: `Approval request "${approvalId}" not found or access denied`,
        operation: 'experiments.denyApply'
      });
    }

    approval.status = 'DENIED';
    approval.reason = reason;
    this.pendingApplies.delete(approvalId);

    return JSON.parse(JSON.stringify(approval));
  }

  /**
   * Execute an approved experiment apply transaction.
   * Validates base-state concurrency before modifying AdityyaFS.
   * @param {string} approvalId
   * @param {number} requestingPid
   * @param {string} requestingProfileId
   * @returns {Object}
   */
  executeApply(approvalId, requestingPid, requestingProfileId) {
    const approval = this.pendingApplies.get(approvalId);
    if (!approval || approval.ownerPid !== requestingPid || approval.ownerProfileId !== requestingProfileId) {
      throw new ExperimentError({
        code: 'ENOENT',
        message: `Approval request "${approvalId}" not found or access denied`,
        operation: 'experiments.executeApply'
      });
    }

    if (approval.status !== 'APPROVED') {
      throw new ExperimentError({
        code: 'EAPPROVALREQUIRED',
        message: 'Experiment apply requires explicit approval',
        operation: 'experiments.executeApply'
      });
    }

    if (approval.executed) {
      throw new ExperimentError({
        code: 'EALREADYEXECUTED',
        message: 'Approval request has already been executed',
        operation: 'experiments.executeApply'
      });
    }

    const exp = this.experiments.get(approval.experimentId);
    if (!exp) {
      throw new ExperimentError({
        code: 'ENOENT',
        message: `Experiment "${approval.experimentId}" not found`,
        operation: 'experiments.executeApply'
      });
    }

    const fs = this.kernel.fileSystemManager;
    const username = approval.ownerUsername;

    // 1. Optimistic concurrency check: Ensure base files have not changed since snapshot
    for (const change of approval.diff.changes || []) {
      if (change.type === 'modified' || change.type === 'deleted') {
        const baseSnapshotFile = exp.baseSnapshot.files.get(change.path);
        if (baseSnapshotFile && baseSnapshotFile.type === 'file') {
          const currentBase = fs.readFile(change.path);
          const currentContent = currentBase.success
            ? (typeof currentBase.data === 'string' ? currentBase.data : currentBase.data?.content || '')
            : null;
          if (currentContent !== baseSnapshotFile.content) {
            approval.status = 'FAILED';
            this.pendingApplies.delete(approvalId);
            throw new ExperimentError({
              code: 'EBASECONFLICT',
              message: `Base file "${change.path}" was modified after experiment snapshot was created. Apply rejected.`,
              operation: 'experiments.executeApply',
              experimentId: exp.id
            });
          }
        }
      }
    }

    // 2. Transactionally apply changes in AdityyaFS within /home/<username>
    for (const change of approval.diff.changes || []) {
      if (change.type === 'created' || change.type === 'modified') {
        const sandFile = exp.sandbox.files.get(change.path);
        if (sandFile) {
          if (sandFile.type === 'directory') {
            if (!fs.exists(change.path)) {
              fs.createDirectory(change.path);
            }
          } else {
            if (!fs.exists(change.path)) {
              fs.createFile(change.path);
            }
            fs.writeFile(change.path, sandFile.content || '');
          }
        }
      } else if (change.type === 'deleted') {
        if (fs.exists(change.path)) {
          if (change.fileType === 'directory') {
            fs.deleteDirectory(change.path, { recursive: true });
          } else {
            fs.deleteFile(change.path);
          }
        }
      }
    }

    // 3. Apply preferences changes if any
    if (this.kernel.profileManager && approval.diff.preferences?.length > 0) {
      const prefPatch = {};
      for (const p of approval.diff.preferences) {
        prefPatch[p.key] = p.newValue;
      }
      this.kernel.profileManager.updatePreferences(prefPatch, username);
    }

    // 4. Mark executed and update experiment state
    approval.executed = true;
    approval.status = 'COMPLETED';
    this.pendingApplies.delete(approvalId);

    exp.transition(ExperimentState.COMPLETED);
    this.syncState();

    return {
      success: true,
      experimentId: exp.id,
      appliedChanges: approval.diff.summary
    };
  }

  /**
   * Cancel and clean up all experiments owned by a terminated process.
   * @param {number} pid
   */
  cancelProcessExperiments(pid) {
    if (typeof pid !== 'number') return;
    for (const exp of this.experiments.values()) {
      if (exp.ownerPid === pid) {
        if (exp.status !== ExperimentState.COMPLETED && exp.status !== ExperimentState.DISCARDED) {
          try {
            exp.transition(ExperimentState.DISCARDED);
          } catch {}
        }
        exp.sandbox?.files?.clear();
        exp.baseSnapshot?.files?.clear();
      }
    }
    for (const [apprId, appr] of this.pendingApplies.entries()) {
      if (appr.ownerPid === pid) {
        this.pendingApplies.delete(apprId);
      }
    }
    this.syncState();
  }

  /**
   * Cancel and clean up all experiments owned by an outgoing profile upon profile switch.
   * @param {string} profileId
   */
  cancelProfileExperiments(profileId) {
    if (!profileId) return;
    for (const exp of this.experiments.values()) {
      if (exp.ownerProfileId === profileId) {
        if (exp.status !== ExperimentState.COMPLETED && exp.status !== ExperimentState.DISCARDED) {
          try {
            exp.transition(ExperimentState.DISCARDED);
          } catch {}
        }
        exp.sandbox?.files?.clear();
        exp.baseSnapshot?.files?.clear();
      }
    }
    for (const [apprId, appr] of this.pendingApplies.entries()) {
      if (appr.ownerProfileId === profileId) {
        this.pendingApplies.delete(apprId);
      }
    }
    this.syncState();
  }

  /**
   * Reset experiment manager.
   */
  reset() {
    for (const exp of this.experiments.values()) {
      exp.sandbox?.files?.clear();
      exp.baseSnapshot?.files?.clear();
    }
    this.experiments.clear();
    this.pendingApplies.clear();
    this.syncState();
  }

  /**
   * Shutdown experiment manager.
   */
  shutdown() {
    this.reset();
  }
}
