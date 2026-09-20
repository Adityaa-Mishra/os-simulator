/**
 * public/js/os/apps/browser/BrowserPasswordManager.js
 * Saved passwords and autofill credentials manager for AdityyaOS Browser.
 * Persisted in AdityyaFS at /home/user/.browser/passwords.json (zero writes in incognito).
 */

export class BrowserPasswordManager {
  /**
   * @param {Object} options
   * @param {import('../../api/FileSystemAPI.js').FileSystemAPI|Object} options.fs
   * @param {boolean} [options.isIncognito=false]
   */
  constructor({ fs, isIncognito = false }) {
    this.fs = fs?.fs ? fs.fs : fs;
    this.isIncognito = Boolean(isIncognito);
    this.passwordsFile = '/home/user/.browser/passwords.json';
    this.browserDir = '/home/user/.browser';

    this.passwords = [];
    this.init();
  }

  init() {
    if (this.isIncognito) {
      this.passwords = [];
      return;
    }

    this.ensureDirectory();
    this.load();
  }

  ensureDirectory() {
    try {
      if (!this.fs.exists('/home')) this.fs.createDirectory('/home');
      if (!this.fs.exists('/home/user')) this.fs.createDirectory('/home/user');
      if (!this.fs.exists(this.browserDir)) this.fs.createDirectory(this.browserDir);
    } catch {
      // Directory may already exist
    }
  }

  load() {
    if (this.isIncognito) return;

    try {
      if (this.fs.exists(this.passwordsFile)) {
        const raw = this.fs.readFile(this.passwordsFile);
        const content = typeof raw === 'string' ? raw : (raw?.content || '[]');
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) {
          this.passwords = parsed;
        }
      }
    } catch (err) {
      console.warn('[BrowserPasswordManager] Could not load passwords, initializing empty:', err);
      this.passwords = [];
    }
  }

  save() {
    if (this.isIncognito) return;

    try {
      this.ensureDirectory();
      this.fs.writeFile(this.passwordsFile, JSON.stringify(this.passwords, null, 2));
    } catch (err) {
      console.warn('[BrowserPasswordManager] Failed to save passwords to AdityyaFS:', err);
    }
  }

  getPasswords() {
    return [...this.passwords];
  }

  addPassword({ site, username, password }) {
    if (this.isIncognito || !site || !username) return null;

    const id = `pwd-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const entry = {
      id,
      site: site.trim(),
      username: username.trim(),
      password: password || '',
      createdAt: Date.now()
    };

    // Replace if exact site and username exists, or add new
    const existingIdx = this.passwords.findIndex(
      p => p.site.toLowerCase() === entry.site.toLowerCase() && p.username === entry.username
    );

    if (existingIdx !== -1) {
      this.passwords[existingIdx] = entry;
    } else {
      this.passwords.push(entry);
    }

    this.save();
    return entry;
  }

  removePassword(id) {
    if (this.isIncognito) return false;

    const idx = this.passwords.findIndex(p => p.id === id);
    if (idx !== -1) {
      this.passwords.splice(idx, 1);
      this.save();
      return true;
    }
    return false;
  }

  findPasswords(site) {
    if (!site) return [];
    const normalized = site.toLowerCase();
    return this.passwords.filter(p => p.site.toLowerCase().includes(normalized));
  }
}
