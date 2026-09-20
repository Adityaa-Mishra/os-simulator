/**
 * tests/os/apps/terminal.test.js
 * Automated tests for native Terminal application.
 * Verifies Terminal integration, command execution, and permission restrictions.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TerminalApp, terminalApp } from '../../../public/js/os/apps/terminal/TerminalApp.js';
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
    blur: vi.fn(),
    scrollTop: 0,
    scrollHeight: 100
  };
  return el;
}

if (typeof globalThis.window === 'undefined') {
  globalThis.window = {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  };
}
if (typeof globalThis.document === 'undefined') {
  globalThis.document = {
    createElement: (tag) => createMockElement(tag)
  };
}

describe('Phase 23: Terminal Native Application', () => {
  let kernel;
  let context;
  let api;
  let container;

  beforeEach(() => {
    kernel = new Kernel();
    kernel.boot();
    container = createMockElement('div');
    context = new APIContext({
      appId: 'terminal',
      instanceId: 'term-1',
      pid: 10,
      permissions: [...terminalApp.permissions]
    });
    api = new AdityyaOSAPI({ kernel, context });
  });

  afterEach(() => {
    kernel.shutdown();
  });

  it('conforms to standard Application Definition schema', () => {
    expect(terminalApp.id).toBe('terminal');
    expect(terminalApp.name).toBe('Terminal');
    expect(terminalApp.category).toBe('System');
    expect(typeof terminalApp.entry).toBe('function');
    expect(terminalApp.permissions).toContain('filesystem.read');
    expect(terminalApp.permissions).toContain('filesystem.write');
    expect(terminalApp.permissions).toContain('process.self');
    expect(terminalApp.permissions).toContain('window.control');
    expect(terminalApp.permissions).toContain('application.lifecycle');

    // CRITICAL CONSTRAINT: Terminal must NOT have events.emit permission
    expect(terminalApp.permissions).not.toContain('events.emit');
  });

  it('initializes and mounts in container', () => {
    const app = new TerminalApp(api, container);
    expect(app.terminal).toBeDefined();
    expect(app.shell).toBeDefined();
    expect(container.innerHTML).toContain('os-terminal-app');
    app.destroy();
  });

  it('executes commands through terminal shell and produces output', async () => {
    const app = new TerminalApp(api, container);
    await app.executeCommand('echo Hello AdityyaOS');
    expect(app.terminal.lines.some(line => line.includes('Hello AdityyaOS'))).toBe(true);
    app.destroy();
  });

  it('cleans up resources and listeners on destroy', () => {
    const app = new TerminalApp(api, container);
    app.destroy();
    expect(container.innerHTML).toBe('');
  });
});
