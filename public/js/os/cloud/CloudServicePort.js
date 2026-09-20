/**
 * public/js/os/cloud/CloudServicePort.js
 * Restricted facade port for CloudAPI.
 * Shields raw Kernel and CloudSyncService references and enforces PID/profile ownership.
 */

export class CloudServicePort {
  #service;

  /**
   * @param {import('./CloudSyncService.js').CloudSyncService} service
   */
  constructor(service) {
    if (!service) {
      throw new TypeError('CloudServicePort requires a CloudSyncService instance');
    }
    this.#service = service;
  }

  createSnapshot({ description }, context) {
    return this.#service.createSnapshot({ description }, context);
  }

  listSnapshots(context) {
    return this.#service.listSnapshots(context);
  }

  getSnapshot(snapshotId, context) {
    return this.#service.getSnapshot(snapshotId, context);
  }

  requestRestore(snapshotId, context) {
    return this.#service.requestRestore(snapshotId, context);
  }

  requestDelete(snapshotId, context) {
    return this.#service.requestDelete(snapshotId, context);
  }

  approveAction(approvalId, requestingPid, requestingProfileId, resolution = null) {
    return this.#service.approveAction(approvalId, requestingPid, requestingProfileId, resolution);
  }

  denyAction(approvalId, requestingPid, requestingProfileId, reason) {
    return this.#service.denyAction(approvalId, requestingPid, requestingProfileId, reason);
  }

  resolveConflict(approvalId, resolution, requestingPid, requestingProfileId) {
    return this.#service.resolveConflict(approvalId, resolution, requestingPid, requestingProfileId);
  }
}
