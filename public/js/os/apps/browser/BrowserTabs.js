/**
 * public/js/os/apps/browser/BrowserTabs.js
 * Tab management and per-tab navigation stacks for AdityyaOS Browser.
 * Strictly maintains per-tab back/forward stacks in-memory, completely separate
 * from global persistent history.
 */

export class BrowserTab {
  constructor(options = {}) {
    this.id = options.id || `tab-${Date.now()}`;
    this.url = options.url || 'adityya://newtab';
    this.title = options.title || 'New Tab';
    this.isLoading = false;
    this.isPinned = Boolean(options.isPinned);
    this.isMuted = Boolean(options.isMuted);
    this.favicon = options.favicon || null;
    this.backStack = Array.isArray(options.backStack) ? [...options.backStack] : [];
    this.forwardStack = Array.isArray(options.forwardStack) ? [...options.forwardStack] : [];
  }

  canGoBack() {
    return this.backStack.length > 0;
  }

  canGoForward() {
    return this.forwardStack.length > 0;
  }

  navigate(newUrl, title = null) {
    if (this.url && this.url !== newUrl) {
      this.backStack.push(this.url);
      this.forwardStack = [];
    }
    this.url = newUrl;
    if (title) this.title = title;
    return this;
  }

  goBack() {
    if (this.backStack.length === 0) return null;
    const prevUrl = this.backStack.pop();
    this.forwardStack.push(this.url);
    this.url = prevUrl;
    return prevUrl;
  }

  goForward() {
    if (this.forwardStack.length === 0) return null;
    const nextUrl = this.forwardStack.pop();
    this.backStack.push(this.url);
    this.url = nextUrl;
    return nextUrl;
  }
}

export class BrowserTabs {
  /**
   * @param {import('./BrowserState.js').BrowserState} state
   */
  constructor(state) {
    this.state = state;
  }

  /**
   * Create a new tab.
   * @param {string} [url]
   * @param {string} [title='New Tab']
   * @returns {BrowserTab}
   */
  createTab(url = null, title = 'New Tab') {
    const tab = this.state.createTab(url, title);
    return tab;
  }

  /**
   * Close a tab. Enforces minimum 1 tab constraint.
   * @param {string} tabId
   * @returns {Object} current active tab
   */
  closeTab(tabId) {
    this.state.closeTab(tabId);
    return this.state.getActiveTab();
  }

  /**
   * Close all tabs except tabId.
   * @param {string} tabId
   */
  closeOtherTabs(tabId) {
    if (typeof this.state.closeOtherTabs === 'function') {
      this.state.closeOtherTabs(tabId);
    }
  }

  /**
   * Toggle pin state of a tab.
   * @param {string} tabId
   * @returns {boolean}
   */
  pinTab(tabId) {
    if (typeof this.state.pinTab === 'function') {
      return this.state.pinTab(tabId);
    }
    return false;
  }

  /**
   * Toggle mute state of a tab.
   * @param {string} tabId
   * @returns {boolean}
   */
  muteTab(tabId) {
    if (typeof this.state.muteTab === 'function') {
      return this.state.muteTab(tabId);
    }
    return false;
  }

  /**
   * Duplicate a tab.
   * @param {string} tabId
   * @returns {Object|null}
   */
  duplicateTab(tabId) {
    if (typeof this.state.duplicateTab === 'function') {
      return this.state.duplicateTab(tabId);
    }
    return null;
  }

  /**
   * Set active tab.
   * @param {string} tabId
   * @returns {Object|null}
   */
  setActiveTab(tabId) {
    return this.state.setActiveTab(tabId);
  }

  /**
   * Navigate a tab to a new URL.
   * Updates per-tab back/forward stacks.
   * @param {string} tabId
   * @param {string} newUrl
   * @param {string} [title=null]
   * @returns {Object|null}
   */
  navigateTab(tabId, newUrl, title = null) {
    const tab = this.state.tabs.get(tabId);
    if (!tab) return null;

    if (typeof tab.navigate === 'function') {
      tab.navigate(newUrl, title);
    } else {
      if (tab.url && tab.url !== newUrl) {
        tab.backStack.push(tab.url);
        tab.forwardStack = [];
      }
      tab.url = newUrl;
      if (title) tab.title = title;
      tab.canGoBack = tab.backStack.length > 0;
      tab.canGoForward = tab.forwardStack.length > 0;
    }

    return tab;
  }

  /**
   * Navigate backward in a tab.
   * @param {string} tabId
   * @returns {string|null} previous URL or null
   */
  goBack(tabId) {
    const tab = this.state.tabs.get(tabId);
    if (!tab) return null;

    if (typeof tab.goBack === 'function') {
      return tab.goBack();
    }

    if (tab.backStack.length === 0) return null;
    const prevUrl = tab.backStack.pop();
    tab.forwardStack.push(tab.url);
    tab.url = prevUrl;
    tab.canGoBack = tab.backStack.length > 0;
    tab.canGoForward = tab.forwardStack.length > 0;

    return prevUrl;
  }

  /**
   * Navigate forward in a tab.
   * @param {string} tabId
   * @returns {string|null} next URL or null
   */
  goForward(tabId) {
    const tab = this.state.tabs.get(tabId);
    if (!tab) return null;

    if (typeof tab.goForward === 'function') {
      return tab.goForward();
    }

    if (tab.forwardStack.length === 0) return null;
    const nextUrl = tab.forwardStack.pop();
    tab.backStack.push(tab.url);
    tab.url = nextUrl;
    tab.canGoBack = tab.backStack.length > 0;
    tab.canGoForward = tab.forwardStack.length > 0;

    return nextUrl;
  }

  /**
   * Update tab title and icon.
   * @param {string} tabId
   * @param {string} title
   */
  updateTabMeta(tabId, title) {
    const tab = this.state.tabs.get(tabId);
    if (tab && title) {
      tab.title = title;
    }
  }
}
