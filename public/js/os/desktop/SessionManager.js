/**
 * SessionManager
 * Manages user session state and OS power lifecycle (shutdown, restart, logout).
 * Integrates directly with AdityyaOS Kernel and the existing authentication store.
 */

import { store } from '../../core/store.js';
import { authView } from '../../views/authView.js';

export class SessionManager {
  /**
   * @param {import('../kernel/Kernel.js').Kernel} kernel
   */
  constructor(kernel) {
    this.kernel = kernel;
    this.unsubscribers = [];
  }

  /**
   * Get the current user profile, or guest fallback.
   * @returns {{ name: string, email: string|null, role: string, avatar: string, isAuthenticated: boolean }}
   */
  getUser() {
    const user = store.getState('user');
    const isAuth = Boolean(store.getState('isAuthenticated') || user);

    if (user && isAuth) {
      const name = user.name || 'User';
      const initial = name.charAt(0).toUpperCase();
      return {
        name,
        email: user.email || null,
        role: user.role || 'System Operator',
        avatar: initial,
        isAuthenticated: true
      };
    }

    return {
      name: 'Guest Operator',
      email: null,
      role: 'Guest Workspace',
      avatar: 'G',
      isAuthenticated: false
    };
  }

  /**
   * Subscribe to user session state changes.
   * @param {Function} callback
   * @returns {Function} unsubscribe
   */
  onUserChange(callback) {
    const unsub = store.subscribe('user', () => {
      try {
        callback(this.getUser());
      } catch (err) {
        console.error('[SessionManager] Error in user change callback:', err);
      }
    });
    this.unsubscribers.push(unsub);
    return unsub;
  }

  /**
   * Shutdown the operating system.
   * Awaits kernel.shutdown() to ensure clean lifecycle transition.
   * @returns {Promise<{ success: boolean, status: string }>}
   */
  async shutdown() {
    if (this.kernel && typeof this.kernel.shutdown === 'function') {
      return await this.kernel.shutdown();
    }
    return { success: false, status: 'UNKNOWN' };
  }

  /**
   * Restart the operating system.
   * Properly sequences shutdown() followed by boot().
   * @returns {Promise<{ success: boolean, status: string }>}
   */
  async restart() {
    if (this.kernel) {
      if (typeof this.kernel.shutdown === 'function') {
        await this.kernel.shutdown();
      }
      if (typeof this.kernel.boot === 'function') {
        return await this.kernel.boot();
      }
    }
    return { success: false, status: 'UNKNOWN' };
  }

  /**
   * Log out the current user via existing auth view.
   * @returns {Promise<void>}
   */
  async logout() {
    if (authView && typeof authView.handleLogout === 'function') {
      await authView.handleLogout();
    } else {
      store.setState({ user: null, isAuthenticated: false });
    }
  }

  /**
   * Open the login / registration modal.
   */
  openLogin() {
    if (authView && typeof authView.openModal === 'function') {
      authView.openModal('login');
    }
  }

  /**
   * Cleanup all listeners and resources.
   */
  destroy() {
    for (const unsub of this.unsubscribers) {
      try {
        unsub();
      } catch (err) {
        console.error('[SessionManager] Error cleaning up subscriber:', err);
      }
    }
    this.unsubscribers = [];
  }
}
