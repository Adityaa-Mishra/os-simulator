import { describe, it, expect } from 'vitest';
import { AIApprovalRequest, ApprovalStatus } from '../../../public/js/os/ai-control/AIApprovalRequest.js';
import { ActionRisk } from '../../../public/js/os/ai-control/AIAction.js';

describe('Phase 27 — AIApprovalRequest Single-Use and Immutability', () => {
  it('creates approval request in PENDING state with frozen details', () => {
    const req = new AIApprovalRequest({
      actionId: 'act-123',
      tool: 'window.closeSelf',
      args: { windowId: 'win-1' },
      target: 'win-1',
      requiredPermissions: ['window.control'],
      risk: ActionRisk.MEDIUM,
      summary: 'Close window win-1',
      timeoutMs: 5000
    });

    expect(req.id).toBeDefined();
    expect(req.actionId).toBe('act-123');
    expect(req.status).toBe(ApprovalStatus.PENDING);
    expect(req.tool).toBe('window.closeSelf');
    expect(req.target).toBe('win-1');
    expect(req.risk).toBe(ActionRisk.MEDIUM);

    // Args should be immutable/frozen
    expect(() => { req.args.windowId = 'win-2'; }).toThrow();
  });

  it('approves request once and rejects subsequent attempts', () => {
    const req = new AIApprovalRequest({
      actionId: 'act-123',
      tool: 'window.closeSelf',
      args: {}
    });

    const result = req.approve({ approvedBy: 'user' });
    expect(result.status).toBe(ApprovalStatus.APPROVED);
    expect(req.status).toBe(ApprovalStatus.APPROVED);

    // Double approval must fail
    expect(() => req.approve()).toThrowError(/not in PENDING state/);
    expect(() => req.reject()).toThrowError(/not in PENDING state/);
  });

  it('rejects request once and rejects subsequent attempts', () => {
    const req = new AIApprovalRequest({
      actionId: 'act-123',
      tool: 'window.closeSelf',
      args: {}
    });

    const result = req.reject({ reason: 'User denied' });
    expect(result.status).toBe(ApprovalStatus.REJECTED);
    expect(req.status).toBe(ApprovalStatus.REJECTED);

    // Further transitions must fail
    expect(() => req.approve()).toThrowError(/not in PENDING state/);
    expect(() => req.reject()).toThrowError(/not in PENDING state/);
  });

  it('prevents approval after timeout expiration', () => {
    const req = new AIApprovalRequest({
      actionId: 'act-123',
      tool: 'window.closeSelf',
      args: {},
      timeoutMs: 1 // expires immediately
    });

    req.expire();
    expect(req.status).toBe(ApprovalStatus.EXPIRED);
    expect(() => req.approve()).toThrowError(/not in PENDING state/);
  });

  it('produces safe snapshot representation', () => {
    const req = new AIApprovalRequest({
      actionId: 'act-456',
      tool: 'process.terminateEligible',
      args: { pid: 42 },
      target: 'pid:42',
      requiredPermissions: ['process.terminate'],
      risk: ActionRisk.HIGH,
      summary: 'Terminate process 42'
    });

    const snapshot = req.toSnapshot();
    expect(snapshot.id).toBe(req.id);
    expect(snapshot.actionId).toBe('act-456');
    expect(snapshot.tool).toBe('process.terminateEligible');
    expect(snapshot.args).toEqual({ pid: 42 });
    expect(snapshot.status).toBe(ApprovalStatus.PENDING);
  });
});
