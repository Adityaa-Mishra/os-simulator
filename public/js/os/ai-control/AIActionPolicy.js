/**
 * public/js/os/ai-control/AIActionPolicy.js
 * Safety policy evaluation for AI OS Control in AdityyaOS.
 * Enforces risk classification, mandatory approval rules, and protected process rules.
 */

import { PackagePermissions } from '../packages/PackagePermissions.js';

export class AIActionPolicy {
  /**
   * @param {import('./AIToolRegistry.js').AIToolRegistry} [registry]
   */
  constructor(registry = null) {
    this.registry = registry;
  }

  /**
   * Assess risk and approval requirements for a tool.
   * @param {string} tool
   * @param {Object} [args={}]
   * @returns {{ risk: 'low'|'medium'|'high', requiresApproval: boolean }}
   */
  assessRisk(tool, args = {}) {
    const res = AIActionPolicy.evaluate(tool, args, {});
    return {
      risk: res.risk,
      requiresApproval: res.requiresApproval
    };
  }

  /**
   * Evaluate whether an action is allowed, its risk level, and whether user approval is mandatory.
   * @param {string|Object} toolOrAction
   * @param {Object} [args={}]
   * @param {import('../api/APIContext.js').APIContext} [context={}]
   * @returns {{ allowed: boolean, requiresApproval: boolean, risk: 'low'|'medium'|'high', reason?: string, expectedEffect: string }}
   */
  evaluate(toolOrAction, args = {}, context = {}) {
    if (typeof toolOrAction === 'object' && toolOrAction !== null) {
      return AIActionPolicy.evaluate(toolOrAction.tool, toolOrAction.args || {}, context);
    }
    return AIActionPolicy.evaluate(toolOrAction, args, context);
  }

  /**
   * Static evaluation of tool policy.
   * @param {string} tool
   * @param {Object} args
   * @param {import('../api/APIContext.js').APIContext} [context={}]
   * @returns {{ allowed: boolean, requiresApproval: boolean, risk: 'low'|'medium'|'high', reason?: string, expectedEffect: string }}
   */
  static evaluate(tool, args = {}, context = {}) {
    if (!tool || typeof tool !== 'string') {
      return {
        allowed: false,
        requiresApproval: false,
        risk: 'high',
        reason: 'Invalid tool name provided',
        expectedEffect: ''
      };
    }

    switch (tool) {
      // 1. Read-Only Tools (Low Risk, no prompt required if permitted)
      case 'system.getInfo':
        return {
          allowed: true,
          requiresApproval: false,
          risk: 'low',
          expectedEffect: 'Inspect OS simulator version and hostname'
        };

      case 'system.getStatus':
        return {
          allowed: true,
          requiresApproval: false,
          risk: 'low',
          expectedEffect: 'Inspect system uptime and operational status'
        };

      case 'process.getCurrent':
        return {
          allowed: true,
          requiresApproval: false,
          risk: 'low',
          expectedEffect: `Inspect process metadata for PID ${context?.pid ?? 'current'}`
        };

      case 'process.list':
        return {
          allowed: true,
          requiresApproval: false,
          risk: 'low',
          expectedEffect: 'List active processes in the system'
        };

      case 'window.getState':
        return {
          allowed: true,
          requiresApproval: false,
          risk: 'low',
          expectedEffect: 'Inspect current window state and dimensions'
        };

      case 'application.getInfo':
        return {
          allowed: true,
          requiresApproval: false,
          risk: 'low',
          expectedEffect: `Inspect application metadata for ${context?.appId ?? 'current'}`
        };

      // 2. Mutating Window Tools (Medium Risk — Approval ALWAYS Required)
      case 'window.focusSelf':
        return {
          allowed: true,
          requiresApproval: true,
          risk: 'medium',
          expectedEffect: `Focus window for ${context?.appId ?? 'current'}`
        };

      case 'window.minimizeSelf':
        return {
          allowed: true,
          requiresApproval: true,
          risk: 'medium',
          expectedEffect: `Minimize window for ${context?.appId ?? 'current'}`
        };

      case 'window.maximizeSelf':
        return {
          allowed: true,
          requiresApproval: true,
          risk: 'medium',
          expectedEffect: `Maximize window for ${context?.appId ?? 'current'}`
        };

      case 'window.restoreSelf':
        return {
          allowed: true,
          requiresApproval: true,
          risk: 'medium',
          expectedEffect: `Restore window dimensions for ${context?.appId ?? 'current'}`
        };

      case 'window.closeSelf':
        return {
          allowed: true,
          requiresApproval: true,
          risk: 'medium',
          expectedEffect: `Close window for ${context?.appId ?? 'current'}`
        };

      // 3. Mutating Application Tools (Medium Risk — Approval ALWAYS Required)
      case 'application.exitSelf':
        return {
          allowed: true,
          requiresApproval: true,
          risk: 'medium',
          expectedEffect: `Exit application instance ${context?.appId ?? 'current'} (PID ${context?.pid ?? 'current'})`
        };

      // 4. Mutating Process Termination (High Risk — Approval ALWAYS Required)
      case 'process.terminateEligible': {
        const rawPid = args.targetPid ?? args.pid;
        const targetPid = Number(rawPid);

        // HARD SAFETY CONSTRAINTS:
        // Never permit termination of PID 0, PID 1, or Kernel/system-critical processes
        if (targetPid === 0 || targetPid === 1) {
          return {
            allowed: false,
            requiresApproval: true,
            risk: 'high',
            reason: `Termination of critical system PID ${targetPid} is strictly prohibited (PID ${targetPid} cannot be terminated)`,
            expectedEffect: ''
          };
        }

        if (isNaN(targetPid) || targetPid < 0) {
          return {
            allowed: false,
            requiresApproval: true,
            risk: 'high',
            reason: 'Invalid or missing targetPid for process termination',
            expectedEffect: ''
          };
        }

        return {
          allowed: true,
          requiresApproval: true,
          risk: 'high',
          expectedEffect: `Terminate process with PID ${targetPid}`
        };
      }

      default:
        return {
          allowed: false,
          requiresApproval: false,
          risk: 'high',
          reason: `Unknown or unsupported AI control tool: '${tool}'`,
          expectedEffect: ''
        };
    }
  }
}
