/**
 * tests/os/browser/browserInteractiveFixes.test.js
 * Automated tests for History, Downloads, and Settings interactivity fixes.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BrowserApp } from '../../../public/js/os/apps/browser/BrowserApp.js';
import { SettingsApp } from '../../../public/js/os/apps/settings/SettingsApp.js';
import { Kernel } from '../../../public/js/os/kernel/Kernel.js';
import { APIContext } from '../../../public/js/os/api/APIContext.js';
import { AdityyaOSAPI } from '../../../public/js/os/api/AdityyaOSAPI.js';
import { PackagePermissions } from '../../../public/js/os/packages/PackagePermissions.js';

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
      contains: function (c) { return this._classes.has(c); },
      toggle: function (c) {
        if (this._classes.has(c)) { this._classes.delete(c); return false; }
        else { this._classes.add(c); return true; }
      }
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
    dispatchEvent: function (evtOrName, payload) {
      const evtName = typeof evtOrName === 'string' ? evtOrName : evtOrName.type;
      const handlers = this.listeners[evtName] || [];
      const eventObj = typeof evtOrName === 'object' ? evtOrName : {
        type: evtName,
        target: this,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        ...payload
      };
      handlers.forEach(h => h(eventObj));
      return true;
    },
    querySelector: function (sel) {
      const dummy = createMockElement('div');
      dummy.className = sel.replace(/[#.\[\]="]/g, ' ').trim();
      return dummy;
    },
    querySelectorAll: function () {
      return [];
    },
    closest: function (sel) {
      if (sel === '.os-internal-link' && this.attributes.has('data-url')) return this;
      if (sel === '.btn-open-download' && this.attributes.has('data-path')) return this;
      return null;
    },
    appendChild: function (child) { return child; },
    removeChild: function (child) { return child; },
    prepend: function (child) { return child; },
    contains: function () { return true; },
    focus: vi.fn(),
    blur: vi.fn(),
    select: vi.fn()
  };
  return el;
}

describe('Browser & Settings Interactivity Fixes', () => {
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
      instanceId: 'test-browser',
      pid: 10,
      username: 'user',
      permissions: [
        PackagePermissions.FILESYSTEM_READ,
        PackagePermissions.FILESYSTEM_WRITE,
        PackagePermissions.WINDOW_CONTROL,
        PackagePermissions.APPLICATION_LIFECYCLE,
        PackagePermissions.NETWORK_READ,
        PackagePermissions.NETWORK_CONNECT,
        PackagePermissions.PROFILE_READ,
        PackagePermissions.PROFILE_WRITE,
        PackagePermissions.SYSTEM_READ,
        PackagePermissions.MEMORY_READ
      ]
    });
    api = new AdityyaOSAPI({ kernel, context });
  });

  afterEach(() => {
    kernel.shutdown();
  });

  it('container-level delegation navigates on .os-internal-link clicks from dropdowns', async () => {
    const app = new BrowserApp(api, container);
    await app.init();

    // Create a mock link element as if inside kebab dropdown
    const link = createMockElement('button');
    link.classList.add('os-internal-link');
    link.setAttribute('data-url', 'adityya://history');

    // Simulate clicking on the link within container
    container.dispatchEvent('click', {
      target: link,
      preventDefault: vi.fn()
    });

    // Verify the active tab navigated to adityya://history
    expect(app.state.getActiveTab().url).toBe('adityya://history');

    // Simulate clicking downloads
    const dlLink = createMockElement('button');
    dlLink.classList.add('os-internal-link');
    dlLink.setAttribute('data-url', 'adityya://downloads');

    container.dispatchEvent('click', {
      target: dlLink,
      preventDefault: vi.fn()
    });

    expect(app.state.getActiveTab().url).toBe('adityya://downloads');

    // Simulate clicking settings
    const setLink = createMockElement('button');
    setLink.classList.add('os-internal-link');
    setLink.setAttribute('data-url', 'adityya://settings');

    container.dispatchEvent('click', {
      target: setLink,
      preventDefault: vi.fn()
    });

    expect(app.state.getActiveTab().url).toBe('adityya://settings');

    app.destroy();
  });

  it('keyboard shortcuts Ctrl+H and Ctrl+J navigate to History and Downloads', async () => {
    const app = new BrowserApp(api, container);
    await app.init();

    // Trigger Ctrl+H
    container.dispatchEvent('keydown', {
      ctrlKey: true,
      key: 'h',
      target: container,
      preventDefault: vi.fn()
    });
    expect(app.state.getActiveTab().url).toBe('adityya://history');

    // Trigger Ctrl+J
    container.dispatchEvent('keydown', {
      ctrlKey: true,
      key: 'j',
      target: container,
      preventDefault: vi.fn()
    });
    expect(app.state.getActiveTab().url).toBe('adityya://downloads');

    app.destroy();
  });

  it('triggerPageDownload downloads file to /home/user/Downloads/ in AdityyaFS', async () => {
    const app = new BrowserApp(api, container);
    await app.init();

    const downloadedItem = await app.view.triggerPageDownload('test_file.txt', 'Test Download Content');
    expect(downloadedItem).toBeTruthy();
    expect(downloadedItem.filename).toBe('test_file.txt');
    expect(downloadedItem.status).toBe('completed');

    // Verify file exists on AdityyaFS
    const exists = await api.fs.exists('/home/user/Downloads/test_file.txt');
    expect(exists).toBe(true);

    const file = await api.fs.readFile('/home/user/Downloads/test_file.txt');
    const content = typeof file === 'string' ? file : file.content;
    expect(content).toBe('Test Download Content');

    // Verify it is listed in downloads
    const list = app.downloads.getDownloads();
    expect(list.length).toBeGreaterThanOrEqual(1);
    expect(list[0].filename).toBe('test_file.txt');

    app.destroy();
  });

  it('ProfileManager.getCurrentProfile returns active profile snapshot and SettingsApp profile works', async () => {
    const currentProfile = kernel.profileManager.getCurrentProfile();
    expect(currentProfile).toBeTruthy();
    expect(currentProfile.username).toBe('user');
    expect(currentProfile.displayName).toBe('Default User');

    // Mount SettingsApp
    const settingsContainer = createMockElement('div');
    const settingsAppInstance = new SettingsApp(api, settingsContainer);
    await settingsAppInstance.init();

    // Verify SettingsApp profile panel renders
    await settingsAppInstance.setTab('profile');
    expect(settingsContainer.innerHTML).toContain('User Profile');
    expect(settingsContainer.innerHTML).toContain('Default User');

    // Verify SettingsApp applications panel renders fallback apps
    await settingsAppInstance.setTab('apps');
    expect(settingsContainer.innerHTML).toContain('Installed Applications');
    expect(settingsContainer.innerHTML).toContain('Additya Browser');

    settingsAppInstance.destroy();
  });
});
