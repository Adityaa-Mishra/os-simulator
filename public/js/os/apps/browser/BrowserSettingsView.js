/**
 * public/js/os/apps/browser/BrowserSettingsView.js
 * Comprehensive template renderer for internal browser pages (chrome:// and adityya://).
 * Renders New Tab, Incognito, Settings, History, Bookmarks, Passwords, Downloads, Extensions, and Version.
 */

import { escapeHtml } from '../../../utils/sanitize.js';

export class BrowserSettingsView {
  /**
   * Render internal page HTML based on URL and context.
   * @param {string} url
   * @param {Object} context
   * @returns {string}
   */
  static renderPage(url, context = {}) {
    const clean = url.replace(/^(adityya|chrome):\/\//, '').toLowerCase().split('?')[0];

    switch (clean) {
      case 'newtab':
      case 'welcome':
      case '':
        return this.renderNewTab(context);
      case 'incognito':
        return this.renderIncognito(context);
      case 'settings':
        return this.renderSettings(context);
      case 'history':
        return this.renderHistory(context);
      case 'bookmarks':
        return this.renderBookmarks(context);
      case 'passwords':
        return this.renderPasswords(context);
      case 'downloads':
        return this.renderDownloads(context);
      case 'extensions':
        return this.renderExtensions(context);
      case 'version':
      case 'about':
        return this.renderVersion(context);
      default:
        return `
          <div class="os-browser-internal-page error">
            <h2>404 - Page Not Found</h2>
            <p>The internal page <code>${escapeHtml(url)}</code> does not exist.</p>
            <p><a href="#" class="os-internal-link" data-url="adityya://newtab">Return to New Tab</a></p>
          </div>
        `;
    }
  }

  static renderNewTab(context = {}) {
    const bookmarks = typeof context.bookmarks?.getBookmarks === 'function'
      ? context.bookmarks.getBookmarks()
      : (Array.isArray(context.bookmarks) ? context.bookmarks : (context.bookmarks?.bookmarks || []));

    const quickLinks = bookmarks.slice(0, 8);

    return `
      <div class="os-browser-internal-page chrome-newtab">
        <div class="chrome-ntp-header">
          <div class="chrome-ntp-links">
            <a href="#" class="os-internal-link" data-url="https://mail.google.com">Gmail</a>
            <a href="#" class="os-internal-link" data-url="https://images.google.com">Images</a>
            <button class="chrome-ntp-apps-btn" title="Google apps">⋮⋮⋮</button>
            <button class="chrome-ntp-avatar-btn" id="ntp-avatar-btn" title="Google Account">👤</button>
          </div>
        </div>

        <div class="chrome-ntp-center">
          <div class="chrome-google-logo">
            <span class="logo-g">G</span><span class="logo-o1">o</span><span class="logo-o2">o</span><span class="logo-g2">g</span><span class="logo-l">l</span><span class="logo-e">e</span>
          </div>

          <div class="chrome-ntp-searchbox">
            <form id="ntp-search-form" class="chrome-search-form">
              <span class="chrome-search-icon">🔍</span>
              <input type="text" id="ntp-search-input" placeholder="Search Google or type a URL" autocomplete="off" />
              <span class="chrome-voice-icon" title="Search by voice">🎙️</span>
            </form>
          </div>

          <div class="chrome-ntp-shortcuts">
            ${quickLinks.map(b => `
              <button class="chrome-shortcut-tile os-internal-link" data-url="${escapeHtml(b.url)}" title="${escapeHtml(b.title)}">
                <div class="chrome-shortcut-icon">${b.url.startsWith('adityya://') || b.url.startsWith('chrome://') ? '⚛️' : '🌐'}</div>
                <div class="chrome-shortcut-title">${escapeHtml(b.title || b.url)}</div>
              </button>
            `).join('')}
            <button class="chrome-shortcut-tile add-shortcut" id="btn-ntp-add-shortcut" title="Add shortcut">
              <div class="chrome-shortcut-icon">➕</div>
              <div class="chrome-shortcut-title">Add shortcut</div>
            </button>
          </div>
        </div>

        <div class="chrome-ntp-footer">
          <button class="chrome-customize-btn" id="btn-ntp-customize">✏️ Customize Chrome</button>
        </div>
      </div>
    `;
  }

  static renderIncognito(context = {}) {
    return `
      <div class="os-browser-internal-page chrome-incognito">
        <div class="chrome-incognito-card">
          <div class="chrome-incognito-icon">🕶️</div>
          <h1>You’ve gone Incognito</h1>
          <p class="chrome-incognito-subtitle">
            Now you can browse privately, and other people who use this device won’t see your activity.
            However, downloads and bookmarks will be saved.
          </p>

          <div class="chrome-incognito-columns">
            <div class="incognito-col">
              <h3>Chrome won’t save:</h3>
              <ul>
                <li>Your browsing history</li>
                <li>Cookies and site data</li>
                <li>Information entered in forms</li>
              </ul>
            </div>
            <div class="incognito-col">
              <h3>Your activity might still be visible to:</h3>
              <ul>
                <li>Websites that you visit</li>
                <li>Your employer or school</li>
                <li>Your internet service provider</li>
              </ul>
            </div>
          </div>

          <div class="chrome-incognito-cookie-card">
            <div class="cookie-card-info">
              <h4>Block third-party cookies</h4>
              <p>When on, sites can't use cookies that track you across the web. Features on some sites may break.</p>
            </div>
            <label class="chrome-switch">
              <input type="checkbox" id="incognito-cookie-toggle" checked />
              <span class="chrome-slider"></span>
            </label>
          </div>
        </div>
      </div>
    `;
  }

  static renderSettings(context = {}) {
    const profile = context.profile || { name: 'Adityya User', email: 'user@adityya.os', syncEnabled: true };
    const searchEngine = context.searchEngine || 'Google';

    return `
      <div class="os-browser-internal-page chrome-settings-page">
        <div class="chrome-settings-sidebar">
          <div class="sidebar-brand">
            <span class="brand-icon">⚙️</span>
            <span>Settings</span>
          </div>
          <nav class="settings-nav">
            <button class="settings-nav-item active" data-section="you-and-google">👤 You and Google</button>
            <button class="settings-nav-item" data-section="autofill">🔑 Autofill and passwords</button>
            <button class="settings-nav-item" data-section="privacy">🛡️ Privacy and security</button>
            <button class="settings-nav-item" data-section="appearance">🎨 Appearance</button>
            <button class="settings-nav-item" data-section="search">🔍 Search engine</button>
            <button class="settings-nav-item" data-section="startup">🚀 On startup</button>
            <button class="settings-nav-item" data-section="about">ℹ️ About Chrome</button>
          </nav>
        </div>

        <div class="chrome-settings-content">
          <!-- You and Google Section -->
          <section class="settings-section" id="section-you-and-google">
            <h2>You and Google</h2>
            <div class="settings-card profile-card">
              <div class="profile-card-avatar">${escapeHtml(profile.avatar || '👤')}</div>
              <div class="profile-card-info">
                <h3>${escapeHtml(profile.name || 'Adityya User')}</h3>
                <p>${escapeHtml(profile.email || 'user@adityya.os')}</p>
              </div>
              <div class="profile-card-action">
                <span class="sync-badge ${profile.syncEnabled ? 'active' : ''}">${profile.syncEnabled ? 'Sync is ON' : 'Sync is OFF'}</span>
                <button class="chrome-btn" id="btn-toggle-sync">${profile.syncEnabled ? 'Turn off' : 'Turn on'}</button>
              </div>
            </div>
            <div class="settings-card-list">
              <div class="settings-row">
                <div class="row-label">
                  <strong>Manage your Google Account</strong>
                  <p>Control, protect, and secure your account in one place.</p>
                </div>
                <button class="chrome-btn-outline os-internal-link" data-url="adityya://settings">Manage</button>
              </div>
              <div class="settings-row">
                <div class="row-label">
                  <strong>Sync and Google services</strong>
                  <p>Manage what data you sync and personalization options.</p>
                </div>
                <button class="chrome-btn-outline" id="btn-sync-options">Configure</button>
              </div>
            </div>
          </section>

          <!-- Autofill Section -->
          <section class="settings-section" id="section-autofill">
            <h2>Autofill and passwords</h2>
            <div class="settings-card-list">
              <div class="settings-row">
                <div class="row-label">
                  <strong>Google Password Manager</strong>
                  <p>View, edit, or remove passwords saved in Chrome.</p>
                </div>
                <button class="chrome-btn-outline os-internal-link" data-url="adityya://passwords">Manage Passwords</button>
              </div>
              <div class="settings-row">
                <div class="row-label">
                  <strong>Payment methods</strong>
                  <p>Save and fill payment methods.</p>
                </div>
                <button class="chrome-btn-outline" disabled>Saved Cards</button>
              </div>
              <div class="settings-row">
                <div class="row-label">
                  <strong>Addresses and more</strong>
                  <p>Save and fill addresses, phone numbers, and emails.</p>
                </div>
                <button class="chrome-btn-outline" disabled>Addresses</button>
              </div>
            </div>
          </section>

          <!-- Privacy and Security Section -->
          <section class="settings-section" id="section-privacy">
            <h2>Privacy and security</h2>
            <div class="settings-card-list">
              <div class="settings-row">
                <div class="row-label">
                  <strong>Clear browsing data</strong>
                  <p>Clear history, cookies, cache, and more.</p>
                </div>
                <button class="chrome-btn danger" id="btn-open-clear-data">Clear data</button>
              </div>
              <div class="settings-row">
                <div class="row-label">
                  <strong>Safe Browsing</strong>
                  <p>Protection against dangerous sites and malware.</p>
                </div>
                <span class="badge-success">Standard protection</span>
              </div>
              <div class="settings-row">
                <div class="row-label">
                  <strong>Third-party cookies</strong>
                  <p>Block third-party cookies in Incognito.</p>
                </div>
                <span class="badge-neutral">Enabled</span>
              </div>
            </div>
          </section>

          <!-- Appearance Section -->
          <section class="settings-section" id="section-appearance">
            <h2>Appearance</h2>
            <div class="settings-card-list">
              <div class="settings-row">
                <div class="row-label">
                  <strong>Theme</strong>
                  <p>AdityyaOS Obsidian Laboratory theme.</p>
                </div>
                <span class="badge-neutral">Dark Mode</span>
              </div>
              <div class="settings-row">
                <div class="row-label">
                  <strong>Show Home button</strong>
                  <p>Displays home icon in toolbar.</p>
                </div>
                <label class="chrome-switch">
                  <input type="checkbox" id="toggle-home-btn" checked />
                  <span class="chrome-slider"></span>
                </label>
              </div>
              <div class="settings-row">
                <div class="row-label">
                  <strong>Show bookmarks bar</strong>
                  <p>Always show bookmarks under address bar.</p>
                </div>
                <label class="chrome-switch">
                  <input type="checkbox" id="toggle-bookmarks-bar" checked />
                  <span class="chrome-slider"></span>
                </label>
              </div>
            </div>
          </section>

          <!-- Search Engine Section -->
          <section class="settings-section" id="section-search">
            <h2>Search engine</h2>
            <div class="settings-card-list">
              <div class="settings-row">
                <div class="row-label">
                  <strong>Search engine used in the address bar</strong>
                </div>
                <select class="chrome-select" id="select-search-engine">
                  <option value="Google" ${searchEngine === 'Google' ? 'selected' : ''}>Google</option>
                  <option value="DuckDuckGo" ${searchEngine === 'DuckDuckGo' ? 'selected' : ''}>DuckDuckGo</option>
                  <option value="Bing" ${searchEngine === 'Bing' ? 'selected' : ''}>Bing</option>
                </select>
              </div>
            </div>
          </section>

          <!-- About Section -->
          <section class="settings-section" id="section-about">
            <h2>About Google Chrome (AdityyaOS Edition)</h2>
            <div class="settings-card">
              <div class="chrome-about-hero">
                <div class="chrome-logo-icon">🌐</div>
                <div>
                  <h3>Google Chrome for AdityyaOS</h3>
                  <p>Version 128.0.6613.120 (Official Build) (64-bit)</p>
                  <p class="text-success">✔ Chrome is up to date</p>
                </div>
              </div>
              <p class="about-disclaimer">
                AdityyaOS Browser is built with sandboxed web gateway security, strict AdityyaFS storage isolation, and zero host network leakage.
              </p>
            </div>
          </section>
        </div>
      </div>
    `;
  }

  static renderHistory(context = {}) {
    const entries = typeof context.history?.getEntries === 'function'
      ? context.history.getEntries()
      : (Array.isArray(context.history) ? context.history : (context.history?.entries || []));

    return `
      <div class="os-browser-internal-page chrome-history-page">
        <div class="chrome-subpage-header">
          <div class="subpage-title">
            <span class="subpage-icon">🕒</span>
            <h2>History</h2>
          </div>
          <div class="subpage-search">
            <input type="text" id="history-search-input" placeholder="Search history..." />
          </div>
          <div class="subpage-actions">
            <button class="chrome-btn danger" id="btn-clear-history-page" ${entries.length === 0 ? 'disabled' : ''}>Clear browsing data</button>
          </div>
        </div>

        <div class="chrome-history-container" id="history-list-container">
          ${entries.length === 0 ? '<div class="empty-state"><p>Your browsing history appears here</p></div>' : entries.map(e => `
            <div class="chrome-history-item" data-id="${escapeHtml(e.id || '')}">
              <span class="item-time">${new Date(e.timestamp || e.visitedAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              <span class="item-favicon">${e.url.startsWith('adityya://') || e.url.startsWith('chrome://') ? '⚛️' : '🌐'}</span>
              <div class="item-details">
                <a href="#" class="os-internal-link item-title" data-url="${escapeHtml(e.url)}">${escapeHtml(e.title || e.url)}</a>
                <span class="item-url">${escapeHtml(e.url)}</span>
              </div>
              <button class="chrome-item-delete" data-delete-id="${escapeHtml(e.id || '')}" title="Remove from history">✕</button>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  static renderBookmarks(context = {}) {
    const bookmarks = typeof context.bookmarks?.getBookmarks === 'function'
      ? context.bookmarks.getBookmarks()
      : (Array.isArray(context.bookmarks) ? context.bookmarks : (context.bookmarks?.bookmarks || []));

    return `
      <div class="os-browser-internal-page chrome-bookmarks-page">
        <div class="chrome-subpage-header">
          <div class="subpage-title">
            <span class="subpage-icon">★</span>
            <h2>Bookmarks Manager</h2>
          </div>
          <div class="subpage-search">
            <input type="text" id="bookmarks-search-input" placeholder="Search bookmarks..." />
          </div>
          <div class="subpage-actions">
            <button class="chrome-btn primary" id="btn-add-bookmark-modal">Add Bookmark</button>
          </div>
        </div>

        <div class="chrome-bookmarks-layout">
          <div class="bookmarks-sidebar">
            <div class="folder-item active"><span class="folder-icon">📁</span> Bookmarks bar</div>
            <div class="folder-item"><span class="folder-icon">📂</span> Other bookmarks</div>
          </div>

          <div class="bookmarks-main" id="bookmarks-list-container">
            ${bookmarks.length === 0 ? '<div class="empty-state"><p>No bookmarks saved yet</p></div>' : bookmarks.map(b => `
              <div class="chrome-bookmark-item" data-url="${escapeHtml(b.url)}">
                <span class="item-favicon">${b.url.startsWith('adityya://') || b.url.startsWith('chrome://') ? '⚛️' : '🌐'}</span>
                <div class="item-details">
                  <a href="#" class="os-internal-link item-title" data-url="${escapeHtml(b.url)}">${escapeHtml(b.title)}</a>
                  <span class="item-url">${escapeHtml(b.url)}</span>
                </div>
                <div class="item-actions">
                  <button class="chrome-btn-icon edit-bookmark-btn" data-url="${escapeHtml(b.url)}" title="Edit">✏️</button>
                  <button class="chrome-btn-icon delete-bookmark-btn" data-url="${escapeHtml(b.url)}" title="Delete">🗑️</button>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  }

  static renderPasswords(context = {}) {
    const passwords = typeof context.passwords?.getPasswords === 'function'
      ? context.passwords.getPasswords()
      : (Array.isArray(context.passwords) ? context.passwords : []);

    return `
      <div class="os-browser-internal-page chrome-passwords-page">
        <div class="chrome-subpage-header">
          <div class="subpage-title">
            <span class="subpage-icon">🔑</span>
            <h2>Password Manager</h2>
          </div>
          <div class="subpage-search">
            <input type="text" id="passwords-search-input" placeholder="Search passwords..." />
          </div>
          <div class="subpage-actions">
            <button class="chrome-btn primary" id="btn-add-password-modal">Add Password</button>
          </div>
        </div>

        <div class="chrome-passwords-container" id="passwords-list-container">
          ${passwords.length === 0 ? '<div class="empty-state"><p>No passwords saved in Google Password Manager</p></div>' : `
            <table class="chrome-passwords-table">
              <thead>
                <tr>
                  <th>Website</th>
                  <th>Username</th>
                  <th>Password</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                ${passwords.map(p => `
                  <tr data-id="${escapeHtml(p.id)}">
                    <td class="site-cell">
                      <span class="site-icon">🌐</span>
                      <span>${escapeHtml(p.site)}</span>
                    </td>
                    <td>${escapeHtml(p.username)}</td>
                    <td class="password-cell">
                      <span class="pwd-masked" id="pwd-val-${escapeHtml(p.id)}">••••••••</span>
                      <button class="chrome-btn-icon toggle-pwd-btn" data-id="${escapeHtml(p.id)}" data-pwd="${escapeHtml(p.password)}" title="Show/Hide">👁️</button>
                    </td>
                    <td>
                      <button class="chrome-btn-icon delete-pwd-btn" data-id="${escapeHtml(p.id)}" title="Delete">🗑️</button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          `}
        </div>
      </div>
    `;
  }

  static renderDownloads(context = {}) {
    const downloads = typeof context.downloads?.getDownloads === 'function'
      ? context.downloads.getDownloads()
      : (Array.isArray(context.downloads) ? context.downloads : []);

    return `
      <div class="os-browser-internal-page chrome-downloads-page">
        <div class="chrome-subpage-header">
          <div class="subpage-title">
            <span class="subpage-icon">📥</span>
            <h2>Downloads</h2>
          </div>
          <div class="subpage-search">
            <input type="text" id="downloads-search-input" placeholder="Search downloads..." />
          </div>
          <div class="subpage-actions">
            <button class="chrome-btn danger" id="btn-clear-downloads-page" ${downloads.length === 0 ? 'disabled' : ''}>Clear all</button>
          </div>
        </div>

        <div class="chrome-downloads-container" id="downloads-list-container">
          ${downloads.length === 0 ? '<div class="empty-state"><p>Files you download will appear here</p></div>' : downloads.map(d => `
            <div class="chrome-download-item" data-id="${escapeHtml(d.id)}">
              <div class="download-icon">📄</div>
              <div class="download-details">
                <h4 class="download-filename">${escapeHtml(d.filename)}</h4>
                <p class="download-url">${escapeHtml(d.url || '')}</p>
                <div class="download-meta">
                  <span>${d.size || 0} bytes</span> • 
                  <span>${new Date(d.timestamp || Date.now()).toLocaleDateString()}</span> • 
                  <span class="status-${escapeHtml(d.status || 'completed')}">${escapeHtml(d.status || 'completed')}</span>
                </div>
              </div>
              <div class="download-actions">
                <button class="chrome-btn-outline btn-open-download" data-path="${escapeHtml(d.path)}">Show in folder</button>
                <button class="chrome-btn-icon delete-download-btn" data-id="${escapeHtml(d.id)}" title="Remove">✕</button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  static renderExtensions(context = {}) {
    const extensions = typeof context.extensions?.getExtensions === 'function'
      ? context.extensions.getExtensions()
      : (Array.isArray(context.extensions) ? context.extensions : []);

    return `
      <div class="os-browser-internal-page chrome-extensions-page">
        <div class="chrome-subpage-header">
          <div class="subpage-title">
            <span class="subpage-icon">🧩</span>
            <h2>Extensions</h2>
          </div>
          <div class="subpage-search">
            <input type="text" id="extensions-search-input" placeholder="Search extensions..." />
          </div>
        </div>

        <div class="chrome-extensions-grid">
          ${extensions.map(ext => `
            <div class="chrome-ext-card" data-id="${escapeHtml(ext.id)}">
              <div class="ext-card-header">
                <div class="ext-icon">${ext.icon || '🧩'}</div>
                <div class="ext-meta">
                  <h3>${escapeHtml(ext.name)}</h3>
                  <span class="ext-version">v${escapeHtml(ext.version)}</span>
                </div>
                <label class="chrome-switch">
                  <input type="checkbox" class="ext-toggle" data-id="${escapeHtml(ext.id)}" ${ext.enabled ? 'checked' : ''} />
                  <span class="chrome-slider"></span>
                </label>
              </div>
              <p class="ext-desc">${escapeHtml(ext.description)}</p>
              <div class="ext-footer">
                <button class="chrome-btn-outline" disabled>Details</button>
                <button class="chrome-btn-outline" disabled>Remove</button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  static renderVersion(context = {}) {
    return `
      <div class="os-browser-internal-page chrome-version-page">
        <h2>About Version</h2>
        <table class="chrome-version-table">
          <tr><th>Google Chrome</th><td>128.0.6613.120 (Official Build) (64-bit)</td></tr>
          <tr><th>Operating System</th><td>AdityyaOS v1.0 (Advanced Agentic Web Gateway)</td></tr>
          <tr><th>User Agent</th><td>Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 AdityyaOS/1.0</td></tr>
          <tr><th>Command Line</th><td>adityya-browser --enable-features=AdityyaSandbox,IncognitoMode,SafeBrowsing</td></tr>
          <tr><th>Executable Path</th><td>/bin/browser</td></tr>
          <tr><th>Profile Path</th><td>/home/user/.browser/</td></tr>
          <tr><th>Active Profile</th><td>${escapeHtml(context.profile?.name || 'Adityya User')} (${escapeHtml(context.profile?.email || 'user@adityya.os')})</td></tr>
          <tr><th>Incognito Mode</th><td>${context.isIncognito ? 'ACTIVE (Zero trace)' : 'Inactive'}</td></tr>
        </table>
      </div>
    `;
  }
}
