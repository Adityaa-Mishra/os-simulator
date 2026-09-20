/**
 * tests/os/terminalLifecycle.test.js
 * Comprehensive tests for Terminal lifecycle, WindowManager integration,
 * process creation/termination, event emissions, and resource cleanup.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Kernel } from '../../public/js/os/kernel/Kernel.js';
import { WindowManager } from '../../public/js/os/shell/WindowManager.js';
import { ApplicationRegistry } from '../../public/js/os/shell/ApplicationRegistry.js';
import { Shell as DesktopShell } from '../../public/js/os/shell/Shell.js';
import { Terminal } from '../../public/js/os/terminal/Terminal.js';
import { TerminalEvents } from '../../public/js/os/terminal/TerminalEvents.js';
import { WindowState } from '../../public/js/os/shell/WindowState.js';

// Headless DOM mock element generator
function createMockElement(tag = 'div') {
  const el = {
    tagName: tag.toUpperCase(),
    style: {},
    dataset: {},
    value: '',
    textContent: '',
    _innerHTML: '',
    clientWidth: 1024,
    clientHeight: 600,
    get innerHTML() { return this._innerHTML; },
    set innerHTML(val) {
      this._innerHTML = String(val);
      this._children = [];
    },
    className: '',
    disabled: false,
    attributes: new Map(),
    setAttribute: function (name, val) { this.attributes.set(name, String(val)); },
    getAttribute: function (name) { return this.attributes.get(name) || null; },
    removeAttribute: function (name) { this.attributes.delete(name); },
    classList: {
      _classes: new Set(),
      add: function (...cls) { cls.forEach(c => this._classes.add(c)); },
      remove: function (...cls) { cls.forEach(c => this._classes.delete(c)); },
      contains: function (c) { return this._classes.has(c); },
      toggle: function (c) {
        if (this._classes.has(c)) this._classes.delete(c);
        else this._classes.add(c);
      }
    },
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
      handlers.forEach(h => h(payload || {
        target: this,
        stopPropagation: vi.fn(),
        preventDefault: vi.fn()
      }));
    },
    click: function () {
      this.dispatchEvent('click');
    },
    focus: vi.fn(),
    blur: vi.fn(),
    querySelector: function (selector) {
      return createMockElement('div');
    },
    querySelectorAll: function () {
      return [];
    },
    appendChild: function (child) {
      if (!this._children) this._children = [];
      this._children.push(child);
      child.parentNode = this;
      return child;
    },
    removeChild: function (child) {
      if (this._children) {
        this._children = this._children.filter(c => c !== child);
      }
      child.parentNode = null;
      return child;
    },
    closest: function (selector) {
      if (selector === '.os-window') return this;
      return null;
    }
  };
  return el;
}

// Ensure globalThis.window and globalThis.document exist in Node test environment
if (typeof globalThis.window === 'undefined') {
  globalThis.window = {
    location: { hash: '#/' },
    innerWidth: 1280,
    innerHeight: 800,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  };
}
if (typeof globalThis.document === 'undefined') {
  globalThis.document = {
    createElement: (tag) => createMockElement(tag)
  };
}

describe('Phase 18: Terminal Lifecycle & Integration', () => {
  let kernel;
  let container;
  let windowManager;
  let registry;
  let desktopShell;

  beforeEach(() => {
    kernel = new Kernel();
    kernel.boot();
    container = createMockElement('div');
    windowManager = new WindowManager({ container });
    registry = new ApplicationRegistry({ kernel, windowManager });
    desktopShell = new DesktopShell({
      taskbar: null,
      notifications: null,
      windowContainer: container,
      windowManager,
      registry
    });
  });

  it('launches Terminal via ApplicationRegistry and DesktopShell', () => {
    const win = desktopShell.launch('terminal');
    expect(win).toBeDefined();
    expect(win.appId).toBe('terminal');
    expect(win.title).toBe('Terminal');
    expect(win.state).toBe(WindowState.NORMAL);
    expect(windowManager.windows.has(win.id)).toBe(true);
  });

  it('enforces singleton behavior: re-launching focuses existing terminal window', () => {
    const win1 = desktopShell.launch('terminal');
    const win2 = desktopShell.launch('terminal');
    expect(win1.id).toBe(win2.id);
  });

  it('creates simulated process in ProcessManager on Terminal launch', () => {
    const initialProcesses = kernel.processManager.getProcesses().length;
    const terminal = new Terminal({ kernel, windowManager });

    expect(terminal.pid).not.toBeNull();
    expect(typeof terminal.pid).toBe('number');

    const proc = kernel.processManager.getProcess(terminal.pid);
    expect(proc).toBeDefined();
    expect(proc.name).toBe('terminal');
    expect(kernel.processManager.getProcesses().length).toBe(initialProcesses + 1);

    terminal.destroy();
  });

  it('terminates simulated process when Terminal is destroyed', () => {
    const terminal = new Terminal({ kernel, windowManager });
    const pid = terminal.pid;

    expect(kernel.processManager.getProcess(pid)).toBeDefined();

    terminal.destroy();

    expect(kernel.processManager.getProcess(pid).state).toBe('TERMINATED');
    expect(terminal.pid).toBeNull();
    expect(terminal.state.isActive).toBe(false);
  });

  it('cleans up process and session when window is closed in WindowManager', () => {
    const activeProcessesBefore = kernel.processManager.getProcesses(p => p.state !== 'TERMINATED').length;
    const win = desktopShell.launch('terminal');
    const renderedWin = windowManager.renderedWindows.get(win.id);
    expect(renderedWin).toBeDefined();

    expect(kernel.processManager.getProcesses(p => p.state !== 'TERMINATED').length).toBe(activeProcessesBefore + 1);

    windowManager.closeWindow(win.id);

    expect(win.state).toBe(WindowState.CLOSED);
    expect(kernel.processManager.getProcesses(p => p.state !== 'TERMINATED').length).toBe(activeProcessesBefore);
  });

  it('executes exit command and closes window cleanly without stopping kernel', async () => {
    const win = desktopShell.launch('terminal');
    const terminal = new Terminal({ kernel, windowManager, windowId: win.id });

    const res = await terminal.execute('exit');
    expect(res.exit).toBe(true);
    expect(res.exitCode).toBe(0);

    terminal.exit();

    expect(win.state).toBe(WindowState.CLOSED);
    expect(kernel.state.system.status).toBe('RUNNING'); // Kernel was NOT stopped
  });

  it('emits terminal lifecycle events through OSEventEmitter', async () => {
    const events = [];
    kernel.events.on(TerminalEvents.TERMINAL_OPENED, (e) => events.push({ type: 'opened', ...e }));
    kernel.events.on(TerminalEvents.TERMINAL_COMMAND, (e) => events.push({ type: 'command', ...e }));
    kernel.events.on(TerminalEvents.TERMINAL_COMMAND_COMPLETED, (e) => events.push({ type: 'completed', ...e }));
    kernel.events.on(TerminalEvents.TERMINAL_DIRECTORY_CHANGED, (e) => events.push({ type: 'dir_changed', ...e }));
    kernel.events.on(TerminalEvents.TERMINAL_CLEARED, (e) => events.push({ type: 'cleared', ...e }));
    kernel.events.on(TerminalEvents.TERMINAL_CLOSED, (e) => events.push({ type: 'closed', ...e }));

    const terminal = new Terminal({ kernel, windowManager });

    await terminal.execute('cd /');
    await terminal.execute('clear');
    terminal.destroy();

    const types = events.map(e => e.type);
    expect(types).toContain('opened');
    expect(types).toContain('command');
    expect(types).toContain('completed');
    expect(types).toContain('dir_changed');
    expect(types).toContain('closed');
  });
});
