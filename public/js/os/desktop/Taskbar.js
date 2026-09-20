/**
 * Taskbar
 * Fixed bottom taskbar coordinator for AdityyaOS desktop.
 * Coordinates Start button, application window tab bar (ready for Phase 14), and System Tray.
 */

import { SystemTray } from './SystemTray.js';

export class Taskbar {
  /**
   * @param {Object} options
   * @param {Function} [options.onStartClick]
   * @param {import('./SystemTray.js').SystemTray} [options.systemTray]
   */
  constructor(options = {}) {
    this.onStartClick = options.onStartClick || null;
    this.systemTray = options.systemTray || new SystemTray();

    this.container = null;
    this.startBtn = null;
    this.appsContainer = null;
    this.windowTabs = new Map();
  }

  /**
   * Mount taskbar into DOM container.
   * @param {HTMLElement} container
   */
  mount(container) {
    this.container = container;
    this.render();

    const trayMount = this.container.querySelector('#os-taskbar-tray');
    if (trayMount && this.systemTray) {
      this.systemTray.mount(trayMount);
    }
  }

  /**
   * Render base taskbar structure.
   */
  render() {
    if (!this.container) return;

    this.container.innerHTML = `
      <footer class="os-taskbar" role="toolbar" aria-label="Taskbar">
        <div class="os-taskbar-left">
          <button class="os-start-btn" id="os-start-btn" aria-label="Start" aria-haspopup="true" aria-expanded="false">
            <span class="os-start-logo" aria-hidden="true">⚛️</span>
            <span>Start</span>
          </button>
        </div>

        <!-- Applications Area (Phase 14 Window Manager Mount Point) -->
        <div class="os-taskbar-apps" id="os-taskbar-apps" role="tablist" aria-label="Running Applications"></div>

        <!-- System Tray Area -->
        <div id="os-taskbar-tray"></div>
      </footer>
    `;

    this.startBtn = this.container.querySelector('#os-start-btn');
    this.appsContainer = this.container.querySelector('#os-taskbar-apps');

    this.startBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (typeof this.onStartClick === 'function') {
        this.onStartClick();
      }
    });
  }

  /**
   * Update start button active/highlight state.
   * @param {boolean} active
   */
  setStartActive(active) {
    if (this.startBtn) {
      if (active) {
        this.startBtn.classList.add('active');
        this.startBtn.setAttribute('aria-expanded', 'true');
      } else {
        this.startBtn.classList.remove('active');
        this.startBtn.setAttribute('aria-expanded', 'false');
      }
    }
  }

  /**
   * Future-proof window tab interface for Phase 14 Window Manager.
   * Adds an application tab to the taskbar.
   * @param {string} windowId
   * @param {string} title
   * @param {string} icon
   * @param {Function} [onClick]
   */
  addWindowTab(windowId, title, icon = '📄', onClick = null) {
    if (!this.appsContainer) return;

    const tab = document.createElement('button');
    tab.className = 'os-taskbar-app-tab';
    tab.setAttribute('data-window-id', windowId);
    tab.setAttribute('role', 'tab');
    tab.innerHTML = `
      <span aria-hidden="true">${icon}</span>
      <span>${title}</span>
    `;

    if (typeof onClick === 'function') {
      tab.addEventListener('click', () => onClick(windowId));
    }

    this.appsContainer.appendChild(tab);
    this.windowTabs.set(windowId, tab);
  }

  /**
   * Future-proof window tab removal for Phase 14.
   * @param {string} windowId
   */
  removeWindowTab(windowId) {
    const tab = this.windowTabs.get(windowId);
    if (tab && tab.parentNode) {
      tab.parentNode.removeChild(tab);
    }
    this.windowTabs.delete(windowId);
  }

  /**
   * Future-proof active tab highlight for Phase 14.
   * @param {string} windowId
   */
  setActiveWindowTab(windowId) {
    for (const [id, tab] of this.windowTabs.entries()) {
      if (id === windowId) {
        tab.classList.add('active');
        tab.setAttribute('aria-selected', 'true');
      } else {
        tab.classList.remove('active');
        tab.setAttribute('aria-selected', 'false');
      }
    }
  }

  /**
   * Clean up taskbar and subcomponents.
   */
  destroy() {
    if (this.systemTray) {
      this.systemTray.destroy();
    }
    this.windowTabs.clear();
    this.startBtn = null;
    this.appsContainer = null;
    if (this.container) {
      this.container.innerHTML = '';
      this.container = null;
    }
  }
}
