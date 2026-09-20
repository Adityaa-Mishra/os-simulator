/**
 * public/js/os/apps/browser/BrowserView.js
 * DOM rendering, user interaction, and Chrome-like layout controller for AdityyaOS Browser.
 * Features rounded tab strip, Incognito theme, Omnibox autocomplete, downloads shelf,
 * extensions popup, profile switcher, 3-dots menu, and sandboxed viewport.
 */

import { BrowserNavigation } from './BrowserNavigation.js';
import { escapeHtml } from '../../../utils/sanitize.js';

export class BrowserView {
  /**
   * @param {Object} options
   * @param {import('./BrowserState.js').BrowserState} options.state
   * @param {import('./BrowserTabs.js').BrowserTabs} options.tabs
   * @param {import('./BrowserHistory.js').BrowserHistory} options.history
   * @param {import('./BrowserBookmarks.js').BrowserBookmarks} options.bookmarks
   * @param {import('./BrowserProfileManager.js').BrowserProfileManager} [options.profileManager]
   * @param {import('./BrowserPasswordManager.js').BrowserPasswordManager} [options.passwords]
   * @param {import('./BrowserDownloads.js').BrowserDownloads} [options.downloads]
   * @param {import('./BrowserExtensions.js').BrowserExtensions} [options.extensions]
   * @param {Function} [options.onNavigate]
   * @param {Function} [options.openIncognitoWindow]
   * @param {Function} [options.openNewWindow]
   */
  constructor({
    state,
    tabs,
    history,
    bookmarks,
    profileManager = null,
    passwords = null,
    downloads = null,
    extensions = null,
    onNavigate = null,
    openIncognitoWindow = null,
    openNewWindow = null
  }) {
    this.state = state;
    this.tabs = tabs;
    this.history = history;
    this.bookmarks = bookmarks;
    this.profileManager = profileManager;
    this.passwords = passwords;
    this.downloads = downloads;
    this.extensions = extensions;
    this.onNavigate = onNavigate;
    this.openIncognitoWindow = openIncognitoWindow;
    this.openNewWindow = openNewWindow;

    this.container = null;
    this.errorMessage = null;
    this.showBookmarksBar = true;
    this.activeDropdown = null; // 'profile' | 'menu' | 'extensions' | null
    this.activeModal = null; // 'clearData' | 'addBookmark' | 'addPassword' | 'addProfile' | null
    this.cleanupListeners = [];
  }

  mount(container) {
    this.container = container;
    this.render();
  }

  render() {
    if (!this.container) return;

    const isIncognito = Boolean(this.state.isIncognito);
    const activeProfile = this.profileManager?.getActiveProfile() || {
      name: isIncognito ? 'Incognito' : 'Adityya User',
      avatar: isIncognito ? '🕶️' : '👤',
      avatarColor: isIncognito ? '#202124' : '#4285f4',
      email: isIncognito ? '' : 'user@adityya.os'
    };

    this.container.innerHTML = `
      <div class="os-browser-app ${isIncognito ? 'incognito' : ''}" role="region" aria-label="Web Browser">
        <!-- Chrome Tab Strip -->
        <div class="os-browser-tab-strip browser-tabbar">
          <div class="os-browser-tabs" id="browser-tabs-container" role="tablist">
            ${this.getTabsHtml()}
          </div>
          <button class="os-browser-new-tab-btn" id="btn-browser-new-tab" title="New Tab (Ctrl+T)" aria-label="New Tab">➕</button>
          ${isIncognito ? '<div class="chrome-incognito-pill"><span class="pill-icon">🕶️</span><span>Incognito</span></div>' : ''}
        </div>

        <!-- Chrome Navigation Toolbar -->
        <div class="os-browser-toolbar browser-toolbar">
          <div class="os-browser-nav-controls">
            <button class="os-browser-btn" id="btn-browser-back" title="Click to go back" aria-label="Back">←</button>
            <button class="os-browser-btn" id="btn-browser-forward" title="Click to go forward" aria-label="Forward">→</button>
            <button class="os-browser-btn" id="btn-browser-reload" title="Reload this page" aria-label="Reload">↻</button>
            <button class="os-browser-btn" id="btn-browser-home" title="Open the home page" aria-label="Home">🏠</button>
          </div>

          <!-- Omnibox -->
          <div class="os-browser-omnibox-wrapper">
            <form class="os-browser-address-form" id="browser-address-form">
              <span class="os-browser-ssl-icon" id="browser-ssl-icon" title="View site information">🔒</span>
              <input 
                type="text" 
                class="os-browser-omnibox" 
                id="browser-omnibox" 
                placeholder="Search Google or type a URL" 
                autocomplete="off" 
              />
              <button type="button" class="os-browser-popout-btn" id="btn-browser-popout" title="Open in new window / external tab" aria-label="Open externally">↗</button>
              <button type="button" class="os-browser-btn-star" id="btn-browser-bookmark" title="Bookmark this tab" aria-label="Bookmark">★</button>
            </form>
            <!-- Omnibox Suggestions Dropdown -->
            <div class="os-browser-omnibox-dropdown" id="browser-omnibox-dropdown" style="display: none;"></div>
          </div>

          <!-- Action Buttons: Extensions, Profile, 3-dots Menu -->
          <div class="os-browser-actions">
            <button class="os-browser-btn os-btn-action" id="btn-browser-extensions" title="Extensions" aria-label="Extensions">🧩</button>
            <button class="os-browser-btn os-btn-action os-btn-profile" id="btn-browser-profile" title="Current Profile: ${escapeHtml(activeProfile.name)}" aria-label="Profile">
              <span class="profile-avatar-circle" style="background-color: ${activeProfile.avatarColor || '#4285f4'};">${escapeHtml(activeProfile.avatar || '👤')}</span>
            </button>
            <button class="os-browser-btn os-btn-action" id="btn-browser-menu" title="Customize and control Google Chrome" aria-label="Menu">⋮</button>
          </div>
        </div>

        <!-- Bookmarks Bar -->
        <div class="os-browser-bookmarks-bar" id="browser-bookmarks-bar" style="${this.showBookmarksBar ? '' : 'display: none;'}">
          ${this.getBookmarksBarHtml()}
        </div>

        <!-- Viewport Area -->
        <div class="os-browser-viewport browser-viewport" id="browser-viewport">
          ${this.getViewportHtml()}
        </div>

        <!-- Bottom Downloads Shelf -->
        <div class="os-browser-downloads-shelf" id="browser-downloads-shelf" style="display: none;">
          <div class="shelf-header">
            <span class="shelf-title">Downloads</span>
            <button class="shelf-close-btn" id="btn-close-shelf" title="Close">✕</button>
          </div>
          <div class="shelf-items" id="shelf-items-container"></div>
        </div>

        <!-- Dropdown Menus Container -->
        <div class="os-browser-dropdowns" id="browser-dropdowns">
          ${this.getProfileDropdownHtml()}
          ${this.getExtensionsDropdownHtml()}
          ${this.getKebabMenuHtml()}
        </div>

        <!-- Modals Container -->
        <div class="os-browser-modals" id="browser-modals"></div>
      </div>
    `;

    this.bindEvents();
    this.updateToolbar();
  }

  getTabsHtml() {
    const allTabs = this.state.getAllTabs();
    const activeTab = this.state.getActiveTab();

    return allTabs.map(tab => {
      const isActive = activeTab?.id === tab.id;
      const isInternal = BrowserNavigation.isInternalUrl(tab.url);
      let icon = isInternal ? '⚛️' : '🌐';
      if (tab.url.includes('incognito')) icon = '🕶️';
      if (tab.url.includes('settings')) icon = '⚙️';
      if (tab.url.includes('passwords')) icon = '🔑';
      if (tab.url.includes('downloads')) icon = '📥';
      if (tab.url.includes('history')) icon = '🕒';
      if (tab.url.includes('bookmarks')) icon = '★';

      return `
        <div class="os-browser-tab ${isActive ? 'active' : ''} ${tab.isPinned ? 'pinned' : ''}" data-tab-id="${escapeHtml(tab.id)}" role="tab" aria-selected="${isActive}" title="${escapeHtml(tab.title || 'New Tab')}">
          <span class="os-browser-tab-icon">${icon}</span>
          ${!tab.isPinned ? `<span class="os-browser-tab-title">${escapeHtml(tab.title || 'New Tab')}</span>` : ''}
          ${tab.isMuted ? '<span class="os-browser-tab-muted" title="Muted">🔇</span>' : ''}
          <button class="os-browser-tab-close" data-close-id="${escapeHtml(tab.id)}" title="Close tab (Ctrl+W)" aria-label="Close Tab">✕</button>
        </div>
      `;
    }).join('');
  }

  getBookmarksBarHtml() {
    const bms = this.bookmarks.getBookmarks();
    return bms.map(b => `
      <button class="os-browser-bm-item" data-url="${escapeHtml(b.url)}" title="${escapeHtml(b.url)}">
        <span class="os-bm-icon">${BrowserNavigation.isInternalUrl(b.url) ? '⚛️' : '🌐'}</span>
        <span class="os-bm-title">${escapeHtml(b.title)}</span>
      </button>
    `).join('');
  }

  getViewportHtml() {
    if (this.errorMessage) {
      return `
        <div class="os-browser-error-view">
          <div class="error-card">
            <span class="error-icon">⚠️</span>
            <h3>Unable to display page</h3>
            <p>${escapeHtml(this.errorMessage || 'An error occurred')}</p>
            <button class="chrome-btn primary" id="btn-error-home">Return to New Tab</button>
          </div>
        </div>
      `;
    }

    const active = this.state.getActiveTab();
    if (!active) return '';

    const url = active.url || this.state.homeUrl;

    if (BrowserNavigation.isInternalUrl(url)) {
      return BrowserNavigation.renderInternalPage(url, {
        history: this.history,
        bookmarks: this.bookmarks,
        profile: this.profileManager?.getActiveProfile(),
        passwords: this.passwords,
        downloads: this.downloads,
        extensions: this.extensions,
        isIncognito: this.state.isIncognito,
        onNavigate: (newUrl) => this.loadUrlInActiveTab(newUrl)
      });
    }

    return `
      <div class="os-browser-web-container">
        <iframe 
          class="os-browser-iframe" 
          src="${escapeHtml(url)}" 
          sandbox="allow-scripts allow-same-origin allow-forms"
          title="Sandboxed Web Content"
        ></iframe>
        <div class="os-browser-embed-fallback" id="browser-embed-fallback" style="display: none;">
          <div class="os-browser-fallback-card">
            <span class="os-fallback-icon">🛡️</span>
            <h3>Website Security Notice</h3>
            <p>This website (<code>${escapeHtml(url)}</code>) restricts direct iframe embedding via <code>X-Frame-Options: SAMEORIGIN</code> or <code>Content-Security-Policy</code>.</p>
            <div class="os-fallback-actions">
              <button class="chrome-btn primary" id="btn-fallback-popout">Open in External Window ↗</button>
              <button class="chrome-btn-outline" id="btn-fallback-home">Return to New Tab</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  getProfileDropdownHtml() {
    const isIncognito = Boolean(this.state.isIncognito);
    const activeProfile = this.profileManager?.getActiveProfile() || { name: 'User', email: '', avatar: '👤' };
    const allProfiles = this.profileManager?.getProfiles() || [];

    return `
      <div class="chrome-dropdown-card profile-dropdown" id="dropdown-profile" style="display: none;">
        <div class="profile-dropdown-header">
          <div class="dropdown-avatar" style="background-color: ${activeProfile.avatarColor || '#4285f4'};">${escapeHtml(activeProfile.avatar || '👤')}</div>
          <h4>${escapeHtml(activeProfile.name)}</h4>
          <p>${escapeHtml(activeProfile.email || (isIncognito ? 'Incognito Mode' : 'Not signed in'))}</p>
          <div class="dropdown-sync-status">
            <span>${activeProfile.syncEnabled ? '✔ Sync is on' : 'Sync is off'}</span>
          </div>
        </div>

        <div class="dropdown-divider"></div>

        ${!isIncognito ? `
          <div class="dropdown-section">
            <h5>Other profiles</h5>
            <div class="other-profiles-list">
              ${allProfiles.map(p => `
                <button class="profile-switch-btn ${p.id === activeProfile.id ? 'active' : ''}" data-profile-id="${escapeHtml(p.id)}">
                  <span class="mini-avatar" style="background-color: ${p.avatarColor || '#4285f4'};">${escapeHtml(p.avatar || '👤')}</span>
                  <span>${escapeHtml(p.name)}</span>
                  ${p.id === activeProfile.id ? ' (Current)' : ''}
                </button>
              `).join('')}
            </div>
            <button class="dropdown-item-btn" id="btn-add-profile">➕ Add profile</button>
          </div>
          <div class="dropdown-divider"></div>
        ` : ''}

        <div class="dropdown-section">
          <button class="dropdown-item-btn" id="btn-menu-incognito">🕶️ New Incognito window</button>
        </div>
      </div>
    `;
  }

  getExtensionsDropdownHtml() {
    const exts = this.extensions?.getExtensions() || [];

    return `
      <div class="chrome-dropdown-card extensions-dropdown" id="dropdown-extensions" style="display: none;">
        <div class="dropdown-header-title">
          <h4>Extensions</h4>
          <button class="manage-exts-link os-internal-link" data-url="adityya://extensions">Manage extensions</button>
        </div>
        <p class="exts-subtext">No access needed</p>
        <div class="extensions-dropdown-list">
          ${exts.map(ext => `
            <div class="ext-dropdown-row">
              <span class="ext-mini-icon">${ext.icon || '🧩'}</span>
              <span class="ext-mini-title">${escapeHtml(ext.name)}</span>
              <label class="chrome-switch mini">
                <input type="checkbox" class="ext-quick-toggle" data-id="${escapeHtml(ext.id)}" ${ext.enabled ? 'checked' : ''} />
                <span class="chrome-slider"></span>
              </label>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  getKebabMenuHtml() {
    return `
      <div class="chrome-dropdown-card kebab-menu" id="dropdown-kebab" style="display: none;">
        <button class="kebab-item" id="kebab-new-tab">
          <span>New tab</span>
          <span class="shortcut">Ctrl+T</span>
        </button>
        <button class="kebab-item" id="kebab-new-window">
          <span>New window</span>
          <span class="shortcut">Ctrl+N</span>
        </button>
        <button class="kebab-item" id="kebab-new-incognito">
          <span>New Incognito window</span>
          <span class="shortcut">Ctrl+Shift+N</span>
        </button>
        <div class="dropdown-divider"></div>
        <button class="kebab-item os-internal-link" data-url="adityya://history">
          <span>History</span>
          <span class="shortcut">Ctrl+H</span>
        </button>
        <button class="kebab-item os-internal-link" data-url="adityya://downloads">
          <span>Downloads</span>
          <span class="shortcut">Ctrl+J</span>
        </button>
        <button class="kebab-item os-internal-link" data-url="adityya://bookmarks">
          <span>Bookmarks</span>
          <span class="shortcut">Ctrl+Shift+O</span>
        </button>
        <button class="kebab-item os-internal-link" data-url="adityya://passwords">
          <span>Google Password Manager</span>
        </button>
        <button class="kebab-item os-internal-link" data-url="adityya://extensions">
          <span>Extensions</span>
        </button>
        <div class="dropdown-divider"></div>
        <button class="kebab-item" id="kebab-clear-data">
          <span>Clear browsing data...</span>
          <span class="shortcut">Ctrl+Shift+Del</span>
        </button>
        <button class="kebab-item os-internal-link" data-url="adityya://settings">
          <span>Settings</span>
        </button>
        <button class="kebab-item os-internal-link" data-url="adityya://version">
          <span>About Google Chrome</span>
        </button>
      </div>
    `;
  }

  bindEvents() {
    // Top-level elements
    const btnNewTab = this.container.querySelector('#btn-browser-new-tab');
    const btnBack = this.container.querySelector('#btn-browser-back');
    const btnForward = this.container.querySelector('#btn-browser-forward');
    const btnReload = this.container.querySelector('#btn-browser-reload');
    const btnHome = this.container.querySelector('#btn-browser-home');
    const btnBookmark = this.container.querySelector('#btn-browser-bookmark');
    const btnPopout = this.container.querySelector('#btn-browser-popout');
    const btnExtensions = this.container.querySelector('#btn-browser-extensions');
    const btnProfile = this.container.querySelector('#btn-browser-profile');
    const btnMenu = this.container.querySelector('#btn-browser-menu');
    const addressForm = this.container.querySelector('#browser-address-form');
    const omnibox = this.container.querySelector('#browser-omnibox');
    const omniboxDropdown = this.container.querySelector('#browser-omnibox-dropdown');

    // Tab buttons & clicks
    const tabsContainer = this.container.querySelector('#browser-tabs-container');
    tabsContainer?.addEventListener('click', (e) => {
      const closeBtn = e.target.closest('.os-browser-tab-close');
      if (closeBtn) {
        e.stopPropagation();
        const tabId = closeBtn.getAttribute('data-close-id');
        this.tabs.closeTab(tabId);
        this.updateAll();
        return;
      }
      const tabEl = e.target.closest('.os-browser-tab');
      if (tabEl) {
        const tabId = tabEl.getAttribute('data-tab-id');
        this.tabs.setActiveTab(tabId);
        this.updateAll();
      }
    });

    const onNewTab = () => {
      this.tabs.createTab(this.state.homeUrl, this.state.isIncognito ? 'Incognito' : 'New Tab');
      this.updateAll();
    };

    const onBack = () => {
      const active = this.state.getActiveTab();
      if (active && active.canGoBack) {
        const prevUrl = this.tabs.goBack(active.id);
        if (prevUrl) this.loadUrlInActiveTab(prevUrl, false);
      }
    };

    const onForward = () => {
      const active = this.state.getActiveTab();
      if (active && active.canGoForward) {
        const nextUrl = this.tabs.goForward(active.id);
        if (nextUrl) this.loadUrlInActiveTab(nextUrl, false);
      }
    };

    const onReload = () => {
      const active = this.state.getActiveTab();
      if (active) this.loadUrlInActiveTab(active.url, false);
    };

    const onHome = () => {
      this.loadUrlInActiveTab(this.state.homeUrl);
    };

    const onBookmark = () => {
      const active = this.state.getActiveTab();
      if (!active) return;

      if (this.bookmarks.isBookmarked(active.url)) {
        this.bookmarks.removeBookmark(active.url);
      } else {
        this.bookmarks.addBookmark({ url: active.url, title: active.title });
      }
      this.updateBookmarksBar();
      this.updateBookmarkButton();
    };

    const onPopout = () => {
      const active = this.state.getActiveTab();
      if (active && active.url && typeof window !== 'undefined' && typeof window.open === 'function') {
        window.open(active.url, '_blank');
      }
    };

    const onSubmit = (e) => {
      e.preventDefault();
      const raw = omnibox?.value;
      if (raw) {
        const normalized = BrowserNavigation.normalizeUrl(raw);
        this.closeAllDropdowns();
        this.loadUrlInActiveTab(normalized);
      }
    };

    // Autocomplete on Omnibox Input
    const onOmniboxInput = () => {
      const val = omnibox?.value?.trim();
      if (!val || val.length === 0 || !omniboxDropdown) {
        if (omniboxDropdown) omniboxDropdown.style.display = 'none';
        return;
      }

      const suggestions = this.getSuggestions(val);
      if (suggestions.length === 0) {
        omniboxDropdown.style.display = 'none';
        return;
      }

      omniboxDropdown.innerHTML = suggestions.map(s => `
        <div class="omnibox-suggestion-item" data-url="${escapeHtml(s.url)}">
          <span class="sugg-icon">${s.icon}</span>
          <span class="sugg-title">${escapeHtml(s.title)}</span>
          <span class="sugg-url">${escapeHtml(s.url)}</span>
        </div>
      `).join('');

      omniboxDropdown.style.display = 'block';

      omniboxDropdown.querySelectorAll('.omnibox-suggestion-item').forEach(item => {
        item.addEventListener('click', () => {
          const u = item.getAttribute('data-url');
          if (u) {
            omniboxDropdown.style.display = 'none';
            this.loadUrlInActiveTab(u);
          }
        });
      });
    };

    btnNewTab?.addEventListener('click', onNewTab);
    btnBack?.addEventListener('click', onBack);
    btnForward?.addEventListener('click', onForward);
    btnReload?.addEventListener('click', onReload);
    btnHome?.addEventListener('click', onHome);
    btnBookmark?.addEventListener('click', onBookmark);
    btnPopout?.addEventListener('click', onPopout);
    addressForm?.addEventListener('submit', onSubmit);
    omnibox?.addEventListener('input', onOmniboxInput);

    // Dropdown Toggles
    btnProfile?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleDropdown('profile');
    });

    btnExtensions?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleDropdown('extensions');
    });

    btnMenu?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleDropdown('kebab');
    });

    // Close dropdowns on outside click
    const onDocumentClick = (e) => {
      if (!e.target.closest('.os-browser-dropdowns') && !e.target.closest('.os-browser-actions') && !e.target.closest('.os-browser-omnibox-wrapper')) {
        this.closeAllDropdowns();
        if (omniboxDropdown) omniboxDropdown.style.display = 'none';
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('click', onDocumentClick);
      this.cleanupListeners.push(() => document.removeEventListener('click', onDocumentClick));
    }

    // Bind Dropdown Items
    this.bindDropdownActions();
    this.bindInternalPageActions();
    this.bindBookmarksBarEvents();

    this.cleanupListeners.push(() => {
      btnNewTab?.removeEventListener('click', onNewTab);
      btnBack?.removeEventListener('click', onBack);
      btnForward?.removeEventListener('click', onForward);
      btnReload?.removeEventListener('click', onReload);
      btnHome?.removeEventListener('click', onHome);
      btnBookmark?.removeEventListener('click', onBookmark);
      btnPopout?.removeEventListener('click', onPopout);
      addressForm?.removeEventListener('submit', onSubmit);
      omnibox?.removeEventListener('input', onOmniboxInput);
    });
  }

  getSuggestions(query) {
    const q = query.toLowerCase();
    const suggestions = [];

    // Internal pages matching query
    const internalPages = [
      { title: 'New Tab', url: 'adityya://newtab', icon: '⚛️' },
      { title: 'Incognito Mode', url: 'adityya://incognito', icon: '🕶️' },
      { title: 'Settings', url: 'adityya://settings', icon: '⚙️' },
      { title: 'History', url: 'adityya://history', icon: '🕒' },
      { title: 'Bookmarks Manager', url: 'adityya://bookmarks', icon: '★' },
      { title: 'Google Password Manager', url: 'adityya://passwords', icon: '🔑' },
      { title: 'Downloads', url: 'adityya://downloads', icon: '📥' },
      { title: 'Extensions', url: 'adityya://extensions', icon: '🧩' },
      { title: 'About Google Chrome', url: 'adityya://version', icon: '🌐' }
    ];

    for (const p of internalPages) {
      if (p.title.toLowerCase().includes(q) || p.url.toLowerCase().includes(q)) {
        suggestions.push(p);
      }
    }

    // Bookmarks matching query
    const bms = this.bookmarks?.searchBookmarks(q) || [];
    for (const b of bms.slice(0, 3)) {
      suggestions.push({ title: b.title, url: b.url, icon: '★' });
    }

    // History matching query
    const hist = this.history?.search(q) || [];
    for (const h of hist.slice(0, 3)) {
      if (!suggestions.some(s => s.url === h.url)) {
        suggestions.push({ title: h.title || h.url, url: h.url, icon: '🕒' });
      }
    }

    // Google search suggestion
    suggestions.unshift({
      title: `Google Search: "${query}"`,
      url: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
      icon: '🔍'
    });

    return suggestions.slice(0, 6);
  }

  toggleDropdown(name) {
    const profileDropdown = this.container?.querySelector('#dropdown-profile');
    const extsDropdown = this.container?.querySelector('#dropdown-extensions');
    const kebabDropdown = this.container?.querySelector('#dropdown-kebab');

    if (this.activeDropdown === name) {
      this.closeAllDropdowns();
      return;
    }

    this.closeAllDropdowns();
    this.activeDropdown = name;

    if (name === 'profile' && profileDropdown) profileDropdown.style.display = 'block';
    if (name === 'extensions' && extsDropdown) extsDropdown.style.display = 'block';
    if (name === 'kebab' && kebabDropdown) kebabDropdown.style.display = 'block';
  }

  closeAllDropdowns() {
    this.activeDropdown = null;
    const cards = this.container?.querySelectorAll('.chrome-dropdown-card');
    cards?.forEach(card => card.style.display = 'none');
  }

  bindDropdownActions() {
    const profileDropdown = this.container?.querySelector('#dropdown-profile');
    const kebabDropdown = this.container?.querySelector('#dropdown-kebab');
    const extsDropdown = this.container?.querySelector('#dropdown-extensions');

    // Profile Switchers
    profileDropdown?.querySelectorAll('.profile-switch-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-profile-id');
        if (id && this.profileManager) {
          this.profileManager.switchProfile(id);
          this.closeAllDropdowns();
          this.updateAll();
        }
      });
    });

    // Add Profile Button
    profileDropdown?.querySelector('#btn-add-profile')?.addEventListener('click', () => {
      this.closeAllDropdowns();
      this.showAddProfileModal();
    });

    // New Incognito window
    const onNewIncognito = () => {
      this.closeAllDropdowns();
      if (typeof this.openIncognitoWindow === 'function') {
        this.openIncognitoWindow();
      } else {
        this.tabs.createTab('adityya://incognito', 'Incognito');
        this.updateAll();
      }
    };

    profileDropdown?.querySelector('#btn-menu-incognito')?.addEventListener('click', onNewIncognito);
    kebabDropdown?.querySelector('#kebab-new-incognito')?.addEventListener('click', onNewIncognito);

    // Kebab items
    kebabDropdown?.querySelector('#kebab-new-tab')?.addEventListener('click', () => {
      this.closeAllDropdowns();
      this.tabs.createTab(this.state.homeUrl);
      this.updateAll();
    });

    kebabDropdown?.querySelector('#kebab-new-window')?.addEventListener('click', () => {
      this.closeAllDropdowns();
      if (typeof this.openNewWindow === 'function') this.openNewWindow();
    });

    kebabDropdown?.querySelector('#kebab-clear-data')?.addEventListener('click', () => {
      this.closeAllDropdowns();
      this.showClearDataModal();
    });

    // Extension quick toggles
    extsDropdown?.querySelectorAll('.ext-quick-toggle').forEach(toggle => {
      toggle.addEventListener('change', () => {
        const id = toggle.getAttribute('data-id');
        if (id && this.extensions) {
          this.extensions.toggleExtension(id, toggle.checked);
        }
      });
    });
  }

  bindBookmarksBarEvents() {
    const bar = this.container?.querySelector('#browser-bookmarks-bar');
    if (!bar) return;

    bar.querySelectorAll('.os-browser-bm-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const u = btn.getAttribute('data-url');
        if (u) this.loadUrlInActiveTab(u);
      });
    });
  }

  bindInternalPageActions() {
    const viewport = this.container?.querySelector('#browser-viewport');
    if (!viewport) return;

    // Delegate clicks on .os-internal-link
    viewport.addEventListener('click', (e) => {
      const link = e.target.closest('.os-internal-link');
      if (link) {
        e.preventDefault();
        const targetUrl = link.getAttribute('data-url');
        if (targetUrl) this.loadUrlInActiveTab(targetUrl);
      }
    });

    // NTP Search Form
    const ntpForm = viewport.querySelector('#ntp-search-form');
    const ntpInput = viewport.querySelector('#ntp-search-input');
    ntpForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      const val = ntpInput?.value;
      if (val) {
        const normalized = BrowserNavigation.normalizeUrl(val);
        this.loadUrlInActiveTab(normalized);
      }
    });

    // Fallback actions
    viewport.querySelector('#btn-fallback-popout')?.addEventListener('click', () => {
      const active = this.state.getActiveTab();
      if (active && active.url && typeof window !== 'undefined') {
        window.open(active.url, '_blank');
      }
    });

    viewport.querySelector('#btn-fallback-home')?.addEventListener('click', () => {
      this.loadUrlInActiveTab(this.state.homeUrl);
    });

    viewport.querySelector('#btn-error-home')?.addEventListener('click', () => {
      this.loadUrlInActiveTab(this.state.homeUrl);
    });

    // Settings Actions
    viewport.querySelector('#btn-toggle-sync')?.addEventListener('click', () => {
      this.profileManager?.toggleSync();
      this.updateAll();
    });

    viewport.querySelector('#btn-open-clear-data')?.addEventListener('click', () => {
      this.showClearDataModal();
    });

    // History Actions: Delete single entry
    viewport.querySelectorAll('.chrome-item-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-delete-id');
        if (id && this.history) {
          this.history.removeEntry(id);
          this.updateAll();
        }
      });
    });

    viewport.querySelector('#btn-clear-history-page')?.addEventListener('click', () => {
      this.showClearDataModal();
    });

    // Bookmarks Actions: Delete bookmark
    viewport.querySelectorAll('.delete-bookmark-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const url = btn.getAttribute('data-url');
        if (url && this.bookmarks) {
          this.bookmarks.removeBookmark(url);
          this.updateAll();
        }
      });
    });

    viewport.querySelector('#btn-add-bookmark-modal')?.addEventListener('click', () => {
      this.showAddBookmarkModal();
    });

    // Passwords Actions: Show/Hide & Delete
    viewport.querySelectorAll('.toggle-pwd-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const pwd = btn.getAttribute('data-pwd');
        const span = viewport.querySelector(`#pwd-val-${id}`);
        if (span) {
          if (span.textContent === '••••••••') {
            span.textContent = pwd;
            btn.textContent = '🙈';
          } else {
            span.textContent = '••••••••';
            btn.textContent = '👁️';
          }
        }
      });
    });

    viewport.querySelectorAll('.delete-pwd-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        if (id && this.passwords) {
          this.passwords.removePassword(id);
          this.updateAll();
        }
      });
    });

    viewport.querySelector('#btn-add-password-modal')?.addEventListener('click', () => {
      this.showAddPasswordModal();
    });

    // Downloads Actions: Clear & Remove
    viewport.querySelectorAll('.delete-download-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        if (id && this.downloads) {
          this.downloads.removeDownload(id);
          this.updateAll();
        }
      });
    });

    viewport.querySelector('#btn-clear-downloads-page')?.addEventListener('click', () => {
      this.downloads?.clearDownloads();
      this.updateAll();
    });

    // Extensions Toggles
    viewport.querySelectorAll('.ext-toggle').forEach(toggle => {
      toggle.addEventListener('change', () => {
        const id = toggle.getAttribute('data-id');
        if (id && this.extensions) {
          this.extensions.toggleExtension(id, toggle.checked);
        }
      });
    });

    // Iframe error listener
    const iframe = viewport.querySelector('.os-browser-iframe');
    const fallback = viewport.querySelector('#browser-embed-fallback');
    if (iframe && fallback) {
      iframe.addEventListener('error', () => {
        fallback.style.display = 'flex';
      });
    }
  }

  showClearDataModal() {
    const modalsContainer = this.container?.querySelector('#browser-modals');
    if (!modalsContainer) return;

    modalsContainer.innerHTML = `
      <div class="chrome-modal-backdrop" id="modal-clear-data">
        <div class="chrome-modal-card">
          <div class="modal-header">
            <h3>Clear browsing data</h3>
            <button class="modal-close-btn" id="btn-modal-close">✕</button>
          </div>
          <div class="modal-body">
            <div class="modal-field">
              <label>Time range:</label>
              <select class="chrome-select" id="clear-timerange">
                <option value="all">All time</option>
                <option value="24h">Last 24 hours</option>
                <option value="7d">Last 7 days</option>
              </select>
            </div>
            <div class="modal-checkboxes">
              <label><input type="checkbox" id="check-clear-history" checked /> Browsing history</label>
              <label><input type="checkbox" id="check-clear-cookies" checked /> Cookies and other site data</label>
              <label><input type="checkbox" id="check-clear-cache" checked /> Cached images and files</label>
            </div>
          </div>
          <div class="modal-footer">
            <button class="chrome-btn-outline" id="btn-cancel-clear">Cancel</button>
            <button class="chrome-btn danger" id="btn-confirm-clear">Clear data</button>
          </div>
        </div>
      </div>
    `;

    const close = () => { modalsContainer.innerHTML = ''; };
    modalsContainer.querySelector('#btn-modal-close')?.addEventListener('click', close);
    modalsContainer.querySelector('#btn-cancel-clear')?.addEventListener('click', close);
    modalsContainer.querySelector('#btn-confirm-clear')?.addEventListener('click', () => {
      const clearHistory = modalsContainer.querySelector('#check-clear-history')?.checked;
      if (clearHistory && this.history) {
        this.history.clear();
      }
      close();
      this.updateAll();
    });
  }

  showAddBookmarkModal() {
    const modalsContainer = this.container?.querySelector('#browser-modals');
    if (!modalsContainer) return;

    const active = this.state.getActiveTab();

    modalsContainer.innerHTML = `
      <div class="chrome-modal-backdrop" id="modal-add-bookmark">
        <div class="chrome-modal-card">
          <div class="modal-header">
            <h3>Add Bookmark</h3>
            <button class="modal-close-btn" id="btn-modal-close">✕</button>
          </div>
          <div class="modal-body">
            <div class="modal-field">
              <label>Name:</label>
              <input type="text" class="chrome-input" id="bm-input-title" value="${escapeHtml(active?.title || '')}" />
            </div>
            <div class="modal-field">
              <label>URL:</label>
              <input type="text" class="chrome-input" id="bm-input-url" value="${escapeHtml(active?.url || 'https://')}" />
            </div>
          </div>
          <div class="modal-footer">
            <button class="chrome-btn-outline" id="btn-cancel-bm">Cancel</button>
            <button class="chrome-btn primary" id="btn-save-bm">Done</button>
          </div>
        </div>
      </div>
    `;

    const close = () => { modalsContainer.innerHTML = ''; };
    modalsContainer.querySelector('#btn-modal-close')?.addEventListener('click', close);
    modalsContainer.querySelector('#btn-cancel-bm')?.addEventListener('click', close);
    modalsContainer.querySelector('#btn-save-bm')?.addEventListener('click', () => {
      const title = modalsContainer.querySelector('#bm-input-title')?.value;
      const url = modalsContainer.querySelector('#bm-input-url')?.value;
      if (url && this.bookmarks) {
        this.bookmarks.addBookmark({ title, url });
      }
      close();
      this.updateAll();
    });
  }

  showAddPasswordModal() {
    const modalsContainer = this.container?.querySelector('#browser-modals');
    if (!modalsContainer) return;

    modalsContainer.innerHTML = `
      <div class="chrome-modal-backdrop" id="modal-add-pwd">
        <div class="chrome-modal-card">
          <div class="modal-header">
            <h3>Add Password</h3>
            <button class="modal-close-btn" id="btn-modal-close">✕</button>
          </div>
          <div class="modal-body">
            <div class="modal-field">
              <label>Website:</label>
              <input type="text" class="chrome-input" id="pwd-input-site" placeholder="example.com" />
            </div>
            <div class="modal-field">
              <label>Username:</label>
              <input type="text" class="chrome-input" id="pwd-input-user" placeholder="username or email" />
            </div>
            <div class="modal-field">
              <label>Password:</label>
              <input type="password" class="chrome-input" id="pwd-input-val" />
            </div>
          </div>
          <div class="modal-footer">
            <button class="chrome-btn-outline" id="btn-cancel-pwd">Cancel</button>
            <button class="chrome-btn primary" id="btn-save-pwd">Save</button>
          </div>
        </div>
      </div>
    `;

    const close = () => { modalsContainer.innerHTML = ''; };
    modalsContainer.querySelector('#btn-modal-close')?.addEventListener('click', close);
    modalsContainer.querySelector('#btn-cancel-pwd')?.addEventListener('click', close);
    modalsContainer.querySelector('#btn-save-pwd')?.addEventListener('click', () => {
      const site = modalsContainer.querySelector('#pwd-input-site')?.value;
      const username = modalsContainer.querySelector('#pwd-input-user')?.value;
      const password = modalsContainer.querySelector('#pwd-input-val')?.value;
      if (site && username && this.passwords) {
        this.passwords.addPassword({ site, username, password });
      }
      close();
      this.updateAll();
    });
  }

  showAddProfileModal() {
    const modalsContainer = this.container?.querySelector('#browser-modals');
    if (!modalsContainer) return;

    modalsContainer.innerHTML = `
      <div class="chrome-modal-backdrop" id="modal-add-profile">
        <div class="chrome-modal-card">
          <div class="modal-header">
            <h3>Add Chrome Profile</h3>
            <button class="modal-close-btn" id="btn-modal-close">✕</button>
          </div>
          <div class="modal-body">
            <div class="modal-field">
              <label>Profile Name:</label>
              <input type="text" class="chrome-input" id="prof-input-name" placeholder="e.g. Work, Personal" />
            </div>
            <div class="modal-field">
              <label>Email (optional):</label>
              <input type="email" class="chrome-input" id="prof-input-email" placeholder="user@adityya.os" />
            </div>
          </div>
          <div class="modal-footer">
            <button class="chrome-btn-outline" id="btn-cancel-prof">Cancel</button>
            <button class="chrome-btn primary" id="btn-save-prof">Create</button>
          </div>
        </div>
      </div>
    `;

    const close = () => { modalsContainer.innerHTML = ''; };
    modalsContainer.querySelector('#btn-modal-close')?.addEventListener('click', close);
    modalsContainer.querySelector('#btn-cancel-prof')?.addEventListener('click', close);
    modalsContainer.querySelector('#btn-save-prof')?.addEventListener('click', () => {
      const name = modalsContainer.querySelector('#prof-input-name')?.value;
      const email = modalsContainer.querySelector('#prof-input-email')?.value;
      if (name && this.profileManager) {
        this.profileManager.createProfile({ name, email });
      }
      close();
      this.updateAll();
    });
  }

  updateAll() {
    this.render();
  }

  updateToolbar() {
    const active = this.state.getActiveTab();
    const omnibox = this.container?.querySelector('#browser-omnibox');
    const btnBack = this.container?.querySelector('#btn-browser-back');
    const btnForward = this.container?.querySelector('#btn-browser-forward');
    const sslIcon = this.container?.querySelector('#browser-ssl-icon');

    if (active) {
      if (omnibox) omnibox.value = active.url || '';
      if (btnBack) {
        if (active.canGoBack) btnBack.removeAttribute('disabled');
        else btnBack.setAttribute('disabled', 'true');
      }
      if (btnForward) {
        if (active.canGoForward) btnForward.removeAttribute('disabled');
        else btnForward.setAttribute('disabled', 'true');
      }
      if (sslIcon) {
        sslIcon.textContent = active.url.startsWith('https://') || BrowserNavigation.isInternalUrl(active.url) ? '🔒' : '⚠️';
      }
    }

    this.updateBookmarkButton();
  }

  updateBookmarkButton() {
    const active = this.state.getActiveTab();
    const btnBookmark = this.container?.querySelector('#btn-browser-bookmark');
    if (!btnBookmark || !active) return;

    if (this.bookmarks.isBookmarked(active.url)) {
      btnBookmark.classList.add('bookmarked');
      btnBookmark.title = 'Remove bookmark';
    } else {
      btnBookmark.classList.remove('bookmarked');
      btnBookmark.title = 'Bookmark this tab';
    }
  }

  updateBookmarksBar() {
    const bar = this.container?.querySelector('#browser-bookmarks-bar');
    if (!bar) return;
    bar.innerHTML = this.getBookmarksBarHtml();
    this.bindBookmarksBarEvents();
  }

  loadUrlInActiveTab(url, isNewNavigation = true) {
    this.errorMessage = null;
    const active = this.state.getActiveTab();
    if (!active) return;

    if (isNewNavigation) {
      this.tabs.navigateTab(active.id, url);
      // Persist to global history only if NOT in incognito mode
      if (!this.state.isIncognito && this.history) {
        this.history.addEntry({ url, title: url });
      }
    } else {
      active.url = url;
    }

    if (typeof this.onNavigate === 'function') {
      this.onNavigate(url);
    }

    this.render();
  }

  showError(msg) {
    this.errorMessage = msg;
    this.render();
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
