/**
 * ApplicationRegistry
 * Central catalog of registered AdityyaOS applications.
 * Resolves application IDs to descriptors and interactive views.
 */

import { SYSTEM_APPLICATIONS } from '../desktop/Launcher.js';
import { escapeHtml } from '../../utils/sanitize.js';
import { Terminal } from '../terminal/Terminal.js';
import { kernel as defaultKernel } from '../kernel/Kernel.js';
import { FileManager } from '../apps/files/FileManager.js';
import { TextEditor } from '../apps/editor/TextEditor.js';
import { SettingsApp } from '../apps/settings/SettingsApp.js';
import { Calculator } from '../apps/calculator/Calculator.js';
import { NotesApp } from '../apps/notes/NotesApp.js';
import { BrowserApp } from '../apps/browser/BrowserApp.js';
import { TaskManagerApp } from '../apps/task-manager/TaskManagerApp.js';
import { SystemMonitorApp } from '../apps/system-monitor/SystemMonitorApp.js';
import { ImageViewerApp } from '../apps/image-viewer/ImageViewerApp.js';
import { APIContext } from '../api/APIContext.js';
import { AdityyaOSAPI } from '../api/AdityyaOSAPI.js';
import { PackagePermissions } from '../packages/PackagePermissions.js';

export class ApplicationRegistry {
  constructor(options = {}) {
    this.kernel = options.kernel || null;
    this.windowManager = options.windowManager || null;
    this.apps = new Map();
    this.initDefaultApplications();
  }

  /**
   * Initialize default system application descriptors.
   * All default applications are explicitly marked as singleton: true.
   */
  initDefaultApplications() {
    for (const app of SYSTEM_APPLICATIONS) {
      this.register({
        ...app,
        singleton: true,
        defaultWidth: this.getDefaultWidth(app.id),
        defaultHeight: this.getDefaultHeight(app.id),
        createView: (context) => this.createAppView(app, context)
      });
    }
  }

  /**
   * Get default window width for an application.
   * @param {string} appId
   * @returns {number}
   */
  getDefaultWidth(appId) {
    switch (appId) {
      case 'files': return 680;
      case 'terminal': return 640;
      case 'settings': return 620;
      case 'browser': return 720;
      case 'notes': return 640;
      case 'calculator': return 320;
      case 'taskmanager':
      case 'task-manager': return 640;
      case 'systemmonitor':
      case 'system-monitor': return 660;
      case 'text-editor':
      case 'editor': return 640;
      case 'image-viewer': return 600;
      default: return 620;
    }
  }

  /**
   * Get default window height for an application.
   * @param {string} appId
   * @returns {number}
   */
  getDefaultHeight(appId) {
    switch (appId) {
      case 'files': return 460;
      case 'terminal': return 440;
      case 'settings': return 440;
      case 'browser': return 480;
      case 'notes': return 440;
      case 'calculator': return 440;
      case 'taskmanager':
      case 'task-manager': return 440;
      case 'systemmonitor':
      case 'system-monitor': return 460;
      case 'text-editor':
      case 'editor': return 460;
      case 'image-viewer': return 440;
      default: return 420;
    }
  }

  /**
   * Get default permissions for an application.
   * @param {string} appId
   * @returns {Array<string>}
   */
  getDefaultPermissions(appId) {
    switch (appId) {
      case 'files':
      case 'file-manager':
      case 'notes':
      case 'text-editor':
      case 'editor':
        return [
          PackagePermissions.FILESYSTEM_READ,
          PackagePermissions.FILESYSTEM_WRITE,
          PackagePermissions.WINDOW_CONTROL,
          PackagePermissions.APPLICATION_LIFECYCLE
        ];
      case 'settings':
        return [
          PackagePermissions.SYSTEM_READ,
          PackagePermissions.FILESYSTEM_READ,
          PackagePermissions.MEMORY_READ,
          PackagePermissions.PROFILE_READ,
          PackagePermissions.PROFILE_WRITE,
          PackagePermissions.NETWORK_READ,
          PackagePermissions.WINDOW_CONTROL,
          PackagePermissions.APPLICATION_LIFECYCLE
        ];
      case 'browser':
        return [
          PackagePermissions.NETWORK_READ,
          PackagePermissions.NETWORK_CONNECT,
          PackagePermissions.FILESYSTEM_READ,
          PackagePermissions.FILESYSTEM_WRITE,
          PackagePermissions.WINDOW_CONTROL,
          PackagePermissions.APPLICATION_LIFECYCLE
        ];
      case 'calculator':
      case 'calc':
        return [
          PackagePermissions.WINDOW_CONTROL,
          PackagePermissions.APPLICATION_LIFECYCLE
        ];
      case 'taskmanager':
      case 'task-manager':
        return [
          PackagePermissions.PROCESS_READ,
          PackagePermissions.PROCESS_TERMINATE,
          PackagePermissions.MEMORY_READ,
          PackagePermissions.SYSTEM_READ,
          PackagePermissions.WINDOW_CONTROL,
          PackagePermissions.APPLICATION_LIFECYCLE
        ];
      case 'systemmonitor':
      case 'system-monitor':
        return [
          PackagePermissions.SYSTEM_READ,
          PackagePermissions.MEMORY_READ,
          PackagePermissions.PROCESS_READ,
          PackagePermissions.WINDOW_CONTROL,
          PackagePermissions.APPLICATION_LIFECYCLE
        ];
      case 'image-viewer':
        return [
          PackagePermissions.FILESYSTEM_READ,
          PackagePermissions.WINDOW_CONTROL,
          PackagePermissions.APPLICATION_LIFECYCLE
        ];
      default:
        return [
          PackagePermissions.SYSTEM_READ,
          PackagePermissions.FILESYSTEM_READ,
          PackagePermissions.WINDOW_CONTROL,
          PackagePermissions.APPLICATION_LIFECYCLE
        ];
    }
  }

  /**
   * Create an interactive application view adapter for a registered app.
   * @param {Object} app
   * @param {Object} [context]
   * @returns {{ mount: Function, unmount: Function }}
   */
  createAppView(app, context = {}) {
    const kernel = this.kernel || context?.kernel || defaultKernel;
    const windowManager = this.windowManager || context?.windowManager;

    let appInstance = null;
    let apiInstance = null;
    let pid = null;

    return {
      mount: (container) => {
        // 1. Create simulated process in ProcessManager if available
        // Terminal manages its own process in Terminal.js
        if (app.id !== 'terminal' && kernel?.processManager && typeof kernel.processManager.createProcess === 'function') {
          try {
            const proc = kernel.processManager.createProcess({
              name: app.name || app.id,
              priority: 1,
              memoryRequired: app.memoryRequired || 16
            });
            pid = proc?.data?.pid ?? proc?.pid ?? null;
          } catch (err) {
            // Non-fatal process creation fallback
          }
        }

        // 2. Determine permissions for this application
        const permissions = app.permissions || this.getDefaultPermissions(app.id);

        // 3. Create APIContext and AdityyaOSAPI
        const apiContext = new APIContext({
          appId: app.id,
          instanceId: `${app.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          pid: pid || 10,
          username: kernel?.state?.system?.user || 'user',
          permissions,
          cwd: '/home/user'
        });

        apiInstance = new AdityyaOSAPI({
          kernel,
          context: apiContext,
          windowManager
        });

        // 4. Instantiate the corresponding interactive application controller
        const options = { ...context, initialPath: '/home/user' };

        switch (app.id) {
          case 'files':
          case 'file-manager':
            appInstance = new FileManager(apiInstance, container, options);
            break;
          case 'terminal': {
            const term = new Terminal({
              kernel,
              windowManager,
              api: apiInstance
            });
            appInstance = term;
            const view = term.createView();
            view.mount(container);
            break;
          }
          case 'settings':
            appInstance = new SettingsApp(apiInstance, container, options);
            break;
          case 'browser':
            appInstance = new BrowserApp(apiInstance, container, options);
            break;
          case 'notes':
            appInstance = new NotesApp(apiInstance, container, options);
            break;
          case 'calculator':
          case 'calc':
            appInstance = new Calculator(apiInstance, container, options);
            break;
          case 'taskmanager':
          case 'task-manager':
            appInstance = new TaskManagerApp(apiInstance, container, options);
            break;
          case 'systemmonitor':
          case 'system-monitor':
            appInstance = new SystemMonitorApp(apiInstance, container, options);
            break;
          case 'editor':
          case 'text-editor':
            appInstance = new TextEditor(apiInstance, container, options);
            break;
          case 'image-viewer':
            appInstance = new ImageViewerApp(apiInstance, container, options);
            break;
          default:
            if (typeof app.entry === 'function') {
              appInstance = app.entry(apiInstance, container, options);
            } else {
              const ph = this.createPlaceholderView(app);
              ph.mount(container);
              appInstance = ph;
            }
            break;
        }
      },
      unmount: () => {
        if (appInstance) {
          if (typeof appInstance.destroy === 'function') {
            try { appInstance.destroy(); } catch {}
          } else if (typeof appInstance.unmount === 'function') {
            try { appInstance.unmount(); } catch {}
          }
          appInstance = null;
        }

        if (apiInstance && typeof apiInstance.destroy === 'function') {
          try { apiInstance.destroy(); } catch {}
          apiInstance = null;
        }

        if (pid && kernel?.processManager && typeof kernel.processManager.terminateProcess === 'function') {
          try {
            kernel.processManager.terminateProcess(pid);
          } catch {}
          pid = null;
        }
      }
    };
  }

  /**
   * Register an application descriptor.
   * @param {Object} appDef
   * @param {string} appDef.id
   * @param {string} appDef.name
   * @param {string} appDef.icon
   * @param {string} [appDef.category='Utilities']
   * @param {string} [appDef.description='']
   * @param {boolean} [appDef.singleton=true]
   * @param {number} [appDef.defaultWidth=620]
   * @param {number} [appDef.defaultHeight=420]
   * @param {Function} [appDef.createView]
   */
  register(appDef) {
    if (!appDef.id) throw new Error('Application definition requires an id');

    this.apps.set(appDef.id, {
      id: appDef.id,
      name: appDef.name || appDef.id,
      icon: appDef.icon || '📄',
      category: appDef.category || 'Utilities',
      description: appDef.description || '',
      singleton: appDef.singleton !== false,
      defaultWidth: appDef.defaultWidth || this.getDefaultWidth(appDef.id),
      defaultHeight: appDef.defaultHeight || this.getDefaultHeight(appDef.id),
      createView: appDef.createView || ((context) => this.createAppView(appDef, context))
    });
  }

  /**
   * Get an application definition by id.
   * Also transparently resolves aliases (e.g. text-editor, editor, image-viewer, task-manager, system-monitor).
   * @param {string} appId
   * @returns {Object|null}
   */
  get(appId) {
    if (this.apps.has(appId)) {
      return this.apps.get(appId);
    }

    // Dynamic resolution for native apps & aliases
    if (appId === 'text-editor' || appId === 'editor') {
      return {
        id: appId,
        name: 'Text Editor',
        icon: '📝',
        category: 'Productivity',
        description: 'AdityyaFS text document editor',
        singleton: false,
        defaultWidth: 640,
        defaultHeight: 460,
        createView: (context) => this.createAppView({ id: 'text-editor', name: 'Text Editor' }, context)
      };
    }
    if (appId === 'image-viewer') {
      return {
        id: 'image-viewer',
        name: 'Image Viewer',
        icon: '🖼️',
        category: 'Media',
        description: 'AdityyaFS image viewer',
        singleton: false,
        defaultWidth: 600,
        defaultHeight: 440,
        createView: (context) => this.createAppView({ id: 'image-viewer', name: 'Image Viewer' }, context)
      };
    }
    if (appId === 'task-manager' && this.apps.has('taskmanager')) {
      return { ...this.apps.get('taskmanager'), id: 'task-manager' };
    }
    if (appId === 'system-monitor' && this.apps.has('systemmonitor')) {
      return { ...this.apps.get('systemmonitor'), id: 'system-monitor' };
    }
    if (appId === 'calc' && this.apps.has('calculator')) {
      return { ...this.apps.get('calculator'), id: 'calc' };
    }
    if (appId === 'file-manager' && this.apps.has('files')) {
      return { ...this.apps.get('files'), id: 'file-manager' };
    }

    return null;
  }

  /**
   * Check if an application is registered.
   * @param {string} appId
   * @returns {boolean}
   */
  has(appId) {
    if (this.apps.has(appId)) return true;
    return ['text-editor', 'editor', 'image-viewer', 'task-manager', 'system-monitor', 'calc', 'file-manager'].includes(appId);
  }

  /**
   * Get all registered application definitions.
   * @returns {Array<Object>}
   */
  getAll() {
    return Array.from(this.apps.values());
  }

  /**
   * Generate a clean, responsive placeholder view for Phase 14 applications.
   * Kept for fallback and backward compatibility with earlier phase tests.
   * @param {Object} app
   * @returns {{ mount: Function, unmount: Function }}
   */
  createPlaceholderView(app) {
    let mountPoint = null;

    return {
      mount(container) {
        mountPoint = container;
        container.innerHTML = `
          <div class="os-app-placeholder" role="region" aria-label="${escapeHtml(app.name)} Placeholder">
            <div class="os-placeholder-card">
              <div class="os-placeholder-icon" aria-hidden="true">${escapeHtml(app.icon || '📄')}</div>
              <h2 class="os-placeholder-title">${escapeHtml(app.name || 'Application')}</h2>
              <div class="os-placeholder-badge">${escapeHtml(app.category || 'System')}</div>
              <p class="os-placeholder-desc">
                ${escapeHtml(app.description || 'Simulated OS Application')}
              </p>
              <div class="os-placeholder-notice">
                <span class="os-notice-icon">ℹ️</span>
                <span>
                  <strong>Window Container Active</strong><br>
                  This application is running inside an OS-managed window. Full application features and interactive tools will be integrated in subsequent phases.
                </span>
              </div>
            </div>
          </div>
        `;
      },
      unmount() {
        if (mountPoint) {
          mountPoint.innerHTML = '';
          mountPoint = null;
        }
      }
    };
  }
}
