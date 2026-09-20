/**
 * public/js/os/apps/browser/BrowserBookmarks.js
 * Persistent bookmarks management for AdityyaOS Browser.
 * Persisted in AdityyaFS at /home/user/.browser/bookmarks.json.
 */

export const DEFAULT_BOOKMARKS = Object.freeze([
  { url: 'adityya://newtab', title: 'New Tab' },
  { url: 'adityya://welcome', title: 'AdityyaOS Portal' },
  { url: 'adityya://bookmarks', title: 'Bookmarks Manager' },
  { url: 'adityya://history', title: 'Browsing History' },
  { url: 'adityya://settings', title: 'Settings' },
  { url: 'https://duckduckgo.com', title: 'DuckDuckGo' },
  { url: 'https://wikipedia.org', title: 'Wikipedia' }
]);

export class BrowserBookmarks {
  /**
   * @param {import('../../api/FileSystemAPI.js').FileSystemAPI|Object} fsOrApi
   */
  constructor(fsOrApi) {
    this.fs = fsOrApi?.fs ? fsOrApi.fs : fsOrApi;
    this.bookmarksFile = '/home/user/.browser/bookmarks.json';
    this.browserDir = '/home/user/.browser';
    this.bookmarks = [];

    this.init();
  }

  init() {
    this.ensureDirectory();
    this.load();
  }

  ensureDirectory() {
    try {
      if (!this.fs.exists('/home')) this.fs.createDirectory('/home');
      if (!this.fs.exists('/home/user')) this.fs.createDirectory('/home/user');
      if (!this.fs.exists(this.browserDir)) this.fs.createDirectory(this.browserDir);
    } catch {
      // Ignore if directory already exists
    }
  }

  load() {
    try {
      if (this.fs.exists(this.bookmarksFile)) {
        const data = this.fs.readFile(this.bookmarksFile);
        const raw = typeof data === 'string' ? data : (data?.content || '[]');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          this.bookmarks = parsed;
          return;
        }
      }
    } catch (err) {
      console.warn('[BrowserBookmarks] Could not load bookmarks file, initializing defaults:', err);
    }

    // Initialize empty if none exist
    this.bookmarks = [];
    this.save();
  }

  save() {
    try {
      this.ensureDirectory();
      this.fs.writeFile(this.bookmarksFile, JSON.stringify(this.bookmarks, null, 2));
    } catch (err) {
      console.warn('[BrowserBookmarks] Failed to save bookmarks to AdityyaFS:', err);
    }
  }

  /**
   * Add a bookmark.
   * Supports both (url, title) and ({ url, title }).
   * @param {string|Object} urlOrObj
   * @param {string} [title='']
   * @returns {boolean}
   */
  addBookmark(urlOrObj, title = '') {
    let url, t;
    if (typeof urlOrObj === 'object' && urlOrObj !== null) {
      url = urlOrObj.url;
      t = urlOrObj.title;
    } else {
      url = urlOrObj;
      t = title;
    }

    if (!url || typeof url !== 'string') return false;
    if (this.isBookmarked(url)) return false;

    this.bookmarks.push({
      url,
      title: t || url
    });

    this.save();
    return true;
  }

  /**
   * Remove a bookmark by URL.
   * @param {string} url
   * @returns {boolean}
   */
  removeBookmark(url) {
    const idx = this.bookmarks.findIndex(b => b.url === url);
    if (idx !== -1) {
      this.bookmarks.splice(idx, 1);
      this.save();
      return true;
    }
    return false;
  }

  /**
   * Update a bookmark.
   * @param {string} oldUrl
   * @param {Object} update
   * @param {string} [update.title]
   * @param {string} [update.url]
   * @returns {boolean}
   */
  updateBookmark(oldUrl, update = {}) {
    const item = this.bookmarks.find(b => b.url === oldUrl);
    if (item) {
      if (update.title) item.title = update.title;
      if (update.url) item.url = update.url;
      this.save();
      return true;
    }
    return false;
  }

  /**
   * Check if URL is bookmarked.
   * @param {string} url
   * @returns {boolean}
   */
  isBookmarked(url) {
    return this.bookmarks.some(b => b.url === url);
  }

  /**
   * Get all bookmarks.
   * @returns {Array<{ url: string, title: string }>}
   */
  getBookmarks() {
    return [...this.bookmarks];
  }

  /**
   * Search bookmarks.
   * @param {string} query
   * @returns {Array<{ url: string, title: string }>}
   */
  searchBookmarks(query) {
    if (!query) return this.getBookmarks();
    const q = query.toLowerCase();
    return this.bookmarks.filter(b => b.url.toLowerCase().includes(q) || b.title.toLowerCase().includes(q));
  }
}
