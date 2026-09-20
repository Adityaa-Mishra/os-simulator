/**
 * public/js/os/ai-control/AIToolRegistry.js
 * Allowlisted tool registry for AdityyaOS AI OS Control.
 * Guarantees that only strictly predefined tools can be executed,
 * and that executors receive only the controlled AdityyaOSAPI facade (never raw Kernel or managers).
 */

import { PackagePermissions } from '../packages/PackagePermissions.js';

export class AIToolRegistry {
  constructor() {
    this.tools = new Map();
    this.registerDefaultTools();
  }

  /**
   * Register standard allowlisted tools.
   */
  registerDefaultTools() {
    // 1. Read-Only Tools
    this.register({
      id: 'system.getInfo',
      description: 'Get operating system simulator info and version',
      requiredPermissions: [PackagePermissions.SYSTEM_READ],
      risk: 'low',
      requiresApproval: false,
      validateArgs: () => ({ valid: true }),
      execute: async (api) => {
        return api.system.getInfo();
      }
    });

    this.register({
      id: 'system.getStatus',
      description: 'Get system operational status and uptime',
      requiredPermissions: [PackagePermissions.SYSTEM_READ],
      risk: 'low',
      requiresApproval: false,
      validateArgs: () => ({ valid: true }),
      execute: async (api) => {
        return api.system.getStatus();
      }
    });

    this.register({
      id: 'process.getCurrent',
      description: 'Get metadata for the calling process',
      requiredPermissions: [PackagePermissions.PROCESS_SELF],
      risk: 'low',
      requiresApproval: false,
      validateArgs: () => ({ valid: true }),
      execute: async (api) => {
        return api.process.getCurrent();
      }
    });

    this.register({
      id: 'process.list',
      description: 'List active processes in the system',
      requiredPermissions: [PackagePermissions.PROCESS_READ],
      risk: 'low',
      requiresApproval: false,
      validateArgs: () => ({ valid: true }),
      execute: async (api) => {
        return api.process.list();
      }
    });

    this.register({
      id: 'window.getState',
      description: 'Get current window state and dimensions',
      requiredPermissions: [PackagePermissions.WINDOW_CONTROL],
      risk: 'low',
      requiresApproval: false,
      validateArgs: () => ({ valid: true }),
      execute: async (api) => {
        if (!api.window) {
          const err = new Error('No window associated with this application context');
          err.code = 'ENOWINDOW';
          throw err;
        }
        return api.window.getState();
      }
    });

    this.register({
      id: 'application.getInfo',
      description: 'Get application metadata for the current context',
      requiredPermissions: [PackagePermissions.APPLICATION_LIFECYCLE],
      risk: 'low',
      requiresApproval: false,
      validateArgs: () => ({ valid: true }),
      execute: async (api) => {
        if (api.app && typeof api.app.getInfo === 'function') {
          return api.app.getInfo();
        }
        return { appId: api.context.appId, pid: api.context.pid };
      }
    });

    // 2. Mutating Window Tools (Approval ALWAYS Required)
    this.register({
      id: 'window.focusSelf',
      description: 'Bring the application window to front and focus',
      requiredPermissions: [PackagePermissions.WINDOW_CONTROL],
      risk: 'medium',
      requiresApproval: true,
      validateArgs: () => ({ valid: true }),
      execute: async (api) => {
        if (!api.window) {
          const err = new Error('No window associated with this application context');
          err.code = 'ENOWINDOW';
          throw err;
        }
        return api.window.focus();
      }
    });

    this.register({
      id: 'window.minimizeSelf',
      description: 'Minimize the application window to the taskbar',
      requiredPermissions: [PackagePermissions.WINDOW_CONTROL],
      risk: 'medium',
      requiresApproval: true,
      validateArgs: () => ({ valid: true }),
      execute: async (api) => {
        if (!api.window) {
          const err = new Error('No window associated with this application context');
          err.code = 'ENOWINDOW';
          throw err;
        }
        return api.window.minimize();
      }
    });

    this.register({
      id: 'window.maximizeSelf',
      description: 'Maximize the application window to fill workspace',
      requiredPermissions: [PackagePermissions.WINDOW_CONTROL],
      risk: 'medium',
      requiresApproval: true,
      validateArgs: () => ({ valid: true }),
      execute: async (api) => {
        if (!api.window) {
          const err = new Error('No window associated with this application context');
          err.code = 'ENOWINDOW';
          throw err;
        }
        return api.window.maximize();
      }
    });

    this.register({
      id: 'window.restoreSelf',
      description: 'Restore the application window from minimized/maximized state',
      requiredPermissions: [PackagePermissions.WINDOW_CONTROL],
      risk: 'medium',
      requiresApproval: true,
      validateArgs: () => ({ valid: true }),
      execute: async (api) => {
        if (!api.window) {
          const err = new Error('No window associated with this application context');
          err.code = 'ENOWINDOW';
          throw err;
        }
        return api.window.restore();
      }
    });

    this.register({
      id: 'window.closeSelf',
      description: 'Close the application window',
      requiredPermissions: [PackagePermissions.WINDOW_CONTROL],
      risk: 'medium',
      requiresApproval: true,
      validateArgs: () => ({ valid: true }),
      execute: async (api) => {
        if (!api.window) {
          const err = new Error('No window associated with this application context');
          err.code = 'ENOWINDOW';
          throw err;
        }
        return api.window.close();
      }
    });

    // 3. Mutating Application Tools (Approval ALWAYS Required)
    this.register({
      id: 'application.exitSelf',
      description: 'Exit the application cleanly',
      requiredPermissions: [PackagePermissions.APPLICATION_LIFECYCLE],
      risk: 'medium',
      requiresApproval: true,
      validateArgs: (args) => {
        const exitCode = args.exitCode !== undefined ? Number(args.exitCode) : 0;
        if (isNaN(exitCode)) {
          return { valid: false, error: 'exitCode must be a number' };
        }
        return { valid: true };
      },
      execute: async (api, args) => {
        if (!api.app) {
          const err = new Error('No application runtime facade available in this context');
          err.code = 'ENOAPP';
          throw err;
        }
        return api.app.exit(args.exitCode !== undefined ? Number(args.exitCode) : 0);
      }
    });

    // 4. Mutating Process Termination Tool (Approval ALWAYS Required)
    this.register({
      id: 'process.terminateEligible',
      description: 'Terminate an eligible non-critical process',
      requiredPermissions: [PackagePermissions.PROCESS_TERMINATE],
      risk: 'high',
      requiresApproval: true,
      validateArgs: (args) => {
        const targetPid = Number(args.targetPid ?? args.pid);
        if (isNaN(targetPid) || targetPid <= 0) {
          return { valid: false, error: 'Valid positive targetPid required' };
        }
        if (targetPid === 0 || targetPid === 1) {
          return { valid: false, error: `Termination of critical system PID ${targetPid} is strictly prohibited` };
        }
        return { valid: true };
      },
      execute: async (api, args) => {
        const targetPid = Number(args.targetPid ?? args.pid);
        if (targetPid === 0 || targetPid === 1) {
          const err = new Error(`Termination of critical system PID ${targetPid} is strictly prohibited`);
          err.code = 'EPERM';
          throw err;
        }
        return api.process.terminate(targetPid);
      }
    });
  }

  /**
   * Register a tool definition.
   * @param {Object} tool
   */
  register(tool) {
    if (!tool || !tool.id) {
      throw new TypeError('Tool definition requires an id');
    }
    this.tools.set(tool.id, tool);
  }

  /**
   * Get a tool by ID.
   * @param {string} id
   * @returns {Object|null}
   */
  get(id) {
    return this.tools.get(id);
  }

  /**
   * Check if a tool exists.
   * @param {string} id
   * @returns {boolean}
   */
  has(id) {
    return this.tools.has(id);
  }

  /**
   * List all registered tools with public metadata.
   * @returns {Array<Object>}
   */
  listTools() {
    return Array.from(this.tools.values()).map(t => ({
      id: t.id,
      description: t.description,
      requiredPermissions: [...t.requiredPermissions],
      risk: t.risk,
      requiresApproval: t.requiresApproval
    }));
  }

  /**
   * Alias for listTools to get allowlisted tools.
   * @returns {Array<Object>}
   */
  getAllowlistedTools() {
    return this.listTools();
  }
}
