/**
 * tests/os/apps/systemMonitor.test.js
 * Automated tests for native System Monitor application.
 * Verifies metric consumption from api.system, api.memory, api.process and clean interval lifecycle.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SystemMonitorApp, systemMonitorApp } from '../../../public/js/os/apps/system-monitor/SystemMonitorApp.js';
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

describe('Phase 23: System Monitor Native Application', () => {
  let kernel;
  let context;
  let api;
  let container;

  beforeEach(() => {
    kernel = new Kernel();
    kernel.boot();
    kernel.processManager.createProcess({ name: 'init' });
    container = createMockElement('div');
    context = new APIContext({
      appId: 'system-monitor',
      instanceId: 'sm-1',
      pid: 10,
      permissions: [...systemMonitorApp.permissions]
    });
    api = new AdityyaOSAPI({ kernel, context });
  });

  afterEach(() => {
    kernel.shutdown();
  });

  it('conforms to standard Application Definition schema', () => {
    expect(systemMonitorApp.id).toBe('system-monitor');
    expect(systemMonitorApp.name).toBe('System Monitor');
    expect(systemMonitorApp.category).toBe('System');
    expect(typeof systemMonitorApp.entry).toBe('function');
    expect(systemMonitorApp.permissions).toContain('system.read');
    expect(systemMonitorApp.permissions).toContain('memory.read');
    expect(systemMonitorApp.permissions).toContain('process.read');
    expect(systemMonitorApp.permissions).toContain('window.control');
    expect(systemMonitorApp.permissions).toContain('application.lifecycle');
  });

  it('collects genuine metrics exclusively from api.system, api.memory, api.process', async () => {
    const sysSpy = vi.spyOn(api.system, 'getUptime');
    const memSpy = vi.spyOn(api.memory, 'getUsage');
    const procSpy = vi.spyOn(api.process, 'list');

    const app = new SystemMonitorApp(api, container, { autoStart: false });
    await app.sample();

    expect(sysSpy).toHaveBeenCalled();
    expect(memSpy).toHaveBeenCalled();
    expect(procSpy).toHaveBeenCalled();

    expect(app.currentMetrics).toBeDefined();
    expect(app.currentMetrics.memory).toBeDefined();
    expect(app.currentMetrics.system).toBeDefined();
    expect(app.currentMetrics.processCount).toBeGreaterThan(0);

    app.destroy();
  });

  it('maintains a bounded history of samples for sparklines', async () => {
    const app = new SystemMonitorApp(api, container, { autoStart: false });

    for (let i = 0; i < 5; i++) {
      await app.sample();
    }

    expect(app.history.length).toBe(5);
    expect(container.innerHTML).toContain('os-system-monitor-app');
    expect(container.innerHTML).toContain('CPU');
    expect(container.innerHTML).toContain('Memory');

    app.destroy();
  });

  it('starts and stops metric sampling timer on destroy', () => {
    const app = new SystemMonitorApp(api, container, { autoStart: true, intervalMs: 500 });
    expect(app.intervalId).not.toBeNull();

    app.destroy();
    expect(app.intervalId).toBeNull();
  });
});
