import { describe, it, expect, beforeEach } from 'vitest';
import { Kernel } from '../../../public/js/os/kernel/Kernel.js';
import { APIContext } from '../../../public/js/os/api/APIContext.js';
import { AdityyaOSAPI } from '../../../public/js/os/api/AdityyaOSAPI.js';
import { PackagePermissions } from '../../../public/js/os/packages/PackagePermissions.js';
import { ActionRisk, ActionState } from '../../../public/js/os/ai-control/AIAction.js';
import { ApprovalStatus } from '../../../public/js/os/ai-control/AIApprovalRequest.js';

describe('Phase 27 — AIControlAPI & Controlled Execution', () => {
  let kernel;

  beforeEach(() => {
    kernel = new Kernel();
    kernel.boot();
  });

  it('denies all AI control operations when ai.control permission is not granted', async () => {
    const context = new APIContext({
      appId: 'unpermitted-app',
      instanceId: 'inst-1',
      pid: 10,
      permissions: [PackagePermissions.SYSTEM_READ] // Missing ai.control
    });

    const api = new AdityyaOSAPI({ kernel, context });

    expect(() => api.aiControl.getAllowlistedTools()).toThrowError(/Permission denied.*ai\.control/);
    await expect(api.aiControl.planAction('system.getInfo')).rejects.toThrowError(/Permission denied.*ai\.control/);
    await expect(api.aiControl.executeAction('act-1')).rejects.toThrowError(/Permission denied.*ai\.control/);
  });

  it('allows planning and executing read-only action when permissions are granted', async () => {
    const context = new APIContext({
      appId: 'permitted-app',
      instanceId: 'inst-1',
      pid: 10,
      permissions: [PackagePermissions.AI_CONTROL, PackagePermissions.SYSTEM_READ]
    });

    const api = new AdityyaOSAPI({ kernel, context });

    const tools = api.aiControl.getAllowlistedTools();
    expect(tools.length).toBeGreaterThan(0);

    // Plan read-only action
    const planResult = await api.aiControl.planAction('system.getInfo', {});
    expect(planResult.action.id).toBeDefined();
    expect(planResult.action.state).toBe(ActionState.PLANNED);
    expect(planResult.requiresApproval).toBe(false);
    expect(planResult.risk).toBe(ActionRisk.LOW);

    // Execute read-only action
    const execResult = await api.aiControl.executeAction(planResult.action.id);
    expect(execResult.success).toBe(true);
    expect(execResult.result).toBeDefined();
    expect(execResult.result.status).toBe('RUNNING');
  });

  it('requires user approval for mutating actions before execution', async () => {
    const context = new APIContext({
      appId: 'permitted-app',
      instanceId: 'inst-1',
      pid: 10,
      permissions: [PackagePermissions.AI_CONTROL, PackagePermissions.PROCESS_TERMINATE]
    });

    // Create init process (PID 1) then target process (PID 2)
    kernel.processManager.createProcess({ name: 'init' });
    const targetProc = kernel.processManager.createProcess({ name: 'target-proc' }).data;
    expect(targetProc.pid).toBeGreaterThan(1);

    const api = new AdityyaOSAPI({ kernel, context });

    // Plan mutating action
    const planResult = await api.aiControl.planAction('process.terminateEligible', { pid: targetProc.pid });
    expect(planResult.requiresApproval).toBe(true);
    expect(planResult.approvalRequest).toBeDefined();
    expect(planResult.approvalRequest.status).toBe(ApprovalStatus.PENDING);
    expect(planResult.action.state).toBe(ActionState.WAITING_FOR_APPROVAL);

    // Attempting to execute before approval must fail
    await expect(api.aiControl.executeAction(planResult.action.id)).rejects.toThrowError(/requires approval/i);

    // Approve the action
    const approved = api.aiControl.approveAction(planResult.approvalRequest.id);
    expect(approved.status).toBe(ApprovalStatus.APPROVED);

    // Now execute successfully
    const execResult = await api.aiControl.executeAction(planResult.action.id);
    expect(execResult.status).toBe('COMPLETED');

    // Verify target process was terminated in ProcessManager
    const terminatedProc = kernel.processManager.getProcess(targetProc.pid);
    expect(terminatedProc.state).toBe('TERMINATED');
  });

  it('rejects mutating action when user denies approval', async () => {
    const context = new APIContext({
      appId: 'permitted-app',
      instanceId: 'inst-1',
      pid: 10,
      permissions: [PackagePermissions.AI_CONTROL, PackagePermissions.PROCESS_TERMINATE]
    });

    kernel.processManager.createProcess({ name: 'init' });
    const targetProc = kernel.processManager.createProcess({ name: 'target-proc' }).data;
    const api = new AdityyaOSAPI({ kernel, context });

    const planResult = await api.aiControl.planAction('process.terminateEligible', { pid: targetProc.pid });
    expect(planResult.requiresApproval).toBe(true);

    // Reject the request
    const rejected = api.aiControl.rejectAction(planResult.approvalRequest.id, 'User refused');
    expect(rejected.status).toBe(ApprovalStatus.DENIED);

    // Execution must fail
    await expect(api.aiControl.executeAction(planResult.action.id)).rejects.toThrowError(/requires approval/i);
    expect(kernel.processManager.getProcess(targetProc.pid).state).not.toBe('TERMINATED');
  });

  it('strictly rejects terminating PID 0 or PID 1 with EPERM error', async () => {
    const context = new APIContext({
      appId: 'permitted-app',
      instanceId: 'inst-1',
      pid: 10,
      permissions: [PackagePermissions.AI_CONTROL, PackagePermissions.PROCESS_TERMINATE]
    });

    const api = new AdityyaOSAPI({ kernel, context });

    await expect(api.aiControl.planAction('process.terminateEligible', { pid: 0 }))
      .rejects.toThrowError(/cannot be terminated/i);

    await expect(api.aiControl.planAction('process.terminateEligible', { pid: 1 }))
      .rejects.toThrowError(/cannot be terminated/i);
  });

  it('cancels active and pending actions when the process terminates', async () => {
    // Create process in ProcessManager
    const proc = kernel.processManager.createProcess({ name: 'test-proc' }).data;

    const context = new APIContext({
      appId: 'test-app',
      instanceId: 'inst-1',
      pid: proc.pid,
      permissions: [PackagePermissions.AI_CONTROL, PackagePermissions.PROCESS_TERMINATE]
    });

    const api = new AdityyaOSAPI({ kernel, context });

    const planResult = await api.aiControl.planAction('process.terminateEligible', { pid: 99 });
    expect(planResult.action.state).toBe(ActionState.WAITING_FOR_APPROVAL);

    // Terminate process in kernel
    kernel.processManager.terminateProcess(proc.pid);

    // Action should be cancelled in aiControlService
    const action = kernel.aiControlService.actions.get(planResult.action.id);
    expect(action.state).toBe(ActionState.CANCELLED);
  });

  it('enforces strict cross-process isolation without leaking action or approval status', async () => {
    const contextA = new APIContext({
      appId: 'app-a',
      instanceId: 'inst-a',
      pid: 10,
      permissions: [PackagePermissions.AI_CONTROL, PackagePermissions.PROCESS_TERMINATE]
    });
    const apiA = new AdityyaOSAPI({ kernel, context: contextA });

    const contextB = new APIContext({
      appId: 'app-b',
      instanceId: 'inst-b',
      pid: 20,
      permissions: [PackagePermissions.AI_CONTROL, PackagePermissions.PROCESS_TERMINATE]
    });
    const apiB = new AdityyaOSAPI({ kernel, context: contextB });

    // Process A plans a mutating action requiring approval
    const planA = await apiA.aiControl.planAction('process.terminateEligible', { pid: 99 });
    const actionId = planA.action.id;
    const approvalId = planA.approvalRequest.id;

    // Process B cannot inspect Process A's action
    expect(apiB.aiControl.getAction(actionId)).toBeNull();

    // Process B's action list does not include Process A's action
    const actionsB = apiB.aiControl.getActions();
    expect(actionsB.some(a => a.id === actionId)).toBe(false);

    // Process B cannot inspect Process A's approval request
    expect(apiB.aiControl.getApproval(approvalId)).toBeNull();

    // Process B attempting to approve throws uniform ENOENT error
    await expect(async () => apiB.aiControl.approveAction(approvalId)).rejects.toThrowError(
      /not found or access denied/i
    );

    // Process B attempting to reject throws uniform ENOENT error
    await expect(async () => apiB.aiControl.rejectAction(approvalId)).rejects.toThrowError(
      /not found or access denied/i
    );

    // Process B attempting to respond throws uniform ENOENT error
    await expect(async () => apiB.aiControl.respondToApproval(approvalId, 'DISMISSED')).rejects.toThrowError(
      /not found or access denied/i
    );

    // Process B attempting to execute throws uniform ENOENT without leaking action status
    await expect(apiB.aiControl.executeAction(actionId)).rejects.toThrowError(
      /not found or access denied/i
    );

    // Process A approves its own action
    apiA.aiControl.approveAction(approvalId);

    // Even after approval, Process B cannot execute it
    await expect(apiB.aiControl.executeAction(actionId)).rejects.toThrowError(
      /not found or access denied/i
    );
  });

  it('does not expose raw Kernel, managers, or internal state maps on AIControlAPI', () => {
    const context = new APIContext({
      appId: 'app-test',
      instanceId: 'inst-1',
      pid: 10,
      permissions: [PackagePermissions.AI_CONTROL]
    });
    const api = new AdityyaOSAPI({ kernel, context });

    // AIControlAPI facade must not retain raw Kernel or manager references
    expect(api.aiControl._kernel).toBeUndefined();
    expect(api.aiControl.kernel).toBeUndefined();
    expect(api.aiControl.actions).toBeUndefined();
    expect(api.aiControl.approvals).toBeUndefined();

    // AIControlServicePort must not expose raw internal maps or service references
    expect(api.aiControl._servicePort.actions).toBeUndefined();
    expect(api.aiControl._servicePort.approvals).toBeUndefined();
    expect(api.aiControl._servicePort.kernel).toBeUndefined();
    expect(api.aiControl._servicePort._service).toBeUndefined();
  });

  it('returns plain serializable snapshots only', async () => {
    const context = new APIContext({
      appId: 'app-test',
      instanceId: 'inst-1',
      pid: 10,
      permissions: [PackagePermissions.AI_CONTROL, PackagePermissions.SYSTEM_READ]
    });
    const api = new AdityyaOSAPI({ kernel, context });

    const plan = await api.aiControl.planAction('system.getInfo', {});
    expect(plan.action).toBeDefined();
    // Verify it is a plain object without class mutation methods
    expect(typeof plan.action.transition).toBe('undefined');
    expect(typeof plan.action.execute).toBe('undefined');
    expect(JSON.parse(JSON.stringify(plan.action))).toEqual(plan.action);

    const tools = api.aiControl.getAllowlistedTools();
    expect(Array.isArray(tools)).toBe(true);
    expect(JSON.parse(JSON.stringify(tools))).toEqual(tools);
  });
});

