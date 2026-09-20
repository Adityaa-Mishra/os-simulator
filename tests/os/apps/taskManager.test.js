/**
 * tests/os/apps/taskManager.test.js
 * Automated tests for native Task Manager application.
 * Verifies process listing via api.process.list(), filtering, termination via api.process.terminate(),
 * and protection of critical system processes.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TaskManagerApp, taskManagerApp } from '../../../public/js/os/apps/task-manager/TaskManagerApp.js';
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

describe('Phase 23: Task Manager Native Application', () => {
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
      appId: 'task-manager',
      instanceId: 'tm-1',
      pid: 10,
      permissions: [...taskManagerApp.permissions]
    });
    api = new AdityyaOSAPI({ kernel, context });
  });

  afterEach(() => {
    kernel.shutdown();
  });

  it('conforms to standard Application Definition schema', () => {
    expect(taskManagerApp.id).toBe('task-manager');
    expect(taskManagerApp.name).toBe('Task Manager');
    expect(taskManagerApp.category).toBe('System');
    expect(typeof taskManagerApp.entry).toBe('function');
    expect(taskManagerApp.permissions).toContain('process.read');
    expect(taskManagerApp.permissions).toContain('process.terminate');
    expect(taskManagerApp.permissions).toContain('system.read');
    expect(taskManagerApp.permissions).toContain('memory.read');
    expect(taskManagerApp.permissions).toContain('window.control');
    expect(taskManagerApp.permissions).toContain('application.lifecycle');
  });

  it('strictly interacts with OS via api.process and never accesses kernel.processManager directly', async () => {
    const listSpy = vi.spyOn(api.process, 'list');
    const app = new TaskManagerApp(api, container);
    await app.refresh();

    expect(listSpy).toHaveBeenCalled();
    expect(app.kernel).toBeUndefined();
    app.destroy();
  });

  it('lists existing processes and populates process table', async () => {
    const app = new TaskManagerApp(api, container);
    await app.refresh();

    expect(app.processes.length).toBeGreaterThan(0);
    expect(container.innerHTML).toContain('os-task-manager-app');
    expect(container.innerHTML).toContain('PID');
    expect(container.innerHTML).toContain('Name');
    app.destroy();
  });

  it('filters processes by name or PID', async () => {
    const app = new TaskManagerApp(api, container);
    await app.refresh();

    app.setFilter('init');
    const filtered = app.getFilteredProcesses();
    expect(filtered.every(p => p.name.toLowerCase().includes('init') || String(p.pid).includes('init'))).toBe(true);
    app.destroy();
  });

  it('terminates a user process via api.process.terminate', async () => {
    // Create a dummy user process
    const dummyProcess = kernel.processManager.createProcess({
      name: 'user-worker',
      priority: 1
    });

    const app = new TaskManagerApp(api, container);
    await app.refresh();

    const pid = dummyProcess.data?.pid ?? dummyProcess.pid;
    const terminateSpy = vi.spyOn(api.process, 'terminate');
    const success = await app.terminateProcess(pid);

    expect(terminateSpy).toHaveBeenCalledWith(pid);
    expect(success).toBe(true);
    app.destroy();
  });

  it('fails gracefully when attempting to terminate critical system processes', async () => {
    const app = new TaskManagerApp(api, container);
    await app.refresh();

    // PID 0 is kernel idle
    const terminateSpy = vi.spyOn(api.process, 'terminate');
    const success = await app.terminateProcess(0);

    expect(terminateSpy).toHaveBeenCalledWith(0);
    expect(success).toBe(false);
    expect(app.errorMessage).toMatch(/critical|cannot be terminated/i);
    app.destroy();
  });
});
