/**
 * public/js/os/store/StoreCatalog.js
 * In-memory catalog of available applications in the Adityya Store.
 * Pre-populated with trusted simulated test packages to prove the Store lifecycle
 * without implementing Phase 23 native applications.
 */

import { StoreApp } from './StoreApp.js';
import { PackageBuilder } from '../packages/PackageBuilder.js';
import { PackagePermissions } from '../packages/PackagePermissions.js';

export class StoreCatalog {
  constructor() {
    this._apps = new Map(); // appId -> StoreApp
    this.initDefaultCatalog();
  }

  /**
   * Initialize default catalog with trusted simulated test packages.
   */
  initDefaultCatalog() {
    // 1. example.notes
    const notesPkg = new PackageBuilder()
      .setManifest({
        id: 'example.notes',
        name: 'Notes',
        version: '1.0.0',
        description: 'Simple text notes for AdityyaOS',
        author: 'AdityyaOS',
        entry: 'app.js',
        window: { width: 500, height: 400, resizable: true },
        permissions: [
          PackagePermissions.FILESYSTEM_READ,
          PackagePermissions.FILESYSTEM_WRITE,
          PackagePermissions.WINDOW_CONTROL,
          PackagePermissions.APPLICATION_LIFECYCLE
        ],
        memoryRequired: 32
      })
      .addFile('app.js', '// Notes simulated application code\nconsole.log("Notes loaded");')
      .addFile('style.css', '/* Notes styles */\n.notes-view { padding: 8px; }')
      .build();

    this.addApp(new StoreApp({
      id: 'example.notes',
      name: 'Notes',
      version: '1.0.0',
      description: 'Simple text notes for AdityyaOS',
      category: 'Productivity',
      icon: '📝',
      permissions: [
        PackagePermissions.FILESYSTEM_READ,
        PackagePermissions.FILESYSTEM_WRITE,
        PackagePermissions.WINDOW_CONTROL,
        PackagePermissions.APPLICATION_LIFECYCLE
      ],
      package: notesPkg,
      trustedEntry: (api, container) => {
        if (container) {
          container.innerHTML = '<div class="store-notes-app">Notes App Active</div>';
        }
      }
    }));

    // 2. example.calculator
    const calcPkg = new PackageBuilder()
      .setManifest({
        id: 'example.calculator',
        name: 'Calculator',
        version: '1.0.0',
        description: 'Basic simulated calculator',
        author: 'AdityyaOS',
        entry: 'app.js',
        window: { width: 320, height: 420, resizable: false },
        permissions: [
          PackagePermissions.WINDOW_CONTROL,
          PackagePermissions.APPLICATION_LIFECYCLE
        ],
        memoryRequired: 16
      })
      .addFile('app.js', '// Calculator simulated application code\nconsole.log("Calculator loaded");')
      .build();

    this.addApp(new StoreApp({
      id: 'example.calculator',
      name: 'Calculator',
      version: '1.0.0',
      description: 'Basic simulated calculator',
      category: 'Utilities',
      icon: '🔢',
      permissions: [
        PackagePermissions.WINDOW_CONTROL,
        PackagePermissions.APPLICATION_LIFECYCLE
      ],
      package: calcPkg,
      trustedEntry: (api, container) => {
        if (container) {
          container.innerHTML = '<div class="store-calc-app">Calculator Active</div>';
        }
      }
    }));

    // 3. example.text-editor
    const editorPkg = new PackageBuilder()
      .setManifest({
        id: 'example.text-editor',
        name: 'Text Editor',
        version: '1.0.0',
        description: 'Plain text file editor',
        author: 'AdityyaOS',
        entry: 'app.js',
        window: { width: 640, height: 480, resizable: true },
        permissions: [
          PackagePermissions.FILESYSTEM_READ,
          PackagePermissions.FILESYSTEM_WRITE,
          PackagePermissions.WINDOW_CONTROL,
          PackagePermissions.APPLICATION_LIFECYCLE
        ],
        memoryRequired: 48
      })
      .addFile('app.js', '// Text Editor simulated application code\nconsole.log("Editor loaded");')
      .build();

    this.addApp(new StoreApp({
      id: 'example.text-editor',
      name: 'Text Editor',
      version: '1.0.0',
      description: 'Plain text file editor',
      category: 'Productivity',
      icon: '📄',
      permissions: [
        PackagePermissions.FILESYSTEM_READ,
        PackagePermissions.FILESYSTEM_WRITE,
        PackagePermissions.WINDOW_CONTROL,
        PackagePermissions.APPLICATION_LIFECYCLE
      ],
      package: editorPkg,
      trustedEntry: (api, container) => {
        if (container) {
          container.innerHTML = '<div class="store-editor-app">Text Editor Active</div>';
        }
      }
    }));
  }

  /**
   * Add an application to the catalog.
   * @param {StoreApp} app
   */
  addApp(app) {
    if (!app || !app.id) {
      throw new TypeError('StoreApp must have a valid id');
    }
    this._apps.set(app.id, app);
  }

  /**
   * Remove an application from the catalog.
   * @param {string} appId
   * @returns {boolean}
   */
  removeApp(appId) {
    return this._apps.delete(appId);
  }

  /**
   * Get an application from the catalog.
   * @param {string} appId
   * @returns {StoreApp|null}
   */
  getApp(appId) {
    return this._apps.get(appId) || null;
  }

  /**
   * Get available versions for an application.
   * @param {string} appId
   * @returns {Array<string>}
   */
  getVersions(appId) {
    const app = this.getApp(appId);
    return app ? [app.version] : [];
  }

  /**
   * Search catalog applications by query string.
   * Searches in id, name, description, and category.
   * @param {string} query
   * @returns {Array<StoreApp>}
   */
  search(query = '') {
    if (!query || typeof query !== 'string' || !query.trim()) {
      return this.list();
    }
    const q = query.toLowerCase().trim();
    return Array.from(this._apps.values()).filter(app =>
      app.id.toLowerCase().includes(q) ||
      app.name.toLowerCase().includes(q) ||
      app.description.toLowerCase().includes(q) ||
      app.category.toLowerCase().includes(q)
    );
  }

  /**
   * List catalog applications, optionally filtered by category.
   * @param {string|null} [category=null]
   * @returns {Array<StoreApp>}
   */
  list(category = null) {
    const list = Array.from(this._apps.values());
    if (category && typeof category === 'string') {
      return list.filter(app => app.category.toLowerCase() === category.toLowerCase());
    }
    return list;
  }

  /**
   * Get safe snapshot of catalog state.
   * @returns {Object}
   */
  getState() {
    return {
      count: this._apps.size,
      apps: this.list().map(app => app.getState())
    };
  }

  /**
   * JSON serialization support.
   */
  toJSON() {
    return this.getState();
  }
}
