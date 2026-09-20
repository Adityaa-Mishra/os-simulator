/**
 * public/js/os/ai-control/AIActionExecutor.js
 * Controlled executor for AI Actions in AdityyaOS.
 * Enforces permission checks, argument immutability against approval snapshots,
 * and single-use execution semantics.
 */

import { ActionStatus } from './AIAction.js';
import { ApprovalStatus } from './AIApprovalRequest.js';
import { APIError } from '../api/APIError.js';

export class AIActionExecutor {
  /**
   * @param {import('./AIToolRegistry.js').AIToolRegistry} registry
   */
  constructor(registry) {
    this.registry = registry;
  }

  /**
   * Execute an AI action through the controlled AdityyaOSAPI facade.
   * @param {import('./AIAction.js').AIAction} action
   * @param {import('../api/AdityyaOSAPI.js').AdityyaOSAPI} api
   * @param {import('./AIApprovalRequest.js').AIApprovalRequest} [approvalRequest=null]
   * @returns {Promise<import('./AIAction.js').AIAction>}
   */
  async execute(action, api, approvalRequest = null) {
    if (!action) {
      throw new TypeError('AIActionExecutor.execute requires an AIAction');
    }
    if (!api) {
      throw new TypeError('AIActionExecutor.execute requires an AdityyaOSAPI instance');
    }

    const toolDef = this.registry.get(action.tool);
    if (!toolDef) {
      action.transition(ActionStatus.REJECTED, { error: `Disallowed tool: '${action.tool}'` });
      throw new APIError({
        code: 'ENOSYS',
        message: `Disallowed or unknown tool: '${action.tool}'`,
        operation: 'aiControl.execute',
        appId: action.appId
      });
    }

    // 1. Validate argument schema
    const validation = toolDef.validateArgs(action.args);
    if (!validation.valid) {
      action.transition(ActionStatus.REJECTED, { error: validation.error || 'Invalid arguments' });
      throw new APIError({
        code: 'EINVAL',
        message: validation.error || 'Invalid arguments for action',
        operation: 'aiControl.execute',
        appId: action.appId
      });
    }

    // 2. Validate permissions
    for (const perm of action.requiredPermissions) {
      if (!api.context.hasPermission(perm)) {
        action.transition(ActionStatus.REJECTED, {
          error: `Missing required permission: '${perm}'`
        });
        throw new APIError({
          code: 'EPERM',
          message: `Permission denied: '${perm}' required for tool '${action.tool}'`,
          operation: 'aiControl.execute',
          appId: action.appId
        });
      }
    }

    // 3. Approval verification for mutating actions
    if (action.requiresApproval) {
      if (!approvalRequest) {
        if (action.status === ActionStatus.CREATED || action.status === ActionStatus.PLANNED) {
          action.transition(ActionStatus.WAITING_FOR_APPROVAL);
        }
        const err = new Error('Action requires explicit user approval before execution');
        err.code = 'EAPPROVALREQUIRED';
        throw err;
      }

      if (approvalRequest.status === ApprovalStatus.DENIED) {
        if (action.status !== ActionStatus.DENIED) {
          action.transition(ActionStatus.DENIED, { error: 'Action approval denied by user' });
        }
        const err = new Error('Action requires approval before execution (denied by user)');
        err.code = 'EAPPROVALDENIED';
        throw err;
      }

      if (approvalRequest.status === ApprovalStatus.DISMISSED || approvalRequest.status === ApprovalStatus.CANCELLED) {
        if (action.status !== ActionStatus.CANCELLED) {
          action.transition(ActionStatus.CANCELLED, { error: 'Action approval cancelled or dismissed' });
        }
        const err = new Error('Action requires approval before execution (cancelled or dismissed)');
        err.code = 'EAPPROVALCANCELLED';
        throw err;
      }

      if (approvalRequest.status !== ApprovalStatus.APPROVED) {
        const err = new Error(`Action requires approval before execution (status: ${approvalRequest.status})`);
        err.code = 'EAPPROVALPENDING';
        throw err;
      }

      // Verify immutable arguments match the approved snapshot
      const currentArgsStr = JSON.stringify(action.args);
      const approvedArgsStr = JSON.stringify(approvalRequest.args);
      if (currentArgsStr !== approvedArgsStr) {
        action.transition(ActionStatus.REJECTED, {
          error: 'Action arguments modified after approval'
        });
        const err = new Error('Security violation: Action arguments were mutated after approval');
        err.code = 'EARGSMUTATED';
        throw err;
      }

      // Enforce single-use execution
      approvalRequest.markExecuted();

      if (action.status === ActionStatus.WAITING_FOR_APPROVAL) {
        action.transition(ActionStatus.APPROVED);
      }
    } else {
      if (action.status === ActionStatus.CREATED) {
        action.transition(ActionStatus.PLANNED);
      }
    }

    // 4. Execution
    action.transition(ActionStatus.EXECUTING);

    try {
      const output = await toolDef.execute(api, action.args);
      action.transition(ActionStatus.COMPLETED, { result: output });
      return action;
    } catch (err) {
      action.transition(ActionStatus.FAILED, { error: err.message });
      throw err;
    }
  }
}
