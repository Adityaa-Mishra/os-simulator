/**
 * public/js/os/api/ExperimentAPI.js
 * Application-facing facade for AdityyaOS Experiments Sandbox.
 * Enforces experiment permissions, PID & profile ownership, and returns plain snapshots only.
 * Does NOT retain or expose raw Kernel or ExperimentManager references.
 */

import { APIError } from './APIError.js';

export class ExperimentAPI {
  /**
   * @param {Object} options
   * @param {import('../experiments/ExperimentServicePort.js').ExperimentServicePort} options.servicePort
   * @param {import('./APIContext.js').APIContext} options.context
   */
  constructor({ servicePort, context } = {}) {
    if (!servicePort) {
      throw new TypeError('ExperimentAPI requires a servicePort instance');
    }
    if (!context) {
      throw new TypeError('ExperimentAPI requires an APIContext instance');
    }

    this._servicePort = servicePort;
    this._context = context;
  }

  /**
   * Create a new isolated experiment sandbox.
   * Requires 'experiment.write' permission.
   * @param {Object} params
   * @param {string} params.name
   * @param {string} [params.description]
   * @param {Array<string>} [params.capabilities]
   * @param {Object} [params.limits]
   * @returns {Object}
   */
  create({ name, description = '', capabilities = [], limits = {} } = {}) {
    this._context.assertPermission('experiment.write', 'experiments.create');
    try {
      return this._servicePort.create({ name, description, capabilities, limits }, this._context);
    } catch (err) {
      throw new APIError({
        code: err.code || 'EEXPERIMENTCREATEFAILED',
        message: err.message,
        operation: 'experiments.create',
        appId: this._context.appId,
        cause: err
      });
    }
  }

  /**
   * Get an experiment by ID scoped to this process and profile.
   * Requires 'experiment.read' permission.
   * @param {string} id
   * @returns {Object|null}
   */
  get(id) {
    this._context.assertPermission('experiment.read', 'experiments.get');
    return this._servicePort.get(id, this._context.pid, this._context.profileId);
  }

  /**
   * List all experiments owned by this process and profile.
   * Requires 'experiment.read' permission.
   * @returns {Array<Object>}
   */
  list() {
    this._context.assertPermission('experiment.read', 'experiments.list');
    return this._servicePort.list(this._context.pid, this._context.profileId);
  }

  /**
   * Compute deterministic diff for an experiment.
   * Requires 'experiment.read' permission.
   * @param {string} id
   * @returns {Object}
   */
  diff(id) {
    this._context.assertPermission('experiment.read', 'experiments.diff');
    try {
      return this._servicePort.diff(id, this._context.pid, this._context.profileId);
    } catch (err) {
      throw new APIError({
        code: err.code || 'EEXPERIMENTDIFFFAILED',
        message: err.message,
        operation: 'experiments.diff',
        appId: this._context.appId,
        cause: err
      });
    }
  }

  /**
   * Discard an experiment sandbox without altering base OS.
   * Requires 'experiment.write' permission.
   * @param {string} id
   * @returns {Object}
   */
  discard(id) {
    this._context.assertPermission('experiment.write', 'experiments.discard');
    try {
      return this._servicePort.discard(id, this._context.pid, this._context.profileId);
    } catch (err) {
      throw new APIError({
        code: err.code || 'EEXPERIMENTDISCARDFAILED',
        message: err.message,
        operation: 'experiments.discard',
        appId: this._context.appId,
        cause: err
      });
    }
  }

  /**
   * Request an immutable approval to apply sandbox changes to the base OS.
   * Requires 'experiment.apply' permission.
   * @param {string} id
   * @returns {Object} Immutable approval request snapshot
   */
  requestApply(id) {
    this._context.assertPermission('experiment.apply', 'experiments.requestApply');
    try {
      return this._servicePort.requestApply(id, this._context);
    } catch (err) {
      throw new APIError({
        code: err.code || 'EEXPERIMENTAPPLYFAILED',
        message: err.message,
        operation: 'experiments.requestApply',
        appId: this._context.appId,
        cause: err
      });
    }
  }

  /**
   * Approve and execute an experiment apply transaction.
   * Requires 'experiment.apply' permission.
   * @param {string} approvalId
   * @returns {Object}
   */
  approveApply(approvalId) {
    this._context.assertPermission('experiment.apply', 'experiments.approveApply');
    try {
      return this._servicePort.approveApply(approvalId, this._context.pid, this._context.profileId);
    } catch (err) {
      throw new APIError({
        code: err.code || 'EEXPERIMENTAPPLYFAILED',
        message: err.message,
        operation: 'experiments.approveApply',
        appId: this._context.appId,
        cause: err
      });
    }
  }

  /**
   * Deny an experiment apply request.
   * Requires 'experiment.apply' permission.
   * @param {string} approvalId
   * @param {string} [reason='User denied']
   * @returns {Object}
   */
  denyApply(approvalId, reason = 'User denied') {
    this._context.assertPermission('experiment.apply', 'experiments.denyApply');
    try {
      return this._servicePort.denyApply(approvalId, this._context.pid, this._context.profileId, reason);
    } catch (err) {
      throw new APIError({
        code: err.code || 'EEXPERIMENTAPPLYFAILED',
        message: err.message,
        operation: 'experiments.denyApply',
        appId: this._context.appId,
        cause: err
      });
    }
  }
}
