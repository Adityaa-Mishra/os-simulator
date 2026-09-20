/**
 * tests/os/windowManager.test.js
 * Comprehensive automated tests for Phase 14: AdityyaOS Window Manager & OS Shell.
 * Covers WindowState, WindowEvents, Window, WindowManager, ApplicationRegistry,
 * Shell, Taskbar integration, Keyboard shortcuts (Alt+Tab, Alt+F4), and repeated lifecycle cleanup.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WindowModel, WindowState } from '../../public/js/os/shell/WindowState.js';
import { WindowEvents } from '../../public/js/os/shell/WindowEvents.js';
import { Window } from '../../public/js/os/shell/Window.js';
import { WindowManager } from '../../public/js/os/shell/WindowManager.js';
import { ApplicationRegistry } from '../../public/js/os/shell/ApplicationRegistry.js';
import { Shell } from '../../public/js/os/shell/Shell.js';
import { Taskbar } from '../../public/js/os/desktop/Taskbar.js';
import { Notifications } from '../../public/js/os/desktop/Notifications.js';
import { DesktopEnvironment } from '../../public/js/os/desktop/DesktopEnvironment.js';
import { Kernel } from '../../public/js/os/kernel/Kernel.js';
import { SystemStatus } from '../../public/js/os/kernel/OSState.js';

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
        preventDefault: vi.fn(),
        clientX: 200,
        clientY: 150
      }));
    },
    click: function () {
      this.dispatchEvent('click', {
        target: this,
        stopPropagation: vi.fn(),
        preventDefault: vi.fn(),
        clientX: 200,
        clientY: 150
      });
    },
    focus: vi.fn(),
    querySelector: function (sel) {
      const dummy = createMockElement('div');
      dummy.className = sel.replace(/[#.\[\]="]/g, ' ').trim();
      dummy.parentNode = this;
      return dummy;
    },
    querySelectorAll: function () {
      return [];
    },
    closest: function () {
      return null;
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
    contains: function (target) {
      return target === this;
    }
  };
  return el;
}

// Ensure globalThis.window and globalThis.document exist in Node environment
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
    createElement: (tag) => createMockElement(tag),
    getElementById: () => createMockElement('div'),
    querySelector: () => createMockElement('div'),
    querySelectorAll: () => [],
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    documentElement: createMockElement('html'),
    body: createMockElement('body')
  };
}

describe('Phase 14: Window Manager & OS Shell Tests', () => {
  let container;
  let windowListeners;

  beforeEach(() => {
    container = createMockElement('div');
    windowListeners = new Map();

    globalThis.window.addEventListener = (evt, handler) => {
      if (!windowListeners.has(evt)) windowListeners.set(evt, []);
      windowListeners.get(evt).push(handler);
    };

    globalThis.window.removeEventListener = (evt, handler) => {
      if (!windowListeners.has(evt)) return;
      windowListeners.set(evt, windowListeners.get(evt).filter(h => h !== handler));
    };

    globalThis.window.dispatchEvent = (evt, payload) => {
      const handlers = windowListeners.get(evt) || [];
      handlers.forEach(h => h(payload));
    };

    globalThis.windowListeners = windowListeners;
    vi.restoreAllMocks();
  });

  /* ========================================================================
     1. WindowState & WindowModel Tests
     ======================================================================== */
  describe('WindowState & WindowModel', () => {
    it('initializes WindowModel with required properties and defaults', () => {
      const model = new WindowModel({
        id: 'win-1',
        appId: 'files',
        title: 'Files',
        icon: '📁'
      });

      expect(model.id).toBe('win-1');
      expect(model.appId).toBe('files');
      expect(model.title).toBe('Files');
      expect(model.icon).toBe('📁');
      expect(model.state).toBe(WindowState.NORMAL);
      expect(model.x).toBe(100);
      expect(model.y).toBe(80);
      expect(model.width).toBe(640);
      expect(model.height).toBe(420);
      expect(model.minWidth).toBe(280);
      expect(model.minHeight).toBe(200);
      expect(model.focused).toBe(false);
      expect(model.visible).toBe(true);
      expect(model.singleton).toBe(true);
      expect(model.prevGeometry).toBeNull();
    });

    it('requires id and appId upon construction', () => {
      expect(() => new WindowModel({ appId: 'files' })).toThrow();
      expect(() => new WindowModel({ id: 'win-1' })).toThrow();
    });

    it('returns a serializable JSON snapshot', () => {
      const model = new WindowModel({
        id: 'win-2',
        appId: 'terminal',
        title: 'Terminal'
      });

      const json = model.toJSON();
      expect(json.id).toBe('win-2');
      expect(json.appId).toBe('terminal');
      expect(json.state).toBe(WindowState.NORMAL);
      expect(json.x).toBe(100);
    });
  });

  /* ========================================================================
     2. ApplicationRegistry Tests
     ======================================================================== */
  describe('ApplicationRegistry', () => {
    it('registers all 8 default system applications as singletons', () => {
      const registry = new ApplicationRegistry();
      const allApps = registry.getAll();

      expect(allApps.length).toBe(8);
      const ids = allApps.map(a => a.id);
      expect(ids).toContain('files');
      expect(ids).toContain('terminal');
      expect(ids).toContain('settings');
      expect(ids).toContain('browser');
      expect(ids).toContain('notes');
      expect(ids).toContain('calculator');
      expect(ids).toContain('taskmanager');
      expect(ids).toContain('systemmonitor');

      for (const app of allApps) {
        expect(app.singleton).toBe(true);
        expect(typeof app.createView).toBe('function');
      }
    });

    it('supports custom application registration and lookup', () => {
      const registry = new ApplicationRegistry();
      registry.register({
        id: 'paint',
        name: 'Paint',
        icon: '🎨',
        singleton: true
      });

      expect(registry.has('paint')).toBe(true);
      const app = registry.get('paint');
      expect(app.name).toBe('Paint');
      expect(app.icon).toBe('🎨');
    });

    it('createPlaceholderView creates a clean view mountable in a window', () => {
      const registry = new ApplicationRegistry();
      const view = registry.createPlaceholderView({
        id: 'files',
        name: 'Files',
        icon: '📁',
        category: 'System',
        description: 'VFS Explorer'
      });

      const contentMount = createMockElement('div');
      view.mount(contentMount);

      expect(contentMount.innerHTML).toContain('os-app-placeholder');
      expect(contentMount.innerHTML).toContain('Files');
      expect(contentMount.innerHTML).toContain('Window Container Active');

      view.unmount();
      expect(contentMount.innerHTML).toBe('');
    });
  });

  /* ========================================================================
     3. WindowManager Unit Tests
     ======================================================================== */
  describe('WindowManager Core Operations', () => {
    it('creates window model with unique ID and auto-cascading coordinates', () => {
      const wm = new WindowManager({ container });
      const win1 = wm.createWindow({ appId: 'files', title: 'Files' });
      const win2 = wm.createWindow({ appId: 'notes', title: 'Notes' });

      expect(win1.id).toBeDefined();
      expect(win2.id).toBeDefined();
      expect(win1.id).not.toBe(win2.id);
      // Auto-cascading coordinates
      expect(win2.x).toBeGreaterThan(win1.x);
      expect(win2.y).toBeGreaterThan(win1.y);

      wm.destroy();
    });

    it('enforces singleton: re-launching an open singleton returns existing window', () => {
      const wm = new WindowManager({ container });
      const win1 = wm.createWindow({ appId: 'files', title: 'Files', singleton: true });
      const win2 = wm.createWindow({ appId: 'files', title: 'Files', singleton: true });

      expect(win1.id).toBe(win2.id);
      expect(wm.getWindows().length).toBe(1);

      wm.destroy();
    });

    it('openWindow opens, focuses, and renders window in container', () => {
      const wm = new WindowManager({ container });
      const model = wm.openWindow({ appId: 'terminal', title: 'Terminal' });

      expect(model.focused).toBe(true);
      expect(wm.getActiveWindow()?.id).toBe(model.id);
      expect(wm.renderedWindows.has(model.id)).toBe(true);

      wm.destroy();
    });

    it('focusWindow manages deterministic z-index elevation and blurs previous active', () => {
      const wm = new WindowManager({ container });
      const winA = wm.openWindow({ appId: 'files', title: 'Files' });
      const winB = wm.openWindow({ appId: 'notes', title: 'Notes' });

      expect(wm.getActiveWindow()?.id).toBe(winB.id);
      expect(winB.zIndex).toBeGreaterThan(winA.zIndex);
      expect(winA.focused).toBe(false);
      expect(winB.focused).toBe(true);

      wm.focusWindow(winA.id);
      expect(wm.getActiveWindow()?.id).toBe(winA.id);
      expect(winA.zIndex).toBeGreaterThan(winB.zIndex);
      expect(winA.focused).toBe(true);
      expect(winB.focused).toBe(false);

      wm.destroy();
    });

    it('minimizeWindow hides window and focuses next highest visible window', () => {
      const wm = new WindowManager({ container });
      const win1 = wm.openWindow({ appId: 'files', title: 'Files' });
      const win2 = wm.openWindow({ appId: 'notes', title: 'Notes' });

      expect(wm.getActiveWindow()?.id).toBe(win2.id);

      wm.minimizeWindow(win2.id);
      expect(win2.state).toBe(WindowState.MINIMIZED);
      expect(win2.visible).toBe(false);
      // Active window should now fall back to win1
      expect(wm.getActiveWindow()?.id).toBe(win1.id);

      wm.destroy();
    });

    it('restoreWindow restores minimized window and regains focus', () => {
      const wm = new WindowManager({ container });
      const win = wm.openWindow({ appId: 'files', title: 'Files' });

      wm.minimizeWindow(win.id);
      expect(win.state).toBe(WindowState.MINIMIZED);

      wm.restoreWindow(win.id);
      expect(win.state).toBe(WindowState.NORMAL);
      expect(win.visible).toBe(true);
      expect(wm.getActiveWindow()?.id).toBe(win.id);

      wm.destroy();
    });

    it('maximizeWindow expands to workspace bounds and restoreWindow returns to previous geometry', () => {
      const wm = new WindowManager({ container });
      const win = wm.openWindow({ appId: 'files', title: 'Files', x: 50, y: 60, width: 400, height: 300 });

      wm.maximizeWindow(win.id);
      expect(win.state).toBe(WindowState.MAXIMIZED);
      expect(win.prevGeometry).toEqual({ x: 50, y: 60, width: 400, height: 300 });

      wm.restoreWindow(win.id);
      expect(win.state).toBe(WindowState.NORMAL);
      expect(win.x).toBe(50);
      expect(win.y).toBe(60);
      expect(win.width).toBe(400);
      expect(win.height).toBe(300);

      wm.destroy();
    });

    it('moveWindow updates coordinates within workspace boundary constraints', () => {
      const wm = new WindowManager({ container });
      const win = wm.openWindow({ appId: 'files', title: 'Files', x: 100, y: 100 });

      wm.moveWindow(win.id, 250, 180);
      expect(win.x).toBe(250);
      expect(win.y).toBe(180);

      // Clamps y so titlebar cannot go above top boundary
      wm.moveWindow(win.id, 250, -50);
      expect(win.y).toBe(0);

      wm.destroy();
    });

    it('resizeWindow respects minimum width and height constraints', () => {
      const wm = new WindowManager({ container });
      const win = wm.openWindow({
        appId: 'files',
        title: 'Files',
        width: 500,
        height: 400,
        minWidth: 280,
        minHeight: 200
      });

      wm.resizeWindow(win.id, 600, 450);
      expect(win.width).toBe(600);
      expect(win.height).toBe(450);

      // Attempt to resize below minimum dimensions
      wm.resizeWindow(win.id, 100, 80);
      expect(win.width).toBe(280);
      expect(win.height).toBe(200);

      wm.destroy();
    });

    it('closeWindow destroys rendered window and updates active window', () => {
      const wm = new WindowManager({ container });
      const win1 = wm.openWindow({ appId: 'files', title: 'Files' });
      const win2 = wm.openWindow({ appId: 'notes', title: 'Notes' });

      expect(wm.getWindows().length).toBe(2);
      expect(wm.getActiveWindow()?.id).toBe(win2.id);

      wm.closeWindow(win2.id);
      expect(wm.getWindows().length).toBe(1);
      expect(wm.getWindow(win2.id)).toBeNull();
      // win1 becomes active
      expect(wm.getActiveWindow()?.id).toBe(win1.id);

      wm.closeWindow(win1.id);
      expect(wm.getWindows().length).toBe(0);
      expect(wm.getActiveWindow()).toBeNull();

      wm.destroy();
    });

    it('handles unknown window IDs gracefully without crashing', () => {
      const wm = new WindowManager({ container });
      expect(wm.focusWindow('non-existent')).toBe(false);
      expect(wm.minimizeWindow('non-existent')).toBe(false);
      expect(wm.restoreWindow('non-existent')).toBe(false);
      expect(wm.maximizeWindow('non-existent')).toBe(false);
      expect(wm.closeWindow('non-existent')).toBe(false);
      expect(wm.moveWindow('non-existent', 10, 10)).toBe(false);
      expect(wm.resizeWindow('non-existent', 400, 300)).toBe(false);

      wm.destroy();
    });

    it('full window lifecycle: create -> open -> focus -> minimize -> restore -> maximize -> restore -> close', () => {
      const wm = new WindowManager({ container });

      // CREATE
      const win = wm.createWindow({ appId: 'calculator', title: 'Calculator' });
      expect(win.state).toBe(WindowState.NORMAL);

      // OPEN
      wm.openWindow({ id: win.id });
      expect(wm.getActiveWindow()?.id).toBe(win.id);

      // FOCUS
      wm.focusWindow(win.id);
      expect(win.focused).toBe(true);

      // MINIMIZE
      wm.minimizeWindow(win.id);
      expect(win.state).toBe(WindowState.MINIMIZED);

      // RESTORE
      wm.restoreWindow(win.id);
      expect(win.state).toBe(WindowState.NORMAL);
      expect(win.focused).toBe(true);

      // MAXIMIZE
      wm.maximizeWindow(win.id);
      expect(win.state).toBe(WindowState.MAXIMIZED);

      // RESTORE
      wm.restoreWindow(win.id);
      expect(win.state).toBe(WindowState.NORMAL);

      // CLOSE
      wm.closeWindow(win.id);
      expect(wm.getWindow(win.id)).toBeNull();

      wm.destroy();
    });
  });

  /* ========================================================================
     4. Taskbar Window Synchronization Tests
     ======================================================================== */
  describe('Taskbar & Window Synchronization', () => {
    it('creates taskbar entry when window opens, and removes it on close', () => {
      const taskbar = new Taskbar();
      const taskbarMount = createMockElement('div');
      taskbar.mount(taskbarMount);

      const shell = new Shell({
        taskbar,
        notifications: new Notifications(),
        windowContainer: container
      });

      const win = shell.launch('files');
      expect(taskbar.windowTabs.has(win.id)).toBe(true);
      expect(taskbar.windowTabs.get(win.id).classList.contains('active')).toBe(true);

      shell.windowManager.closeWindow(win.id);
      expect(taskbar.windowTabs.has(win.id)).toBe(false);

      shell.destroy();
      taskbar.destroy();
    });

    it('clicking taskbar tab toggles focus and minimize', () => {
      const taskbar = new Taskbar();
      const taskbarMount = createMockElement('div');
      taskbar.mount(taskbarMount);

      const shell = new Shell({
        taskbar,
        notifications: new Notifications(),
        windowContainer: container
      });

      const win = shell.launch('notes');
      expect(win.focused).toBe(true);

      // Clicking active window tab minimizes it
      shell.handleTaskbarTabClick(win.id);
      expect(win.state).toBe(WindowState.MINIMIZED);
      expect(taskbar.windowTabs.get(win.id).classList.contains('active')).toBe(false);

      // Clicking minimized window tab restores and focuses it
      shell.handleTaskbarTabClick(win.id);
      expect(win.state).toBe(WindowState.NORMAL);
      expect(win.focused).toBe(true);
      expect(taskbar.windowTabs.get(win.id).classList.contains('active')).toBe(true);

      shell.destroy();
      taskbar.destroy();
    });
  });

  /* ========================================================================
     5. Shell & Keyboard Shortcuts Tests
     ======================================================================== */
  describe('Shell & Keyboard Shortcuts', () => {
    it('Alt+Tab cycles through open, non-minimized windows and wraps around', () => {
      const shell = new Shell({
        taskbar: new Taskbar(),
        notifications: new Notifications(),
        windowContainer: container
      });

      const win1 = shell.launch('files');
      const win2 = shell.launch('notes');
      const win3 = shell.launch('calculator');

      expect(shell.windowManager.getActiveWindow()?.id).toBe(win3.id);

      // Trigger Alt+Tab
      const altTabEvent = {
        altKey: true,
        key: 'Tab',
        preventDefault: vi.fn(),
        stopPropagation: vi.fn()
      };

      // First Alt+Tab -> cycles to win1
      globalThis.window.dispatchEvent('keydown', altTabEvent);
      expect(shell.windowManager.getActiveWindow()?.id).toBe(win1.id);

      // Second Alt+Tab -> cycles to win2
      globalThis.window.dispatchEvent('keydown', altTabEvent);
      expect(shell.windowManager.getActiveWindow()?.id).toBe(win2.id);

      // Third Alt+Tab -> cycles back to win3 (wraps around)
      globalThis.window.dispatchEvent('keydown', altTabEvent);
      expect(shell.windowManager.getActiveWindow()?.id).toBe(win3.id);

      shell.destroy();
    });

    it('Alt+Tab skips minimized windows', () => {
      const shell = new Shell({
        taskbar: new Taskbar(),
        notifications: new Notifications(),
        windowContainer: container
      });

      const win1 = shell.launch('files');
      const win2 = shell.launch('notes');
      const win3 = shell.launch('calculator');

      // Minimize win2
      shell.windowManager.minimizeWindow(win2.id);

      const altTabEvent = {
        altKey: true,
        key: 'Tab',
        preventDefault: vi.fn(),
        stopPropagation: vi.fn()
      };

      // Focus win3
      shell.windowManager.focusWindow(win3.id);

      // Alt+Tab from win3 should cycle to win1, skipping minimized win2!
      globalThis.window.dispatchEvent('keydown', altTabEvent);
      expect(shell.windowManager.getActiveWindow()?.id).toBe(win1.id);

      // Alt+Tab from win1 should cycle back to win3
      globalThis.window.dispatchEvent('keydown', altTabEvent);
      expect(shell.windowManager.getActiveWindow()?.id).toBe(win3.id);

      shell.destroy();
    });

    it('Alt+F4 closes the active window', () => {
      const shell = new Shell({
        taskbar: new Taskbar(),
        notifications: new Notifications(),
        windowContainer: container
      });

      const win1 = shell.launch('files');
      const win2 = shell.launch('notes');

      expect(shell.windowManager.getActiveWindow()?.id).toBe(win2.id);

      const altF4Event = {
        altKey: true,
        key: 'F4',
        code: 'F4',
        preventDefault: vi.fn(),
        stopPropagation: vi.fn()
      };

      globalThis.window.dispatchEvent('keydown', altF4Event);

      expect(shell.windowManager.getWindow(win2.id)).toBeNull();
      expect(shell.windowManager.getActiveWindow()?.id).toBe(win1.id);

      shell.destroy();
    });

    it('launching an unknown application reports an error safely without crashing', () => {
      const notifs = new Notifications();
      const notifSpy = vi.spyOn(notifs, 'show');

      const shell = new Shell({
        taskbar: new Taskbar(),
        notifications: notifs,
        windowContainer: container
      });

      const res = shell.launch('unknown-app-xyz');
      expect(res).toBeNull();
      expect(notifSpy).toHaveBeenCalledWith(expect.objectContaining({
        title: 'Application Error',
        type: 'error'
      }));

      shell.destroy();
    });
  });

  /* ========================================================================
     6. DesktopEnvironment Lifecycle Regression Tests (Correction #9)
     ======================================================================== */
  describe('DesktopEnvironment Repeated Lifecycle & Leak Prevention', () => {
    it('mount -> launch app -> unmount -> mount -> launch app maintains exactly one Shell and no leaks', async () => {
      const k = new Kernel();
      k.boot();

      const desktop = new DesktopEnvironment({ kernel: k });
      const mountPoint = createMockElement('div');

      // 1. First Mount
      await desktop.mount(mountPoint);
      expect(desktop.shell).not.toBeNull();

      // Launch an app
      const win1 = desktop.shell.launch('files');
      expect(win1).not.toBeNull();
      expect(desktop.shell.windowManager.getWindows().length).toBe(1);

      // 2. First Unmount
      desktop.unmount();
      expect(desktop.shell).toBeNull();

      // 3. Second Mount
      await desktop.mount(mountPoint);
      expect(desktop.shell).not.toBeNull();

      // Launch an app again
      const win2 = desktop.shell.launch('files');
      expect(win2).not.toBeNull();
      // Must be exactly 1 window in the active WindowManager, not 2
      expect(desktop.shell.windowManager.getWindows().length).toBe(1);
      // Exactly 1 taskbar tab
      expect(desktop.taskbar.windowTabs.size).toBe(1);

      // 4. Second Unmount
      desktop.unmount();
      expect(desktop.shell).toBeNull();
    });
  });
});
