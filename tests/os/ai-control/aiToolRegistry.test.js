import { describe, it, expect } from 'vitest';
import { AIToolRegistry } from '../../../public/js/os/ai-control/AIToolRegistry.js';
import { AIActionPolicy } from '../../../public/js/os/ai-control/AIActionPolicy.js';
import { ActionRisk } from '../../../public/js/os/ai-control/AIAction.js';

describe('Phase 27 — AIToolRegistry and AIActionPolicy', () => {
  it('registers all allowlisted tools and denies unregistered tools', () => {
    const registry = new AIToolRegistry();
    const tools = registry.getAllowlistedTools();

    expect(tools.length).toBeGreaterThan(0);
    expect(registry.has('system.getInfo')).toBe(true);
    expect(registry.has('process.list')).toBe(true);
    expect(registry.has('window.closeSelf')).toBe(true);
    expect(registry.has('process.terminateEligible')).toBe(true);

    // Unregistered tools must not exist
    expect(registry.has('eval')).toBe(false);
    expect(registry.has('exec')).toBe(false);
    expect(registry.has('host.shell')).toBe(false);
    expect(registry.has('fs.wipeAll')).toBe(false);
    expect(registry.get('host.shell')).toBeUndefined();
  });

  it('correctly assesses read-only actions as LOW risk requiring NO approval', () => {
    const registry = new AIToolRegistry();
    const policy = new AIActionPolicy(registry);

    const readOnlyTools = [
      'system.getInfo',
      'system.getStatus',
      'process.getCurrent',
      'process.list',
      'window.getState',
      'application.getInfo'
    ];

    for (const toolName of readOnlyTools) {
      const assessment = policy.assessRisk(toolName, {});
      expect(assessment.risk).toBe(ActionRisk.LOW);
      expect(assessment.requiresApproval).toBe(false);
    }
  });

  it('correctly assesses mutating actions as MEDIUM/HIGH risk requiring user approval', () => {
    const registry = new AIToolRegistry();
    const policy = new AIActionPolicy(registry);

    const windowMutating = [
      'window.focusSelf',
      'window.minimizeSelf',
      'window.maximizeSelf',
      'window.restoreSelf',
      'window.closeSelf',
      'application.exitSelf'
    ];

    for (const toolName of windowMutating) {
      const assessment = policy.assessRisk(toolName, {});
      expect(assessment.risk).toBe(ActionRisk.MEDIUM);
      expect(assessment.requiresApproval).toBe(true);
    }

    const terminateAssessment = policy.assessRisk('process.terminateEligible', { pid: 42 });
    expect(terminateAssessment.risk).toBe(ActionRisk.HIGH);
    expect(terminateAssessment.requiresApproval).toBe(true);
  });

  it('strictly protects PID 0 and PID 1 from termination in policy evaluation', () => {
    const registry = new AIToolRegistry();
    const policy = new AIActionPolicy(registry);

    const eval0 = policy.evaluate({ tool: 'process.terminateEligible', args: { pid: 0 } });
    expect(eval0.allowed).toBe(false);
    expect(eval0.reason).toMatch(/PID 0.*cannot be terminated/i);

    const eval1 = policy.evaluate({ tool: 'process.terminateEligible', args: { pid: 1 } });
    expect(eval1.allowed).toBe(false);
    expect(eval1.reason).toMatch(/PID 1.*cannot be terminated/i);

    const evalUser = policy.evaluate({ tool: 'process.terminateEligible', args: { pid: 10 } });
    expect(evalUser.allowed).toBe(true);
    expect(evalUser.requiresApproval).toBe(true);
  });
});
