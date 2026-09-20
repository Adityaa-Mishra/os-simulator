/**
 * SystemTray
 * System tray area coordinator for AdityyaOS taskbar.
 * Integrates live digital clock, kernel system status badge, and notifications bell.
 */

import { Clock } from './Clock.js';
import { escapeHtml } from '../../utils/sanitize.js';

export class SystemTray {
  /**
   * @param {Object} options
   * @param {import('./Clock.js').Clock} [options.clock]
   * @param {import('./Notifications.js').Notifications} [options.notifications]
   * @param {string} [options.initialStatus='RUNNING']
   * @param {Function} [options.onNotificationClick]
   */
  constructor(options = {}) {
    this.clock = options.clock || new Clock();
    this.notifications = options.notifications || null;
    this.status = options.initialStatus || 'RUNNING';
    this.onNotificationClick = options.onNotificationClick || null;

    this.container = null;
    this.statusBadgeEl = null;
    this.clockContainerEl = null;
    this.notifBadgeEl = null;
    this.unsubNotifs = null;
  }

  /**
   * Mount system tray into DOM container.
   * @param {HTMLElement} container
   */
  mount(container) {
    this.container = container;
    this.render();

    if (this.clockContainerEl) {
      this.clock.start(this.clockContainerEl);
    }

    if (this.notifications && typeof this.notifications.onUpdate === 'function') {
      this.unsubNotifs = this.notifications.onUpdate((count) => {
        this.updateNotificationBadge(count);
      });
      this.updateNotificationBadge(this.notifications.getUnreadCount());
    }
  }

  /**
   * Update the system status indicator (e.g. 'RUNNING', 'STOPPED', 'BOOTING').
   * @param {string} status
   */
  updateStatus(status) {
    this.status = status;
    if (!this.statusBadgeEl) return;

    const isRunning = status === 'RUNNING' || status === 'READY';
    this.statusBadgeEl.className = `os-tray-status-badge ${isRunning ? 'running' : 'stopped'}`;
    this.statusBadgeEl.innerHTML = `
      <span class="os-status-dot" aria-hidden="true"></span>
      <span>${escapeHtml(status)}</span>
    `;
    this.statusBadgeEl.setAttribute('title', `Kernel Status: ${status}`);
  }

  /**
   * Update notification bell badge count.
   * @param {number} count
   */
  updateNotificationBadge(count) {
    if (!this.notifBadgeEl) return;

    if (count > 0) {
      this.notifBadgeEl.textContent = count > 99 ? '99+' : String(count);
      this.notifBadgeEl.style.display = 'flex';
    } else {
      this.notifBadgeEl.style.display = 'none';
    }
  }

  /**
   * Render base system tray markup.
   */
  render() {
    if (!this.container) return;

    const isRunning = this.status === 'RUNNING' || this.status === 'READY';

    this.container.innerHTML = `
      <div class="os-system-tray" role="region" aria-label="System Tray">
        <!-- Kernel Status Badge -->
        <div class="os-tray-item" id="os-tray-status">
          <span class="os-tray-status-badge ${isRunning ? 'running' : 'stopped'}">
            <span class="os-status-dot" aria-hidden="true"></span>
            <span>${escapeHtml(this.status)}</span>
          </span>
        </div>

        <!-- Notification Bell -->
        <button class="os-tray-item os-notif-bell" id="os-tray-notif-btn" aria-label="Notifications" title="System Notifications">
          <span>🔔</span>
          <span class="os-notif-badge" id="os-notif-badge" style="display: none;">0</span>
        </button>

        <!-- Digital Clock Mount -->
        <div class="os-tray-item" id="os-tray-clock"></div>
      </div>
    `;

    this.statusBadgeEl = this.container.querySelector('.os-tray-status-badge');
    this.clockContainerEl = this.container.querySelector('#os-tray-clock');
    this.notifBadgeEl = this.container.querySelector('#os-notif-badge');

    const notifBtn = this.container.querySelector('#os-tray-notif-btn');
    notifBtn?.addEventListener('click', () => {
      if (typeof this.onNotificationClick === 'function') {
        this.onNotificationClick();
      }
    });
  }

  /**
   * Destroy system tray, stop clock and clear listeners.
   */
  destroy() {
    if (this.clock) {
      this.clock.stop();
    }
    if (typeof this.unsubNotifs === 'function') {
      this.unsubNotifs();
      this.unsubNotifs = null;
    }
    this.statusBadgeEl = null;
    this.clockContainerEl = null;
    this.notifBadgeEl = null;
    if (this.container) {
      this.container.innerHTML = '';
      this.container = null;
    }
  }
}
