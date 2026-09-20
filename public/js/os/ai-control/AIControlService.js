/**
 * public/js/os/ai-control/AIControlService.js
 * Central Kernel-owned subsystem coordinating AI Actions and Approval requests in AdityyaOS.
 * Enforces strict process ownership isolation, single-use approvals,
 * and automatic cleanup upon process termination, reset, or shutdown.
 */

import { AIAction, ActionStatus } from './AIAction.js';
import { AIApprovalRequest, ApprovalStatus } from './AIApprovalRequest.js';
import { AIActionPolicy } from './AIActionPolicy.js';
import { AIToolRegistry } from './AIToolRegistry.js';
import { AIActionExecutor } from './AIActionExecutor.js';

import { AIControlServicePort } from './AIControlServicePort.js';

export class AIControlService {
  /**
   * @param {import('../kernel/Kernel.js').Kernel} kernel
   * @param {Object} [config={}]
   */
  constructor(kernel, config = {}) {
    this.kernel = kernel;
    this.config = config;

    this.registry = new AIToolRegistry();
    this.executor = new AIActionExecutor(this.registry);

    this.actions = new Map();
    this.approvals = new Map();
  }

  /**
   * Return a restricted AI-control service port for the API facade.
   * Prevents exposing Kernel, managers, or internal state.
   * @returns {AIControlServicePort}
   */
  getPort() {
    return new AIControlServicePort(this);
  }

  /**
   * Create an AI action plan from a tool invocation request.
   * @param {Object} options
   * @param {number} options.pid - Calling process ID
   * @param {string} options.appId - Calling application ID
   * @param {string} options.tool - Tool name
   * @param {Object} [options.args={}] - Arguments
   * @param {import('../api/APIContext.js').APIContext} options.context - Calling API context
   * @returns {{ action: AIAction, approvalRequest: AIApprovalRequest|null }}
   */
  createAction({ pid, appId, tool, args = {}, context }) {
    if (typeof pid !== 'number' || isNaN(pid) || pid <= 0) {
      throw new TypeError('AIControlService.createAction requires a valid positive number pid');
    }

    const toolDef = this.registry.get(tool);
    if (!toolDef) {
      const err = new Error(`Disallowed or unknown tool: '${tool}'`);
      err.code = 'ENOSYS';
      throw err;
    }

    const policy = AIActionPolicy.evaluate(tool, args, context);
    if (!policy.allowed) {
      const err = new Error(policy.reason || `Tool '${tool}' is not permitted by policy`);
      err.code = 'EPOLICYDENIED';
      throw err;
    }

    const action = new AIAction({
      pid,
      appId,
      tool,
      args,
      requiredPermissions: toolDef.requiredPermissions,
      requiresApproval: policy.requiresApproval || toolDef.requiresApproval,
      risk: policy.risk || toolDef.risk
    });

    this.actions.set(action.id, action);

    let approvalRequest = null;
    if (action.requiresApproval) {
      action.transition(ActionStatus.WAITING_FOR_APPROVAL);

      approvalRequest = new AIApprovalRequest({
        actionId: action.id,
        pid: action.pid,
        appId: action.appId,
        tool: action.tool,
        args: action.args,
        target: args.targetPath || args.targetPid || appId || 'system',
        requiredPermissions: action.requiredPermissions,
        risk: action.risk,
        expectedEffect: policy.expectedEffect || toolDef.description
      });

      this.approvals.set(approvalRequest.id, approvalRequest);
    } else {
      action.transition(ActionStatus.PLANNED);
    }

    this.syncState();
    return { action, approvalRequest };
  }

  /**
   * Get an action by ID, verifying PID ownership.
   * @param {string} actionId
   * @param {number} requestingPid
   * @returns {Object|null}
   */
  getAction(actionId, requestingPid) {
    const action = this.actions.get(actionId);
    if (!action || action.pid !== requestingPid) {
      return null;
    }
    return action.toJSON();
  }

  /**
   * Get all actions owned by a process PID.
   * @param {number} requestingPid
   * @returns {Array<Object>}
   */
  getActions(requestingPid) {
    const list = [];
    for (const action of this.actions.values()) {
      if (action.pid === requestingPid) {
        list.push(action.toJSON());
      }
    }
    return list;
  }

  /**
   * Get an approval request by ID, verifying PID ownership.
   * @param {string} approvalId
   * @param {number} requestingPid
   * @returns {Object|null}
   */
  getApproval(approvalId, requestingPid) {
    const approval = this.approvals.get(approvalId);
    if (!approval || approval.pid !== requestingPid) {
      return null;
    }
    return approval.toJSON();
  }

  /**
   * Respond to an approval request (approve, deny, or dismiss).
   * @param {string} approvalId
   * @param {'APPROVED'|'DENIED'|'DISMISSED'} decision
   * @param {number} requestingPid
   * @returns {Object} Updated approval snapshot
   */
  respondToApproval(approvalId, decision, requestingPid) {
    const approval = this.approvals.get(approvalId);
    if (!approval || approval.pid !== requestingPid) {
      const err = new Error(`Approval request '${approvalId}' not found or access denied`);
      err.code = 'ENOENT';
      throw err;
    }

    const action = this.actions.get(approval.actionId);

    if (decision === 'APPROVED') {
      approval.approve();
      if (action && action.status === ActionStatus.WAITING_FOR_APPROVAL) {
        action.transition(ActionStatus.APPROVED);
      }
    } else if (decision === 'DENIED') {
      approval.deny();
      if (action && action.status === ActionStatus.WAITING_FOR_APPROVAL) {
        action.transition(ActionStatus.DENIED, { error: 'Approval denied by user' });
      }
    } else {
      approval.dismiss();
      if (action && action.status === ActionStatus.WAITING_FOR_APPROVAL) {
        action.transition(ActionStatus.CANCELLED, { error: 'Approval dismissed by user' });
      }
    }

    this.syncState();
    return approval.toJSON();
  }

  /**
   * Execute an action using the controlled API facade.
   * Enforces PID ownership check before returning or executing.
   * @param {string} actionId
   * @param {number|import('../api/AdityyaOSAPI.js').AdityyaOSAPI} requestingPidOrApi
   * @param {import('../api/AdityyaOSAPI.js').AdityyaOSAPI} [maybeApi]
   * @returns {Promise<Object>} Completed action snapshot
   */
  async executeAction(actionId, requestingPidOrApi, maybeApi = null) {
    const requestingPid = typeof requestingPidOrApi === 'number'
      ? requestingPidOrApi
      : requestingPidOrApi?.context?.pid;
    const api = maybeApi || requestingPidOrApi;

    const action = this.actions.get(actionId);
    if (!action || action.pid !== requestingPid) {
      const err = new Error(`Action '${actionId}' not found or access denied`);
      err.code = 'ENOENT';
      throw err;
    }

    let approval = null;
    if (action.requiresApproval) {
      // Find matching approval
      for (const app of this.approvals.values()) {
        if (app.actionId === action.id) {
          approval = app;
          break;
        }
      }
    }

    await this.executor.execute(action, api, approval);
    this.syncState();
    return action.toJSON();
  }

  /**
   * Automatically cancel pending actions and dismiss approvals for a process.
   * Called upon process termination.
   * @param {number} pid
   */
  cancelProcessActions(pid) {
    if (typeof pid !== 'number') return;

    for (const action of this.actions.values()) {
      if (action.pid === pid) {
        if (
          action.status === ActionStatus.CREATED ||
          action.status === ActionStatus.PLANNED ||
          action.status === ActionStatus.WAITING_FOR_APPROVAL ||
          action.status === ActionStatus.APPROVED
        ) {
          try {
            action.transition(ActionStatus.CANCELLED, { error: 'Process terminated' });
          } catch {
            // Ignore invalid transition during process cleanup
          }
        }
      }
    }

    for (const approval of this.approvals.values()) {
      if (approval.pid === pid) {
        approval.cancel();
      }
    }

    this.syncState();
  }

  /**
   * Reset all actions and approvals.
   */
  reset() {
    for (const action of this.actions.values()) {
      if (
        action.status === ActionStatus.CREATED ||
        action.status === ActionStatus.PLANNED ||
        action.status === ActionStatus.WAITING_FOR_APPROVAL
      ) {
        try {
          action.transition(ActionStatus.CANCELLED, { error: 'System reset' });
        } catch {}
      }
    }
    for (const approval of this.approvals.values()) {
      approval.cancel();
    }
    this.actions.clear();
    this.approvals.clear();
    this.syncState();
  }

  /**
   * Shutdown subsystem.
   */
  shutdown() {
    this.reset();
  }

  /**
   * Return a snapshot-safe serializable summary of AI control state.
   * Strictly data only: no functions, DOM objects, or manager references.
   * @returns {Object}
   */
  getAIControlState() {
    let pendingCount = 0;
    let completedCount = 0;
    for (const action of this.actions.values()) {
      if (action.status === ActionStatus.WAITING_FOR_APPROVAL) pendingCount++;
      if (action.status === ActionStatus.COMPLETED) completedCount++;
    }

    return {
      totalActions: this.actions.size,
      pendingApprovals: pendingCount,
      completedActions: completedCount
    };
  }

  /**
   * Synchronize state to central OSState.
   */
  syncState() {
    if (this.kernel && this.kernel.state) {
      this.kernel.state.aiControl = this.getAIControlState();
    }
  }
}
