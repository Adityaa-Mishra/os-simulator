/**
 * Shell
 * Lightweight OS shell coordinator for AdityyaOS.
 * Connects Launcher, ApplicationRegistry, WindowManager, Taskbar, Notifications,
 * and handles shell keyboard shortcuts (Alt+Tab, Alt+F4).
 */

import { WindowManager } from './WindowManager.js';
import { ApplicationRegistry } from './ApplicationRegistry.js';
import { WindowEvents } from './WindowEvents.js';
import { WindowState } from './WindowState.js';

export class Shell {
  /**
   * @param {Object} options
   * @param {import('../desktop/Taskbar.js').Taskbar} options.taskbar
   * @param {import('../desktop/Notifications.js').Notifications} options.notifications
   * @param {HTMLElement} options.windowContainer - Layer for window mounting (.os-window-layer)
   * @param {WindowManager} [options.windowManager]
   * @param {ApplicationRegistry} [options.registry]
   */
  constructor({ taskbar, notifications, windowContainer, windowManager = null, registry = null, runtime = null }) {
    this.taskbar = taskbar;
    this.notifications = notifications;
    this.windowContainer = windowContainer;

    this.registry = registry || new ApplicationRegistry();
    this.windowManager = windowManager || new WindowManager({ container: windowContainer });
    if (this.registry) {
      if (!this.registry.windowManager) this.registry.windowManager = this.windowManager;
      if (!this.registry.kernel && this.windowManager?.kernel) this.registry.kernel = this.windowManager.kernel;
    }
    this.runtime = runtime || null;

    this.eventCleanups = [];
    this.keyboardCleanup = null;

    this.init();
  }

  /**
   * Initialize shell event bindings and taskbar synchronization.
   */
  init() {
    this.bindWindowManagerEvents();
    this.bindKeyboardShortcuts();
  }

  /**
   * Connect WindowManager events to Taskbar and Notifications.
   */
  bindWindowManagerEvents() {
    // Window created / opened -> add taskbar tab if not already present
    const onWindowOpened = ({ window }) => {
      if (this.taskbar && typeof this.taskbar.addWindowTab === 'function') {
        // Only add if tab doesn't already exist
        if (!this.taskbar.windowTabs?.has(window.id)) {
          this.taskbar.addWindowTab(
            window.id,
            window.title,
            window.icon,
            (winId) => this.handleTaskbarTabClick(winId)
          );
        }
        if (window.focused) {
          this.taskbar.setActiveWindowTab(window.id);
        }
      }
    };

    // Window focused -> highlight active taskbar tab
    const onWindowFocused = ({ window }) => {
      if (this.taskbar && typeof this.taskbar.setActiveWindowTab === 'function') {
        this.taskbar.setActiveWindowTab(window.id);
      }
    };

    // Window minimized -> un-highlight taskbar tab (tab remains present)
    const onWindowMinimized = () => {
      const activeWin = this.windowManager.getActiveWindow();
      if (this.taskbar && typeof this.taskbar.setActiveWindowTab === 'function') {
        this.taskbar.setActiveWindowTab(activeWin ? activeWin.id : null);
      }
    };

    // Window closed -> remove taskbar tab
    const onWindowClosed = ({ windowId }) => {
      if (this.taskbar && typeof this.taskbar.removeWindowTab === 'function') {
        this.taskbar.removeWindowTab(windowId);
      }
    };

    this.windowManager.events.on(WindowEvents.WINDOW_OPENED, onWindowOpened);
    this.windowManager.events.on(WindowEvents.WINDOW_FOCUSED, onWindowFocused);
    this.windowManager.events.on(WindowEvents.WINDOW_MINIMIZED, onWindowMinimized);
    this.windowManager.events.on(WindowEvents.WINDOW_CLOSED, onWindowClosed);

    this.eventCleanups.push(() => {
      this.windowManager.events.off(WindowEvents.WINDOW_OPENED, onWindowOpened);
      this.windowManager.events.off(WindowEvents.WINDOW_FOCUSED, onWindowFocused);
      this.windowManager.events.off(WindowEvents.WINDOW_MINIMIZED, onWindowMinimized);
      this.windowManager.events.off(WindowEvents.WINDOW_CLOSED, onWindowClosed);
    });
  }

  /**
   * Handle user clicking a window tab in the taskbar.
   * - If window is active & focused -> minimize it.
   * - If window is minimized -> restore & focus it.
   * - If window is open but not focused -> focus it.
   * @param {string} windowId
   */
  handleTaskbarTabClick(windowId) {
    const win = this.windowManager.getWindow(windowId);
    if (!win) return;

    if (win.focused && win.state !== WindowState.MINIMIZED) {
      this.windowManager.minimizeWindow(windowId);
    } else if (win.state === WindowState.MINIMIZED) {
      this.windowManager.restoreWindow(windowId);
    } else {
      this.windowManager.focusWindow(windowId);
    }
  }

  /**
   * Launch an application by its registered appId.
   * Resolves descriptor and view, and opens via WindowManager.
   * Re-launching an already-open singleton application brings its window to focus.
   * @param {string} appId
   * @param {Object} [options={}]
   * @returns {import('./WindowState.js').WindowModel|null}
   */
  launch(appId, options = {}) {
    // Check if runtime is available and has this appId registered
    if (this.runtime && typeof this.runtime.launch === 'function' && this.runtime.loader?.has(appId)) {
      try {
        const instance = this.runtime.launch(appId, options);
        return instance?.windowModel || null;
      } catch (err) {
        if (this.notifications) {
          this.notifications.show({
            title: 'Application Error',
            message: `Failed to launch "${appId}": ${err.message}`,
            type: 'error'
          });
        }
        return null;
      }
    }

    const app = this.registry.get(appId);
    if (!app) {
      if (this.notifications) {
        this.notifications.show({
          title: 'Application Error',
          message: `Application "${appId}" is not registered in AdityyaOS.`,
          type: 'error'
        });
      }
      return null;
    }

    // Check if singleton instance already exists and is not closed
    const existing = this.windowManager.findWindowByAppId(appId);
    if (existing && existing.state !== WindowState.CLOSED) {
      if (existing.state === WindowState.MINIMIZED) {
        this.windowManager.restoreWindow(existing.id);
      } else {
        this.windowManager.focusWindow(existing.id);
      }
      return existing;
    }

    // Create view from factory
    const view = typeof app.createView === 'function'
      ? app.createView({ windowManager: this.windowManager, kernel: this.windowManager?.kernel || this.registry?.kernel, ...options })
      : null;

    // Open new window
    return this.windowManager.openWindow({
      appId: app.id,
      title: app.name,
      icon: app.icon,
      width: app.defaultWidth,
      height: app.defaultHeight,
      singleton: app.singleton,
      view
    });
  }

  /**
   * Bind shell-level keyboard shortcuts:
   * - Alt + Tab: Cycles through open, non-minimized windows.
   * - Alt + F4: Closes the active window.
   */
  bindKeyboardShortcuts() {
    const onKeyDown = (e) => {
      // Alt + Tab: Cycle through open, non-minimized windows
      if (e.altKey && e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();

        const visibleWindows = this.windowManager.getWindows(
          w => w.state !== WindowState.MINIMIZED && w.state !== WindowState.CLOSED
        );

        if (visibleWindows.length > 1) {
          const currentIndex = visibleWindows.findIndex(w => w.id === this.windowManager.activeWindowId);
          const nextIndex = (currentIndex + 1) % visibleWindows.length;
          this.windowManager.focusWindow(visibleWindows[nextIndex].id);
        }
        return;
      }

      // Alt + F4: Close the active window
      if (e.altKey && (e.key === 'F4' || e.code === 'F4')) {
        e.preventDefault();
        e.stopPropagation();

        const activeWin = this.windowManager.getActiveWindow();
        if (activeWin) {
          this.windowManager.closeWindow(activeWin.id);
        }
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', onKeyDown);

      this.keyboardCleanup = () => {
        window.removeEventListener('keydown', onKeyDown);
        this.keyboardCleanup = null;
      };
    }
  }

  /**
   * Centralized cleanup for Shell and all its managed subsystems.
   * Shell.destroy() -> WindowManager destroys windows -> Window destroys listeners/DOM -> Taskbar removes window entries.
   */
  destroy() {
    if (typeof this.keyboardCleanup === 'function') {
      this.keyboardCleanup();
    }

    for (const cleanup of this.eventCleanups) {
      try {
        cleanup();
      } catch (err) {
        console.error('[Shell] Error in event cleanup:', err);
      }
    }
    this.eventCleanups = [];

    // Destroy window manager and all windows
    if (this.windowManager) {
      // Clear taskbar tabs for all windows
      const openWindows = this.windowManager.getWindows();
      for (const win of openWindows) {
        if (this.taskbar && typeof this.taskbar.removeWindowTab === 'function') {
          this.taskbar.removeWindowTab(win.id);
        }
      }
      this.windowManager.destroy();
    }

    this.taskbar = null;
    this.notifications = null;
    this.windowContainer = null;
  }
}
