/**
 * public/js/os/apps/browser/BrowserExtensions.js
 * Simulated extension registry and runtime manager for AdityyaOS Browser.
 * Persisted in AdityyaFS at /home/user/.browser/extensions.json.
 */

export const DEFAULT_EXTENSIONS = Object.freeze([
  {
    id: 'adblock',
    name: 'Adityya Shield',
    version: '1.4.0',
    description: 'Blocks intrusive ads, popups, and network trackers',
    icon: '🛡️',
    enabled: true
  },
  {
    id: 'darkreader',
    name: 'Dark Theme Pro',
    version: '2.1.0',
    description: 'Enables high-contrast dark mode for all websites',
    icon: '🌙',
    enabled: true
  },
  {
    id: 'autofill',
    name: 'Password AutoFill',
    version: '3.0.1',
    description: 'Securely manages and auto-populates site credentials',
    icon: '🔑',
    enabled: true
  },
  {
    id: 'privacy',
    name: 'Privacy Guard',
    version: '1.0.2',
    description: 'Guards against cross-site cookies and canvas fingerprinting',
    icon: '🔒',
    enabled: true
  }
]);

export class BrowserExtensions {
  /**
   * @param {Object} options
   * @param {import('../../api/FileSystemAPI.js').FileSystemAPI|Object} options.fs
   * @param {boolean} [options.isIncognito=false]
   */
  constructor({ fs, isIncognito = false }) {
    this.fs = fs?.fs ? fs.fs : fs;
    this.isIncognito = Boolean(isIncognito);
    this.extensionsFile = '/home/user/.browser/extensions.json';
    this.browserDir = '/home/user/.browser';

    this.extensions = [];
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
      if (this.fs.exists(this.extensionsFile)) {
        const raw = this.fs.readFile(this.extensionsFile);
        const content = typeof raw === 'string' ? raw : (raw?.content || '[]');
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.extensions = parsed;
          return;
        }
      }
    } catch (err) {
      console.warn('[BrowserExtensions] Could not load extensions, initializing defaults:', err);
    }

    this.extensions = DEFAULT_EXTENSIONS.map(ext => ({ ...ext }));
  }

  save() {
    if (this.isIncognito) return;

    try {
      this.ensureDirectory();
      this.fs.writeFile(this.extensionsFile, JSON.stringify(this.extensions, null, 2));
    } catch (err) {
      console.warn('[BrowserExtensions] Failed to save extensions to AdityyaFS:', err);
    }
  }

  getExtensions() {
    return [...this.extensions];
  }

  toggleExtension(id, enabled = null) {
    const ext = this.extensions.find(e => e.id === id);
    if (ext) {
      ext.enabled = typeof enabled === 'boolean' ? enabled : !ext.enabled;
      this.save();
      return ext.enabled;
    }
    return false;
  }
}
