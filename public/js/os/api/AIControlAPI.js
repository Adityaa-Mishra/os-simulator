/**
 * public/js/os/api/AIControlAPI.js
 * Application-facing facade for AdityyaOS AI OS Control.
 * Enforces process ownership, permission checking, and exposes only snapshot-safe plain data.
 * Does NOT retain or expose raw Kernel, managers, or internal state maps.
 */

import { APIError } from './APIError.js';

export class AIControlAPI {
  /**
   * @param {Object} options
   * @param {import('../ai-control/AIControlServicePort.js').AIControlServicePort} [options.servicePort]
   * @param {import('../kernel/Kernel.js').Kernel} [options.kernel] - Fallback to acquire port if not supplied directly
   * @param {import('./APIContext.js').APIContext} options.context
   * @param {import('./AdityyaOSAPI.js').AdityyaOSAPI} [options.apiFacade]
   */
  constructor({ servicePort = null, kernel = null, context, apiFacade = null } = {}) {
    if (!context) {
      throw new TypeError('AIControlAPI requires an APIContext instance');
    }

    const port = servicePort || (kernel?.aiControlService?.getPort ? kernel.aiControlService.getPort() : null);
    if (!port) {
      throw new TypeError('AIControlAPI requires a servicePort or kernel with aiControlService');
    }

    this._servicePort = port;
    this._context = context;
    this._apiFacade = apiFacade;
  }

  /**
   * Set parent API facade if initialized later.
   * @param {import('./AdityyaOSAPI.js').AdityyaOSAPI} api
   */
  setAPIFacade(api) {
    this._apiFacade = api;
  }

  /**
   * Get list of allowlisted tools available for AI control.
   * Requires 'ai.control' permission.
   * @returns {Array<Object>}
   */
  getAllowlistedTools() {
    this._context.assertPermission('ai.control', 'aiControl.getAllowlistedTools');
    return this._servicePort.getAllowlistedTools();
  }

  /**
   * Plan an AI-controlled action.
   * Requires 'ai.control' permission.
   * @param {string} tool - Tool name
   * @param {Object} [args={}] - Arguments for the tool
   * @returns {Promise<{ action: Object, approvalRequest: Object|null, requiresApproval: boolean, risk: string }>}
   */
  async planAction(tool, args = {}) {
    this._context.assertPermission('ai.control', 'aiControl.planAction');
    try {
      return this._servicePort.createAction({
        pid: this._context.pid,
        appId: this._context.appId,
        tool,
        args,
        context: this._context
      });
    } catch (err) {
      throw new APIError({
        code: err.code || 'EACTIONPLANFAILED',
        message: err.message,
        operation: 'aiControl.planAction',
        appId: this._context.appId,
        cause: err
      });
    }
  }

  /**
   * Alias for planAction.
   * @param {string} tool
   * @param {Object} [args={}]
   * @returns {Promise<{ action: Object, approvalRequest: Object|null }>}
   */
  async requestAction(tool, args = {}) {
    return this.planAction(tool, args);
  }

  /**
   * Get an action by ID, strictly scoped to this process PID.
   * @param {string} actionId
   * @returns {Object|null}
   */
  getAction(actionId) {
    this._context.assertPermission('ai.control', 'aiControl.getAction');
    return this._servicePort.getAction(actionId, this._context.pid);
  }

  /**
   * Get all actions owned by this process PID.
   * @returns {Array<Object>}
   */
  getActions() {
    this._context.assertPermission('ai.control', 'aiControl.getActions');
    return this._servicePort.getActions(this._context.pid);
  }

  /**
   * Get an approval request by ID, strictly scoped to this process PID.
   * @param {string} approvalId
   * @returns {Object|null}
   */
  getApproval(approvalId) {
    this._context.assertPermission('ai.control', 'aiControl.getApproval');
    return this._servicePort.getApproval(approvalId, this._context.pid);
  }

  /**
   * Approve an action owned by this process PID.
   * @param {string} approvalId
   * @returns {Object} Updated approval request
   */
  approveAction(approvalId) {
    this._context.assertPermission('ai.control', 'aiControl.approveAction');
    try {
      return this._servicePort.respondToApproval(
        approvalId,
        'APPROVED',
        this._context.pid
      );
    } catch (err) {
      throw new APIError({
        code: err.code || 'EAPPROVALFAILED',
        message: err.message,
        operation: 'aiControl.approveAction',
        appId: this._context.appId,
        cause: err
      });
    }
  }

  /**
   * Reject an action owned by this process PID.
   * @param {string} approvalId
   * @param {string} [reason='User rejected']
   * @returns {Object} Updated approval request
   */
  rejectAction(approvalId, reason = 'User rejected') {
    this._context.assertPermission('ai.control', 'aiControl.rejectAction');
    try {
      return this._servicePort.respondToApproval(
        approvalId,
        'DENIED',
        this._context.pid,
        reason
      );
    } catch (err) {
      throw new APIError({
        code: err.code || 'EAPPROVALFAILED',
        message: err.message,
        operation: 'aiControl.rejectAction',
        appId: this._context.appId,
        cause: err
      });
    }
  }

  /**
   * Respond to an approval request (approve, deny, or dismiss) owned by this process PID.
   * @param {string} approvalId
   * @param {'APPROVED'|'DENIED'|'DISMISSED'} decision
   * @returns {Object} Updated approval request
   */
  respondToApproval(approvalId, decision) {
    this._context.assertPermission('ai.control', 'aiControl.respondToApproval');
    try {
      return this._servicePort.respondToApproval(
        approvalId,
        decision,
        this._context.pid
      );
    } catch (err) {
      throw new APIError({
        code: err.code || 'EAPPROVALFAILED',
        message: err.message,
        operation: 'aiControl.respondToApproval',
        appId: this._context.appId,
        cause: err
      });
    }
  }

  /**
   * Execute an approved action owned by this process PID.
   * @param {string} actionId
   * @returns {Promise<Object>} Completed action
   */
  async executeAction(actionId) {
    this._context.assertPermission('ai.control', 'aiControl.executeAction');
    try {
      return await this._servicePort.executeAction(actionId, this._context.pid, this._apiFacade);
    } catch (err) {
      if (err instanceof APIError) {
        throw err;
      }
      throw new APIError({
        code: err.code || 'EACTIONEXECFAILED',
        message: err.message,
        operation: 'aiControl.executeAction',
        appId: this._context.appId,
        cause: err
      });
    }
  }

  /**
   * Clean up pending actions owned by this instance.
   */
  destroy() {
    if (this._servicePort) {
      this._servicePort.cancelProcessActions(this._context.pid);
    }
  }
}
