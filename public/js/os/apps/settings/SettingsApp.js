/**
 * public/js/os/apps/settings/SettingsApp.js
 * Native AdityyaOS Settings Application.
 * Panels for System Status, Profile Info, Network Status, Appearance / Display, Applications, Storage, and About.
 * Strictly operates through AdityyaOS API facades.
 */

import { PackagePermissions } from '../../packages/PackagePermissions.js';
import { SYSTEM_APPLICATIONS } from '../../desktop/Launcher.js';
import { escapeHtml } from '../../../utils/sanitize.js';

export class SettingsApp {
  /**
   * @param {import('../../api/AdityyaOSAPI.js').AdityyaOSAPI|Object} apiOrOptions
   * @param {HTMLElement} [container]
   * @param {Object} [options={}]
   */
  constructor(apiOrOptions, container = null, options = {}) {
    if (apiOrOptions && typeof apiOrOptions === 'object' && !apiOrOptions.system && apiOrOptions.api) {
      this.api = apiOrOptions.api;
      this.container = apiOrOptions.container || container;
      this.options = apiOrOptions;
    } else {
      this.api = apiOrOptions;
      this.container = container;
      this.options = options;
    }

    this.activeTab = 'system';
    this.cleanupListeners = [];

    if (this.container) {
      this.init();
    }
  }

  /**
   * Mount Settings into a DOM container.
   * @param {HTMLElement} container
   */
  mount(container) {
    if (!container) return;
    this.container = container;
    this.init();
  }

  async init() {
    this.render();
    return this;
  }

  async setTab(tabName) {
    this.activeTab = tabName;
    this.render();
  }

  render() {
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="os-settings-app" role="region" aria-label="Settings">
        <!-- Sidebar Navigation -->
        <div class="os-settings-sidebar">
          <button class="os-settings-tab ${this.activeTab === 'system' ? 'active' : ''}" data-tab="system">
            <span>💻</span> System
          </button>
          <button class="os-settings-tab ${this.activeTab === 'profile' ? 'active' : ''}" data-tab="profile">
            <span>👤</span> Profile
          </button>
          <button class="os-settings-tab ${this.activeTab === 'network' ? 'active' : ''}" data-tab="network">
            <span>🌐</span> Network
          </button>
          <button class="os-settings-tab ${this.activeTab === 'display' || this.activeTab === 'appearance' ? 'active' : ''}" data-tab="display">
            <span>🖥️</span> Appearance
          </button>
          <button class="os-settings-tab ${this.activeTab === 'apps' ? 'active' : ''}" data-tab="apps">
            <span>📦</span> Applications
          </button>
          <button class="os-settings-tab ${this.activeTab === 'storage' ? 'active' : ''}" data-tab="storage">
            <span>💾</span> Storage
          </button>
          <button class="os-settings-tab ${this.activeTab === 'about' ? 'active' : ''}" data-tab="about">
            <span>ℹ️</span> About
          </button>
        </div>

        <!-- Panel Content -->
        <div class="os-settings-content" id="settings-panel">
          ${this.getPanelHtml(this.activeTab)}
        </div>
      </div>
    `;

    this.bindEvents();
  }

  bindEvents() {
    const tabs = this.container?.querySelectorAll('.os-settings-tab');
    tabs?.forEach(tab => {
      const onTabClick = () => {
        const target = tab.getAttribute('data-tab');
        if (target && target !== this.activeTab) {
          this.setTab(target);
        }
      };
      tab.addEventListener('click', onTabClick);
      this.cleanupListeners.push(() => tab.removeEventListener('click', onTabClick));
    });

    // Appearance: Theme toggle button
    const themeToggleBtn = this.container?.querySelector('#btn-toggle-theme, .btn-toggle-theme');
    if (themeToggleBtn) {
      const onToggleClick = () => this.toggleTheme();
      themeToggleBtn.addEventListener('click', onToggleClick);
      this.cleanupListeners.push(() => themeToggleBtn.removeEventListener('click', onToggleClick));
    }

    // Appearance: Theme cards
    const themeCards = this.container?.querySelectorAll('.theme-card');
    themeCards?.forEach(card => {
      const onCardClick = () => {
        const theme = card.getAttribute('data-theme');
        if (theme) this.setTheme(theme);
      };
      card.addEventListener('click', onCardClick);
      this.cleanupListeners.push(() => card.removeEventListener('click', onCardClick));
    });

    // Appearance: Accent swatches
    const accentSwatches = this.container?.querySelectorAll('.accent-swatch');
    accentSwatches?.forEach(swatch => {
      const onSwatchClick = () => {
        const color = swatch.getAttribute('data-color');
        if (color) this.setAccent(color);
      };
      swatch.addEventListener('click', onSwatchClick);
      this.cleanupListeners.push(() => swatch.removeEventListener('click', onSwatchClick));
    });

    // Appearance: Wallpaper cards
    const wallpaperCards = this.container?.querySelectorAll('.wallpaper-card');
    wallpaperCards?.forEach(card => {
      const onWpClick = () => {
        const wp = card.getAttribute('data-wallpaper');
        if (wp) this.setWallpaper(wp);
      };
      card.addEventListener('click', onWpClick);
      this.cleanupListeners.push(() => card.removeEventListener('click', onWpClick));
    });

    // Appearance: Font scale buttons
    const scaleBtns = this.container?.querySelectorAll('.scale-btn');
    scaleBtns?.forEach(btn => {
      const onScaleClick = () => {
        const scale = btn.getAttribute('data-scale');
        if (scale) this.setFontScale(scale);
      };
      btn.addEventListener('click', onScaleClick);
      this.cleanupListeners.push(() => btn.removeEventListener('click', onScaleClick));
    });

    // Appearance: Glassmorphism switch
    const glassToggle = this.container?.querySelector('#toggle-glassmorphism');
    if (glassToggle) {
      const onGlassToggle = () => this.toggleGlassmorphism(glassToggle.checked);
      glassToggle.addEventListener('change', onGlassToggle);
      this.cleanupListeners.push(() => glassToggle.removeEventListener('change', onGlassToggle));
    }

    // App launch buttons in Applications panel
    const launchBtns = this.container?.querySelectorAll('.btn-launch-app');
    launchBtns?.forEach(btn => {
      const onLaunch = () => {
        const appId = btn.getAttribute('data-app-id');
        if (!appId) return;

        // 1. Try WindowAPI create
        if (this.api?.window && typeof this.api.window.create === 'function') {
          this.api.window.create({ appId });
          return;
        }

        // 2. Try ApplicationAPI launch
        if (this.api?.app && typeof this.api.app.launch === 'function') {
          this.api.app.launch(appId);
          return;
        }

        // 3. Try WindowManager direct
        if (this.api?.windowManager && typeof this.api.windowManager.openWindow === 'function') {
          const registry = this.api.windowManager.applicationRegistry;
          const app = registry?.get?.(appId) || SYSTEM_APPLICATIONS.find(a => a.id === appId);
          if (app) {
            const view = typeof app.createView === 'function'
              ? app.createView({ windowManager: this.api.windowManager })
              : null;
            this.api.windowManager.openWindow({
              appId: app.id,
              title: app.name,
              icon: app.icon,
              width: app.defaultWidth,
              height: app.defaultHeight,
              singleton: app.singleton,
              view
            });
            return;
          }
        }

        // 4. Try global Shell / DesktopEnvironment
        if (typeof window !== 'undefined') {
          if (window.adityyaShell && typeof window.adityyaShell.launch === 'function') {
            window.adityyaShell.launch(appId);
            return;
          }
          if (window.desktop && typeof window.desktop.openApp === 'function') {
            window.desktop.openApp(appId);
            return;
          }
        }
      };
      btn.addEventListener('click', onLaunch);
      this.cleanupListeners.push(() => btn.removeEventListener('click', onLaunch));
    });
  }

  setTheme(nextTheme) {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', nextTheme);
    }
    if (typeof localStorage !== 'undefined') {
      try { localStorage.setItem('theme', nextTheme); } catch {}
    }
    if (this.api?.profile && typeof this.api.profile.updatePreferences === 'function') {
      try { this.api.profile.updatePreferences({ theme: nextTheme }); } catch {}
    }
    this.render();
  }

  toggleTheme() {
    if (typeof document === 'undefined') return;
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
    const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
    this.setTheme(nextTheme);
  }

  setAccent(accentColor) {
    if (typeof document !== 'undefined') {
      document.documentElement.style.setProperty('--accent-primary', accentColor);
      document.documentElement.setAttribute('data-accent', accentColor);
    }
    if (typeof localStorage !== 'undefined') {
      try { localStorage.setItem('accentColor', accentColor); } catch {}
    }
    if (this.api?.profile && typeof this.api.profile.updatePreferences === 'function') {
      try { this.api.profile.updatePreferences({ accentColor }); } catch {}
    }
    this.render();
  }

  setWallpaper(wallpaper) {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-wallpaper', wallpaper);
    }
    if (typeof localStorage !== 'undefined') {
      try { localStorage.setItem('wallpaper', wallpaper); } catch {}
    }
    if (this.api?.profile && typeof this.api.profile.updatePreferences === 'function') {
      try { this.api.profile.updatePreferences({ wallpaper }); } catch {}
    }
    this.render();
  }

  setFontScale(fontScale) {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-font-scale', fontScale);
    }
    if (typeof localStorage !== 'undefined') {
      try { localStorage.setItem('fontScale', fontScale); } catch {}
    }
    if (this.api?.profile && typeof this.api.profile.updatePreferences === 'function') {
      try { this.api.profile.updatePreferences({ fontScale }); } catch {}
    }
    this.render();
  }

  toggleGlassmorphism(checked) {
    const effect = checked ? 'glass' : 'solid';
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-effects', effect);
    }
    if (typeof localStorage !== 'undefined') {
      try { localStorage.setItem('effects', effect); } catch {}
    }
    if (this.api?.profile && typeof this.api.profile.updatePreferences === 'function') {
      try { this.api.profile.updatePreferences({ glassmorphism: Boolean(checked) }); } catch {}
    }
    this.render();
  }

  renderPanel() {
    const panel = this.container?.querySelector('#settings-panel');
    if (panel) {
      panel.innerHTML = this.getPanelHtml(this.activeTab);
    }
  }

  getPanelHtml(tabName) {
    switch (tabName) {
      case 'system':
        return this.getSystemPanelHtml();
      case 'profile':
        return this.getProfilePanelHtml();
      case 'network':
        return this.getNetworkPanelHtml();
      case 'display':
      case 'appearance':
        return this.getDisplayPanelHtml();
      case 'apps':
        return this.getAppsPanelHtml();
      case 'storage':
        return this.getStoragePanelHtml();
      case 'about':
        return this.getAboutPanelHtml();
      default:
        return this.getSystemPanelHtml();
    }
  }

  getSystemPanelHtml() {
    const info = this.api?.system?.getInfo ? this.api.system.getInfo() : {
      name: 'AdityyaOS',
      version: '1.0.0',
      kernelVersion: '1.0.0',
      arch: 'x86_64-sim',
      user: 'user',
      status: 'RUNNING'
    };
    const uptimeSec = this.api?.system?.getUptime ? this.api.system.getUptime() : 0;

    // Memory usage
    let memHtml = 'Unavailable';
    if (this.api?.memory && typeof this.api.memory.getUsage === 'function') {
      try {
        const mem = this.api.memory.getUsage();
        const pct = mem.totalMemory > 0 ? Math.round((mem.usedMemory / mem.totalMemory) * 100) : 0;
        memHtml = `${this.formatBytes(mem.usedMemory)} / ${this.formatBytes(mem.totalMemory)} (${pct}%)`;
      } catch {}
    }

    return `
      <div class="os-settings-section">
        <h3>System Status & Information</h3>
        <table class="os-settings-table">
          <tr><th>Operating System</th><td>${escapeHtml(info.name)}</td></tr>
          <tr><th>Version</th><td>v${escapeHtml(info.version)}</td></tr>
          <tr><th>Kernel Version</th><td>v${escapeHtml(info.kernelVersion)}</td></tr>
          <tr><th>Architecture</th><td>${escapeHtml(info.arch)}</td></tr>
          <tr><th>Current User</th><td>${escapeHtml(info.user)}</td></tr>
          <tr><th>System Status</th><td><span class="badge success">${escapeHtml(info.status)}</span></td></tr>
          <tr><th>Uptime</th><td>${this.formatUptime(uptimeSec)}</td></tr>
          <tr><th>Memory Usage</th><td>${escapeHtml(memHtml)}</td></tr>
        </table>
      </div>
    `;
  }

  getProfilePanelHtml() {
    let profile = null;
    if (this.api?.profile && typeof this.api.profile.getCurrent === 'function') {
      try {
        profile = this.api.profile.getCurrent();
      } catch {}
    }

    const username = profile?.username || this.api?.system?.getInfo?.()?.user || 'user';
    const displayName = profile?.displayName || username;
    const homeDir = profile?.homeDirectory || `/home/${username}`;
    const createdAt = profile?.createdAt ? new Date(profile.createdAt).toLocaleString() : 'System Boot';

    return `
      <div class="os-settings-section">
        <h3>User Profile</h3>
        <table class="os-settings-table">
          <tr><th>Username</th><td>${escapeHtml(username)}</td></tr>
          <tr><th>Display Name</th><td>${escapeHtml(displayName)}</td></tr>
          <tr><th>Home Directory</th><td><code>${escapeHtml(homeDir)}</code></td></tr>
          <tr><th>Account Created</th><td>${escapeHtml(createdAt)}</td></tr>
          <tr><th>Profile Status</th><td><span class="badge success">Active</span></td></tr>
        </table>
      </div>
    `;
  }

  getNetworkPanelHtml() {
    let interfaces = [];
    if (this.api?.network && typeof this.api.network.getInterfaces === 'function') {
      try {
        interfaces = this.api.network.getInterfaces();
      } catch {}
    }

    // Default virtual interfaces if none returned
    if (!interfaces || interfaces.length === 0) {
      interfaces = [
        { name: 'lo0', ip: '127.0.0.1', netmask: '255.0.0.0', mac: '00:00:00:00:00:00', status: 'UP' },
        { name: 'eth0', ip: '192.168.1.100', netmask: '255.255.255.0', mac: '02:00:00:ad:17:01', status: 'UP' }
      ];
    }

    return `
      <div class="os-settings-section">
        <h3>Network Status</h3>
        <p>Virtual network interfaces and connectivity state:</p>
        <table class="os-settings-table">
          <thead>
            <tr>
              <th>Interface</th>
              <th>IP Address</th>
              <th>Netmask</th>
              <th>MAC Address</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${interfaces.map(iface => `
              <tr>
                <td><strong>${escapeHtml(iface.name || '')}</strong></td>
                <td>${escapeHtml(iface.ip || '—')}</td>
                <td>${escapeHtml(iface.netmask || '—')}</td>
                <td><code>${escapeHtml(iface.mac || '—')}</code></td>
                <td><span class="badge ${iface.status === 'UP' ? 'success' : 'danger'}">${escapeHtml(iface.status || 'UP')}</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  getDisplayPanelHtml() {
    const width = typeof window !== 'undefined' ? (window.innerWidth || 1280) : 1280;
    const height = typeof window !== 'undefined' ? (window.innerHeight || 800) : 800;

    let prefs = {};
    if (this.api?.profile && typeof this.api.profile.getCurrent === 'function') {
      try {
        prefs = this.api.profile.getCurrent()?.preferences || {};
      } catch {}
    }

    const currentTheme = (typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme')) || prefs.theme || 'dark';
    const currentAccent = (typeof document !== 'undefined' && document.documentElement.getAttribute('data-accent')) || prefs.accentColor || '#00f2fe';
    const currentWallpaper = (typeof document !== 'undefined' && document.documentElement.getAttribute('data-wallpaper')) || prefs.wallpaper || 'obsidian';
    const currentFontScale = (typeof document !== 'undefined' && document.documentElement.getAttribute('data-font-scale')) || prefs.fontScale || 'medium';
    const currentEffects = (typeof document !== 'undefined' && document.documentElement.getAttribute('data-effects')) || (prefs.glassmorphism === false ? 'solid' : 'glass');

    const accents = [
      { id: '#00f2fe', name: 'Neon Cyan', color: '#00f2fe' },
      { id: '#3b82f6', name: 'Electric Blue', color: '#3b82f6' },
      { id: '#10b981', name: 'Emerald Green', color: '#10b981' },
      { id: '#f59e0b', name: 'Amber Gold', color: '#f59e0b' },
      { id: '#8b5cf6', name: 'Cyber Violet', color: '#8b5cf6' },
      { id: '#f43f5e', name: 'Crimson Rose', color: '#f43f5e' }
    ];

    const wallpapers = [
      {
        id: 'obsidian',
        name: 'Obsidian Lab',
        gradient: 'radial-gradient(ellipse at 20% 20%, rgba(37, 99, 235, 0.4), transparent 50%), linear-gradient(135deg, #090d16 0%, #0f172a 100%)'
      },
      {
        id: 'nebula',
        name: 'Deep Space',
        gradient: 'radial-gradient(circle at 70% 30%, rgba(139, 92, 246, 0.5), transparent 50%), linear-gradient(135deg, #0f0c1b 0%, #1a103c 100%)'
      },
      {
        id: 'cyber',
        name: 'Cyber Neon',
        gradient: 'radial-gradient(ellipse at 50% 0%, rgba(0, 242, 254, 0.4), transparent 60%), linear-gradient(180deg, #050811 0%, #0c1222 100%)'
      },
      {
        id: 'sunset',
        name: 'Sunset Twilight',
        gradient: 'radial-gradient(ellipse at 30% 80%, rgba(245, 158, 11, 0.4), transparent 50%), linear-gradient(135deg, #18091e 0%, #2c1236 100%)'
      },
      {
        id: 'slate',
        name: 'Minimal Slate',
        gradient: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)'
      }
    ];

    return `
      <div class="os-settings-section">
        <h3>Display & Appearance</h3>

        <!-- Display Metrics -->
        <table class="os-settings-table" style="margin-bottom: 20px;">
          <tr><th>Display Resolution</th><td>${width} × ${height} px</td></tr>
          <tr><th>Color Mode</th><td>24-bit TrueColor (sRGB)</td></tr>
          <tr><th>Active Theme</th><td>${currentTheme === 'dark' ? 'Dark Theme' : 'Light Theme'}</td></tr>
        </table>

        <!-- Theme Mode Selection -->
        <div class="os-appearance-group">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <div class="os-appearance-group-title" style="margin-bottom: 0;">Theme Mode</div>
            <button id="btn-toggle-theme" class="btn btn-secondary btn-toggle-theme" style="padding: 4px 10px; font-size: 12px; cursor: pointer;">
              Toggle Theme
            </button>
          </div>
          <div class="os-theme-cards">
            <div class="os-theme-card theme-card ${currentTheme === 'dark' ? 'active' : ''}" data-theme="dark">
              <div class="os-theme-preview dark">
                <div class="os-theme-preview-bar"></div>
                <div class="os-theme-preview-box"></div>
              </div>
              <div class="os-theme-card-info">
                <span class="os-theme-card-name">Dark Theme</span>
                ${currentTheme === 'dark' ? '<span class="os-theme-card-badge">Active</span>' : ''}
              </div>
            </div>

            <div class="os-theme-card theme-card ${currentTheme === 'light' ? 'active' : ''}" data-theme="light">
              <div class="os-theme-preview light">
                <div class="os-theme-preview-bar"></div>
                <div class="os-theme-preview-box"></div>
              </div>
              <div class="os-theme-card-info">
                <span class="os-theme-card-name">Light Theme</span>
                ${currentTheme === 'light' ? '<span class="os-theme-card-badge">Active</span>' : ''}
              </div>
            </div>
          </div>
        </div>

        <!-- Accent Color Palette -->
        <div class="os-appearance-group">
          <div class="os-appearance-group-title">Accent Color</div>
          <div class="os-accent-grid">
            ${accents.map(acc => `
              <button class="os-accent-swatch accent-swatch ${currentAccent === acc.id ? 'active' : ''}"
                data-color="${escapeHtml(acc.id)}"
                title="${escapeHtml(acc.name)}"
                style="background-color: ${escapeHtml(acc.color)};">
              </button>
            `).join('')}
          </div>
        </div>

        <!-- Desktop Wallpaper -->
        <div class="os-appearance-group">
          <div class="os-appearance-group-title">Desktop Wallpaper</div>
          <div class="os-wallpaper-grid">
            ${wallpapers.map(wp => `
              <div class="os-wallpaper-card wallpaper-card ${currentWallpaper === wp.id ? 'active' : ''}" data-wallpaper="${escapeHtml(wp.id)}">
                <div class="os-wallpaper-thumb" style="background: ${wp.gradient};"></div>
                <div class="os-wallpaper-name">${escapeHtml(wp.name)}</div>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- UI & Font Scaling -->
        <div class="os-appearance-group">
          <div class="os-appearance-group-title">UI & Font Scaling</div>
          <div class="os-scale-selector">
            <button class="os-scale-btn scale-btn ${currentFontScale === 'small' ? 'active' : ''}" data-scale="small">Small (90%)</button>
            <button class="os-scale-btn scale-btn ${currentFontScale === 'medium' ? 'active' : ''}" data-scale="medium">Normal (100%)</button>
            <button class="os-scale-btn scale-btn ${currentFontScale === 'large' ? 'active' : ''}" data-scale="large">Large (115%)</button>
          </div>
        </div>

        <!-- Window Effects & Transparency -->
        <div class="os-appearance-group">
          <div class="os-appearance-group-title">Window Effects</div>
          <div class="os-toggle-row">
            <div class="os-toggle-info">
              <strong>Acrylic Glassmorphism</strong>
              <span>Translucent blurred window backdrops and taskbar glass effect</span>
            </div>
            <label class="os-switch">
              <input type="checkbox" id="toggle-glassmorphism" ${currentEffects === 'glass' ? 'checked' : ''} />
              <span class="os-slider"></span>
            </label>
          </div>
        </div>
      </div>
    `;
  }

  getAppsPanelHtml() {
    let apps = [];
    if (this.api?.app?._runtime?.loader) {
      apps = this.api.app._runtime.loader.getAll();
    }
    if (!apps || apps.length === 0) {
      apps = SYSTEM_APPLICATIONS.map(a => ({
        id: a.id,
        name: a.name,
        description: a.description,
        version: '1.0.0',
        window: { icon: a.icon },
        permissions: ['system.read', 'filesystem.read', 'window.control']
      }));
    }

    return `
      <div class="os-settings-section">
        <h3>Installed Applications (${apps.length})</h3>
        <div class="os-settings-app-list">
          ${apps.map(app => `
            <div class="os-settings-app-card">
              <span class="os-app-card-icon">${escapeHtml(app.window?.icon || app.icon || '📦')}</span>
              <div class="os-app-card-meta">
                <strong>${escapeHtml(app.name || app.id)}</strong>
                <span>v${escapeHtml(app.version || '1.0.0')}</span>
                <p>${escapeHtml(app.description || '')}</p>
                <div class="os-app-card-perms">
                  ${(app.permissions || []).map(p => `<span class="badge perm">${escapeHtml(p)}</span>`).join('')}
                </div>
              </div>
              <button class="os-settings-btn btn-launch-app" data-app-id="${escapeHtml(app.id)}" style="margin-left: auto;">
                Launch
              </button>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  getStoragePanelHtml() {
    let usage = null;
    try {
      usage = this.api?.fs?.getUsage ? this.api.fs.getUsage() : null;
    } catch {
      usage = null;
    }

    return `
      <div class="os-settings-section">
        <h3>Storage Usage & Filesystem</h3>
        ${usage ? `
          <table class="os-settings-table">
            <tr><th>Filesystem</th><td>AdityyaFS (Virtual Block Device)</td></tr>
            <tr><th>Block Size</th><td>${usage.blockSize} bytes</td></tr>
            <tr><th>Total Blocks</th><td>${usage.totalBlocks} (${this.formatBytes(usage.totalBytes)})</td></tr>
            <tr><th>Allocated Blocks</th><td>${usage.usedBlocks} (${this.formatBytes(usage.usedBytes)})</td></tr>
            <tr><th>Free Blocks</th><td>${usage.freeBlocks} (${this.formatBytes(usage.freeBytes)})</td></tr>
          </table>
          <div class="os-storage-bar-container">
            <div class="os-storage-bar" style="width: ${Math.round((usage.usedBlocks / Math.max(1, usage.totalBlocks)) * 100)}%;"></div>
          </div>
          <p class="os-storage-percent">Storage Usage: ${Math.round((usage.usedBlocks / Math.max(1, usage.totalBlocks)) * 100)}% Used</p>
        ` : `
          <p>Filesystem telemetry unavailable.</p>
        `}
      </div>
    `;
  }

  getAboutPanelHtml() {
    return `
      <div class="os-settings-section">
        <h3>About AdityyaOS</h3>
        <p><strong>AdityyaOS</strong> is a web-based educational operating system simulator featuring a simulated kernel, process manager, scheduler, virtual filesystem (AdityyaFS), window manager, shell, and native application runtime.</p>
        <table class="os-settings-table">
          <tr><th>Author</th><td>Adityya Mishra</td></tr>
          <tr><th>License</th><td>MIT License</td></tr>
          <tr><th>Architecture</th><td>Vanilla JavaScript (ES Modules), Controlled OS APIs</td></tr>
          <tr><th>Active Phase</th><td>AdityyaOS Simulator</td></tr>
        </table>
      </div>
    `;
  }

  formatUptime(sec) {
    if (typeof sec !== 'number' || isNaN(sec)) return '0s';
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    return `${h}h ${m}m ${s}s (${sec} ticks)`;
  }

  formatBytes(bytes) {
    if (typeof bytes !== 'number' || isNaN(bytes) || bytes === 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  destroy() {
    for (const cleanup of this.cleanupListeners) {
      try { cleanup(); } catch {}
    }
    this.cleanupListeners = [];
    if (this.container) {
      this.container.innerHTML = '';
      this.container = null;
    }
  }
}

/**
 * Standard AdityyaOS Application Definition for Settings.
 */
export const settingsApp = Object.freeze({
  id: 'settings',
  name: 'Settings',
  version: '1.0.0',
  description: 'System preferences, display, & configuration',
  icon: '⚙️',
  category: 'System',
  permissions: Object.freeze([
    PackagePermissions.SYSTEM_READ,
    PackagePermissions.FILESYSTEM_READ,
    PackagePermissions.MEMORY_READ,
    PackagePermissions.PROFILE_READ,
    PackagePermissions.PROFILE_WRITE,
    PackagePermissions.NETWORK_READ,
    PackagePermissions.WINDOW_CONTROL,
    PackagePermissions.APPLICATION_LIFECYCLE
  ]),
  window: Object.freeze({
    title: 'Settings',
    icon: '⚙️',
    width: 620,
    height: 440,
    singleton: true
  }),
  entry: (api, container, options) => {
    const app = new SettingsApp(api, container, options);
    return {
      destroy: () => app.destroy()
    };
  }
});
