/**
 * public/js/os/apps/browser/BrowserState.js
 * State model for the AdityyaOS Web Browser application.
 * Supports tabs, active index, tab pinning/muting, and standalone Incognito state.
 */

function createTabCollection() {
  const map = new Map();
  return new Proxy(map, {
    get(target, prop) {
      if (prop === 'length' || prop === 'size') return target.size;
      if (typeof prop === 'string' && !isNaN(Number(prop)) && prop !== '') {
        return Array.from(target.values())[Number(prop)];
      }
      const val = Reflect.get(target, prop, target);
      if (typeof val === 'function') {
        return val.bind(target);
      }
      return val;
    }
  });
}

export class BrowserState {
  constructor(options = {}) {
    this.isIncognito = Boolean(options.isIncognito || options.incognito);
    this.homeUrl = options.homeUrl || (this.isIncognito ? 'adityya://incognito' : 'adityya://newtab');
    this.activeTabId = null;
    this.tabs = createTabCollection(); // TabCollection: behaves as Map & Array-like with .length
    this.nextTabId = 1;

    // Initialize with 1 default tab
    this.createTab(this.homeUrl, this.isIncognito ? 'Incognito' : 'New Tab');
  }

  createTabModel(url = null, title = null) {
    const id = `tab-${this.nextTabId++}`;
    const targetUrl = url || this.homeUrl;
    const defaultTitle = title || (this.isIncognito ? 'Incognito' : 'New Tab');

    const tab = {
      id,
      title: defaultTitle,
      url: targetUrl,
      isLoading: false,
      isPinned: false,
      isMuted: false,
      favicon: null,
      // Per-tab navigation history (in-memory only, strictly separate from global history)
      backStack: [],
      forwardStack: [],
      canGoBack: false,
      canGoForward: false
    };

    this.tabs.set(id, tab);
    if (!this.activeTabId) {
      this.activeTabId = id;
    }

    return tab;
  }

  createTab(url = null, title = null) {
    const tab = this.createTabModel(url, title);
    this.activeTabId = tab.id;
    return tab;
  }

  getActiveTab() {
    return this.tabs.get(this.activeTabId) || null;
  }

  getAllTabs() {
    return Array.from(this.tabs.values());
  }

  setActiveTab(tabId) {
    if (this.tabs.has(tabId)) {
      this.activeTabId = tabId;
      return this.tabs.get(tabId);
    }
    return null;
  }

  pinTab(tabId) {
    const tab = this.tabs.get(tabId);
    if (tab) {
      tab.isPinned = !tab.isPinned;
      return tab.isPinned;
    }
    return false;
  }

  muteTab(tabId) {
    const tab = this.tabs.get(tabId);
    if (tab) {
      tab.isMuted = !tab.isMuted;
      return tab.isMuted;
    }
    return false;
  }

  duplicateTab(tabId) {
    const source = this.tabs.get(tabId);
    if (!source) return null;
    return this.createTab(source.url, source.title);
  }

  closeTab(tabId) {
    if (this.tabs.size <= 1) {
      // Never close the last tab; reset it to homeUrl
      const lastTab = this.getActiveTab();
      if (lastTab) {
        lastTab.url = this.homeUrl;
        lastTab.title = this.isIncognito ? 'Incognito' : 'New Tab';
        lastTab.backStack = [];
        lastTab.forwardStack = [];
        lastTab.canGoBack = false;
        lastTab.canGoForward = false;
        return lastTab;
      }
    }

    const deleted = this.tabs.delete(tabId);
    if (this.activeTabId === tabId) {
      const remaining = this.getAllTabs();
      this.activeTabId = remaining.length > 0 ? remaining[remaining.length - 1].id : null;
    }
    return deleted;
  }

  closeOtherTabs(tabId) {
    const keepTab = this.tabs.get(tabId);
    if (!keepTab) return;

    for (const [id] of Array.from(this.tabs.entries())) {
      if (id !== tabId) {
        this.tabs.delete(id);
      }
    }
    this.activeTabId = tabId;
  }

  removeTab(tabId) {
    return this.closeTab(tabId);
  }
}
