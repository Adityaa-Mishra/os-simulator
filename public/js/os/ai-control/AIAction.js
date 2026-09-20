/**
 * public/js/os/ai-control/AIAction.js
 * Structured, serializable model representing an AI-planned action in AdityyaOS.
 * Enforces a strict finite lifecycle state machine and snapshot isolation.
 */

export const ActionStatus = Object.freeze({
  CREATED: 'CREATED',
  PLANNED: 'PLANNED',
  WAITING_FOR_APPROVAL: 'WAITING_FOR_APPROVAL',
  APPROVED: 'APPROVED',
  EXECUTING: 'EXECUTING',
  COMPLETED: 'COMPLETED',
  DENIED: 'DENIED',
  REJECTED: 'REJECTED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED'
});

export const ActionState = ActionStatus;

export const ActionRisk = Object.freeze({
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high'
});

export const VALID_ACTION_TRANSITIONS = Object.freeze({
  [ActionStatus.CREATED]: [ActionStatus.PLANNED, ActionStatus.WAITING_FOR_APPROVAL, ActionStatus.CANCELLED, ActionStatus.REJECTED],
  [ActionStatus.PLANNED]: [ActionStatus.WAITING_FOR_APPROVAL, ActionStatus.EXECUTING, ActionStatus.CANCELLED, ActionStatus.REJECTED],
  [ActionStatus.WAITING_FOR_APPROVAL]: [ActionStatus.APPROVED, ActionStatus.DENIED, ActionStatus.REJECTED, ActionStatus.CANCELLED],
  [ActionStatus.APPROVED]: [ActionStatus.EXECUTING, ActionStatus.CANCELLED],
  [ActionStatus.EXECUTING]: [ActionStatus.COMPLETED, ActionStatus.FAILED, ActionStatus.CANCELLED],
  [ActionStatus.COMPLETED]: [],
  [ActionStatus.DENIED]: [],
  [ActionStatus.REJECTED]: [],
  [ActionStatus.FAILED]: [],
  [ActionStatus.CANCELLED]: []
});

/**
 * Validate whether an action state transition is permitted.
 * @param {string} from
 * @param {string} to
 * @returns {boolean}
 */
export function isValidActionTransition(from, to) {
  const allowed = VALID_ACTION_TRANSITIONS[from];
  return Array.isArray(allowed) && allowed.includes(to);
}

let actionSeq = 0;

export class AIAction {
  /**
   * @param {Object} options
   * @param {string} [options.id]
   * @param {string} [options.requestId]
   * @param {number} [options.pid=1] - Owning process ID
   * @param {string} [options.appId='system']
   * @param {string} options.tool - Tool name (e.g. 'system.getInfo')
   * @param {Object} [options.args={}] - Schema-validated arguments
   * @param {Array<string>} [options.requiredPermissions=[]]
   * @param {boolean} [options.requiresApproval=false]
   * @param {'low'|'medium'|'high'} [options.risk='low']
   */
  constructor({
    id = null,
    requestId = null,
    pid = 1,
    appId = 'system',
    tool,
    args = {},
    requiredPermissions = [],
    requiresApproval = false,
    risk = 'low'
  }) {
    if (!tool || typeof tool !== 'string') {
      throw new TypeError('AIAction requires a valid string tool name');
    }

    this.id = id || `act-${Date.now()}-${++actionSeq}`;
    this.requestId = requestId;
    this.pid = typeof pid === 'number' ? pid : 1;
    this.appId = String(appId || 'system');
    this.tool = tool;

    // Deep clone args to ensure snapshot isolation
    this.args = Object.freeze(JSON.parse(JSON.stringify(args || {})));
    this.requiredPermissions = Object.freeze([...(requiredPermissions || [])]);
    this.requiresApproval = Boolean(requiresApproval);
    this.risk = ['low', 'medium', 'high'].includes(risk) ? risk : 'low';

    this.status = ActionStatus.CREATED;
    this.result = null;
    this.error = null;
    this.createdAt = Date.now();
    this.updatedAt = this.createdAt;
  }

  get state() {
    return this.status;
  }

  /**
   * Transition action to a new lifecycle state.
   * @param {string} to - Destination ActionStatus
   * @param {Object} [options={}]
   * @returns {AIAction}
   */
  transition(to, options = {}) {
    if (!isValidActionTransition(this.status, to)) {
      throw new Error(`Invalid state transition from ${this.status} to ${to}`);
    }
    this.status = to;
    this.updatedAt = Date.now();
    if (options.result !== undefined) {
      this.setResult(options.result);
    }
    if (options.error !== undefined) {
      this.error = options.error;
    }
    return this;
  }

  /**
   * Set execution result.
   * @param {any} result
   */
  setResult(result) {
    this.result = Object.freeze(JSON.parse(JSON.stringify(result || {})));
  }

  /**
   * Return a safe, serializable deep copy of the action.
   * @returns {Object}
   */
  toJSON() {
    return {
      id: this.id,
      requestId: this.requestId,
      pid: this.pid,
      appId: this.appId,
      tool: this.tool,
      args: JSON.parse(JSON.stringify(this.args)),
      requiredPermissions: [...this.requiredPermissions],
      requiresApproval: this.requiresApproval,
      risk: this.risk,
      status: this.status,
      state: this.status,
      success: this.status === ActionStatus.COMPLETED,
      result: this.result ? JSON.parse(JSON.stringify(this.result)) : null,
      error: this.error,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }

  toSnapshot() {
    return this.toJSON();
  }
}
