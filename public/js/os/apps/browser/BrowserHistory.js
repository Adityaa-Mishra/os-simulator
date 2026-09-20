/**
 * public/js/os/apps/browser/BrowserHistory.js
 * Global browsing history for AdityyaOS Browser.
 * Persisted in AdityyaFS at /home/user/.browser/history.json.
 * Strict Incognito Isolation: In incognito mode, ZERO history is written to AdityyaFS.
 */

export class BrowserHistory {
  /**
   * @param {import('../../api/FileSystemAPI.js').FileSystemAPI|Object} fsOrOptions
   * @param {boolean} [isIncognito=false]
   */
  constructor(fsOrOptions, isIncognito = false) {
    if (fsOrOptions && typeof fsOrOptions === 'object' && ('fs' in fsOrOptions || 'isIncognito' in fsOrOptions)) {
      this.fs = fsOrOptions.fs?.fs ? fsOrOptions.fs.fs : (fsOrOptions.fs || fsOrOptions);
      this.isIncognito = Boolean(fsOrOptions.isIncognito);
    } else {
      this.fs = fsOrOptions?.fs ? fsOrOptions.fs : fsOrOptions;
      this.isIncognito = Boolean(isIncognito);
    }

    this.historyFile = '/home/user/.browser/history.json';
    this.browserDir = '/home/user/.browser';
    this.entries = []; // Array<{ id: string, url: string, title: string, timestamp: number }>

    this.init();
  }

  init() {
    if (this.isIncognito) {
      this.entries = [];
      return;
    }
    this.ensureDirectory();
    this.load();
  }

  ensureDirectory() {
    if (this.isIncognito) return;
    try {
      if (!this.fs.exists('/home')) this.fs.createDirectory('/home');
      if (!this.fs.exists('/home/user')) this.fs.createDirectory('/home/user');
      if (!this.fs.exists(this.browserDir)) this.fs.createDirectory(this.browserDir);
    } catch {
      // Ignore if directory already exists
    }
  }

  load() {
    if (this.isIncognito) return;
    try {
      if (this.fs.exists(this.historyFile)) {
        const data = this.fs.readFile(this.historyFile);
        const raw = typeof data === 'string' ? data : (data?.content || '[]');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          this.entries = parsed;
        }
      }
    } catch (err) {
      console.warn('[BrowserHistory] Could not load history file, starting fresh:', err);
      this.entries = [];
    }
  }

  save() {
    if (this.isIncognito) return;
    try {
      this.ensureDirectory();
      this.fs.writeFile(this.historyFile, JSON.stringify(this.entries, null, 2));
    } catch (err) {
      console.warn('[BrowserHistory] Failed to save history to AdityyaFS:', err);
    }
  }

  /**
   * Add an entry to browsing history.
   * If in incognito mode, this is a strict no-op.
   * @param {string|Object} urlOrObj
   * @param {string} [title='']
   * @param {number} [timestamp=null]
   * @returns {Object|null}
   */
  addEntry(urlOrObj, title = '', timestamp = null) {
    if (this.isIncognito) return null;

    let url, t, ts;
    if (typeof urlOrObj === 'object' && urlOrObj !== null) {
      url = urlOrObj.url;
      t = urlOrObj.title;
      ts = urlOrObj.timestamp;
    } else {
      url = urlOrObj;
      t = title;
      ts = timestamp;
    }

    if (!url || typeof url !== 'string') return null;

    const entry = {
      id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      url,
      title: t || url,
      timestamp: ts || Date.now()
    };

    // Prepend (newest first), limit to 1000 items
    this.entries.unshift(entry);
    if (this.entries.length > 1000) {
      this.entries = this.entries.slice(0, 1000);
    }

    this.save();
    return entry;
  }

  /**
   * Get all history entries.
   * @returns {Array<Object>}
   */
  getEntries() {
    return [...this.entries];
  }

  /**
   * Search history entries by query.
   * @param {string} query
   * @returns {Array<Object>}
   */
  search(query) {
    if (!query) return this.getEntries();
    const q = query.toLowerCase();
    return this.entries.filter(e => e.url.toLowerCase().includes(q) || (e.title && e.title.toLowerCase().includes(q)));
  }

  /**
   * Remove a single history entry by ID.
   * @param {string} id
   * @returns {boolean}
   */
  removeEntry(id) {
    if (this.isIncognito) return false;
    const idx = this.entries.findIndex(e => e.id === id);
    if (idx !== -1) {
      this.entries.splice(idx, 1);
      this.save();
      return true;
    }
    return false;
  }

  /**
   * Clear all browsing history.
   */
  clear() {
    this.entries = [];
    if (!this.isIncognito) {
      this.save();
    }
  }
}
