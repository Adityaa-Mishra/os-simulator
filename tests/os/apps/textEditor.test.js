/**
 * tests/os/apps/textEditor.test.js
 * Automated tests for native Text Editor application.
 * Verifies AdityyaFS file loading, saving, dirty tracking, and zero host filesystem access.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TextEditorApp, textEditorApp } from '../../../public/js/os/apps/text-editor/TextEditorApp.js';
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
    appendChild: function (child) { return child; },
    removeChild: function (child) { return child; },
    contains: function () { return true; },
    focus: vi.fn(),
    blur: vi.fn()
  };
  return el;
}

describe('Phase 23: Text Editor Native Application', () => {
  let kernel;
  let context;
  let api;
  let container;

  beforeEach(() => {
    kernel = new Kernel();
    kernel.boot();
    container = createMockElement('div');
    context = new APIContext({
      appId: 'text-editor',
      instanceId: 'te-1',
      pid: 10,
      permissions: [...textEditorApp.permissions]
    });
    api = new AdityyaOSAPI({ kernel, context });
  });

  afterEach(() => {
    kernel.shutdown();
  });

  it('conforms to standard Application Definition schema', () => {
    expect(textEditorApp.id).toBe('text-editor');
    expect(textEditorApp.name).toBe('Text Editor');
    expect(textEditorApp.category).toBe('Productivity');
    expect(typeof textEditorApp.entry).toBe('function');
    expect(textEditorApp.permissions).toContain('filesystem.read');
    expect(textEditorApp.permissions).toContain('filesystem.write');
    expect(textEditorApp.permissions).toContain('window.control');
    expect(textEditorApp.permissions).toContain('application.lifecycle');
  });

  it('initializes with an empty document and mounts in container', () => {
    const app = new TextEditorApp(api, container);
    expect(app.currentPath).toBeNull();
    expect(app.content).toBe('');
    expect(app.isDirty).toBe(false);
    expect(container.innerHTML).toContain('os-text-editor-app');
    app.destroy();
  });

  it('loads and displays a file from AdityyaFS', async () => {
    await api.fs.writeFile('/home/user/document.txt', 'Hello World AdityyaFS');

    const app = new TextEditorApp(api, container);
    await app.openFile('/home/user/document.txt');

    expect(app.currentPath).toBe('/home/user/document.txt');
    expect(app.content).toBe('Hello World AdityyaFS');
    expect(app.isDirty).toBe(false);
    app.destroy();
  });

  it('tracks modifications and marks editor as dirty', async () => {
    const app = new TextEditorApp(api, container);
    app.setContent('Some unsaved text');
    expect(app.isDirty).toBe(true);
    app.destroy();
  });

  it('saves changes back to AdityyaFS and resets dirty flag', async () => {
    const app = new TextEditorApp(api, container);
    app.setContent('Saved content here');
    await app.saveFile('/home/user/saved.txt');

    expect(app.isDirty).toBe(false);
    expect(app.currentPath).toBe('/home/user/saved.txt');

    const read = await api.fs.readFile('/home/user/saved.txt');
    expect(typeof read === 'string' ? read : read.content).toBe('Saved content here');
    app.destroy();
  });

  it('does not create or invoke host file input elements', () => {
    const app = new TextEditorApp(api, container);
    expect(container.innerHTML).not.toContain('type="file"');
    app.destroy();
  });
});
