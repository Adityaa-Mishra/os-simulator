/**
 * tests/os/desktop.test.js
 * Comprehensive automated tests for Phase 13: AdityyaOS Desktop Environment.
 * Covers Clock, Notifications, DesktopSearch, Launcher, SystemTray, Taskbar,
 * SessionManager, DesktopEnvironment, Kernel lifecycle integration, and SPA routing.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Clock } from '../../public/js/os/desktop/Clock.js';
import { Notifications } from '../../public/js/os/desktop/Notifications.js';
import { DesktopSearch } from '../../public/js/os/desktop/DesktopSearch.js';
import { Launcher, SYSTEM_APPLICATIONS } from '../../public/js/os/desktop/Launcher.js';
import { SystemTray } from '../../public/js/os/desktop/SystemTray.js';
import { Taskbar } from '../../public/js/os/desktop/Taskbar.js';
import { SessionManager } from '../../public/js/os/desktop/SessionManager.js';
import { DesktopEnvironment } from '../../public/js/os/desktop/DesktopEnvironment.js';
import { desktopView } from '../../public/js/views/desktopView.js';
import { Kernel } from '../../public/js/os/kernel/Kernel.js';
import { SystemStatus } from '../../public/js/os/kernel/OSState.js';
import { OSEvents } from '../../public/js/os/kernel/OSEventEmitter.js';
import { store } from '../../public/js/core/store.js';
import { Router } from '../../public/js/core/router.js';

// Headless DOM mock element generator for Node test environment
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
      // Simulate child element creation for queries
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
      handlers.forEach(h => h(payload || { target: this, stopPropagation: vi.fn(), preventDefault: vi.fn() }));
    },
    click: function () {
      this.dispatchEvent('click', { target: this, stopPropagation: vi.fn(), preventDefault: vi.fn() });
    },
    focus: vi.fn(),
    querySelector: function (sel) {
      const dummy = createMockElement('div');
      dummy.className = sel.replace(/[#.\[\]="]/g, ' ').trim();
      return dummy;
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
    getElementById: (id) => createMockElement('div'),
    querySelector: (sel) => createMockElement('div'),
    querySelectorAll: () => [],
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    documentElement: createMockElement('html'),
    body: createMockElement('body')
  };
}

describe('Phase 13: AdityyaOS Desktop Environment Tests', () => {
  let container;

  beforeEach(() => {
    container = createMockElement('div');
    store.setState({ user: null, isAuthenticated: false });
    vi.restoreAllMocks();
  });

  /* ========================================================================
     1. Clock Unit Tests
     ======================================================================== */
  describe('Clock Component', () => {
    it('formats 24-hour and 12-hour time correctly', () => {
      const clock24 = new Clock({ use24Hour: true });
      const clock12 = new Clock({ use24Hour: false });

      const testDate = new Date(2026, 8, 20, 14, 30, 45); // 14:30:45
      expect(clock24.formatTime(testDate)).toBe('14:30:45');
      expect(clock12.formatTime(testDate)).toBe('2:30:45 PM');

      const morningDate = new Date(2026, 8, 20, 9, 5, 2);
      expect(clock24.formatTime(morningDate)).toBe('09:05:02');
      expect(clock12.formatTime(morningDate)).toBe('9:05:02 AM');
    });

    it('formats date string with month, day and year', () => {
      const clock = new Clock();
      const testDate = new Date(2026, 8, 20); // Sep 20, 2026 (Sunday)
      const dateStr = clock.formatDate(testDate);
      expect(dateStr).toContain('Sep');
      expect(dateStr).toContain('20');
      expect(dateStr).toContain('2026');
    });

    it('starts interval timer on container and updates DOM', () => {
      vi.useFakeTimers();
      const clock = new Clock();
      const clockContainer = createMockElement('div');

      clock.start(clockContainer);
      expect(clock.intervalId).not.toBeNull();
      expect(clockContainer.innerHTML).toContain('os-clock-widget');

      // Advance time by 1 second
      vi.advanceTimersByTime(1000);
      expect(clock.intervalId).not.toBeNull();

      clock.stop();
      expect(clock.intervalId).toBeNull();
      vi.useRealTimers();
    });

    it('clears interval and prevents memory leaks on destroy', () => {
      vi.useFakeTimers();
      const clock = new Clock();
      const clockContainer = createMockElement('div');

      clock.start(clockContainer);
      const timerId = clock.intervalId;
      expect(timerId).not.toBeNull();

      clock.destroy();
      expect(clock.intervalId).toBeNull();
      expect(clock.element).toBeNull();
      vi.useRealTimers();
    });
  });

  /* ========================================================================
     2. Notifications Unit Tests
     ======================================================================== */
  describe('Notifications Component', () => {
    it('queues and displays notifications with correct type and title', () => {
      const notifs = new Notifications();
      const notifContainer = createMockElement('div');
      notifs.mount(notifContainer);

      const id = notifs.show({
        title: 'System Alert',
        message: 'Disk mounted successfully',
        type: 'success',
        duration: 0
      });

      expect(typeof id).toBe('number');
      expect(notifs.getUnreadCount()).toBe(1);
      const items = notifs.getNotifications();
      expect(items[0].title).toBe('System Alert');
      expect(items[0].type).toBe('success');
    });

    it('auto-dismisses notification after duration expires', () => {
      vi.useFakeTimers();
      const notifs = new Notifications();
      const notifContainer = createMockElement('div');
      notifs.mount(notifContainer);

      notifs.show({
        title: 'Transient',
        message: 'Disappears in 2s',
        type: 'info',
        duration: 2000
      });

      expect(notifs.getUnreadCount()).toBe(1);

      vi.advanceTimersByTime(2000);
      expect(notifs.getUnreadCount()).toBe(0);

      vi.useRealTimers();
    });

    it('supports manual dismissal by id', () => {
      const notifs = new Notifications();
      const id1 = notifs.show({ title: 'N1', message: 'First', duration: 0 });
      const id2 = notifs.show({ title: 'N2', message: 'Second', duration: 0 });

      expect(notifs.getUnreadCount()).toBe(2);
      notifs.dismiss(id1);
      expect(notifs.getUnreadCount()).toBe(1);
      expect(notifs.getNotifications()[0].id).toBe(id2);
    });

    it('notifies subscribers on notification updates and cleans up on destroy', () => {
      vi.useFakeTimers();
      const notifs = new Notifications();
      const subscriber = vi.fn();
      const unsub = notifs.onUpdate(subscriber);

      notifs.show({ title: 'Test', message: 'Sub test', duration: 1000 });
      expect(subscriber).toHaveBeenCalledWith(1, expect.any(Array));

      notifs.clearAll();
      expect(subscriber).toHaveBeenCalledWith(0, expect.any(Array));

      unsub();
      notifs.destroy();
      expect(notifs.timers.size).toBe(0);
      expect(notifs.notifications.length).toBe(0);
      vi.useRealTimers();
    });
  });

  /* ========================================================================
     3. DesktopSearch Unit Tests
     ======================================================================== */
  describe('DesktopSearch Utility', () => {
    it('returns all items when search query is empty', () => {
      const items = [{ id: '1', name: 'Files' }, { id: '2', name: 'Terminal' }];
      expect(DesktopSearch.filter(items, '')).toEqual(items);
      expect(DesktopSearch.filter(items, '   ')).toEqual(items);
    });

    it('filters items by name case-insensitively', () => {
      const filtered = DesktopSearch.filter(SYSTEM_APPLICATIONS, 'terminal');
      expect(filtered.length).toBe(1);
      expect(filtered[0].id).toBe('terminal');
    });

    it('filters items by keywords and category', () => {
      const vfsMatches = DesktopSearch.filter(SYSTEM_APPLICATIONS, 'vfs');
      expect(vfsMatches.some(a => a.id === 'files')).toBe(true);

      const adminMatches = DesktopSearch.filter(SYSTEM_APPLICATIONS, 'Administration');
      expect(adminMatches.some(a => a.id === 'taskmanager')).toBe(true);
      expect(adminMatches.some(a => a.id === 'systemmonitor')).toBe(true);
    });

    it('returns empty array when no items match', () => {
      const noMatches = DesktopSearch.filter(SYSTEM_APPLICATIONS, 'nonexistentxyz123');
      expect(noMatches).toEqual([]);
    });
  });

  /* ========================================================================
     4. Launcher & Application Descriptors Tests
     ======================================================================== */
  describe('Launcher & System Applications (Phase 13 Scope)', () => {
    it('contains exactly the 8 registered system applications', () => {
      expect(SYSTEM_APPLICATIONS.length).toBe(8);
      const ids = SYSTEM_APPLICATIONS.map(a => a.id);
      expect(ids).toContain('files');
      expect(ids).toContain('terminal');
      expect(ids).toContain('settings');
      expect(ids).toContain('browser');
      expect(ids).toContain('notes');
      expect(ids).toContain('calculator');
      expect(ids).toContain('taskmanager');
      expect(ids).toContain('systemmonitor');
    });

    it('applications are strictly descriptors without window or shell logic', () => {
      for (const app of SYSTEM_APPLICATIONS) {
        expect(app.id).toBeDefined();
        expect(app.name).toBeDefined();
        expect(app.icon).toBeDefined();
        expect(app.category).toBeDefined();
        expect(app.description).toBeDefined();
        // Strict boundary: No window manager, window coordinates, or executable code
        expect(app.window).toBeUndefined();
        expect(app.execute).toBeUndefined();
        expect(app.runtime).toBeUndefined();
      }
    });

    it('mounts launcher, renders user profile, and opens/closes', () => {
      const k = new Kernel();
      const session = new SessionManager(k);
      const launcher = new Launcher({ sessionManager: session });
      const launcherContainer = createMockElement('div');

      launcher.mount(launcherContainer);
      expect(launcherContainer.innerHTML).toContain('Guest Operator');
      expect(launcherContainer.innerHTML).toContain('Start Menu');

      launcher.open();
      expect(launcher.isOpen).toBe(true);

      launcher.close();
      expect(launcher.isOpen).toBe(false);

      launcher.toggle();
      expect(launcher.isOpen).toBe(true);

      launcher.destroy();
      expect(launcher.container).toBeNull();
    });

    it('invokes onLaunch callback and closes launcher when app is selected', () => {
      const k = new Kernel();
      const session = new SessionManager(k);
      const launchCb = vi.fn();
      const launcher = new Launcher({ sessionManager: session, onLaunch: launchCb });
      const launcherContainer = createMockElement('div');

      launcher.mount(launcherContainer);
      launcher.open();

      launcher.launch(SYSTEM_APPLICATIONS[0]);
      expect(launcher.isOpen).toBe(false);
      expect(launchCb).toHaveBeenCalledWith(SYSTEM_APPLICATIONS[0]);

      launcher.destroy();
    });
  });

  /* ========================================================================
     5. SystemTray & Taskbar Tests
     ======================================================================== */
  describe('SystemTray and Taskbar', () => {
    it('mounts system tray and updates kernel status badge', () => {
      const tray = new SystemTray({ initialStatus: 'RUNNING' });
      const trayContainer = createMockElement('div');

      tray.mount(trayContainer);
      expect(trayContainer.innerHTML).toContain('RUNNING');

      tray.updateStatus('STOPPED');
      expect(tray.status).toBe('STOPPED');

      tray.updateStatus('BOOTING');
      expect(tray.status).toBe('BOOTING');

      tray.destroy();
      expect(tray.container).toBeNull();
    });

    it('taskbar coordinates start button and future-proof window tabs', () => {
      const startClickCb = vi.fn();
      const taskbar = new Taskbar({ onStartClick: startClickCb });
      const taskbarContainer = createMockElement('div');

      taskbar.mount(taskbarContainer);
      expect(taskbarContainer.innerHTML).toContain('Start');

      taskbar.setStartActive(true);
      expect(taskbar.startBtn?.classList.contains('active')).toBe(true);

      taskbar.setStartActive(false);
      expect(taskbar.startBtn?.classList.contains('active')).toBe(false);

      // Future-proofing for Phase 14 Window Manager: add, activate, remove tab
      taskbar.addWindowTab('win-1', 'Notes', '📝');
      expect(taskbar.windowTabs.has('win-1')).toBe(true);

      taskbar.setActiveWindowTab('win-1');
      expect(taskbar.windowTabs.get('win-1').classList.contains('active')).toBe(true);

      taskbar.removeWindowTab('win-1');
      expect(taskbar.windowTabs.has('win-1')).toBe(false);

      taskbar.destroy();
      expect(taskbar.container).toBeNull();
    });
  });

  /* ========================================================================
     6. SessionManager & Power Lifecycle Tests
     ======================================================================== */
  describe('SessionManager Lifecycle & Power Actions', () => {
    it('returns guest details when unauthenticated and user details when authenticated', () => {
      const k = new Kernel();
      const session = new SessionManager(k);

      const guest = session.getUser();
      expect(guest.name).toBe('Guest Operator');
      expect(guest.isAuthenticated).toBe(false);

      store.setState({
        user: { name: 'Ada Lovelace', email: 'ada@example.com', role: 'Chief Engineer' },
        isAuthenticated: true
      });

      const authUser = session.getUser();
      expect(authUser.name).toBe('Ada Lovelace');
      expect(authUser.avatar).toBe('A');
      expect(authUser.isAuthenticated).toBe(true);

      session.destroy();
    });

    it('shutdown() calls kernel.shutdown()', async () => {
      const k = new Kernel();
      k.boot();
      expect(k.getStatus()).toBe(SystemStatus.RUNNING);

      const session = new SessionManager(k);
      const res = await session.shutdown();

      expect(res.success).toBe(true);
      expect(res.status).toBe(SystemStatus.STOPPED);
      expect(k.getStatus()).toBe(SystemStatus.STOPPED);

      session.destroy();
    });

    it('restart() sequences kernel.shutdown() then kernel.boot() in exact order', async () => {
      const k = new Kernel();
      k.boot();

      const sequence = [];
      const shutdownSpy = vi.spyOn(k, 'shutdown').mockImplementation(() => {
        sequence.push('shutdown');
        return { success: true, status: SystemStatus.STOPPED };
      });
      const bootSpy = vi.spyOn(k, 'boot').mockImplementation(() => {
        sequence.push('boot');
        return { success: true, status: SystemStatus.RUNNING };
      });

      const session = new SessionManager(k);
      const res = await session.restart();

      expect(sequence).toEqual(['shutdown', 'boot']);
      expect(shutdownSpy).toHaveBeenCalledTimes(1);
      expect(bootSpy).toHaveBeenCalledTimes(1);
      expect(res.success).toBe(true);

      session.destroy();
    });
  });

  /* ========================================================================
     7. DesktopEnvironment & Kernel Event Integration Tests
     ======================================================================== */
  describe('DesktopEnvironment & Kernel Lifecycle Integration', () => {
    it('renders boot sequence overlay when kernel is stopped and transitions to desktop', async () => {
      const k = new Kernel();
      expect(k.getStatus()).toBe(SystemStatus.STOPPED);

      const desktop = new DesktopEnvironment({ kernel: k });
      const mountContainer = createMockElement('div');

      const bootEvents = [];
      k.events.on(OSEvents.SYSTEM_BOOTING, () => bootEvents.push('BOOTING'));
      k.events.on(OSEvents.SYSTEM_READY, () => bootEvents.push('READY'));
      k.events.on(OSEvents.SYSTEM_RUNNING, () => bootEvents.push('RUNNING'));

      await desktop.mount(mountContainer);

      expect(k.getStatus()).toBe(SystemStatus.RUNNING);
      expect(bootEvents).toEqual(['BOOTING', 'READY', 'RUNNING']);
      expect(mountContainer.innerHTML).toContain('os-desktop-container');

      desktop.unmount();
    });

    it('renders desktop directly if kernel is already in RUNNING state', async () => {
      const k = new Kernel();
      k.boot();
      expect(k.getStatus()).toBe(SystemStatus.RUNNING);

      const desktop = new DesktopEnvironment({ kernel: k });
      const mountContainer = createMockElement('div');

      await desktop.mount(mountContainer);

      expect(mountContainer.innerHTML).toContain('os-desktop-container');
      expect(mountContainer.innerHTML).toContain('AdityyaOS');

      desktop.unmount();
    });

    it('clicking desktop icon launches application window via Shell', async () => {
      const k = new Kernel();
      k.boot();

      const desktop = new DesktopEnvironment({ kernel: k });
      const mountContainer = createMockElement('div');
      await desktop.mount(mountContainer);

      const launchSpy = vi.spyOn(desktop.shell, 'launch');
      desktop.openApp(SYSTEM_APPLICATIONS[0]);

      expect(launchSpy).toHaveBeenCalledWith('files');
      expect(desktop.shell.windowManager.getWindows().length).toBe(1);

      desktop.unmount();
    });

    it('opens context menu on right click in desktop workspace', async () => {
      const k = new Kernel();
      k.boot();

      const desktop = new DesktopEnvironment({ kernel: k });
      const mountContainer = createMockElement('div');
      await desktop.mount(mountContainer);

      desktop.openContextMenu(100, 150);
      expect(desktop.contextMenuEl?.style.display).toBe('flex');
      expect(desktop.contextMenuEl?.innerHTML).toContain('Refresh Desktop');
      expect(desktop.contextMenuEl?.innerHTML).toContain('System Info');

      desktop.closeContextMenu();
      expect(desktop.contextMenuEl?.style.display).toBe('none');

      desktop.unmount();
    });

    it('shutdown power action transitions to shutdown screen', async () => {
      const k = new Kernel();
      k.boot();

      const desktop = new DesktopEnvironment({ kernel: k });
      const mountContainer = createMockElement('div');
      await desktop.mount(mountContainer);

      await desktop.handleShutdown();
      expect(k.getStatus()).toBe(SystemStatus.STOPPED);
      expect(mountContainer.innerHTML).toContain('os-shutdown-overlay');

      desktop.unmount();
    });

    it('repeated mounting and unmounting cleans up all listeners and prevents leaks', async () => {
      const k = new Kernel();
      k.boot();

      const initialListenerCount = k.events.listenerCount(OSEvents.SYSTEM_RUNNING);

      const desktop1 = new DesktopEnvironment({ kernel: k });
      const m1 = createMockElement('div');
      await desktop1.mount(m1);
      desktop1.unmount();

      const desktop2 = new DesktopEnvironment({ kernel: k });
      const m2 = createMockElement('div');
      await desktop2.mount(m2);
      desktop2.unmount();

      const finalListenerCount = k.events.listenerCount(OSEvents.SYSTEM_RUNNING);
      expect(finalListenerCount).toBe(initialListenerCount);
    });
  });

  /* ========================================================================
     8. SPA Router & Route Integration Tests
     ======================================================================== */
  describe('SPA Router #/os Route Integration', () => {
    it('mounts desktopView on #/os route and unmounts cleanly when navigating away', async () => {
      const router = new Router(container);
      const mockDashboard = { mount: vi.fn(), unmount: vi.fn() };

      router.register('#/', mockDashboard, { title: 'Dashboard' });
      router.register('#/os', desktopView, { title: 'AdityyaOS Desktop' });

      window.location.hash = '#/os';
      await router.handleRouting();

      expect(desktopView.desktop).not.toBeNull();

      window.location.hash = '#/';
      await router.handleRouting();

      expect(desktopView.desktop).toBeNull();
      expect(mockDashboard.mount).toHaveBeenCalled();
    });
  });
});
