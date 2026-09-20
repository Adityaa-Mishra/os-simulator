/**
 * public/js/os/runtime/ApplicationRuntime.js
 * Central Application Runtime for AdityyaOS.
 * Orchestrates application registration, lifecycle transitions, process mapping,
 * window mounting, controlled API provisioning, and isolated failure containment.
 */

import { ApplicationLoader } from './ApplicationLoader.js';
import { ApplicationState } from './ApplicationState.js';
import { ApplicationInstance } from './ApplicationInstance.js';
import { ApplicationContext } from './ApplicationContext.js';
import { RuntimeEvents } from './RuntimeEvents.js';
import { APIContext } from '../api/APIContext.js';
import { AdityyaOSAPI } from '../api/AdityyaOSAPI.js';
import { APIEvents } from '../api/APIEvents.js';
import { OSEvents } from '../kernel/OSEventEmitter.js';
import { WindowEvents } from '../shell/WindowEvents.js';

export class ApplicationRuntime {
  /**
   * @param {Object} options
   * @param {import('../kernel/Kernel.js').Kernel} options.kernel
   * @param {import('../shell/WindowManager.js').WindowManager} [options.windowManager]
   * @param {import('./ApplicationLoader.js').ApplicationLoader} [options.loader]
   */
  constructor({ kernel, windowManager = null, loader = null }) {
    if (!kernel) {
      throw new TypeError('ApplicationRuntime requires a Kernel instance');
    }

    this.kernel = kernel;
    this.windowManager = windowManager;
    this.loader = loader || new ApplicationLoader();
    this.instances = new Map(); // instanceId -> ApplicationInstance
    this.events = kernel.events;

    this._instanceCounter = 0;
    this._isTerminatingFromWindow = false;

    this._bindKernelEvents();
  }

  /**
   * Bind to OS and Window lifecycle events for automatic cleanup synchronization.
   * @private
   */
  _bindKernelEvents() {
    // Synchronize if a process is terminated directly via ProcessManager
    if (this.events) {
      this.events.on(OSEvents.PROCESS_TERMINATED, ({ pid }) => {
        for (const instance of this.instances.values()) {
          if (instance.pid === pid &&
              instance.state !== ApplicationState.TERMINATED &&
              instance.state !== ApplicationState.FAILED &&
              instance.state !== ApplicationState.TERMINATING) {
            this.terminate(instance.instanceId, 0);
          }
        }
      });
    }

    // Synchronize if a window is closed directly via WindowManager
    if (this.windowManager?.events) {
      this.windowManager.events.on(WindowEvents.WINDOW_CLOSED, ({ windowId }) => {
        if (this._isTerminatingFromWindow) return;
        for (const instance of this.instances.values()) {
          if (instance.windowModel?.id === windowId &&
              instance.state !== ApplicationState.TERMINATED &&
              instance.state !== ApplicationState.FAILED &&
              instance.state !== ApplicationState.TERMINATING) {
            this.terminate(instance.instanceId, 0);
          }
        }
      });
    }
  }

  /**
   * Register an application definition.
   * @param {Object} definition
   * @returns {boolean}
   */
  registerApplication(definition) {
    this.loader.register(definition);
    if (this.events) {
      this.events.emit(RuntimeEvents.APP_REGISTERED, {
        appId: definition.id,
        definition: this.loader.get(definition.id)
      });
    }
    return true;
  }

  /**
   * Unregister an application definition.
   * @param {string} appId
   * @returns {boolean}
   */
  unregisterApplication(appId) {
    // Terminate any active instances of this application
    const activeInstances = this.getInstancesByAppId(appId);
    for (const instance of activeInstances) {
      if (instance.state !== ApplicationState.TERMINATED && instance.state !== ApplicationState.FAILED) {
        this.terminate(instance.instanceId, 1);
      }
    }

    const removed = this.loader.unregister(appId);
    if (removed && this.events) {
      this.events.emit(RuntimeEvents.APP_UNREGISTERED, { appId });
    }
    return removed;
  }

  /**
   * Launch an application by appId.
   * Coordinates process creation, window mounting, API context provisioning, and entry execution.
   * @param {string} appId
   * @param {Object} [options={}]
   * @returns {ApplicationInstance}
   */
  launch(appId, options = {}) {
    const def = this.loader.get(appId);
    if (!def) {
      throw new Error(`Application "${appId}" is not registered`);
    }

    // Singleton management: if application is singleton, focus existing instance if active
    const isSingleton = def.window?.singleton !== false && options.singleton !== false;
    if (isSingleton) {
      const existing = this.getInstancesByAppId(appId).find(inst =>
        inst.state !== ApplicationState.TERMINATED && inst.state !== ApplicationState.FAILED
      );
      if (existing) {
        if (existing.state === ApplicationState.SUSPENDED) {
          this.resume(existing.instanceId);
        }
        if (existing.windowModel && this.windowManager) {
          this.windowManager.focusWindow(existing.windowModel.id);
        }
        return existing;
      }
    }

    // 1. Create simulated OS Process
    const procRes = this.kernel.processManager.createProcess({
      name: def.name || appId,
      priority: options.priority || 1,
      memoryRequired: def.memoryRequired || 0
    });

    if (!procRes.success) {
      throw new Error(`Failed to create process for "${appId}": ${procRes.error}`);
    }

    const pid = procRes.data.pid;

    // Allocate memory if required
    if (def.memoryRequired > 0 && this.kernel.memoryManager) {
      this.kernel.memoryManager.allocate(pid, def.memoryRequired);
    }

    // 2. Generate unique instance ID
    const instanceId = `${appId}-${++this._instanceCounter}`;

    if (this.events) {
      this.events.emit(RuntimeEvents.APP_LAUNCHING, { appId, instanceId, pid });
    }

    // 3. Create Window (if not headless)
    const isHeadless = Boolean(options.headless || def.headless);
    let windowModel = null;
    let container = null;

    if (!isHeadless && this.windowManager) {
      const winTitle = def.window?.title || def.name || appId;
      const winIcon = def.window?.icon || '📦';
      const winWidth = def.window?.width || 640;
      const winHeight = def.window?.height || 420;

      windowModel = this.windowManager.createWindow({
        appId,
        title: winTitle,
        icon: winIcon,
        width: winWidth,
        height: winHeight,
        singleton: false
      });

      this.windowManager.openWindow({ id: windowModel.id });
      const rendered = this.windowManager.renderedWindows.get(windowModel.id);
      container = rendered?.contentEl || null;
    }

    // 4. Create APIContext and AdityyaOSAPI
    const apiContext = new APIContext({
      appId,
      instanceId,
      pid,
      username: this.kernel.state?.system?.user || 'user',
      permissions: Array.isArray(def.permissions) ? def.permissions : undefined,
      cwd: options.cwd || '/home/user'
    });

    const api = new AdityyaOSAPI({
      kernel: this.kernel,
      context: apiContext,
      windowManager: this.windowManager,
      windowModel,
      runtime: this
    });

    // 5. Create ApplicationContext and ApplicationInstance
    const appCtx = new ApplicationContext({
      instanceId,
      appId,
      pid,
      apiContext,
      api,
      windowModel
    });

    const instance = new ApplicationInstance({
      instanceId,
      appId,
      pid,
      definition: def,
      context: appCtx,
      windowModel,
      initialState: ApplicationState.READY
    });

    this.instances.set(instanceId, instance);

    if (this.events) {
      this.events.emit(RuntimeEvents.APP_LOADED, { appId, instanceId, pid });
    }

    // 6. Execute application entry function with failure containment
    try {
      instance.setState(ApplicationState.RUNNING);

      if (this.events) {
        this.events.emit(RuntimeEvents.APP_STARTED, { appId, instanceId, pid });
      }

      const result = def.entry(api, container, options);
      if (result && typeof result.then === 'function') {
        result.catch(err => {
          this._handleInstanceError(instance, err);
        });
      }
    } catch (err) {
      this._handleInstanceError(instance, err);
    }

    return instance;
  }

  /**
   * Handle an application failure/crash with strict containment.
   * The faulting application is halted and cleaned up without crashing the Kernel.
   * @private
   * @param {ApplicationInstance} instance
   * @param {Error} error
   */
  _handleInstanceError(instance, error) {
    instance.error = error;

    try {
      instance.setState(ApplicationState.FAILED);
    } catch {
      // Ignore invalid transition if already in terminal state
    }

    if (this.events) {
      this.events.emit(RuntimeEvents.APP_ERROR, {
        appId: instance.appId,
        instanceId: instance.instanceId,
        pid: instance.pid,
        error: { message: error?.message, name: error?.name, stack: error?.stack }
      });
      this.events.emit(RuntimeEvents.APP_FAILED, {
        appId: instance.appId,
        instanceId: instance.instanceId,
        pid: instance.pid,
        error: { message: error?.message, name: error?.name }
      });
    }

    // Clean up instance resources
    this._cleanupInstanceResources(instance);
  }

  /**
   * Clean up OS resources held by an application instance.
   * @private
   * @param {ApplicationInstance} instance
   */
  _cleanupInstanceResources(instance) {
    // 1. Destroy application API (cleans up event listeners)
    if (instance.context) {
      instance.context.destroy();
    }

    // 2. Close any open file descriptors owned by this PID
    if (this.kernel?.fileSystemManager) {
      this.kernel.fileSystemManager.closeProcessDescriptors(instance.pid);
    }

    // 3. Terminate simulated OS process
    if (this.kernel?.processManager) {
      this.kernel.processManager.terminateProcess(instance.pid);
    }

    // 4. Close associated window if open
    if (instance.windowModel && this.windowManager) {
      this._isTerminatingFromWindow = true;
      try {
        this.windowManager.closeWindow(instance.windowModel.id);
      } finally {
        this._isTerminatingFromWindow = false;
      }
    }
  }

  /**
   * Suspend an active application instance.
   * @param {string} instanceId
   * @returns {boolean}
   */
  suspend(instanceId) {
    const instance = this.instances.get(instanceId);
    if (!instance || instance.state !== ApplicationState.RUNNING) {
      return false;
    }

    instance.setState(ApplicationState.SUSPENDED);
    this.kernel.processManager.suspendProcess(instance.pid);

    if (this.events) {
      this.events.emit(RuntimeEvents.APP_SUSPENDED, {
        appId: instance.appId,
        instanceId: instance.instanceId,
        pid: instance.pid
      });
    }

    return true;
  }

  /**
   * Resume a suspended application instance.
   * @param {string} instanceId
   * @returns {boolean}
   */
  resume(instanceId) {
    const instance = this.instances.get(instanceId);
    if (!instance || instance.state !== ApplicationState.SUSPENDED) {
      return false;
    }

    instance.setState(ApplicationState.RUNNING);
    this.kernel.processManager.resumeProcess(instance.pid);

    if (this.events) {
      this.events.emit(RuntimeEvents.APP_RESUMED, {
        appId: instance.appId,
        instanceId: instance.instanceId,
        pid: instance.pid
      });
    }

    return true;
  }

  /**
   * Terminate an application instance with full resource reclamation.
   * @param {string} instanceId
   * @param {number} [exitCode=0]
   * @returns {boolean}
   */
  terminate(instanceId, exitCode = 0) {
    const instance = this.instances.get(instanceId);
    if (!instance ||
        instance.state === ApplicationState.TERMINATED ||
        instance.state === ApplicationState.FAILED) {
      return false;
    }

    if (this.events) {
      this.events.emit(RuntimeEvents.APP_TERMINATING, {
        appId: instance.appId,
        instanceId: instance.instanceId,
        pid: instance.pid,
        exitCode
      });
    }

    try {
      instance.setState(ApplicationState.TERMINATING);
    } catch {
      // Proceed with termination cleanup even if transition throws
    }

    this._cleanupInstanceResources(instance);

    try {
      instance.setState(ApplicationState.TERMINATED);
    } catch {
      instance.state = ApplicationState.TERMINATED;
    }

    instance.exitCode = exitCode;

    if (this.events) {
      this.events.emit(RuntimeEvents.APP_TERMINATED, {
        appId: instance.appId,
        instanceId: instance.instanceId,
        pid: instance.pid,
        exitCode
      });
    }

    return true;
  }

  /**
   * Get an application instance by instance ID.
   * @param {string} instanceId
   * @returns {ApplicationInstance|null}
   */
  getInstance(instanceId) {
    return this.instances.get(instanceId) || null;
  }

  /**
   * Get all tracked application instances.
   * @returns {Array<ApplicationInstance>}
   */
  getInstances() {
    return Array.from(this.instances.values());
  }

  /**
   * Get all instances belonging to a specific application definition.
   * @param {string} appId
   * @returns {Array<ApplicationInstance>}
   */
  getInstancesByAppId(appId) {
    return this.getInstances().filter(inst => inst.appId === appId);
  }
}
