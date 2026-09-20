/**
 * DesktopEnvironment
 * Master coordinator for the AdityyaOS Desktop Environment.
 * Coordinates workspace, desktop icons, taskbar, launcher, system tray,
 * notifications, context menu, and kernel lifecycle integration.
 */

import { kernel } from '../kernel/Kernel.js';
import { SystemStatus } from '../kernel/OSState.js';
import { OSEvents } from '../kernel/OSEventEmitter.js';
import { Taskbar } from './Taskbar.js';
import { Launcher, SYSTEM_APPLICATIONS } from './Launcher.js';
import { SystemTray } from './SystemTray.js';
import { Notifications } from './Notifications.js';
import { Clock } from './Clock.js';
import { SessionManager } from './SessionManager.js';
import { Shell } from '../shell/Shell.js';
import { escapeHtml } from '../../utils/sanitize.js';

export class DesktopEnvironment {
  /**
   * @param {Object} options
   * @param {import('../kernel/Kernel.js').Kernel} [options.kernel]
   * @param {Array<Object>} [options.applications]
   */
  constructor(options = {}) {
    this.kernel = options.kernel || kernel;
    this.applications = options.applications || [...SYSTEM_APPLICATIONS];
    this.loader = options.loader || null;
    this.runtime = options.runtime || null;

    this.shell = null;

    // Submodules
    this.clock = new Clock();
    this.notifications = new Notifications();
    this.sessionManager = new SessionManager(this.kernel);
    this.systemTray = new SystemTray({
      clock: this.clock,
      notifications: this.notifications,
      initialStatus: this.kernel.getStatus()
    });
    this.taskbar = new Taskbar({
      systemTray: this.systemTray,
      onStartClick: () => this.toggleLauncher()
    });
    this.launcher = new Launcher({
      sessionManager: this.sessionManager,
      applications: this.applications,
      onLaunch: (app) => this.openApp(app),
      onPower: (action) => this.handlePowerAction(action)
    });

    this.container = null;
    this.contextMenuEl = null;
    this.bootOverlayEl = null;
    this.eventCleanups = [];
    this.domCleanups = [];
  }

  /**
   * Mount the desktop environment into a DOM container.
   * @param {HTMLElement} container
   */
  async mount(container) {
    this.container = container;
    const currentStatus = this.kernel.getStatus();

    if (currentStatus !== SystemStatus.RUNNING) {
      this.renderBootScreen();
      this.bindKernelLifecycle();
      await this.kernel.boot();
    } else {
      this.renderDesktop();
      this.bindKernelLifecycle();
    }
  }

  /**
   * Render simulated BIOS/OS boot sequence.
   */
  renderBootScreen() {
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="os-boot-overlay" id="os-boot-overlay" role="status" aria-live="polite">
        <div class="os-boot-terminal">
          <div class="os-boot-header">
            <span>AdityyaOS Bootloader v1.0.0</span>
            <span id="os-boot-timer">0.00s</span>
          </div>
          <div class="os-boot-logs" id="os-boot-logs">
            <div class="os-boot-log-line highlight">[BIOS] Initializing hardware abstraction layer...</div>
          </div>
          <div class="os-boot-progress-bar-container">
            <div class="os-boot-progress-fill" id="os-boot-progress"></div>
          </div>
        </div>
      </div>
    `;

    this.bootOverlayEl = this.container.querySelector('#os-boot-overlay');
  }

  /**
   * Append a log line to the boot screen.
   * @param {string} text
   * @param {'normal'|'highlight'|'success'} [style='normal']
   * @param {number} [progress=null]
   */
  addBootLog(text, style = 'normal', progress = null) {
    const logsEl = this.container?.querySelector('#os-boot-logs');
    const progressEl = this.container?.querySelector('#os-boot-progress');

    if (logsEl) {
      const line = document.createElement('div');
      line.className = `os-boot-log-line ${style}`;
      line.textContent = text;
      logsEl.appendChild(line);
      logsEl.scrollTop = logsEl.scrollHeight;
    }

    if (progressEl && typeof progress === 'number') {
      progressEl.style.width = `${Math.min(100, Math.max(0, progress))}%`;
    }
  }

  /**
   * Bind to Kernel lifecycle events.
   */
  bindKernelLifecycle() {
    // SYSTEM_BOOTING
    const offBooting = this.kernel.events.on(OSEvents.SYSTEM_BOOTING, () => {
      this.addBootLog('[SYSTEM_BOOTING] Starting AdityyaOS Kernel...', 'highlight', 30);
      this.systemTray.updateStatus('BOOTING');
    });
    this.eventCleanups.push(offBooting);

    // SYSTEM_READY
    const offReady = this.kernel.events.on(OSEvents.SYSTEM_READY, () => {
      this.addBootLog('[KERNEL] Subsystem managers initialized (Process, Scheduler, Memory, VFS, Disk, Resources)', 'normal', 70);
      this.addBootLog('[SYSTEM_READY] Kernel initialized and verified.', 'success', 90);
      this.systemTray.updateStatus('READY');
    });
    this.eventCleanups.push(offReady);

    // SYSTEM_RUNNING
    const offRunning = this.kernel.events.on(OSEvents.SYSTEM_RUNNING, () => {
      this.addBootLog('[SYSTEM_RUNNING] AdityyaOS running. Starting desktop environment...', 'success', 100);
      this.systemTray.updateStatus('RUNNING');
      this.renderDesktop();
    });
    this.eventCleanups.push(offRunning);

    // SYSTEM_SHUTTING_DOWN
    const offShuttingDown = this.kernel.events.on(OSEvents.SYSTEM_SHUTTING_DOWN, () => {
      this.systemTray.updateStatus('SHUTTING_DOWN');
    });
    this.eventCleanups.push(offShuttingDown);

    // SYSTEM_STOPPED
    const offStopped = this.kernel.events.on(OSEvents.SYSTEM_STOPPED, () => {
      this.systemTray.updateStatus('STOPPED');
      this.renderShutdownScreen();
    });
    this.eventCleanups.push(offStopped);
  }

  /**
   * Render the active desktop environment.
   */
  renderDesktop() {
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="os-desktop-container" id="os-desktop-container">
        <!-- Desktop Wallpaper with Watermark -->
        <div class="os-wallpaper"></div>
        <div class="os-wallpaper-watermark">
          <div class="os-watermark-title">AdityyaOS</div>
          <div class="os-watermark-sub">Web Operating System</div>
        </div>

        <!-- Desktop Workspace & Shortcut Icons -->
        <div class="os-workspace" id="os-workspace">
          <div class="os-desktop-icons" id="os-desktop-icons" role="region" aria-label="Desktop Shortcuts"></div>
          <!-- Future Phase 14 Window Manager Layer -->
          <div class="os-window-layer" id="os-window-layer"></div>
        </div>

        <!-- Floating Start Menu Mount -->
        <div id="os-launcher-mount"></div>

        <!-- Floating Notifications Mount -->
        <div class="os-notifications-container" id="os-notifications-mount"></div>

        <!-- Context Menu Mount -->
        <div class="os-context-menu" id="os-context-menu" style="display: none;"></div>

        <!-- Fixed Bottom Taskbar Mount -->
        <div id="os-taskbar-mount"></div>
      </div>
    `;

    // Render desktop icons
    this.renderDesktopIcons();

    // Mount subcomponents
    const taskbarMount = this.container.querySelector('#os-taskbar-mount');
    if (taskbarMount) {
      this.taskbar.mount(taskbarMount);
    }

    const launcherMount = this.container.querySelector('#os-launcher-mount');
    if (launcherMount) {
      this.launcher.mount(launcherMount);
    }

    const notifMount = this.container.querySelector('#os-notifications-mount');
    if (notifMount) {
      this.notifications.mount(notifMount);
    }

    // Initialize Shell coordinator (Phase 14 Window Manager & Shell integration)
    const windowLayer = this.container.querySelector('#os-window-layer');
    this.shell = new Shell({
      taskbar: this.taskbar,
      notifications: this.notifications,
      windowContainer: windowLayer,
      runtime: this.runtime
    });

    this.contextMenuEl = this.container.querySelector('#os-context-menu');

    // Bind DOM events
    this.bindDomEvents();

    // Show initial greeting notification
    const user = this.sessionManager.getUser();
    this.notifications.show({
      title: 'AdityyaOS Ready',
      message: `Welcome, ${user.name}! Desktop environment initialized.`,
      type: 'success',
      duration: 4000
    });
  }

  /**
   * Render desktop shortcut icons.
   */
  renderDesktopIcons() {
    const iconsContainer = this.container?.querySelector('#os-desktop-icons');
    if (!iconsContainer) return;

    iconsContainer.innerHTML = this.applications.map(app => `
      <button class="os-desktop-icon" data-app-id="${escapeHtml(app.id)}" title="${escapeHtml(app.name)} - ${escapeHtml(app.description)}">
        <span class="os-icon-graphic" aria-hidden="true">${escapeHtml(app.icon)}</span>
        <span class="os-icon-label">${escapeHtml(app.name)}</span>
      </button>
    `).join('');

    iconsContainer.querySelectorAll('.os-desktop-icon').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const appId = btn.getAttribute('data-app-id');
        const app = this.applications.find(a => a.id === appId);
        if (app) {
          this.openApp(app);
        }
      });
    });
  }

  /**
   * Launch an application through the OS Shell.
   * @param {Object|string} app
   */
  openApp(app) {
    const appId = typeof app === 'string' ? app : app.id;
    if (this.shell) {
      this.shell.launch(appId);
    }
  }

  /**
   * Toggle the launcher start menu.
   */
  toggleLauncher() {
    this.launcher.toggle();
    this.taskbar.setStartActive(this.launcher.isOpen);
    this.closeContextMenu();
  }

  /**
   * Close the launcher start menu.
   */
  closeLauncher() {
    if (this.launcher.isOpen) {
      this.launcher.close();
      this.taskbar.setStartActive(false);
    }
  }

  /**
   * Open desktop context menu at specified coordinates.
   * @param {number} x
   * @param {number} y
   */
  openContextMenu(x, y) {
    if (!this.contextMenuEl) return;

    this.contextMenuEl.innerHTML = `
      <button class="os-context-item" id="ctx-refresh">
        <span>🔄</span>
        <span>Refresh Desktop</span>
      </button>
      <button class="os-context-item" id="ctx-launcher">
        <span>⚛️</span>
        <span>Open Start Menu</span>
      </button>
      <div class="os-context-divider"></div>
      <button class="os-context-item" id="ctx-info">
        <span>ℹ️</span>
        <span>System Info</span>
      </button>
      <button class="os-context-item" id="ctx-exit">
        <span>🚪</span>
        <span>Exit to Lab Dashboard</span>
      </button>
    `;

    this.contextMenuEl.style.left = `${Math.min(x, window.innerWidth - 200)}px`;
    this.contextMenuEl.style.top = `${Math.min(y, window.innerHeight - 180)}px`;
    this.contextMenuEl.style.display = 'flex';

    this.contextMenuEl.querySelector('#ctx-refresh')?.addEventListener('click', () => {
      this.closeContextMenu();
      this.notifications.show({ title: 'Desktop', message: 'Desktop refreshed.', type: 'info', duration: 2000 });
    });

    this.contextMenuEl.querySelector('#ctx-launcher')?.addEventListener('click', () => {
      this.closeContextMenu();
      this.toggleLauncher();
    });

    this.contextMenuEl.querySelector('#ctx-info')?.addEventListener('click', () => {
      this.closeContextMenu();
      const state = this.kernel.getState();
      this.notifications.show({
        title: 'System Information',
        message: `Hostname: ${state.system.hostname} | Kernel: v${state.system.version} | Status: ${state.system.status}`,
        type: 'info',
        duration: 5000
      });
    });

    this.contextMenuEl.querySelector('#ctx-exit')?.addEventListener('click', () => {
      this.closeContextMenu();
      window.location.hash = '#/';
    });
  }

  /**
   * Close the desktop context menu.
   */
  closeContextMenu() {
    if (this.contextMenuEl) {
      this.contextMenuEl.style.display = 'none';
      this.contextMenuEl.innerHTML = '';
    }
  }

  /**
   * Bind DOM level event listeners (clicking outside, escape key, right-click).
   */
  bindDomEvents() {
    const onWindowClick = (e) => {
      // Close context menu on any click outside
      if (this.contextMenuEl && !this.contextMenuEl.contains(e.target)) {
        this.closeContextMenu();
      }
      // Close launcher on click outside launcher and start button
      const launcherPanel = this.container?.querySelector('#os-launcher-panel');
      const startBtn = this.container?.querySelector('#os-start-btn');
      if (launcherPanel && !launcherPanel.contains(e.target) && (!startBtn || !startBtn.contains(e.target))) {
        this.closeLauncher();
      }
    };

    const onContextMenu = (e) => {
      // Open custom context menu on right click in desktop workspace
      const workspace = this.container?.querySelector('#os-workspace');
      if (workspace && workspace.contains(e.target)) {
        e.preventDefault();
        this.openContextMenu(e.clientX, e.clientY);
      }
    };

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        this.closeContextMenu();
        this.closeLauncher();
      }
    };

    window.addEventListener('click', onWindowClick);
    window.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('keydown', onKeyDown);

    this.domCleanups.push(() => {
      window.removeEventListener('click', onWindowClick);
      window.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('keydown', onKeyDown);
    });
  }

  /**
   * Handle power actions from launcher (shutdown, restart, logout).
   * @param {'shutdown'|'restart'|'logout'} action
   */
  async handlePowerAction(action) {
    if (action === 'shutdown') {
      await this.handleShutdown();
    } else if (action === 'restart') {
      await this.handleRestart();
    } else if (action === 'logout') {
      await this.sessionManager.logout();
    }
  }

  /**
   * Execute clean shutdown flow.
   */
  async handleShutdown() {
    this.closeLauncher();
    this.closeContextMenu();
    await this.sessionManager.shutdown();
  }

  /**
   * Render shutdown screen with options to reboot or return to dashboard.
   */
  renderShutdownScreen() {
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="os-shutdown-overlay" id="os-shutdown-overlay">
        <div style="font-size: 3rem; margin-bottom: 12px;" aria-hidden="true">🛑</div>
        <div class="os-shutdown-title">AdityyaOS is Shut Down</div>
        <div class="os-shutdown-desc">
          All active processes have been terminated, memory has been freed, and virtual file handles closed.
        </div>
        <div style="display: flex; gap: 12px;">
          <button class="btn btn-primary" id="os-reboot-btn">
            <span>🔄</span> Turn On / Reboot
          </button>
          <a href="#/" class="btn btn-secondary">
            <span>📊</span> Return to Lab Dashboard
          </a>
        </div>
      </div>
    `;

    this.container.querySelector('#os-reboot-btn')?.addEventListener('click', () => {
      this.handleRestart();
    });
  }

  /**
   * Execute clean restart flow (shutdown followed by boot).
   */
  async handleRestart() {
    this.renderBootScreen();
    await this.sessionManager.restart();
  }

  /**
   * Unmount the desktop environment and clean up all resources, timers, and listeners.
   */
  unmount() {
    // Clean up Shell (centralized cleanup of WindowManager, Windows, and Taskbar tabs)
    if (this.shell) {
      this.shell.destroy();
      this.shell = null;
    }

    // Clean up subcomponents
    if (this.clock) {
      this.clock.destroy();
    }
    if (this.notifications) {
      this.notifications.destroy();
    }
    if (this.systemTray) {
      this.systemTray.destroy();
    }
    if (this.taskbar) {
      this.taskbar.destroy();
    }
    if (this.launcher) {
      this.launcher.destroy();
    }
    if (this.sessionManager) {
      this.sessionManager.destroy();
    }

    // Clean up DOM listeners
    for (const cleanup of this.domCleanups) {
      try {
        cleanup();
      } catch (err) {
        console.error('[DesktopEnvironment] Error in DOM cleanup:', err);
      }
    }
    this.domCleanups = [];

    // Clean up Kernel event listeners
    for (const cleanup of this.eventCleanups) {
      try {
        cleanup();
      } catch (err) {
        console.error('[DesktopEnvironment] Error in Kernel event cleanup:', err);
      }
    }
    this.eventCleanups = [];

    if (this.container) {
      this.container.innerHTML = '';
      this.container = null;
    }
    this.contextMenuEl = null;
    this.bootOverlayEl = null;
  }
}
