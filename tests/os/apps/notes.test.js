/**
 * tests/os/apps/notes.test.js
 * Automated tests for native Notes application.
 * Verifies notes directory creation, CRUD operations, and dirty state tracking.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NotesApp, notesApp } from '../../../public/js/os/apps/notes/NotesApp.js';
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

describe('Phase 23: Notes Native Application', () => {
  let kernel;
  let context;
  let api;
  let container;

  beforeEach(() => {
    kernel = new Kernel();
    kernel.boot();
    container = createMockElement('div');
    context = new APIContext({
      appId: 'notes',
      instanceId: 'notes-1',
      pid: 10,
      permissions: [...notesApp.permissions]
    });
    api = new AdityyaOSAPI({ kernel, context });
  });

  afterEach(() => {
    kernel.shutdown();
  });

  it('conforms to standard Application Definition schema', () => {
    expect(notesApp.id).toBe('notes');
    expect(notesApp.name).toBe('Notes');
    expect(notesApp.category).toBe('Productivity');
    expect(typeof notesApp.entry).toBe('function');
    expect(notesApp.permissions).toContain('filesystem.read');
    expect(notesApp.permissions).toContain('filesystem.write');
    expect(notesApp.permissions).toContain('window.control');
    expect(notesApp.permissions).toContain('application.lifecycle');
  });

  it('ensures /home/user/Notes directory exists on init', async () => {
    const app = new NotesApp(api, container);
    await app.init();

    const exists = await api.fs.exists('/home/user/Notes');
    expect(exists).toBe(true);
    app.destroy();
  });

  it('creates and reads notes in /home/user/Notes', async () => {
    const app = new NotesApp(api, container);
    await app.init();

    await app.createNote('TestNote.txt', 'This is a test note content');
    expect(app.notes.some(n => n.name === 'TestNote.txt')).toBe(true);

    const content = await api.fs.readFile('/home/user/Notes/TestNote.txt');
    expect(typeof content === 'string' ? content : content.content).toBe('This is a test note content');
    app.destroy();
  });

  it('tracks dirty state and saves modifications', async () => {
    const app = new NotesApp(api, container);
    await app.init();

    await app.createNote('Draft.txt', 'Initial content');
    expect(app.isDirty).toBe(false);

    app.setContent('Modified content');
    expect(app.isDirty).toBe(true);

    await app.saveCurrentNote();
    expect(app.isDirty).toBe(false);

    const saved = await api.fs.readFile('/home/user/Notes/Draft.txt');
    expect(typeof saved === 'string' ? saved : saved.content).toBe('Modified content');
    app.destroy();
  });

  it('deletes notes cleanly', async () => {
    const app = new NotesApp(api, container);
    await app.init();

    await app.createNote('ToDelete.txt', 'Delete me');
    expect(await api.fs.exists('/home/user/Notes/ToDelete.txt')).toBe(true);

    await app.deleteNote('ToDelete.txt');
    expect(await api.fs.exists('/home/user/Notes/ToDelete.txt')).toBe(false);
    expect(app.notes.some(n => n.name === 'ToDelete.txt')).toBe(false);
    app.destroy();
  });
});
