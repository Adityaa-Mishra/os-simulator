import { describe, it, expect } from 'vitest';
import { AIAction, ActionState, ActionRisk } from '../../../public/js/os/ai-control/AIAction.js';

describe('Phase 27 — AIAction Lifecycle and Safety', () => {
  it('creates action in CREATED state with immutable snapshot', () => {
    const action = new AIAction({
      tool: 'system.getInfo',
      args: { verbose: true },
      pid: 10,
      appId: 'test-app'
    });

    expect(action.id).toBeDefined();
    expect(action.state).toBe(ActionState.CREATED);
    expect(action.tool).toBe('system.getInfo');
    expect(action.args).toEqual({ verbose: true });
    expect(action.pid).toBe(10);
    expect(action.appId).toBe('test-app');
  });

  it('follows valid state machine transitions: CREATED -> PLANNED -> WAITING_FOR_APPROVAL -> APPROVED -> EXECUTING -> COMPLETED', () => {
    const action = new AIAction({
      tool: 'window.closeSelf',
      args: {},
      pid: 10,
      appId: 'test-app'
    });

    // CREATED -> PLANNED
    action.transition(ActionState.PLANNED);
    expect(action.state).toBe(ActionState.PLANNED);

    // PLANNED -> WAITING_FOR_APPROVAL
    action.transition(ActionState.WAITING_FOR_APPROVAL);
    expect(action.state).toBe(ActionState.WAITING_FOR_APPROVAL);

    // WAITING_FOR_APPROVAL -> APPROVED
    action.transition(ActionState.APPROVED);
    expect(action.state).toBe(ActionState.APPROVED);

    // APPROVED -> EXECUTING
    action.transition(ActionState.EXECUTING);
    expect(action.state).toBe(ActionState.EXECUTING);

    // EXECUTING -> COMPLETED
    action.transition(ActionState.COMPLETED);
    expect(action.state).toBe(ActionState.COMPLETED);
  });

  it('allows read-only action transition: PLANNED -> EXECUTING directly when approval not required', () => {
    const action = new AIAction({
      tool: 'system.getInfo',
      args: {},
      pid: 10,
      appId: 'test-app'
    });

    action.transition(ActionState.PLANNED);
    action.transition(ActionState.EXECUTING);
    expect(action.state).toBe(ActionState.EXECUTING);

    action.transition(ActionState.COMPLETED);
    expect(action.state).toBe(ActionState.COMPLETED);
  });

  it('rejects invalid state transitions with descriptive error', () => {
    const action = new AIAction({
      tool: 'system.getInfo',
      args: {},
      pid: 10,
      appId: 'test-app'
    });

    // Cannot jump from CREATED to COMPLETED directly
    expect(() => action.transition(ActionState.COMPLETED)).toThrowError(/Invalid state transition/);

    // Cannot jump from CREATED to EXECUTING directly
    expect(() => action.transition(ActionState.EXECUTING)).toThrowError(/Invalid state transition/);
  });

  it('handles terminal states REJECTED, FAILED, and CANCELLED', () => {
    const action1 = new AIAction({ tool: 'window.closeSelf', pid: 10, appId: 'test-app' });
    action1.transition(ActionState.PLANNED);
    action1.transition(ActionState.WAITING_FOR_APPROVAL);
    action1.transition(ActionState.REJECTED);
    expect(action1.state).toBe(ActionState.REJECTED);
    expect(() => action1.transition(ActionState.EXECUTING)).toThrowError(/Invalid state transition/);

    const action2 = new AIAction({ tool: 'system.getInfo', pid: 10, appId: 'test-app' });
    action2.transition(ActionState.PLANNED);
    action2.transition(ActionState.EXECUTING);
    action2.transition(ActionState.FAILED);
    expect(action2.state).toBe(ActionState.FAILED);

    const action3 = new AIAction({ tool: 'window.closeSelf', pid: 10, appId: 'test-app' });
    action3.transition(ActionState.PLANNED);
    action3.transition(ActionState.CANCELLED);
    expect(action3.state).toBe(ActionState.CANCELLED);
  });

  it('prevents external mutation of args and results through snapshot isolation', () => {
    const inputArgs = { path: '/tmp/test.txt', nested: { val: 1 } };
    const action = new AIAction({
      tool: 'fs.read',
      args: inputArgs,
      pid: 10,
      appId: 'test-app'
    });

    inputArgs.nested.val = 999;
    expect(action.args.nested.val).toBe(1);

    const result = { data: [1, 2, 3] };
    action.setResult(result);
    result.data.push(4);
    expect(action.result.data).toEqual([1, 2, 3]);

    const snapshot = action.toSnapshot();
    expect(snapshot.id).toBe(action.id);
    expect(snapshot.tool).toBe('fs.read');
    expect(snapshot.args).toEqual({ path: '/tmp/test.txt', nested: { val: 1 } });
  });
});
