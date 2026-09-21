/**
 * tests/os/browser/browserIncognito.test.js
 * Automated tests for strict Incognito mode isolation, zero-persistence guarantee, and DOM styling.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BrowserApp } from '../../../public/js/os/apps/browser/BrowserApp.js';
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

describe('Browser Strict Incognito Mode', () => {
  let kernel;
  let context;
  let api;
  let container;

  beforeEach(() => {
    kernel = new Kernel();
    kernel.boot();
    container = createMockElement('div');
    context = new APIContext({
      appId: 'browser',
      instanceId: 'brw-incog-1',
      pid: 25,
      permissions: ['filesystem.read', 'filesystem.write', 'window.control', 'application.lifecycle']
    });
    api = new AdityyaOSAPI({ kernel, context });
  });

  afterEach(() => {
    kernel.shutdown();
  });

  it('initializes in Incognito mode with dark styling and incognito landing page', async () => {
    const app = new BrowserApp(api, container, { isIncognito: true });
    await app.init();

    expect(app.isIncognito).toBe(true);
    expect(app.state.isIncognito).toBe(true);
    expect(app.state.getActiveTab().url).toBe('adityya://incognito');

    // DOM contains incognito classes and badges
    expect(container.innerHTML).toContain('os-browser-app incognito');
    expect(container.innerHTML).toContain('chrome-incognito-pill');
    expect(container.innerHTML).toContain('You’ve gone Incognito');
    expect(container.innerHTML).toContain('Block third-party cookies');

    app.destroy();
  });

  it('STRICT ISOLATION: browsing in Incognito mode NEVER writes history to AdityyaFS', async () => {
    // Ensure history file does not exist before
    const historyPath = '/home/user/.browser/history.json';
    const beforeExists = await api.fs.exists(historyPath);
    expect(beforeExists).toBe(false);

    const app = new BrowserApp(api, container, { isIncognito: true });
    await app.init();

    // Navigate to multiple URLs
    await app.navigate('https://secret-site.com');
    await app.navigate('https://another-private-page.org');
    await app.navigate('adityya://version');

    // In-memory tab tracks current URL
    expect(app.state.getActiveTab().url).toBe('adityya://version');

    // History in app must be empty or strictly unpersisted
    expect(app.history.getEntries().length).toBe(0);

    // AdityyaFS must NOT have created or modified history.json
    const afterExists = await api.fs.exists(historyPath);
    expect(afterExists).toBe(false);

    app.destroy();
  });

  it('STRICT ISOLATION: passwords cannot be saved in Incognito mode', async () => {
    const app = new BrowserApp(api, container, { isIncognito: true });
    await app.init();

    const saved = app.passwords.addPassword({
      site: 'bank.com',
      username: 'user1',
      password: 'password123'
    });
    expect(saved).toBeNull();
    expect(app.passwords.getPasswords().length).toBe(0);

    const passwordsPath = '/home/user/.browser/passwords.json';
    const exists = await api.fs.exists(passwordsPath);
    expect(exists).toBe(false);

    app.destroy();
  });

  it('cleanly destroys session without leaving storage traces', async () => {
    const app = new BrowserApp(api, container, { isIncognito: true });
    await app.init();

    await app.createNewTab('https://ephemeral.io');
    expect(app.state.tabs.length).toBe(2);

    app.destroy();
    expect(container.innerHTML).toBe('');
    expect(app.view).toBeNull();
  });
});
