/**
 * tests/os/apps/settings.test.js
 * Automated tests for native Settings application.
 * Verifies informational tabs, read-only display settings, and clean API integration.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SettingsApp, settingsApp } from '../../../public/js/os/apps/settings/SettingsApp.js';
import { Kernel } from '../../../public/js/os/kernel/Kernel.js';
import { APIContext } from '../../../public/js/os/api/APIContext.js';
import { AdityyaOSAPI } from '../../../public/js/os/api/AdityyaOSAPI.js';

if (typeof globalThis.window === 'undefined') {
  globalThis.window = {
    innerWidth: 1280,
    innerHeight: 800
  };
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

describe('Phase 23: Settings Native Application', () => {
  let kernel;
  let context;
  let api;
  let container;

  beforeEach(() => {
    kernel = new Kernel();
    kernel.boot();
    container = createMockElement('div');
    context = new APIContext({
      appId: 'settings',
      instanceId: 'set-1',
      pid: 10,
      permissions: [...settingsApp.permissions]
    });
    api = new AdityyaOSAPI({ kernel, context });
  });

  afterEach(() => {
    kernel.shutdown();
  });

  it('conforms to standard Application Definition schema', () => {
    expect(settingsApp.id).toBe('settings');
    expect(settingsApp.name).toBe('Settings');
    expect(settingsApp.category).toBe('System');
    expect(typeof settingsApp.entry).toBe('function');
    expect(settingsApp.permissions).toContain('system.read');
    expect(settingsApp.permissions).toContain('filesystem.read');
    expect(settingsApp.permissions).toContain('window.control');
    expect(settingsApp.permissions).toContain('application.lifecycle');
  });

  it('initializes and mounts with default system tab', async () => {
    const app = new SettingsApp(api, container);
    await app.init();

    expect(app.activeTab).toBe('system');
    expect(container.innerHTML).toContain('os-settings-app');
    expect(container.innerHTML).toContain('Operating System');
    app.destroy();
  });

  it('switches between informational tabs', async () => {
    const app = new SettingsApp(api, container);
    await app.init();

    await app.setTab('display');
    expect(app.activeTab).toBe('display');
    expect(container.innerHTML).toContain('Display Resolution');

    await app.setTab('storage');
    expect(app.activeTab).toBe('storage');
    expect(container.innerHTML).toContain('Storage Usage');

    await app.setTab('about');
    expect(app.activeTab).toBe('about');
    expect(container.innerHTML).toContain('AdityyaOS');
    app.destroy();
  });

  it('does not include competing Phase 33 theme personalization engine', async () => {
    const app = new SettingsApp(api, container);
    await app.init();

    await app.setTab('display');
    // Confirm no theme customizer or wallpaper picker controls
    expect(container.innerHTML).not.toContain('Theme Engine');
    expect(container.innerHTML).not.toContain('Change Wallpaper');
    app.destroy();
  });
});
