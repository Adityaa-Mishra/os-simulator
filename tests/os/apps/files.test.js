/**
 * tests/os/apps/files.test.js
 * Automated tests for Files (Directory Explorer) application.
 * Verifies AdityyaFS interaction through AdityyaOSAPI.fs.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FilesApp, filesApp } from '../../../public/js/os/apps/files/FilesApp.js';
import { Kernel } from '../../../public/js/os/kernel/Kernel.js';
import { APIContext } from '../../../public/js/os/api/APIContext.js';
import { AdityyaOSAPI } from '../../../public/js/os/api/AdityyaOSAPI.js';

function createMockElement(tag = 'div') {
  const el = {
    tagName: tag.toUpperCase(),
    style: {},
    dataset: {},
    value: '',
    textContent: '',
    _innerHTML: '',
    get innerHTML() { return this._innerHTML; },
    set innerHTML(val) {
      this._innerHTML = String(val);
      this._children = [];
    },
    className: '',
    classList: {
      _classes: new Set(),
      add: function (...cls) { cls.forEach(c => this._classes.add(c)); },
      remove: function (...cls) { cls.forEach(c => this._classes.delete(c)); },
      contains: function (c) { return this._classes.has(c); }
    },
    attributes: new Map(),
    setAttribute: function (name, val) { this.attributes.set(name, String(val)); },
    getAttribute: function (name) { return this.attributes.get(name) || null; },
    removeAttribute: function (name) { this.attributes.delete(name); },
    listeners: {},
    addEventListener: function (evt, handler) {
      if (!this.listeners[evt]) this.listeners[evt] = [];
      this.listeners[evt].push(handler);
    },
    removeEventListener: function (evt, handler) {
      if (!this.listeners[evt]) return;
      this.listeners[evt] = this.listeners[evt].filter(h => h !== handler);
    },
    dispatchEvent: function (evtName, payload) {
      const handlers = this.listeners[evtName] || [];
      handlers.forEach(h => h(payload || { target: this, preventDefault: vi.fn(), stopPropagation: vi.fn() }));
    },
    querySelector: function (sel) {
      const dummy = createMockElement('div');
      dummy.className = sel.replace(/[#.\[\]="]/g, ' ').trim();
      return dummy;
    },
    querySelectorAll: function () {
      return [];
    },
    contains: function () { return true; }
  };
  return el;
}

describe('Phase 23: Files Application', () => {
  let kernel;
  let context;
  let api;
  let container;

  beforeEach(() => {
    kernel = new Kernel();
    kernel.boot();
    kernel.fileSystemManager.createDirectory('/home');
    kernel.fileSystemManager.createDirectory('/home/user');
    kernel.fileSystemManager.createDirectory('/home/user/Documents');
    kernel.fileSystemManager.createFile('/home/user/readme.txt', 12);
    kernel.fileSystemManager.writeFile('/home/user/readme.txt', 'Welcome user');

    container = createMockElement('div');
    context = new APIContext({
      appId: 'files',
      instanceId: 'files-1',
      pid: 10,
      permissions: [...filesApp.permissions],
      cwd: '/home/user'
    });
    api = new AdityyaOSAPI({ kernel, context });
  });

  afterEach(() => {
    kernel.shutdown();
  });

  it('mounts and renders file manager toolbar and list', () => {
    const app = new FilesApp(api, container, { initialPath: '/home/user' });
    expect(container.innerHTML).toContain('os-files-app');
    expect(container.innerHTML).toContain('Files');
    expect(app.currentPath).toBe('/home/user');
    app.destroy();
  });

  it('navigates directories and updates breadcrumbs', () => {
    const app = new FilesApp(api, container, { initialPath: '/home/user' });
    expect(app.currentPath).toBe('/home/user');

    app.loadDirectory('/home/user/Documents');
    expect(app.currentPath).toBe('/home/user/Documents');

    app.navigateUp();
    expect(app.currentPath).toBe('/home/user');

    app.navigateUp();
    expect(app.currentPath).toBe('/home');

    app.navigateUp();
    expect(app.currentPath).toBe('/');

    app.destroy();
  });

  it('creates and deletes files and directories via API', () => {
    const app = new FilesApp(api, container, { initialPath: '/home/user' });

    // Create folder
    api.fs.createDirectory('/home/user/Projects');
    expect(api.fs.exists('/home/user/Projects')).toBe(true);

    // Create file
    api.fs.createFile('/home/user/Projects/index.js', 10);
    expect(api.fs.exists('/home/user/Projects/index.js')).toBe(true);

    // Delete file
    api.fs.deleteFile('/home/user/Projects/index.js');
    expect(api.fs.exists('/home/user/Projects/index.js')).toBe(false);

    // Delete folder
    api.fs.deleteDirectory('/home/user/Projects');
    expect(api.fs.exists('/home/user/Projects')).toBe(false);

    app.destroy();
  });

  it('renames files using api.fs.rename', () => {
    const app = new FilesApp(api, container, { initialPath: '/home/user' });

    api.fs.rename('/home/user/readme.txt', '/home/user/README.md');
    expect(api.fs.exists('/home/user/readme.txt')).toBe(false);
    expect(api.fs.exists('/home/user/README.md')).toBe(true);

    const read = api.fs.readFile('/home/user/README.md');
    expect(read.content).toBe('Welcome user');

    app.destroy();
  });

  it('formats file sizes and assigns correct icons', () => {
    const app = new FilesApp(api, container, { initialPath: '/home/user' });

    expect(app.formatSize(0)).toBe('0 B');
    expect(app.formatSize(512)).toBe('512 B');
    expect(app.formatSize(2048)).toBe('2.0 KB');
    expect(app.formatSize(2097152)).toBe('2.0 MB');

    expect(app.getFileIcon('photo.png')).toBe('🖼️');
    expect(app.getFileIcon('notes.txt')).toBe('📄');
    expect(app.getFileIcon('code.js')).toBe('📜');
    expect(app.getFileIcon('unknown.xyz')).toBe('📄');

    app.destroy();
  });

  it('conforms to standard Application Definition schema', () => {
    expect(filesApp.id).toBe('files');
    expect(filesApp.name).toBe('Files');
    expect(filesApp.category).toBe('System');
    expect(filesApp.permissions).toContain('filesystem.read');
    expect(filesApp.permissions).toContain('filesystem.write');
    expect(filesApp.permissions).toContain('window.control');
    expect(filesApp.permissions).toContain('application.lifecycle');
  });
});
