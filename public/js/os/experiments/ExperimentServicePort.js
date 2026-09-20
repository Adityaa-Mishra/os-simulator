/**
 * public/js/os/experiments/ExperimentServicePort.js
 * Restricted facade port for ExperimentAPI.
 * Shields raw Kernel and ExperimentManager references and enforces PID/profile ownership.
 */

export class ExperimentServicePort {
  #manager;

  /**
   * @param {import('./ExperimentManager.js').ExperimentManager} manager
   */
  constructor(manager) {
    if (!manager) {
      throw new TypeError('ExperimentServicePort requires an ExperimentManager instance');
    }
    this.#manager = manager;
  }

  create({ name, description, capabilities, limits }, context) {
    return this.#manager.createExperiment({ name, description, capabilities, limits }, context);
  }

  get(id, requestingPid, requestingProfileId) {
    return this.#manager.getExperiment(id, requestingPid, requestingProfileId);
  }

  list(requestingPid, requestingProfileId) {
    return this.#manager.listExperiments(requestingPid, requestingProfileId);
  }

  diff(id, requestingPid, requestingProfileId) {
    return this.#manager.diffExperiment(id, requestingPid, requestingProfileId);
  }

  discard(id, requestingPid, requestingProfileId) {
    return this.#manager.discardExperiment(id, requestingPid, requestingProfileId);
  }

  requestApply(id, context) {
    return this.#manager.requestApply(id, context);
  }

  approveApply(approvalId, requestingPid, requestingProfileId) {
    return this.#manager.approveApply(approvalId, requestingPid, requestingProfileId);
  }

  denyApply(approvalId, requestingPid, requestingProfileId, reason) {
    return this.#manager.denyApply(approvalId, requestingPid, requestingProfileId, reason);
  }
}
