/**
 * tests/os/apps/interactiveApps.test.js
 * Comprehensive tests verifying that all AdityyaOS native applications render
 * fully interactive UIs inside OS-managed windows, completely eliminating placeholder stubs.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Kernel } from '../../../public/js/os/kernel/Kernel.js';
import { WindowManager } from '../../../public/js/os/shell/WindowManager.js';
import { ApplicationRegistry } from '../../../public/js/os/shell/ApplicationRegistry.js';
import { Shell } from '../../../public/js/os/shell/Shell.js';
import { Taskbar } from '../../../public/js/os/desktop/Taskbar.js';
import { Notifications } from '../../../public/js/os/desktop/Notifications.js';
import { TextEditor } from '../../../public/js/os/apps/editor/TextEditor.js';
import { FileManager } from '../../../public/js/os/apps/files/FileManager.js';
import { SettingsApp } from '../../../public/js/os/apps/settings/SettingsApp.js';
import { Calculator } from '../../../public/js/os/apps/calculator/Calculator.js';
import { MathParser } from '../../../public/js/os/apps/calculator/MathParser.js';

if (typeof globalThis.window === 'undefined') {
  globalThis.window = {
    innerWidth: 1280,
    innerHeight: 800,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    alert: vi.fn(),
    confirm: vi.fn().mockReturnValue(true),
    prompt: vi.fn()
  };
}

if (typeof globalThis.document === 'undefined') {
  globalThis.document = {
    documentElement: {
      getAttribute: vi.fn().mockReturnValue('dark'),
      setAttribute: vi.fn()
    },
    activeElement: null,
    createElement: (tag) => createMockElement(tag)
  };
}

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
    get innerHTML() {
      if (this._children && this._children.length > 0) {
        return this._children.map(c => `<div class="${c.className}">${c.innerHTML}</div>`).join('');
      }
      return this._innerHTML;
    },
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
        preventDefault: vi.fn()
      });
    },
    focus: vi.fn(),
    blur: vi.fn(),
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
      return child;
    },
    contains: function () {
      return true;
    }
  };
  return el;
}

describe('AdityyaOS Interactive Native Applications', () => {
  let kernel;
  let windowContainer;
  let wm;
  let registry;
  let shell;

  beforeEach(() => {
    kernel = new Kernel();
    kernel.boot();

    // Setup home directory structure in AdityyaFS
    try {
      kernel.fileSystemManager.createDirectory('/home');
      kernel.fileSystemManager.createDirectory('/home/user');
      kernel.fileSystemManager.createDirectory('/home/user/Documents');
      kernel.fileSystemManager.createFile('/home/user/test.txt', 12);
      kernel.fileSystemManager.writeFile('/home/user/test.txt', 'Hello AdityyaOS');
    } catch {}

    windowContainer = createMockElement('div');
    wm = new WindowManager({ container: windowContainer, kernel });
    registry = new ApplicationRegistry({ kernel, windowManager: wm });
    shell = new Shell({
      windowContainer,
      windowManager: wm,
      registry,
      taskbar: new Taskbar(),
      notifications: new Notifications()
    });
  });

  afterEach(() => {
    shell?.destroy();
    wm?.destroy();
    kernel?.shutdown();
  });

  describe('Elimination of Placeholder Stubs', () => {
    const appIds = [
      'files',
      'terminal',
      'settings',
      'browser',
      'notes',
      'calculator',
      'taskmanager',
      'systemmonitor',
      'text-editor',
      'editor',
      'image-viewer'
    ];

    appIds.forEach(appId => {
      it(`application "${appId}" does not render "Window Container Active" stub`, () => {
        const app = registry.get(appId);
        expect(app).toBeDefined();
        expect(typeof app.createView).toBe('function');

        const mountTarget = createMockElement('div');
        const view = app.createView({ windowManager: wm, kernel });
        view.mount(mountTarget);

        expect(mountTarget.innerHTML).not.toContain('Window Container Active');
        expect(mountTarget.innerHTML).not.toContain('os-app-placeholder');
        expect(mountTarget.innerHTML.length).toBeGreaterThan(0);

        view.unmount();
      });
    });
  });

  describe('Text Editor (TextEditor.js)', () => {
    it('mounts interactive toolbar, textarea, and dirty indicator', () => {
      const app = registry.get('text-editor');
      const mountTarget = createMockElement('div');
      const view = app.createView({ windowManager: wm, kernel });
      view.mount(mountTarget);

      expect(mountTarget.innerHTML).toContain('os-editor-app');
      expect(mountTarget.innerHTML).toContain('os-editor-toolbar');
      expect(mountTarget.innerHTML).toContain('os-editor-textarea');
      expect(mountTarget.innerHTML).toContain('editor-path');
      expect(mountTarget.innerHTML).toContain('editor-dirty');

      view.unmount();
    });

    it('loads and saves files via api.fs with dirty state tracking', async () => {
      const app = registry.get('text-editor');
      const mountTarget = createMockElement('div');
      const view = app.createView({ windowManager: wm, kernel });
      view.mount(mountTarget);

      const editor = new TextEditor({
        api: {
          fs: {
            readFile: vi.fn().mockReturnValue('Sample file content'),
            writeFile: vi.fn(),
            exists: vi.fn().mockReturnValue(true)
          },
          window: { setTitle: vi.fn() }
        },
        container: mountTarget
      });

      // Load file
      await editor.loadFile('/home/user/test.txt');
      expect(editor.content).toBe('Sample file content');
      expect(editor.currentPath).toBe('/home/user/test.txt');
      expect(editor.isDirty).toBe(false);

      // Modify content -> marks dirty
      editor.setContent('Modified text content');
      expect(editor.isDirty).toBe(true);

      // Save file -> clears dirty
      await editor.saveFile();
      expect(editor.isDirty).toBe(false);

      editor.destroy();
      view.unmount();
    });

    it('handles non-existent files (ENOENT) gracefully without crashing', () => {
      const mountTarget = createMockElement('div');
      const editor = new TextEditor({
        api: {
          fs: {
            readFile: vi.fn().mockImplementation(() => {
              const err = new Error('File not found');
              err.code = 'ENOENT';
              throw err;
            })
          }
        },
        container: mountTarget
      });

      // Does not throw an unhandled error
      expect(() => editor.loadFile('/non/existent/path.txt')).not.toThrow();
      expect(editor.content).toBe('');

      editor.destroy();
    });
  });

  describe('File Manager (FileManager.js)', () => {
    it('mounts breadcrumbs, navigation, file list, and action buttons', () => {
      const app = registry.get('files');
      const mountTarget = createMockElement('div');
      const view = app.createView({ windowManager: wm, kernel });
      view.mount(mountTarget);

      expect(mountTarget.innerHTML).toContain('os-files-app');
      expect(mountTarget.innerHTML).toContain('os-files-toolbar');
      expect(mountTarget.innerHTML).toContain('files-breadcrumbs');
      expect(mountTarget.innerHTML).toContain('btn-up');
      expect(mountTarget.innerHTML).toContain('btn-new-folder');
      expect(mountTarget.innerHTML).toContain('btn-new-file');
      expect(mountTarget.innerHTML).toContain('btn-delete');
      expect(mountTarget.innerHTML).toContain('files-list');

      view.unmount();
    });

    it('navigates directories and performs actions through api.fs', () => {
      const mockFs = {
        exists: vi.fn().mockReturnValue(true),
        listDirectory: vi.fn().mockReturnValue([
          { name: 'Documents', type: 'directory', size: 0 },
          { name: 'readme.txt', type: 'file', size: 120 }
        ]),
        createDirectory: vi.fn(),
        createFile: vi.fn(),
        deleteFile: vi.fn()
      };

      const mountTarget = createMockElement('div');
      const fm = new FileManager({
        api: { fs: mockFs },
        container: mountTarget,
        initialPath: '/home/user'
      });

      expect(fm.currentPath).toBe('/home/user');
      expect(mockFs.listDirectory).toHaveBeenCalledWith('/home/user');

      // Navigate up
      fm.navigateUp();
      expect(fm.currentPath).toBe('/home');
      expect(mockFs.listDirectory).toHaveBeenCalledWith('/home');

      fm.destroy();
    });
  });

  describe('Settings (SettingsApp.js)', () => {
    it('mounts System, Profile, Network, and Appearance panels', async () => {
      const app = registry.get('settings');
      const mountTarget = createMockElement('div');
      const view = app.createView({ windowManager: wm, kernel });
      view.mount(mountTarget);

      expect(mountTarget.innerHTML).toContain('os-settings-app');
      expect(mountTarget.innerHTML).toContain('os-settings-sidebar');
      expect(mountTarget.innerHTML).toContain('System Status');

      view.unmount();
    });

    it('renders profile info, network status, and appearance theme toggle', async () => {
      const mountTarget = createMockElement('div');
      const settings = new SettingsApp({
        api: {
          system: {
            getInfo: () => ({ name: 'AdityyaOS', version: '1.0.0', kernelVersion: '1.0.0', arch: 'x86_64-sim', user: 'admin', status: 'RUNNING' }),
            getUptime: () => 3600
          },
          memory: {
            getUsage: () => ({ totalMemory: 1024, usedMemory: 256, freeMemory: 768 })
          },
          profile: {
            getCurrent: () => ({ username: 'admin', displayName: 'Administrator', homeDirectory: '/home/admin' }),
            updatePreferences: vi.fn()
          },
          network: {
            getInterfaces: () => [
              { name: 'lo0', ip: '127.0.0.1', netmask: '255.0.0.0', mac: '00:00:00:00:00:00', status: 'UP' },
              { name: 'eth0', ip: '192.168.1.50', netmask: '255.255.255.0', mac: '02:00:00:ad:17:01', status: 'UP' }
            ]
          }
        },
        container: mountTarget
      });

      // Profile tab
      await settings.setTab('profile');
      expect(mountTarget.innerHTML).toContain('Administrator');
      expect(mountTarget.innerHTML).toContain('/home/admin');

      // Network tab
      await settings.setTab('network');
      expect(mountTarget.innerHTML).toContain('eth0');
      expect(mountTarget.innerHTML).toContain('192.168.1.50');

      // Appearance / Display tab with toggle button
      await settings.setTab('display');
      expect(mountTarget.innerHTML).toContain('Display Resolution');
      expect(mountTarget.innerHTML).toContain('btn-toggle-theme');

      settings.destroy();
    });
  });

  describe('Calculator (Calculator.js)', () => {
    it('mounts screen and complete keypad', () => {
      const app = registry.get('calculator');
      const mountTarget = createMockElement('div');
      const view = app.createView({ windowManager: wm, kernel });
      view.mount(mountTarget);

      expect(mountTarget.innerHTML).toContain('os-calculator-app');
      expect(mountTarget.innerHTML).toContain('os-calc-screen');
      expect(mountTarget.innerHTML).toContain('calc-history');
      expect(mountTarget.innerHTML).toContain('calc-result');
      expect(mountTarget.innerHTML).toContain('os-calc-pad');

      view.unmount();
    });

    it('evaluates expressions accurately without eval or new Function', () => {
      const mountTarget = createMockElement('div');
      const calc = new Calculator({ container: mountTarget });

      calc.append('1');
      calc.append('2');
      calc.append('+');
      calc.append('3');
      calc.append('4');
      calc.calculate();

      expect(calc.result).toBe('46');

      // Multiplication with precedence
      calc.clear();
      calc.append('2');
      calc.append('+');
      calc.append('3');
      calc.append('*');
      calc.append('4');
      calc.calculate();

      expect(calc.result).toBe('14');

      calc.destroy();
    });
  });

  describe('Window Lifecycle & Process Cleanup', () => {
    it('closing an application window terminates the simulated process and cleans up resources', () => {
      const activeCountBefore = kernel.processManager.getProcesses(p => p.state !== 'TERMINATED').length;

      // Launch files app through Shell
      const win = shell.launch('files');
      expect(win).toBeDefined();

      const activeCountDuring = kernel.processManager.getProcesses(p => p.state !== 'TERMINATED').length;
      expect(activeCountDuring).toBeGreaterThan(activeCountBefore);

      // Close the window
      shell.windowManager.closeWindow(win.id);

      const activeCountAfter = kernel.processManager.getProcesses(p => p.state !== 'TERMINATED').length;
      expect(activeCountAfter).toBe(activeCountBefore);
    });
  });
});
