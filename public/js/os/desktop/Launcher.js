/**
 * Launcher (Start Menu)
 * Manages the AdityyaOS Start Menu, user profile card, application search,
 * registered system application descriptors, and session power actions.
 */

import { escapeHtml } from '../../utils/sanitize.js';
import { DesktopSearch } from './DesktopSearch.js';

export const SYSTEM_APPLICATIONS = Object.freeze([
  {
    id: 'files',
    name: 'Files',
    icon: '📁',
    category: 'System',
    description: 'Virtual File System & Directory Explorer',
    keywords: ['vfs', 'directory', 'folder', 'storage']
  },
  {
    id: 'terminal',
    name: 'Terminal',
    icon: '💻',
    category: 'System',
    description: 'Command-line shell & system calls',
    keywords: ['cli', 'shell', 'bash', 'console', 'syscall']
  },
  {
    id: 'settings',
    name: 'Settings',
    icon: '⚙️',
    category: 'System',
    description: 'System preferences, themes, & configuration',
    keywords: ['config', 'preferences', 'display', 'theme']
  },
  {
    id: 'browser',
    name: 'Browser',
    icon: '🌐',
    category: 'Utilities',
    description: 'Web browser & simulator gateway',
    keywords: ['web', 'internet', 'net', 'portal']
  },
  {
    id: 'notes',
    name: 'Notes',
    icon: '📝',
    category: 'Utilities',
    description: 'System scratchpad & text editor',
    keywords: ['text', 'editor', 'scratchpad', 'notepad']
  },
  {
    id: 'calculator',
    name: 'Calculator',
    icon: '🧮',
    category: 'Utilities',
    description: 'Scientific & programmer calculator',
    keywords: ['math', 'calc', 'scientific', 'computation']
  },
  {
    id: 'taskmanager',
    name: 'Task Manager',
    icon: '📊',
    category: 'Administration',
    description: 'Process list & resource monitor',
    keywords: ['processes', 'kill', 'cpu', 'memory']
  },
  {
    id: 'systemmonitor',
    name: 'System Monitor',
    icon: '📈',
    category: 'Administration',
    description: 'CPU, memory, & disk telemetry',
    keywords: ['telemetry', 'usage', 'performance', 'stats']
  }
]);

export class Launcher {
  /**
   * @param {Object} options
   * @param {import('./SessionManager.js').SessionManager} options.sessionManager
   * @param {Array<Object>} [options.applications]
   * @param {Function} [options.onLaunch]
   * @param {Function} [options.onPower]
   */
  constructor(options = {}) {
    this.sessionManager = options.sessionManager;
    this.applications = options.applications || [...SYSTEM_APPLICATIONS];
    this.onLaunchCallback = options.onLaunch || null;
    this.onPowerCallback = options.onPower || null;

    this.container = null;
    this.panelElement = null;
    this.gridElement = null;
    this.searchInput = null;
    this.searchClearBtn = null;
    this.isOpen = false;
    this.searchQuery = '';
    this.unsubUser = null;
  }

  /**
   * Mount the launcher into the specified DOM container.
   * @param {HTMLElement} container
   */
  mount(container) {
    this.container = container;
    this.render();

    if (this.sessionManager && typeof this.sessionManager.onUserChange === 'function') {
      this.unsubUser = this.sessionManager.onUserChange(() => this.updateUserProfile());
    }
  }

  /**
   * Set callback for when an app is launched.
   * @param {Function} cb
   */
  onLaunch(cb) {
    this.onLaunchCallback = cb;
  }

  /**
   * Set callback for power actions.
   * @param {Function} cb
   */
  onPower(cb) {
    this.onPowerCallback = cb;
  }

  /**
   * Render the full launcher panel.
   */
  render() {
    if (!this.container) return;

    const user = this.sessionManager ? this.sessionManager.getUser() : {
      name: 'Guest Operator',
      role: 'Guest Workspace',
      avatar: 'G',
      isAuthenticated: false
    };

    this.container.innerHTML = `
      <div class="os-launcher-panel ${this.isOpen ? 'open' : ''}" id="os-launcher-panel" role="menu" aria-label="Start Menu">
        <!-- Header: User Profile & Search -->
        <div class="os-launcher-header">
          <div class="os-launcher-user-card" id="os-launcher-user-card">
            <div class="os-launcher-avatar">${escapeHtml(user.avatar)}</div>
            <div class="os-launcher-user-info">
              <div class="os-launcher-user-name">${escapeHtml(user.name)}</div>
              <div class="os-launcher-user-role">${escapeHtml(user.role)}</div>
            </div>
          </div>

          <div class="os-launcher-search-box">
            <span class="os-launcher-search-icon" aria-hidden="true">🔍</span>
            <input 
              type="text" 
              class="os-launcher-search-input" 
              id="os-launcher-search" 
              placeholder="Search applications, utilities, commands..."
              aria-label="Search applications"
              value="${escapeHtml(this.searchQuery)}"
            />
            <button class="os-launcher-search-clear" id="os-launcher-search-clear" aria-label="Clear search">✕</button>
          </div>
        </div>

        <!-- Body: Applications Grid -->
        <div class="os-launcher-body">
          <div class="os-launcher-section-title">Applications</div>
          <div class="os-launcher-grid" id="os-launcher-grid"></div>
        </div>

        <!-- Footer: Power & Session Controls -->
        <div class="os-launcher-footer">
          <div class="os-power-actions">
            <button class="os-power-btn shutdown" id="os-btn-shutdown" title="Shutdown AdityyaOS">
              <span>🔴</span>
              <span>Shutdown</span>
            </button>
            <button class="os-power-btn restart" id="os-btn-restart" title="Restart AdityyaOS">
              <span>🔄</span>
              <span>Restart</span>
            </button>
          </div>
          <div class="os-session-action">
            ${user.isAuthenticated ? `
              <button class="os-power-btn" id="os-btn-logout" title="Sign out of AdityyaOS">
                <span>🚪</span>
                <span>Sign Out</span>
              </button>
            ` : `
              <button class="os-power-btn" id="os-btn-login" title="Sign in to AdityyaOS">
                <span>🔑</span>
                <span>Sign In</span>
              </button>
            `}
          </div>
        </div>
      </div>
    `;

    this.panelElement = this.container.querySelector('#os-launcher-panel');
    this.gridElement = this.container.querySelector('#os-launcher-grid');
    this.searchInput = this.container.querySelector('#os-launcher-search');
    this.searchClearBtn = this.container.querySelector('#os-launcher-search-clear');

    this.bindEvents();
    this.renderAppGrid();
  }

  /**
   * Bind event listeners.
   */
  bindEvents() {
    if (this.searchInput) {
      this.searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value;
        if (this.searchClearBtn) {
          if (this.searchQuery) {
            this.searchClearBtn.classList.add('visible');
          } else {
            this.searchClearBtn.classList.remove('visible');
          }
        }
        this.renderAppGrid();
      });
    }

    if (this.searchClearBtn) {
      this.searchClearBtn.addEventListener('click', () => {
        this.searchQuery = '';
        if (this.searchInput) {
          this.searchInput.value = '';
          this.searchInput.focus();
        }
        this.searchClearBtn.classList.remove('visible');
        this.renderAppGrid();
      });
    }

    const shutdownBtn = this.container.querySelector('#os-btn-shutdown');
    shutdownBtn?.addEventListener('click', () => {
      this.close();
      if (this.onPowerCallback) {
        this.onPowerCallback('shutdown');
      } else if (this.sessionManager) {
        this.sessionManager.shutdown();
      }
    });

    const restartBtn = this.container.querySelector('#os-btn-restart');
    restartBtn?.addEventListener('click', () => {
      this.close();
      if (this.onPowerCallback) {
        this.onPowerCallback('restart');
      } else if (this.sessionManager) {
        this.sessionManager.restart();
      }
    });

    const logoutBtn = this.container.querySelector('#os-btn-logout');
    logoutBtn?.addEventListener('click', () => {
      this.close();
      if (this.onPowerCallback) {
        this.onPowerCallback('logout');
      } else if (this.sessionManager) {
        this.sessionManager.logout();
      }
    });

    const loginBtn = this.container.querySelector('#os-btn-login');
    loginBtn?.addEventListener('click', () => {
      this.close();
      if (this.sessionManager) {
        this.sessionManager.openLogin();
      }
    });
  }

  /**
   * Render the filtered application grid.
   */
  renderAppGrid() {
    if (!this.gridElement) return;

    const filtered = DesktopSearch.filter(this.applications, this.searchQuery);

    if (filtered.length === 0) {
      this.gridElement.innerHTML = `
        <div class="os-launcher-empty" style="grid-column: 1 / -1;">
          No applications matching "<strong>${escapeHtml(this.searchQuery)}</strong>"
        </div>
      `;
      return;
    }

    this.gridElement.innerHTML = filtered.map(app => `
      <button class="os-launcher-item" data-app-id="${escapeHtml(app.id)}" role="menuitem">
        <span class="os-launcher-item-icon" aria-hidden="true">${escapeHtml(app.icon)}</span>
        <div class="os-launcher-item-meta">
          <span class="os-launcher-item-name">${escapeHtml(app.name)}</span>
          <span class="os-launcher-item-desc">${escapeHtml(app.description)}</span>
        </div>
      </button>
    `).join('');

    this.gridElement.querySelectorAll('.os-launcher-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const appId = btn.getAttribute('data-app-id');
        const app = this.applications.find(a => a.id === appId);
        if (app) {
          this.launch(app);
        }
      });
    });
  }

  /**
   * Update the user profile section in header.
   */
  updateUserProfile() {
    const card = this.container?.querySelector('#os-launcher-user-card');
    if (!card || !this.sessionManager) return;

    const user = this.sessionManager.getUser();
    card.innerHTML = `
      <div class="os-launcher-avatar">${escapeHtml(user.avatar)}</div>
      <div class="os-launcher-user-info">
        <div class="os-launcher-user-name">${escapeHtml(user.name)}</div>
        <div class="os-launcher-user-role">${escapeHtml(user.role)}</div>
      </div>
    `;
  }

  /**
   * Trigger application launch.
   * @param {Object} app
   */
  launch(app) {
    this.close();
    if (typeof this.onLaunchCallback === 'function') {
      this.onLaunchCallback(app);
    }
  }

  /**
   * Toggle launcher open/close.
   */
  toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  /**
   * Open the launcher panel.
   */
  open() {
    this.isOpen = true;
    if (this.panelElement) {
      this.panelElement.classList.add('open');
      this.panelElement.setAttribute('aria-hidden', 'false');
    }
    if (this.searchInput) {
      this.searchInput.focus();
    }
  }

  /**
   * Close the launcher panel.
   */
  close() {
    this.isOpen = false;
    if (this.panelElement) {
      this.panelElement.classList.remove('open');
      this.panelElement.setAttribute('aria-hidden', 'true');
    }
    this.searchQuery = '';
    if (this.searchInput) {
      this.searchInput.value = '';
    }
    if (this.searchClearBtn) {
      this.searchClearBtn.classList.remove('visible');
    }
    this.renderAppGrid();
  }

  /**
   * Clean up listeners and DOM references.
   */
  destroy() {
    if (typeof this.unsubUser === 'function') {
      this.unsubUser();
      this.unsubUser = null;
    }
    this.isOpen = false;
    this.panelElement = null;
    this.gridElement = null;
    this.searchInput = null;
    this.searchClearBtn = null;
    if (this.container) {
      this.container.innerHTML = '';
      this.container = null;
    }
  }
}
