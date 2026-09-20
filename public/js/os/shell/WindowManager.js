/**
 * WindowManager
 * Central coordinator and authoritative state store for all OS windows in AdityyaOS.
 * Manages window lifecycles, focus, z-index hierarchy, geometry, and events.
 */

import { WindowModel, WindowState } from './WindowState.js';
import { WindowEvents } from './WindowEvents.js';
import { Window } from './Window.js';
import { OSEventEmitter } from '../kernel/OSEventEmitter.js';

export class WindowManager {
  /**
   * @param {Object} [options]
   * @param {HTMLElement} [options.container] - Desktop workspace / window layer element
   * @param {OSEventEmitter} [options.events]
   */
  constructor(options = {}) {
    this.container = options.container || null;
    this.events = options.events || new OSEventEmitter();

    this.windows = new Map(); // id -> WindowModel (Authoritative logical state)
    this.renderedWindows = new Map(); // id -> Window (DOM layer)
    this.activeWindowId = null;
    this.topZIndex = 100;
    this.nextWindowId = 1;
  }

  /**
   * Set or update the DOM mount container for windows.
   * @param {HTMLElement} container
   */
  setContainer(container) {
    this.container = container;
  }

  /**
   * Get workspace dimensions from container element.
   * @returns {{ width: number, height: number }}
   */
  getWorkspaceBounds() {
    if (this.container && this.container.clientWidth > 0 && this.container.clientHeight > 0) {
      return {
        width: this.container.clientWidth,
        height: this.container.clientHeight
      };
    }
    // Safe fallback if container is detached or in test environment
    return { width: 1024, height: 600 };
  }

  /**
   * Calculate a staggered cascading position for a new window.
   * @param {number} count
   * @returns {{ x: number, y: number }}
   */
  cascadePosition(count = this.windows.size) {
    const step = 28;
    const maxSteps = 8;
    const offset = (count % maxSteps) * step;
    return {
      x: 40 + offset,
      y: 30 + offset
    };
  }

  /**
   * Create a new window model.
   * If the application is marked singleton: true and already exists, returns the existing window.
   * @param {Object} options
   * @returns {WindowModel}
   */
  createWindow(options = {}) {
    if (!options.appId) {
      throw new Error('createWindow requires an appId');
    }

    // Check for existing singleton application instance
    const isSingleton = options.singleton !== false;
    if (isSingleton) {
      const existing = this.findWindowByAppId(options.appId);
      if (existing && existing.state !== WindowState.CLOSED) {
        return existing;
      }
    }

    const id = options.id || `win-${this.nextWindowId++}`;
    const cascade = this.cascadePosition(this.windows.size);

    const model = new WindowModel({
      id,
      appId: options.appId,
      title: options.title || 'Window',
      icon: options.icon || '📄',
      x: typeof options.x === 'number' ? options.x : cascade.x,
      y: typeof options.y === 'number' ? options.y : cascade.y,
      width: options.width || 640,
      height: options.height || 420,
      minWidth: options.minWidth || 280,
      minHeight: options.minHeight || 200,
      state: WindowState.NORMAL,
      zIndex: ++this.topZIndex,
      focused: false,
      visible: true,
      singleton: isSingleton
    });

    this.windows.set(id, model);
    this.events.emit(WindowEvents.WINDOW_CREATED, { window: model });

    return model;
  }

  /**
   * Open an application window. Creates the window if needed, mounts view, and brings to focus.
   * @param {Object} options
   * @returns {WindowModel}
   */
  openWindow(options = {}) {
    let model = options.id ? this.windows.get(options.id) : null;

    if (!model) {
      model = this.createWindow(options);
    }

    // Restore if minimized
    if (model.state === WindowState.MINIMIZED) {
      model.state = WindowState.NORMAL;
      model.visible = true;
      this.events.emit(WindowEvents.WINDOW_RESTORED, { window: model });
    }

    // Render DOM if container is available and not yet rendered
    if (this.container && !this.renderedWindows.has(model.id)) {
      const rendered = new Window({
        model,
        windowManager: this,
        container: this.container,
        view: options.view || null
      });
      this.renderedWindows.set(model.id, rendered);
    }

    this.events.emit(WindowEvents.WINDOW_OPENED, { window: model });
    this.focusWindow(model.id);

    return model;
  }

  /**
   * Focus a window, elevating its z-index and active state.
   * @param {string} id
   * @returns {boolean}
   */
  focusWindow(id) {
    const target = this.windows.get(id);
    if (!target || target.state === WindowState.CLOSED || target.state === WindowState.MINIMIZED) {
      return false;
    }

    if (this.activeWindowId === id && target.focused) {
      return true;
    }

    // Blur current active window
    if (this.activeWindowId && this.activeWindowId !== id) {
      const currentActive = this.windows.get(this.activeWindowId);
      if (currentActive) {
        currentActive.focused = false;
        this.syncRenderedWindow(currentActive.id);
        this.events.emit(WindowEvents.WINDOW_BLURRED, { window: currentActive });
      }
    }

    // Elevate target window
    target.zIndex = ++this.topZIndex;
    target.focused = true;
    this.activeWindowId = id;

    this.syncRenderedWindow(target.id);
    this.events.emit(WindowEvents.WINDOW_FOCUSED, { window: target });
    this.events.emit(WindowEvents.ACTIVE_WINDOW_CHANGED, { window: target });

    return true;
  }

  /**
   * Minimize a window.
   * @param {string} id
   * @returns {boolean}
   */
  minimizeWindow(id) {
    const target = this.windows.get(id);
    if (!target || target.state === WindowState.CLOSED || target.state === WindowState.MINIMIZED) {
      return false;
    }

    const wasActive = this.activeWindowId === id;
    if (wasActive) {
      this.activeWindowId = null;
    }

    target.state = WindowState.MINIMIZED;
    target.visible = false;
    target.focused = false;

    this.syncRenderedWindow(target.id);
    this.events.emit(WindowEvents.WINDOW_MINIMIZED, { window: target });

    // If active window was minimized, focus the next highest visible window
    if (wasActive) {
      this.focusNextHighestWindow();
    }

    return true;
  }

  /**
   * Restore a window from minimized or maximized state to normal geometry.
   * @param {string} id
   * @returns {boolean}
   */
  restoreWindow(id) {
    const target = this.windows.get(id);
    if (!target || target.state === WindowState.CLOSED) {
      return false;
    }

    if (target.state === WindowState.MAXIMIZED && target.prevGeometry) {
      target.x = target.prevGeometry.x;
      target.y = target.prevGeometry.y;
      target.width = target.prevGeometry.width;
      target.height = target.prevGeometry.height;
      target.prevGeometry = null;
    }

    target.state = WindowState.NORMAL;
    target.visible = true;

    this.syncRenderedWindow(target.id);
    this.focusWindow(target.id);
    this.events.emit(WindowEvents.WINDOW_RESTORED, { window: target });

    return true;
  }

  /**
   * Maximize a window to occupy the usable desktop workspace.
   * @param {string} id
   * @returns {boolean}
   */
  maximizeWindow(id) {
    const target = this.windows.get(id);
    if (!target || target.state === WindowState.CLOSED) {
      return false;
    }

    if (target.state !== WindowState.MAXIMIZED) {
      // Save current geometry for restore
      target.prevGeometry = {
        x: target.x,
        y: target.y,
        width: target.width,
        height: target.height
      };
    }

    target.state = WindowState.MAXIMIZED;
    target.visible = true;

    this.syncRenderedWindow(target.id);
    this.focusWindow(target.id);
    this.events.emit(WindowEvents.WINDOW_MAXIMIZED, { window: target });

    return true;
  }

  /**
   * Move a window to new coordinates, enforcing desktop workspace boundary constraints.
   * @param {string} id
   * @param {number} x
   * @param {number} y
   * @returns {boolean}
   */
  moveWindow(id, x, y) {
    const target = this.windows.get(id);
    if (!target || target.state === WindowState.CLOSED || target.state === WindowState.MAXIMIZED) {
      return false;
    }

    const bounds = this.getWorkspaceBounds();
    // Keep window reasonably inside desktop (titlebar at y >= 0, titlebar visible)
    const clampedY = Math.max(0, Math.min(y, bounds.height - 40));
    const clampedX = Math.max(-target.width + 60, Math.min(x, bounds.width - 60));

    target.x = clampedX;
    target.y = clampedY;

    this.syncRenderedWindow(target.id);
    this.events.emit(WindowEvents.WINDOW_MOVED, { window: target, x: clampedX, y: clampedY });

    return true;
  }

  /**
   * Resize a window with minimum sizing and bounds enforcement.
   * @param {string} id
   * @param {number} width
   * @param {number} height
   * @param {number} [x]
   * @param {number} [y]
   * @returns {boolean}
   */
  resizeWindow(id, width, height, x = null, y = null) {
    const target = this.windows.get(id);
    if (!target || target.state === WindowState.CLOSED || target.state === WindowState.MAXIMIZED) {
      return false;
    }

    const bounds = this.getWorkspaceBounds();
    const clampedWidth = Math.max(target.minWidth, Math.min(width, bounds.width));
    const clampedHeight = Math.max(target.minHeight, Math.min(height, bounds.height));

    target.width = clampedWidth;
    target.height = clampedHeight;

    if (typeof x === 'number') {
      target.x = Math.max(-target.width + 60, Math.min(x, bounds.width - 60));
    }
    if (typeof y === 'number') {
      target.y = Math.max(0, Math.min(y, bounds.height - 40));
    }

    this.syncRenderedWindow(target.id);
    this.events.emit(WindowEvents.WINDOW_RESIZED, {
      window: target,
      width: target.width,
      height: target.height,
      x: target.x,
      y: target.y
    });

    return true;
  }

  /**
   * Close and destroy a window.
   * @param {string} id
   * @returns {boolean}
   */
  closeWindow(id) {
    const target = this.windows.get(id);
    if (!target || target.state === WindowState.CLOSED) {
      return false;
    }

    // Destroy DOM representation
    const rendered = this.renderedWindows.get(id);
    if (rendered) {
      rendered.destroy();
      this.renderedWindows.delete(id);
    }

    target.state = WindowState.CLOSED;
    this.windows.delete(id);

    this.events.emit(WindowEvents.WINDOW_CLOSED, { window: target, windowId: id });

    // If active window was closed, focus next highest
    if (this.activeWindowId === id) {
      this.activeWindowId = null;
      this.focusNextHighestWindow();
    }

    return true;
  }

  /**
   * Focus the visible window with the highest z-index.
   */
  focusNextHighestWindow() {
    const visibleWindows = Array.from(this.windows.values())
      .filter(w => w.state !== WindowState.MINIMIZED && w.state !== WindowState.CLOSED)
      .sort((a, b) => b.zIndex - a.zIndex);

    if (visibleWindows.length > 0) {
      this.focusWindow(visibleWindows[0].id);
    } else {
      this.activeWindowId = null;
      this.events.emit(WindowEvents.ACTIVE_WINDOW_CHANGED, { window: null });
    }
  }

  /**
   * Synchronize DOM element for a window ID.
   * @param {string} id
   */
  syncRenderedWindow(id) {
    const rendered = this.renderedWindows.get(id);
    if (rendered) {
      rendered.syncState();
    }
  }

  /**
   * Find window by application ID.
   * @param {string} appId
   * @returns {WindowModel|null}
   */
  findWindowByAppId(appId) {
    for (const win of this.windows.values()) {
      if (win.appId === appId && win.state !== WindowState.CLOSED) {
        return win;
      }
    }
    return null;
  }

  /**
   * Get window by id.
   * @param {string} id
   * @returns {WindowModel|null}
   */
  getWindow(id) {
    return this.windows.get(id) || null;
  }

  /**
   * Get all managed windows, optionally filtered.
   * @param {Function} [filter]
   * @returns {Array<WindowModel>}
   */
  getWindows(filter = null) {
    const all = Array.from(this.windows.values());
    return typeof filter === 'function' ? all.filter(filter) : all;
  }

  /**
   * Get the currently active/focused window.
   * @returns {WindowModel|null}
   */
  getActiveWindow() {
    return this.activeWindowId ? this.windows.get(this.activeWindowId) || null : null;
  }

  /**
   * Destroy the window manager and clean up all rendered windows and state.
   */
  destroy() {
    for (const rendered of this.renderedWindows.values()) {
      try {
        rendered.destroy();
      } catch (err) {
        console.error('[WindowManager] Error destroying rendered window:', err);
      }
    }
    this.renderedWindows.clear();
    this.windows.clear();
    this.activeWindowId = null;
    this.events.removeAllListeners();
    this.container = null;
  }
}
