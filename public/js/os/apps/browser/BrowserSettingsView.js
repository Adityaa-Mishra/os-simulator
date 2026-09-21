/**
 * public/js/os/apps/browser/BrowserSettingsView.js
 * Comprehensive template renderer for internal Additya Browser pages.
 * Features native Additya Search, New Tab, Incognito, Settings, History,
 * Bookmarks, Passwords Vault, Downloads, Extensions Hub, and Version.
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
    const clean = url.replace(/^(adityya|additya|chrome):\/\//, '').toLowerCase().split('?')[0];

    switch (clean) {
      case 'search':
        return this.renderSearch(context, url);
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

  /**
   * Native Additya Search Engine Results Page.
   * Prevents "Google.com refused to connect" iframe errors by providing native,
   * interactive search results with smart knowledge cards and 1-click external search buttons.
   * @param {Object} context
   * @param {string} url
   * @returns {string}
   */
  static renderSearch(context = {}, url = '') {
    let query = '';
    try {
      const match = url.match(/[?&]q=([^&]+)/);
      if (match) {
        query = decodeURIComponent(match[1].replace(/\+/g, ' '));
      }
    } catch {}

    const safeQuery = escapeHtml(query);
    const knowledgeCard = this.getKnowledgeCard(query);
    const results = this.generateSearchResults(query);

    return `
      <div class="os-browser-internal-page additya-search-page">
        <!-- Search Header -->
        <div class="search-header-bar">
          <div class="search-brand os-internal-link" data-url="adityya://newtab" title="Additya Browser Home">
            <span class="search-brand-icon">⚛️</span>
            <span class="search-brand-text">Additya</span>
          </div>

          <form id="search-page-form" class="search-header-form">
            <input type="text" id="search-page-input" value="${safeQuery}" placeholder="Search with Additya or enter address..." autocomplete="off" />
            <button type="submit" class="search-submit-btn" title="Search">🔍</button>
          </form>

          <div class="search-header-actions">
            <span class="shield-badge" title="Additya Privacy Shield: Tracking Blocked">🛡️ Shield Active</span>
          </div>
        </div>

        <!-- Category Filter Pills -->
        <div class="search-nav-tabs">
          <button class="search-tab-pill active">🌐 All</button>
          <button class="search-tab-pill">📰 News</button>
          <button class="search-tab-pill">🖼️ Images</button>
          <button class="search-tab-pill">📁 OS Files</button>
          <button class="search-tab-pill">⚙️ System Apps</button>
        </div>

        <!-- External Search Engine Launchers Bar -->
        <div class="external-engines-bar">
          <span class="ext-bar-label">Search this query directly on external engines:</span>
          <div class="ext-buttons-group">
            <button class="ext-engine-btn google" id="btn-search-google" data-query="${safeQuery}">
              <span>Google</span> ↗
            </button>
            <button class="ext-engine-btn duckduckgo" id="btn-search-ddg" data-query="${safeQuery}">
              <span>DuckDuckGo</span> ↗
            </button>
            <button class="ext-engine-btn bing" id="btn-search-bing" data-query="${safeQuery}">
              <span>Bing</span> ↗
            </button>
            <button class="ext-engine-btn wiki" id="btn-search-wiki" data-query="${safeQuery}">
              <span>Wikipedia</span> ↗
            </button>
          </div>
        </div>

        <!-- Main Search Content -->
        <div class="search-main-content">
          ${knowledgeCard ? `
            <div class="search-knowledge-card">
              <div class="kc-header">
                <span class="kc-icon">${knowledgeCard.icon}</span>
                <div class="kc-title-wrap">
                  <h3 class="kc-title">${escapeHtml(knowledgeCard.title)}</h3>
                  <span class="kc-category">${escapeHtml(knowledgeCard.category)}</span>
                </div>
              </div>
              <div class="kc-body">
                <p class="kc-description">${knowledgeCard.description}</p>
                ${knowledgeCard.details ? `<div class="kc-details">${knowledgeCard.details}</div>` : ''}
              </div>
            </div>
          ` : ''}

          <!-- Search Results List -->
          <div class="search-results-list">
            <div class="results-stats">About ${results.length * 42000} results for <strong>"${safeQuery}"</strong> (0.02 seconds)</div>

            ${results.map(r => `
              <div class="search-result-item">
                <div class="result-site-row">
                  <span class="result-favicon">${r.icon || '🌐'}</span>
                  <span class="result-domain">${escapeHtml(r.domain)}</span>
                  <span class="result-path">${escapeHtml(r.path || '')}</span>
                </div>
                <h3 class="result-title">
                  <a href="#" class="os-internal-link" data-url="${escapeHtml(r.url)}">${escapeHtml(r.title)}</a>
                </h3>
                <p class="result-snippet">${r.snippet}</p>
                <div class="result-actions">
                  <button class="result-action-btn os-internal-link" data-url="${escapeHtml(r.url)}">Open in Tab</button>
                  <button class="result-action-btn btn-popout-result" data-url="${escapeHtml(r.url)}">Open in External Window ↗</button>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Helper to detect instant answers and knowledge panels.
   */
  static getKnowledgeCard(query = '') {
    if (!query) return null;
    const q = query.trim().toLowerCase();

    // 1. Math calculation
    if (/^[0-9\s\+\-\*\/\%\^\(\)\.]+$/.test(q) && /[0-9]/.test(q) && /[\+\-\*\/\%\^]/.test(q)) {
      try {
        const sanitized = q.replace(/[^0-9\+\-\*\/\%\^\(\)\.]/g, '');
        const val = Function(`'use strict'; return (${sanitized.replace(/\^/g, '**')});`)();
        if (typeof val === 'number' && !isNaN(val)) {
          return {
            icon: '🧮',
            title: `${sanitized} = ${val}`,
            category: 'Additya Calculator',
            description: `Calculation completed instantly via Additya Math Engine.`
          };
        }
      } catch {}
    }

    // 2. Weather
    if (q.includes('weather')) {
      return {
        icon: '⛅',
        title: 'Weather Information',
        category: 'Atmospheric Conditions',
        description: 'Current condition: 22°C (72°F), Partly Cloudy. Humidity: 45%. Wind: 8 km/h NW.',
        details: '<span>Forecast: Mild conditions throughout the week.</span>'
      };
    }

    // 3. Time / Date
    if (q.includes('time') || q.includes('date')) {
      const now = new Date();
      return {
        icon: '🕒',
        title: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        category: 'System Clock',
        description: now.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
      };
    }

    // 4. AdityyaOS / Browser Query
    if (q.includes('adityya') || q.includes('additya') || q.includes('os') || q.includes('browser')) {
      return {
        icon: '⚛️',
        title: 'AddityaOS & Additya Browser',
        category: 'Web Operating System Gateway',
        description: 'AddityaOS is an advanced web-based operating system simulator featuring strict sandboxing, multi-profile user accounts, a high-performance terminal, virtual filesystem (AdityyaFS), and the bespoke Additya Browser.'
      };
    }

    return null;
  }

  /**
   * Helper to generate contextually relevant search results.
   */
  static generateSearchResults(query = '') {
    const q = query.trim();
    const encoded = encodeURIComponent(q);

    return [
      {
        title: `${q} - Wikipedia, the free encyclopedia`,
        domain: 'wikipedia.org',
        path: ` › wiki › ${q.replace(/\s+/g, '_')}`,
        url: `https://en.wikipedia.org/wiki/${encodeURIComponent(q.replace(/\s+/g, '_'))}`,
        icon: '📚',
        snippet: `Explore encyclopedic knowledge, historical context, and comprehensive reference material regarding <strong>${escapeHtml(q)}</strong> on Wikipedia.`
      },
      {
        title: `${q} Documentation & Technical Guides`,
        domain: 'docs.adityya.dev',
        path: ` › reference › ${q.toLowerCase().replace(/\s+/g, '-')}`,
        url: `adityya://welcome`,
        icon: '⚛️',
        snippet: `Complete developer documentation, runtime specifications, API references, and architecture guides for <strong>${escapeHtml(q)}</strong> within AddityaOS.`
      },
      {
        title: `Search "${q}" on Google`,
        domain: 'google.com',
        path: ` › search?q=${encoded}`,
        url: `https://www.google.com/search?q=${encoded}`,
        icon: '🔍',
        snippet: `Click to view global web results, images, news, and related searches for <strong>${escapeHtml(q)}</strong> directly on Google.`
      },
      {
        title: `Explore "${q}" on DuckDuckGo Privacy Engine`,
        domain: 'duckduckgo.com',
        path: ` › ?q=${encoded}`,
        url: `https://duckduckgo.com/?q=${encoded}`,
        icon: '🦆',
        snippet: `Search without tracking, banner ads, or profile fingerprinting. Privacy-first search results for <strong>${escapeHtml(q)}</strong>.`
      },
      {
        title: `${q} Open Source Repositories & Discussions`,
        domain: 'github.com',
        path: ` › topics › ${encoded}`,
        url: `https://github.com/search?q=${encoded}`,
        icon: '🐙',
        snippet: `Discover code repositories, libraries, community discussions, and active projects related to <strong>${escapeHtml(q)}</strong>.`
      }
    ];
  }

  static renderNewTab(context = {}) {
    const bookmarks = typeof context.bookmarks?.getBookmarks === 'function'
      ? context.bookmarks.getBookmarks()
      : (Array.isArray(context.bookmarks) ? context.bookmarks : (context.bookmarks?.bookmarks || []));

    const quickLinks = bookmarks.slice(0, 8);

    return `
      <div class="os-browser-internal-page additya-newtab">
        <div class="additya-ntp-header">
          <div class="additya-ntp-links">
            <span class="shield-badge-mini" title="Additya Privacy Shield Active">🛡️ Shield: Active</span>
            <button class="additya-ntp-btn os-internal-link" data-url="adityya://passwords" title="Password Vault">🔑 Vault</button>
            <button class="additya-ntp-btn os-internal-link" data-url="adityya://downloads" title="Downloads">📥 Downloads</button>
            <button class="additya-ntp-btn os-internal-link" data-url="adityya://settings" title="Settings">⚙️ Settings</button>
          </div>
        </div>

        <div class="additya-ntp-center">
          <div class="additya-brand-hero">
            <div class="additya-brand-logo-glow">⚛️</div>
            <h1 class="additya-brand-title">Additya Browser</h1>
            <p class="additya-brand-subtitle">AdityyaOS Browser • Fast, Private & Controlled</p>
          </div>

          <div class="additya-ntp-searchbox">
            <form id="ntp-search-form" class="additya-search-form">
              <span class="additya-search-icon">🔍</span>
              <input type="text" id="ntp-search-input" placeholder="Search or enter address..." autocomplete="off" />
              <button type="submit" class="additya-search-btn" title="Search">Search</button>
            </form>
          </div>

          <!-- Quick Actions Hub -->
          <div class="additya-quick-hub">
            <button class="hub-pill os-internal-link" data-url="adityya://search?q=weather">⛅ Weather</button>
            <button class="hub-pill os-internal-link" data-url="adityya://search?q=time">🕒 Time</button>
            <button class="hub-pill os-internal-link" data-url="adityya://search?q=calculator">🧮 Calculator</button>
            <button class="hub-pill os-internal-link" data-url="adityya://search?q=adityya+os">⚛️ AddityaOS Info</button>
          </div>

          <!-- Shortcuts Grid -->
          <div class="additya-ntp-shortcuts">
            ${quickLinks.map(b => `
              <button class="additya-shortcut-tile os-internal-link" data-url="${escapeHtml(b.url)}" title="${escapeHtml(b.title)}">
                <div class="additya-shortcut-icon">${b.url.startsWith('adityya://') || b.url.startsWith('chrome://') ? '⚛️' : '🌐'}</div>
                <div class="additya-shortcut-title">${escapeHtml(b.title || b.url)}</div>
              </button>
            `).join('')}
            <button class="additya-shortcut-tile add-shortcut" id="btn-ntp-add-shortcut" title="Add shortcut">
              <div class="additya-shortcut-icon">➕</div>
              <div class="additya-shortcut-title">Add shortcut</div>
            </button>
          </div>
        </div>

        <div class="additya-ntp-footer">
          <div class="footer-privacy-text">🔒 Additya Privacy Guard: Trackers and fingerprinters are automatically blocked.</div>
          <button class="additya-customize-btn" id="btn-ntp-customize">⚡ Control Hub</button>
        </div>
      </div>
    `;
  }

  static renderIncognito(context = {}) {
    return `
      <div class="os-browser-internal-page additya-incognito">
        <div class="additya-incognito-card">
          <div class="additya-incognito-icon">🕶️</div>
          <h1>You’ve gone Incognito</h1>
          <h2 class="incognito-brand-tag">Additya Browser Private Mode</h2>
          <p class="additya-incognito-subtitle">
            Now you can browse privately in AddityaOS. Other people who use this device won’t see your activity.
            History, cookies, and passwords are never written to AdityyaFS.
          </p>

          <div class="additya-incognito-columns">
            <div class="incognito-col">
              <h3>Additya Browser won’t save:</h3>
              <ul>
                <li>Your browsing history</li>
                <li>Cookies and site data</li>
                <li>Information entered in forms</li>
                <li>Saved website passwords</li>
              </ul>
            </div>
            <div class="incognito-col">
              <h3>Your activity might still be visible to:</h3>
              <ul>
                <li>Websites that you visit</li>
                <li>Your network administrator</li>
                <li>Your internet service provider</li>
              </ul>
            </div>
          </div>

          <div class="additya-incognito-cookie-card">
            <div class="cookie-card-info">
              <h4>Block third-party cookies</h4>
              <p>Strictly block third-party cookies and cross-site trackers in Incognito mode.</p>
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
    const searchEngine = context.searchEngine || 'Additya';

    return `
      <div class="os-browser-internal-page additya-settings-page">
        <div class="additya-settings-sidebar">
          <div class="sidebar-brand">
            <span class="brand-icon">⚛️</span>
            <span>Settings</span>
          </div>
          <nav class="settings-nav">
            <button class="settings-nav-item active" data-section="you-and-additya">👤 You and Additya</button>
            <button class="settings-nav-item" data-section="autofill">🔑 Password Vault</button>
            <button class="settings-nav-item" data-section="privacy">🛡️ Privacy Shield</button>
            <button class="settings-nav-item" data-section="appearance">🎨 Appearance</button>
            <button class="settings-nav-item" data-section="search">🔍 Search Engine</button>
            <button class="settings-nav-item" data-section="startup">🚀 On Startup</button>
            <button class="settings-nav-item" data-section="about">ℹ️ About Additya</button>
          </nav>
        </div>

        <div class="additya-settings-content">
          <!-- You and Additya Section -->
          <section class="settings-section" id="section-you-and-additya">
            <h2>You and Additya</h2>
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
                  <strong>Manage your Additya Profile</strong>
                  <p>Control profile preferences, bookmarks sync, and security.</p>
                </div>
                <button class="chrome-btn-outline os-internal-link" data-url="adityya://settings">Manage</button>
              </div>
              <div class="settings-row">
                <div class="row-label">
                  <strong>Sync and Cloud Services</strong>
                  <p>Keep passwords, history, and bookmarks synchronized securely.</p>
                </div>
                <button class="chrome-btn-outline" id="btn-sync-options">Configure</button>
              </div>
            </div>
          </section>

          <!-- Autofill Section -->
          <section class="settings-section" id="section-autofill">
            <h2>Password Vault & Autofill</h2>
            <div class="settings-card-list">
              <div class="settings-row">
                <div class="row-label">
                  <strong>Additya Password Vault</strong>
                  <p>Manage saved credentials, website passwords, and autofill rules.</p>
                </div>
                <button class="chrome-btn-outline os-internal-link" data-url="adityya://passwords">Manage Vault</button>
              </div>
              <div class="settings-row">
                <div class="row-label">
                  <strong>Autofill Preferences</strong>
                  <p>Automatically offer to fill logins and site forms.</p>
                </div>
                <span class="badge-success">Active</span>
              </div>
            </div>
          </section>

          <!-- Privacy Shield Section -->
          <section class="settings-section" id="section-privacy">
            <h2>Privacy Shield & Security</h2>
            <div class="settings-card-list">
              <div class="settings-row">
                <div class="row-label">
                  <strong>Additya Privacy Shield</strong>
                  <p>Real-time blocking of intrusive trackers, ads, and fingerprinting scripts.</p>
                </div>
                <span class="badge-success">Shield Active</span>
              </div>
              <div class="settings-row">
                <div class="row-label">
                  <strong>Clear Browsing Data</strong>
                  <p>Clear history, cookies, cache, and downloads records.</p>
                </div>
                <button class="chrome-btn danger" id="btn-open-clear-data">Clear data</button>
              </div>
            </div>
          </section>

          <!-- Appearance Section -->
          <section class="settings-section" id="section-appearance">
            <h2>Appearance & Customization</h2>
            <div class="settings-card-list">
              <div class="settings-row">
                <div class="row-label">
                  <strong>Visual Theme</strong>
                  <p>Additya Obsidian Laboratory with neon cyber-cyan accents.</p>
                </div>
                <span class="badge-neutral">Cyber Obsidian</span>
              </div>
              <div class="settings-row">
                <div class="row-label">
                  <strong>Show Bookmarks Bar</strong>
                  <p>Display bookmarks bar directly below the address bar.</p>
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
            <h2>Search Engine</h2>
            <div class="settings-card-list">
              <div class="settings-row">
                <div class="row-label">
                  <strong>Default Search Engine</strong>
                  <p>Additya Search runs natively without iframe connection refusal errors.</p>
                </div>
                <select class="chrome-select" id="select-search-engine">
                  <option value="Additya" ${searchEngine === 'Additya' ? 'selected' : ''}>Additya Search (Recommended)</option>
                  <option value="Google" ${searchEngine === 'Google' ? 'selected' : ''}>Google (External Tab)</option>
                  <option value="DuckDuckGo" ${searchEngine === 'DuckDuckGo' ? 'selected' : ''}>DuckDuckGo</option>
                  <option value="Bing" ${searchEngine === 'Bing' ? 'selected' : ''}>Bing</option>
                </select>
              </div>
            </div>
          </section>

          <!-- About Section -->
          <section class="settings-section" id="section-about">
            <h2>About Additya Browser</h2>
            <div class="settings-card">
              <div class="additya-about-hero">
                <div class="additya-logo-icon">⚛️</div>
                <div>
                  <h3>Additya Browser</h3>
                  <p>Version 2.4.0 (Bespoke Obsidian Edition)</p>
                  <p class="text-success">✔ Additya Browser is up to date</p>
                </div>
              </div>
              <p class="about-disclaimer">
                Additya Browser is engineered for AdityyaOS with native search, strict storage sandboxing in AdityyaFS, and total privacy isolation.
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
      <div class="os-browser-internal-page additya-history-page">
        <div class="chrome-subpage-header">
          <div class="subpage-title">
            <span class="subpage-icon">🕒</span>
            <h2>Additya Browsing History</h2>
          </div>
          <div class="subpage-search">
            <input type="text" id="history-search-input" placeholder="Search history..." />
          </div>
          <div class="subpage-actions">
            <button class="chrome-btn danger" id="btn-clear-history-page" ${entries.length === 0 ? 'disabled' : ''}>Clear browsing data</button>
          </div>
        </div>

        <div class="chrome-history-container" id="history-list-container">
          ${entries.length === 0 ? '<div class="empty-state"><p>Your browsing history is empty</p></div>' : entries.map(e => `
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
      <div class="os-browser-internal-page additya-bookmarks-page">
        <div class="chrome-subpage-header">
          <div class="subpage-title">
            <span class="subpage-icon">★</span>
            <h2>Additya Bookmarks Manager</h2>
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
      <div class="os-browser-internal-page additya-passwords-page">
        <div class="chrome-subpage-header">
          <div class="subpage-title">
            <span class="subpage-icon">🔑</span>
            <h2>Additya Password Vault</h2>
          </div>
          <div class="subpage-search">
            <input type="text" id="passwords-search-input" placeholder="Search passwords..." />
          </div>
          <div class="subpage-actions">
            <button class="chrome-btn primary" id="btn-add-password-modal">Add Password</button>
          </div>
        </div>

        <div class="chrome-passwords-container" id="passwords-list-container">
          ${passwords.length === 0 ? '<div class="empty-state"><p>No passwords saved in Additya Password Vault</p></div>' : `
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
      <div class="os-browser-internal-page additya-downloads-page">
        <div class="chrome-subpage-header">
          <div class="subpage-title">
            <span class="subpage-icon">📥</span>
            <h2>Additya Downloads</h2>
          </div>
          <div class="subpage-search">
            <input type="text" id="downloads-search-input" placeholder="Search downloads..." />
          </div>
          <div class="subpage-actions">
            <button class="chrome-btn primary" id="btn-mock-download" title="Download a sample artifact to /home/user/Downloads/">📥 Download Sample File</button>
            <button class="chrome-btn danger" id="btn-clear-downloads-page" ${downloads.length === 0 ? 'disabled' : ''}>Clear all</button>
          </div>
        </div>

        <div class="chrome-downloads-container" id="downloads-list-container">
          ${downloads.length === 0 ? '<div class="empty-state"><p>Files you download will appear here in /home/user/Downloads/</p></div>' : downloads.map(d => `
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
      <div class="os-browser-internal-page additya-extensions-page">
        <div class="chrome-subpage-header">
          <div class="subpage-title">
            <span class="subpage-icon">🧩</span>
            <h2>Additya Extensions Hub</h2>
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
      <div class="os-browser-internal-page additya-version-page">
        <h2>AdityyaOS Browser Version</h2>
        <table class="chrome-version-table">
          <tr><th>Browser Name</th><td>Additya Browser (Bespoke Edition)</td></tr>
          <tr><th>Version</th><td>2.4.0 (Official Build) (64-bit)</td></tr>
          <tr><th>Operating System</th><td>AdityyaOS v1.0 (Advanced Agentic Web Gateway)</td></tr>
          <tr><th>User Agent: AdityyaOS</th><td>Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) AddityaBrowser/2.4 Chrome/128.0.0.0 Safari/537.36 AdityyaOS/1.0</td></tr>
          <tr><th>Search Engine</th><td>Native Additya Search (No iframe CORS/X-Frame-Options blocks)</td></tr>
          <tr><th>Privacy Shield</th><td>Enabled (Active tracker & fingerprint blocking)</td></tr>
          <tr><th>Executable Path</th><td>/bin/browser</td></tr>
          <tr><th>Profile Path</th><td>/home/user/.browser/</td></tr>
          <tr><th>Active Profile</th><td>${escapeHtml(context.profile?.name || 'Adityya User')} (${escapeHtml(context.profile?.email || 'user@adityya.os')})</td></tr>
          <tr><th>Incognito Mode</th><td>${context.isIncognito ? 'ACTIVE (Zero trace)' : 'Inactive'}</td></tr>
        </table>
      </div>
    `;
  }
}
