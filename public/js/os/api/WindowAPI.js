/**
 * public/js/os/api/WindowAPI.js
 * Controlled application interface for safe window manipulation.
 * Scoped strictly to the calling application's assigned window,
 * enforcing 'window.control' permission.
 */

import { APIError } from './APIError.js';
import { WindowEvents } from '../shell/WindowEvents.js';
import { SYSTEM_APPLICATIONS } from '../desktop/Launcher.js';

export class WindowAPI {
  /**
   * @param {Object} options
   * @param {import('../shell/WindowManager.js').WindowManager} [options.windowManager]
   * @param {import('../shell/WindowState.js').WindowModel} [options.windowModel]
   * @param {import('./APIContext.js').APIContext} options.context
   */
  constructor({ windowManager = null, windowModel = null, context }) {
    this._windowManager = windowManager;
    this._windowModel = windowModel;
    this._context = context;
  }

  /**
   * Create or open an application window.
   * Requires 'window.control' permission.
   * @param {Object} options
   * @param {string} options.appId
   * @returns {Object|null}
   */
  create(options = {}) {
    this._context?.assertPermission('window.control', 'window.create');
    if (!this._windowManager) return null;
    const appId = options.appId;
    if (!appId) return null;

    const registry = this._windowManager.applicationRegistry || this._windowManager.registry;
    const app = registry?.get?.(appId) || SYSTEM_APPLICATIONS.find(a => a.id === appId);
    if (app) {
      const view = typeof app.createView === 'function'
        ? app.createView({ windowManager: this._windowManager, kernel: this._windowManager?.kernel, ...options })
        : null;
      return this._windowManager.openWindow({
        appId: app.id,
        title: options.title || app.name,
        icon: options.icon || app.icon,
        width: options.width || app.defaultWidth,
        height: options.height || app.defaultHeight,
        singleton: options.singleton ?? app.singleton,
        view
      });
    }

    return this._windowManager.openWindow(options);
  }

  /**
   * Get assigned window ID.
   * @returns {string|null}
   */
  getId() {
    return this._windowModel?.id || null;
  }

  /**
   * Set window title and update rendered titlebar.
   * Requires 'window.control' permission.
   * @param {string} title
   */
  setTitle(title) {
    this._context?.assertPermission('window.control', 'window.setTitle');

    if (typeof title !== 'string' || !title.trim()) {
      throw new APIError({
        code: 'EINVAL',
        message: 'Window title must be a non-empty string',
        operation: 'window.setTitle',
        appId: this._context?.appId
      });
    }

    if (!this._windowModel) return;

    this._windowModel.title = title.trim();

    if (this._windowManager?.renderedWindows) {
      const rendered = this._windowManager.renderedWindows.get(this._windowModel.id);
      if (rendered?.element) {
        rendered.element.setAttribute('aria-label', title.trim());
      }
      const titleTextEl = rendered?.titlebarEl?.querySelector('.os-window-title-text');
      if (titleTextEl) {
        titleTextEl.textContent = title.trim();
      }
    }

    if (this._windowManager?.events) {
      this._windowManager.events.emit(WindowEvents.WINDOW_TITLE_CHANGED || 'window:title_changed', {
        windowId: this._windowModel.id,
        title: this._windowModel.title
      });
    }
  }

  /**
   * Bring window to focus.
   * Requires 'window.control' permission.
   * @returns {boolean}
   */
  focus() {
    this._context?.assertPermission('window.control', 'window.focus');
    if (!this._windowManager || !this._windowModel) return false;
    return this._windowManager.focusWindow(this._windowModel.id);
  }

  /**
   * Minimize window.
   * Requires 'window.control' permission.
   * @returns {boolean}
   */
  minimize() {
    this._context?.assertPermission('window.control', 'window.minimize');
    if (!this._windowManager || !this._windowModel) return false;
    return this._windowManager.minimizeWindow(this._windowModel.id);
  }

  /**
   * Maximize window.
   * Requires 'window.control' permission.
   * @returns {boolean}
   */
  maximize() {
    this._context?.assertPermission('window.control', 'window.maximize');
    if (!this._windowManager || !this._windowModel) return false;
    return this._windowManager.maximizeWindow(this._windowModel.id);
  }

  /**
   * Restore window from minimized/maximized state.
   * Requires 'window.control' permission.
   * @returns {boolean}
   */
  restore() {
    this._context?.assertPermission('window.control', 'window.restore');
    if (!this._windowManager || !this._windowModel) return false;
    return this._windowManager.restoreWindow(this._windowModel.id);
  }

  /**
   * Close window.
   * Requires 'window.control' permission.
   * @returns {boolean}
   */
  close() {
    this._context?.assertPermission('window.control', 'window.close');
    if (!this._windowManager || !this._windowModel) return false;
    return this._windowManager.closeWindow(this._windowModel.id);
  }

  /**
   * Get safe snapshot of window state.
   * @returns {{ id: string, title: string, state: string, focused: boolean, visible: boolean }|null}
   */
  getState() {
    if (!this._windowModel) return null;
    return {
      id: this._windowModel.id,
      title: this._windowModel.title,
      state: this._windowModel.state,
      focused: Boolean(this._windowModel.focused),
      visible: Boolean(this._windowModel.visible)
    };
  }
}
