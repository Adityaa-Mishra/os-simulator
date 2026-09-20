/**
 * Notifications
 * Desktop toast and notification queue controller for AdityyaOS.
 * Provides auto-dismissing and manual toasts with tracked timers for zero memory leaks.
 */

import { escapeHtml } from '../../utils/sanitize.js';

export class Notifications {
  constructor() {
    this.container = null;
    this.notifications = [];
    this.timers = new Map();
    this.subscribers = new Set();
    this.nextId = 1;
  }

  /**
   * Mount to DOM container.
   * @param {HTMLElement} container
   */
  mount(container) {
    this.container = container;
    this.render();
  }

  /**
   * Display a notification.
   * @param {Object} options
   * @param {string} options.title
   * @param {string} options.message
   * @param {'info'|'success'|'warning'|'error'} [options.type='info']
   * @param {number} [options.duration=4000] - Duration in ms (0 for persistent)
   * @returns {number} notificationId
   */
  show({ title, message, type = 'info', duration = 4000 }) {
    const id = this.nextId++;
    const notif = {
      id,
      title: title || 'System Notification',
      message: message || '',
      type,
      duration,
      timestamp: Date.now(),
      read: false
    };

    this.notifications.push(notif);

    if (this.container) {
      this.renderNotification(notif);
    }

    if (duration > 0) {
      const timerId = setTimeout(() => {
        this.dismiss(id);
      }, duration);
      this.timers.set(id, timerId);
    }

    this.notifySubscribers();
    return id;
  }

  /**
   * Dismiss a specific notification by id.
   * @param {number} id
   */
  dismiss(id) {
    if (this.timers.has(id)) {
      clearTimeout(this.timers.get(id));
      this.timers.delete(id);
    }

    const index = this.notifications.findIndex(n => n.id === id);
    if (index !== -1) {
      this.notifications.splice(index, 1);
    }

    if (this.container) {
      const el = this.container.querySelector(`[data-notif-id="${id}"]`);
      if (el) {
        el.classList.add('removing');
        setTimeout(() => {
          if (el.parentNode) {
            el.parentNode.removeChild(el);
          }
        }, 200);
      }
    }

    this.notifySubscribers();
  }

  /**
   * Clear all active notifications.
   */
  clearAll() {
    for (const timerId of this.timers.values()) {
      clearTimeout(timerId);
    }
    this.timers.clear();
    this.notifications = [];

    if (this.container) {
      this.container.innerHTML = '';
    }

    this.notifySubscribers();
  }

  /**
   * Render all notifications into container.
   */
  render() {
    if (!this.container) return;
    this.container.innerHTML = '';
    for (const notif of this.notifications) {
      this.renderNotification(notif);
    }
  }

  /**
   * Render a single notification toast element.
   * @param {Object} notif
   */
  renderNotification(notif) {
    if (!this.container) return;

    const iconMap = {
      info: 'ℹ️',
      success: '✅',
      warning: '⚠️',
      error: '❌'
    };

    const toast = document.createElement('div');
    toast.className = `os-notif-toast ${escapeHtml(notif.type)}`;
    toast.setAttribute('data-notif-id', String(notif.id));
    toast.setAttribute('role', 'alert');

    toast.innerHTML = `
      <span class="os-notif-icon" aria-hidden="true">${iconMap[notif.type] || 'ℹ️'}</span>
      <div class="os-notif-content">
        <div class="os-notif-title">${escapeHtml(notif.title)}</div>
        <div class="os-notif-message">${escapeHtml(notif.message)}</div>
      </div>
      <button class="os-notif-close" aria-label="Dismiss notification" data-dismiss-id="${notif.id}">✕</button>
    `;

    toast.querySelector('.os-notif-close')?.addEventListener('click', () => {
      this.dismiss(notif.id);
    });

    this.container.appendChild(toast);
  }

  /**
   * Get unread count.
   * @returns {number}
   */
  getUnreadCount() {
    return this.notifications.length;
  }

  /**
   * Get all active notifications.
   * @returns {Array<Object>}
   */
  getNotifications() {
    return [...this.notifications];
  }

  /**
   * Subscribe to notification updates.
   * @param {Function} callback
   * @returns {Function} unsubscribe
   */
  onUpdate(callback) {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  notifySubscribers() {
    for (const cb of this.subscribers) {
      try {
        cb(this.getUnreadCount(), this.notifications);
      } catch (err) {
        console.error('[Notifications] Subscriber error:', err);
      }
    }
  }

  /**
   * Destroy notifications instance, clear all timers and references.
   */
  destroy() {
    for (const timerId of this.timers.values()) {
      clearTimeout(timerId);
    }
    this.timers.clear();
    this.notifications = [];
    this.subscribers.clear();
    if (this.container) {
      this.container.innerHTML = '';
      this.container = null;
    }
  }
}
