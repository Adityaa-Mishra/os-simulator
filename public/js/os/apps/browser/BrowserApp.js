/**
 * public/js/os/apps/browser/BrowserApp.js
 * Native AdityyaOS Web Browser Application Definition & Lifecycle Controller.
 * Fully featured Chrome-grade web browser with multi-profile accounts,
 * authentic Incognito mode, passwords vault, downloads shelf, extensions, and settings.
 */

import { BrowserState } from './BrowserState.js';
import { BrowserTabs } from './BrowserTabs.js';
import { BrowserHistory } from './BrowserHistory.js';
import { BrowserBookmarks } from './BrowserBookmarks.js';
import { BrowserProfileManager } from './BrowserProfileManager.js';
import { BrowserPasswordManager } from './BrowserPasswordManager.js';
import { BrowserDownloads } from './BrowserDownloads.js';
import { BrowserExtensions } from './BrowserExtensions.js';
import { BrowserView } from './BrowserView.js';
import { BrowserNavigation } from './BrowserNavigation.js';
import { PackagePermissions } from '../../packages/PackagePermissions.js';

export class BrowserApp {
  /**
   * @param {import('../../api/AdityyaOSAPI.js').AdityyaOSAPI} api
   * @param {HTMLElement} container
   * @param {Object} [options={}]
   */
  constructor(api, container, options = {}) {
    this.api = api;
    this.container = container;
    this.options = options;

    this.isIncognito = Boolean(options.isIncognito || options.incognito);

    this.state = new BrowserState({
      isIncognito: this.isIncognito,
      homeUrl: options.initialUrl || (this.isIncognito ? 'adityya://incognito' : 'adityya://newtab')
    });
    this.tabs = new BrowserTabs(this.state);
    this.history = new BrowserHistory(api.fs, this.isIncognito);
    this.bookmarks = new BrowserBookmarks(api.fs);
    this.profileManager = new BrowserProfileManager({ fs: api.fs, isIncognito: this.isIncognito });
    this.passwords = new BrowserPasswordManager({ fs: api.fs, isIncognito: this.isIncognito });
    this.downloads = new BrowserDownloads({ fs: api.fs, isIncognito: this.isIncognito });
    this.extensions = new BrowserExtensions({ fs: api.fs, isIncognito: this.isIncognito });

    this.view = new BrowserView({
      state: this.state,
      tabs: this.tabs,
      history: this.history,
      bookmarks: this.bookmarks,
      profileManager: this.profileManager,
      passwords: this.passwords,
      downloads: this.downloads,
      extensions: this.extensions,
      onNavigate: (url) => this.onNavigate(url),
      openIncognitoWindow: () => this.openIncognitoWindow(),
      openNewWindow: () => this.openNewWindow()
    });

    if (this.container) {
      this.view.mount(this.container);
    }
  }

  async init() {
    return this;
  }

  async navigate(url) {
    if (this.view) {
      const normalized = BrowserNavigation.normalizeUrl(url);
      this.view.loadUrlInActiveTab(normalized);
    }
  }

  async createNewTab(url = null) {
    const targetUrl = url ? BrowserNavigation.normalizeUrl(url) : this.state.homeUrl;
    const tab = this.tabs.createTab(targetUrl);
    this.view?.updateAll();
    return tab;
  }

  async closeTab(tabId) {
    const res = this.tabs.closeTab(tabId);
    this.view?.updateAll();
    return res;
  }

  handleIframeError(msg) {
    this.view?.showError(msg);
  }

  openIncognitoWindow() {
    if (this.api.window && typeof this.api.window.create === 'function') {
      this.api.window.create({
        appId: 'browser',
        title: 'Google Chrome (Incognito)',
        options: { isIncognito: true }
      });
    } else {
      // Fallback in current window: open an incognito tab
      this.tabs.createTab('adityya://incognito', 'Incognito');
      this.view?.updateAll();
    }
  }

  openNewWindow() {
    if (this.api.window && typeof this.api.window.create === 'function') {
      this.api.window.create({
        appId: 'browser',
        title: 'Google Chrome',
        options: { isIncognito: false }
      });
    } else {
      this.tabs.createTab(this.state.homeUrl);
      this.view?.updateAll();
    }
  }

  onNavigate(url) {
    if (this.api.window) {
      const active = this.state.getActiveTab();
      const title = active?.title || url;
      const suffix = this.isIncognito ? '(Incognito)' : '';
      this.api.window.setTitle(`${title} - Google Chrome ${suffix}`.trim());
    }
  }

  destroy() {
    if (this.view) {
      this.view.destroy();
      this.view = null;
    }
    if (this.container) {
      this.container.innerHTML = '';
      this.container = null;
    }
  }
}

/**
 * Standard AdityyaOS Application Definition for Browser.
 */
export const browserApp = Object.freeze({
  id: 'browser',
  name: 'Web Browser',
  version: '2.0.0',
  description: 'Full-featured Chrome-grade web browser with profiles, incognito, and passwords vault',
  icon: '🌐',
  category: 'Internet',
  permissions: Object.freeze([
    PackagePermissions.FILESYSTEM_READ,
    PackagePermissions.FILESYSTEM_WRITE,
    PackagePermissions.WINDOW_CONTROL,
    PackagePermissions.APPLICATION_LIFECYCLE,
    PackagePermissions.NETWORK_READ,
    PackagePermissions.NETWORK_CONNECT
  ]),
  window: Object.freeze({
    title: 'Google Chrome',
    icon: '🌐',
    width: 860,
    height: 580,
    singleton: false
  }),
  entry: (api, container, options) => {
    const app = new BrowserApp(api, container, options);
    return {
      destroy: () => app.destroy()
    };
  }
});
