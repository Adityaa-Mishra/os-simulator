/**
 * public/js/os/api/CloudAPI.js
 * Application-facing facade for AdityyaOS Simulated Cloud State.
 * Enforces cloud permissions, profile ownership, and returns plain snapshots only.
 * Does NOT retain or expose raw Kernel or CloudSyncService references.
 */

import { APIError } from './APIError.js';

export class CloudAPI {
  /**
   * @param {Object} options
   * @param {import('../cloud/CloudServicePort.js').CloudServicePort} options.servicePort
   * @param {import('./APIContext.js').APIContext} options.context
   */
  constructor({ servicePort, context } = {}) {
    if (!servicePort) {
      throw new TypeError('CloudAPI requires a servicePort instance');
    }
    if (!context) {
      throw new TypeError('CloudAPI requires an APIContext instance');
    }

    this._servicePort = servicePort;
    this._context = context;
  }

  /**
   * Create a simulated cloud snapshot of the current profile's home directory.
   * Requires 'cloud.write' permission.
   * @param {Object} [params]
   * @param {string} [params.description]
   * @returns {Object}
   */
  createSnapshot({ description = '' } = {}) {
    this._context.assertPermission('cloud.write', 'cloud.createSnapshot');
    try {
      return this._servicePort.createSnapshot({ description }, this._context);
    } catch (err) {
      throw new APIError({
        code: err.code || 'ECLOUDSNAPSHOTFAILED',
        message: err.message,
        operation: 'cloud.createSnapshot',
        appId: this._context.appId,
        cause: err
      });
    }
  }

  /**
   * List all cloud snapshots owned by this profile.
   * Requires 'cloud.read' permission.
   * @returns {Array<Object>}
   */
  listSnapshots() {
    this._context.assertPermission('cloud.read', 'cloud.listSnapshots');
    return this._servicePort.listSnapshots(this._context);
  }

  /**
   * Get metadata for a specific cloud snapshot owned by this profile.
   * Requires 'cloud.read' permission.
   * @param {string} snapshotId
   * @returns {Object}
   */
  getSnapshot(snapshotId) {
    this._context.assertPermission('cloud.read', 'cloud.getSnapshot');
    try {
      return this._servicePort.getSnapshot(snapshotId, this._context);
    } catch (err) {
      throw new APIError({
        code: err.code || 'ECLOUDSNAPSHOTFAILED',
        message: err.message,
        operation: 'cloud.getSnapshot',
        appId: this._context.appId,
        cause: err
      });
    }
  }

  /**
   * Request an immutable approval to restore a cloud snapshot.
   * Requires 'cloud.restore' permission.
   * @param {string} snapshotId
   * @returns {Object} Approval request snapshot
   */
  requestRestore(snapshotId) {
    this._context.assertPermission('cloud.restore', 'cloud.requestRestore');
    try {
      return this._servicePort.requestRestore(snapshotId, this._context);
    } catch (err) {
      throw new APIError({
        code: err.code || 'ECLOUDRESTOREFAILED',
        message: err.message,
        operation: 'cloud.requestRestore',
        appId: this._context.appId,
        cause: err
      });
    }
  }

  /**
   * Request an immutable approval to delete a cloud snapshot.
   * Requires 'cloud.write' permission.
   * @param {string} snapshotId
   * @returns {Object} Approval request snapshot
   */
  requestDelete(snapshotId) {
    this._context.assertPermission('cloud.write', 'cloud.requestDelete');
    try {
      return this._servicePort.requestDelete(snapshotId, this._context);
    } catch (err) {
      throw new APIError({
        code: err.code || 'ECLOUDDELETEFAILED',
        message: err.message,
        operation: 'cloud.requestDelete',
        appId: this._context.appId,
        cause: err
      });
    }
  }

  /**
   * Approve and execute a pending cloud action (restore or delete).
   * @param {string} approvalId
   * @param {string} [resolution=null] - 'keep-local' | 'keep-cloud'
   * @returns {Object}
   */
  approveAction(approvalId, resolution = null) {
    try {
      return this._servicePort.approveAction(approvalId, this._context.pid, this._context.profileId, resolution);
    } catch (err) {
      throw new APIError({
        code: err.code || 'ECLOUDACTIONFAILED',
        message: err.message,
        operation: 'cloud.approveAction',
        appId: this._context.appId,
        cause: err
      });
    }
  }

  /**
   * Deny a pending cloud action request.
   * @param {string} approvalId
   * @param {string} [reason='User denied']
   * @returns {Object}
   */
  denyAction(approvalId, reason = 'User denied') {
    try {
      return this._servicePort.denyAction(approvalId, this._context.pid, this._context.profileId, reason);
    } catch (err) {
      throw new APIError({
        code: err.code || 'ECLOUDACTIONFAILED',
        message: err.message,
        operation: 'cloud.denyAction',
        appId: this._context.appId,
        cause: err
      });
    }
  }

  /**
   * Resolve a conflict for a pending cloud restore request.
   * Requires 'cloud.restore' permission.
   * @param {string} approvalId
   * @param {'keep-local'|'keep-cloud'|'cancel'} resolution
   * @returns {Object}
   */
  resolveConflict(approvalId, resolution) {
    this._context.assertPermission('cloud.restore', 'cloud.resolveConflict');
    try {
      return this._servicePort.resolveConflict(approvalId, resolution, this._context.pid, this._context.profileId);
    } catch (err) {
      throw new APIError({
        code: err.code || 'ECLOUDCONFLICTFAILED',
        message: err.message,
        operation: 'cloud.resolveConflict',
        appId: this._context.appId,
        cause: err
      });
    }
  }
}
