/**
 * public/js/os/experiments/Experiment.js
 * Plain serializable experiment model managing state transitions and sandbox snapshot isolation.
 */

import { ExperimentState, isValidExperimentTransition } from './ExperimentState.js';
import { ExperimentError } from './ExperimentError.js';
import { ExperimentDiff } from './ExperimentDiff.js';
import { ExperimentPolicy, DEFAULT_EXPERIMENT_LIMITS } from './ExperimentPolicy.js';

let experimentSeq = 0;

export class Experiment {
  /**
   * @param {Object} options
   * @param {string} [options.id]
   * @param {string} options.name
   * @param {string} [options.description]
   * @param {number} options.ownerPid
   * @param {string} options.ownerAppId
   * @param {string} options.ownerProfileId
   * @param {string} options.ownerUsername
   * @param {import('./ExperimentSnapshot.js').ExperimentSnapshot} options.baseSnapshot
   * @param {import('./ExperimentSnapshot.js').ExperimentSnapshot} [options.sandbox]
   * @param {Array<string>} [options.allowedCapabilities]
   * @param {Object} [options.resourceLimits]
   * @param {string} [options.status=ExperimentState.CREATED]
   * @param {number} [options.createdAt]
   * @param {number} [options.updatedAt]
   */
  constructor({
    id = null,
    name,
    description = '',
    ownerPid,
    ownerAppId,
    ownerProfileId,
    ownerUsername,
    baseSnapshot,
    sandbox = null,
    allowedCapabilities = [],
    resourceLimits = {},
    status = ExperimentState.CREATED,
    createdAt = Date.now(),
    updatedAt = Date.now()
  }) {
    if (!name || typeof name !== 'string') {
      throw new TypeError('Experiment requires a non-empty string name');
    }
    if (typeof ownerPid !== 'number') {
      throw new TypeError('Experiment requires an ownerPid number');
    }
    if (!ownerProfileId || typeof ownerProfileId !== 'string') {
      throw new TypeError('Experiment requires an ownerProfileId string');
    }
    if (!ownerUsername || typeof ownerUsername !== 'string') {
      throw new TypeError('Experiment requires an ownerUsername string');
    }
    if (!baseSnapshot) {
      throw new TypeError('Experiment requires a baseSnapshot instance');
    }

    this.id = id || `exp-${++experimentSeq}`;
    this.name = name.trim();
    this.description = description ? String(description).trim() : '';
    this.ownerPid = ownerPid;
    this.ownerAppId = String(ownerAppId || 'system');
    this.ownerProfileId = ownerProfileId;
    this.ownerUsername = ownerUsername;

    this.status = status;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;

    this.baseSnapshot = baseSnapshot;
    this.sandbox = sandbox || baseSnapshot.clone(`${this.id}-sandbox`);

    this.allowedCapabilities = Array.isArray(allowedCapabilities) ? [...allowedCapabilities] : [];
    this.resourceLimits = { ...DEFAULT_EXPERIMENT_LIMITS, ...(resourceLimits || {}) };

    this.operationsCount = 0;
    this.error = null;
  }

  /**
   * Transition to a new lifecycle state.
   * @param {string} newStatus
   * @param {Object} [options={}]
   * @param {string} [options.error]
   */
  transition(newStatus, { error = null } = {}) {
    if (!isValidExperimentTransition(this.status, newStatus)) {
      throw new ExperimentError({
        code: 'EINVALIDSTATE',
        message: `Invalid experiment state transition from "${this.status}" to "${newStatus}"`,
        experimentId: this.id
      });
    }

    this.status = newStatus;
    this.updatedAt = Date.now();
    if (error) {
      this.error = error;
    }
  }

  /**
   * Record a simulated sandbox operation and verify resource limits.
   */
  recordOperation() {
    this.operationsCount++;
    const check = ExperimentPolicy.checkLimits(this, this.resourceLimits);
    if (!check.allowed) {
      this.transition(ExperimentState.FAILED, { error: check.reason });
      throw new ExperimentError({
        code: 'ELIMITEXCEEDED',
        message: check.reason,
        experimentId: this.id
      });
    }
  }

  /**
   * Compute deterministic diff between base and sandbox.
   * @returns {Object}
   */
  computeDiff() {
    return ExperimentDiff.compute(this.baseSnapshot, this.sandbox);
  }

  /**
   * Return a plain serializable representation.
   * @returns {Object}
   */
  toJSON() {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      ownerPid: this.ownerPid,
      ownerAppId: this.ownerAppId,
      ownerProfileId: this.ownerProfileId,
      ownerUsername: this.ownerUsername,
      status: this.status,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      operationsCount: this.operationsCount,
      allowedCapabilities: [...this.allowedCapabilities],
      resourceLimits: { ...this.resourceLimits },
      sandboxFilesCount: this.sandbox.files.size,
      error: this.error
    };
  }

  getState() {
    return this.toJSON();
  }
}
