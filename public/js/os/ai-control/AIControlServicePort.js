/**
 * public/js/os/ai-control/AIControlServicePort.js
 * Narrow restricted port for AIControlAPI facade.
 * Prevents exposing Kernel, subsystem managers, raw maps, or internal references.
 */

export class AIControlServicePort {
  #service;

  /**
   * @param {import('./AIControlService.js').AIControlService} service
   */
  constructor(service) {
    if (!service) {
      throw new TypeError('AIControlServicePort requires an AIControlService instance');
    }
    this.#service = service;
  }

  /**
   * List allowlisted tools as plain serializable metadata.
   * @returns {Array<Object>}
   */
  getAllowlistedTools() {
    return JSON.parse(JSON.stringify(this.#service.registry.listTools()));
  }

  /**
   * Request an action plan, returning only plain serializable snapshots.
   * @param {Object} params
   * @returns {{ action: Object, approvalRequest: Object|null, requiresApproval: boolean, risk: string }}
   */
  createAction({ pid, appId, tool, args, context }) {
    const res = this.#service.createAction({ pid, appId, tool, args, context });
    return {
      action: res.action.toJSON(),
      approvalRequest: res.approvalRequest ? res.approvalRequest.toJSON() : null,
      requiresApproval: res.action.requiresApproval,
      risk: res.action.risk
    };
  }

  /**
   * Get action snapshot scoped to requesting PID.
   * @param {string} actionId
   * @param {number} requestingPid
   * @returns {Object|null}
   */
  getAction(actionId, requestingPid) {
    return this.#service.getAction(actionId, requestingPid);
  }

  /**
   * Get all action snapshots owned by requesting PID.
   * @param {number} requestingPid
   * @returns {Array<Object>}
   */
  getActions(requestingPid) {
    return this.#service.getActions(requestingPid);
  }

  /**
   * Get approval request snapshot scoped to requesting PID.
   * @param {string} approvalId
   * @param {number} requestingPid
   * @returns {Object|null}
   */
  getApproval(approvalId, requestingPid) {
    return this.#service.getApproval(approvalId, requestingPid);
  }

  /**
   * Respond to approval request scoped to requesting PID.
   * @param {string} approvalId
   * @param {'APPROVED'|'DENIED'|'DISMISSED'} decision
   * @param {number} requestingPid
   * @param {string} [reason]
   * @returns {Object}
   */
  respondToApproval(approvalId, decision, requestingPid, reason = null) {
    return this.#service.respondToApproval(approvalId, decision, requestingPid, reason);
  }

  /**
   * Execute an approved action scoped to requesting PID.
   * @param {string} actionId
   * @param {number} requestingPid
   * @param {import('../api/AdityyaOSAPI.js').AdityyaOSAPI} apiFacade
   * @returns {Promise<Object>} Completed action snapshot
   */
  async executeAction(actionId, requestingPid, apiFacade) {
    return await this.#service.executeAction(actionId, requestingPid, apiFacade);
  }

  /**
   * Cancel actions for a terminating process.
   * @param {number} pid
   */
  cancelProcessActions(pid) {
    this.#service.cancelProcessActions(pid);
  }
}
