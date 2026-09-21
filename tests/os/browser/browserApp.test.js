/**
 * tests/os/browser/browserApp.test.js
 * Automated tests for full BrowserApp integration, sandbox verification, and security isolation.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BrowserApp, browserApp } from '../../../public/js/os/apps/browser/BrowserApp.js';
import { Kernel } from '../../../public/js/os/kernel/Kernel.js';
import { APIContext } from '../../../public/js/os/api/APIContext.js';
import { AdityyaOSAPI } from '../../../public/js/os/api/AdityyaOSAPI.js';

if (typeof globalThis.window === 'undefined') {
  globalThis.window = {};
}

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

describe('Phase 24: Web Browser Native Application', () => {
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
      instanceId: 'brw-app-1',
      pid: 10,
      permissions: [...browserApp.permissions]
    });
    api = new AdityyaOSAPI({ kernel, context });
  });

  afterEach(() => {
    kernel.shutdown();
  });

  it('conforms to standard Application Definition schema', () => {
    expect(browserApp.id).toBe('browser');
    expect(browserApp.name).toBe('Additya Browser');
    expect(browserApp.category).toBe('Internet');
    expect(typeof browserApp.entry).toBe('function');
    expect(browserApp.permissions).toContain('filesystem.read');
    expect(browserApp.permissions).toContain('filesystem.write');
    expect(browserApp.permissions).toContain('window.control');
    expect(browserApp.permissions).toContain('application.lifecycle');
  });

  it('mounts in container with tab strip, toolbar, and viewport', async () => {
    const app = new BrowserApp(api, container);
    await app.init();

    expect(container.innerHTML).toContain('os-browser-app');
    expect(container.innerHTML).toContain('browser-tabbar');
    expect(container.innerHTML).toContain('browser-toolbar');
    expect(container.innerHTML).toContain('browser-viewport');
    app.destroy();
  });

  it('navigates to internal adityya:// page and renders content', async () => {
    const app = new BrowserApp(api, container);
    await app.init();

    await app.navigate('adityya://version');
    expect(app.state.getActiveTab().url).toBe('adityya://version');
    expect(container.innerHTML).toContain('AdityyaOS Browser Version');
    app.destroy();
  });

  it('navigates to external URL and embeds sandboxed iframe', async () => {
    const app = new BrowserApp(api, container);
    await app.init();

    await app.navigate('https://example.com');
    expect(app.state.getActiveTab().url).toBe('https://example.com');
    // Verify iframe creation and sandbox attributes
    expect(container.innerHTML).toContain('<iframe');
    expect(container.innerHTML).toContain('sandbox="allow-scripts allow-same-origin allow-forms"');
    app.destroy();
  });

  it('provides controlled fallback state for blocked or failing pages', async () => {
    const app = new BrowserApp(api, container);
    await app.init();

    await app.navigate('https://blocked-site.com');
    app.handleIframeError('Blocked by CSP or X-Frame-Options');

    expect(container.innerHTML).toContain('Unable to display page');
    expect(container.innerHTML).toContain('Blocked by CSP or X-Frame-Options');
    app.destroy();
  });

  it('SECURITY ISOLATION: external web content in iframe has zero access to AdityyaOS APIs or Kernel', async () => {
    const app = new BrowserApp(api, container);
    await app.init();

    await app.navigate('https://untrusted-site.org');

    // Verify that the iframe attributes do not pass OS references
    expect(container.innerHTML).not.toContain('api=');
    expect(container.innerHTML).not.toContain('kernel=');

    // Confirm that BrowserApp does not attach kernel or api to global window
    expect(typeof window.kernel).toBe('undefined');
    expect(typeof window.AdityyaOS).toBe('undefined');

    app.destroy();
  });

  it('supports multi-tab operations: new tab, switch tab, close tab', async () => {
    const app = new BrowserApp(api, container);
    await app.init();

    const initialCount = app.state.tabs.length;
    await app.createNewTab('https://adityya.dev');
    expect(app.state.tabs.length).toBe(initialCount + 1);

    const activeTab = app.state.getActiveTab();
    expect(activeTab.url).toBe('https://adityya.dev');

    await app.closeTab(activeTab.id);
    expect(app.state.tabs.length).toBe(initialCount);
    app.destroy();
  });
});
