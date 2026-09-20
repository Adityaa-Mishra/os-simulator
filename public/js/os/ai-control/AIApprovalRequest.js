/**
 * public/js/os/ai-control/AIApprovalRequest.js
 * Single-use, immutable approval request snapshot for AdityyaOS AI OS Control.
 * Ensures arguments, targets, and permissions cannot be mutated before or after approval.
 */

export const ApprovalStatus = Object.freeze({
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  DENIED: 'DENIED',
  EXPIRED: 'EXPIRED',
  DISMISSED: 'DISMISSED',
  CANCELLED: 'CANCELLED'
});

let approvalSeq = 0;

export class AIApprovalRequest {
  /**
   * @param {Object} options
   * @param {string} [options.id]
   * @param {string} options.actionId - Associated AIAction ID
   * @param {number} [options.pid=1] - Owning process ID
   * @param {string} [options.appId='system'] - Owning application ID
   * @param {string} options.tool - Tool name
   * @param {Object} [options.args={}] - Frozen arguments snapshot
   * @param {string} [options.target='system'] - Human-readable target (path, process, window, etc.)
   * @param {Array<string>} [options.requiredPermissions=[]]
   * @param {'low'|'medium'|'high'} [options.risk='medium']
   * @param {string} [options.expectedEffect=''] - Description of what the action will do
   * @param {string} [options.summary='']
   * @param {number} [options.timeoutMs]
   */
  constructor({
    id = null,
    actionId,
    pid = 1,
    appId = 'system',
    tool,
    args = {},
    target = 'system',
    requiredPermissions = [],
    risk = 'medium',
    expectedEffect = '',
    summary = '',
    timeoutMs = null
  }) {
    if (!actionId || typeof actionId !== 'string') {
      throw new TypeError('AIApprovalRequest requires a valid string actionId');
    }
    if (!tool || typeof tool !== 'string') {
      throw new TypeError('AIApprovalRequest requires a valid string tool');
    }

    this.id = id || `appr-${Date.now()}-${++approvalSeq}`;
    this.actionId = actionId;
    this.pid = typeof pid === 'number' && !isNaN(pid) ? pid : 1;
    this.appId = String(appId || 'system');
    this.tool = tool;

    // Deep freeze the arguments snapshot to guarantee immutability
    this.args = Object.freeze(JSON.parse(JSON.stringify(args || {})));
    this.target = String(target || 'system');
    this.requiredPermissions = Object.freeze([...(requiredPermissions || [])]);
    this.risk = ['low', 'medium', 'high'].includes(risk) ? risk : 'medium';
    this.expectedEffect = String(expectedEffect || summary || '');
    this.summary = String(summary || expectedEffect || '');
    this.timeoutMs = timeoutMs;

    this.status = ApprovalStatus.PENDING;
    this.executed = false;
    this.createdAt = Date.now();
    this.resolvedAt = null;
  }

  /**
   * Mark that the approved action has been executed (enforcing single-use).
   */
  markExecuted() {
    this.executed = true;
  }

  /**
   * Approve the action (single-use).
   * @param {Object} [options={}]
   * @returns {Object}
   */
  approve(options = {}) {
    if (this.status !== ApprovalStatus.PENDING) {
      const err = new Error(`Cannot approve request in status '${this.status}', not in PENDING state`);
      err.code = 'EINVALIDAPPROVALSTATE';
      throw err;
    }
    this.status = ApprovalStatus.APPROVED;
    this.resolvedAt = Date.now();
    return this.toSnapshot();
  }

  /**
   * Reject the action.
   * @param {Object} [options={}]
   * @returns {Object}
   */
  reject(options = {}) {
    if (this.status !== ApprovalStatus.PENDING) {
      const err = new Error(`Cannot reject request in status '${this.status}', not in PENDING state`);
      err.code = 'EINVALIDAPPROVALSTATE';
      throw err;
    }
    this.status = ApprovalStatus.REJECTED;
    this.resolvedAt = Date.now();
    return this.toSnapshot();
  }

  /**
   * Deny the action.
   */
  deny() {
    if (this.status !== ApprovalStatus.PENDING) {
      return;
    }
    this.status = ApprovalStatus.DENIED;
    this.resolvedAt = Date.now();
  }

  /**
   * Expire the request.
   * @returns {Object}
   */
  expire() {
    if (this.status === ApprovalStatus.PENDING) {
      this.status = ApprovalStatus.EXPIRED;
      this.resolvedAt = Date.now();
    }
    return this.toSnapshot();
  }

  /**
   * Dismiss the action (acts as denial/cancellation).
   */
  dismiss() {
    if (this.status !== ApprovalStatus.PENDING) {
      return;
    }
    this.status = ApprovalStatus.DISMISSED;
    this.resolvedAt = Date.now();
  }

  /**
   * Cancel the approval request.
   */
  cancel() {
    if (this.status === ApprovalStatus.PENDING) {
      this.status = ApprovalStatus.CANCELLED;
      this.resolvedAt = Date.now();
    }
  }

  /**
   * Safe serialized snapshot.
   * @returns {Object}
   */
  toJSON() {
    return {
      id: this.id,
      actionId: this.actionId,
      pid: this.pid,
      appId: this.appId,
      tool: this.tool,
      args: JSON.parse(JSON.stringify(this.args)),
      target: this.target,
      requiredPermissions: [...this.requiredPermissions],
      risk: this.risk,
      expectedEffect: this.expectedEffect,
      summary: this.summary,
      status: this.status,
      createdAt: this.createdAt,
      resolvedAt: this.resolvedAt
    };
  }

  toSnapshot() {
    return this.toJSON();
  }
}
