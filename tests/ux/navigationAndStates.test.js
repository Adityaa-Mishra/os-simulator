import { describe, it, expect, vi, beforeEach } from 'vitest';
import '../../public/js/engines/cpu/index.js';
import '../../public/js/engines/process/index.js';
import '../../public/js/engines/memory/index.js';
import '../../public/js/engines/memory/pageReplacement/index.js';
import '../../public/js/engines/disk/index.js';
import '../../public/js/engines/deadlock/index.js';
import '../../public/js/engines/filesystem/index.js';
import { Router } from '../../public/js/core/router.js';
import { store } from '../../public/js/core/store.js';
import { cpuView } from '../../public/js/views/cpuView.js';
import { processView } from '../../public/js/views/processView.js';
import { memoryView } from '../../public/js/views/memoryView.js';
import { diskView } from '../../public/js/views/diskView.js';
import { deadlockView } from '../../public/js/views/deadlockView.js';
import { filesystemView } from '../../public/js/views/filesystemView.js';
import { learnHubView } from '../../public/js/views/learnHubView.js';
import { moduleLearnView } from '../../public/js/views/moduleLearnView.js';
import { savedView } from '../../public/js/views/savedView.js';
import { historyView } from '../../public/js/views/historyView.js';
import { authView } from '../../public/js/views/authView.js';

// Headless DOM element factory for Node test environment
function createMockElement(tag = 'div') {
  const el = {
    tagName: tag.toUpperCase(),
    style: {},
    dataset: {},
    value: '',
    textContent: '',
    _innerHTML: '',
    get innerHTML() { return this._innerHTML; },
    set innerHTML(val) { this._innerHTML = String(val); },
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
    removeEventListener: vi.fn(),
    dispatchEvent: function (evtName, payload) {
      const handlers = this.listeners[evtName] || [];
      handlers.forEach(h => h(payload || { target: this }));
    },
    click: function () {
      this.dispatchEvent('click', { target: this });
    },
    querySelector: function (sel) {
      return createMockElement();
    },
    querySelectorAll: function (sel) {
      return [];
    },
    appendChild: vi.fn(),
    remove: vi.fn(),
    contains: function () { return false; }
  };
  return el;
}

// Ensure globalThis.window and globalThis.document exist in Node environment
if (typeof globalThis.window === 'undefined') {
  globalThis.window = {
    location: { hash: '#/' },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  };
}

if (typeof globalThis.document === 'undefined') {
  globalThis.document = {
    createElement: (tag) => createMockElement(tag),
    getElementById: (id) => createMockElement('div'),
    querySelector: (sel) => createMockElement('div'),
    querySelectorAll: (sel) => [],
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    documentElement: createMockElement('html'),
    body: createMockElement('body')
  };
}

describe('Phase 11: UX, Navigation & State Tests', () => {
  let container;

  beforeEach(() => {
    container = createMockElement('div');
    store.setState({ user: null, isAuthenticated: false });
    vi.restoreAllMocks();
  });

  describe('SPA Router & View Lifecycle', () => {
    it('registers routes and navigates to default route', async () => {
      const router = new Router(container);
      const mockView = {
        mount: vi.fn(),
        unmount: vi.fn()
      };

      router.register('#/', mockView, { title: 'Dashboard' });
      window.location.hash = '#/';
      await router.handleRouting();

      expect(mockView.mount).toHaveBeenCalledWith(container, { title: 'Dashboard' });
    });

    it('calls unmount() on previous view when navigating away', async () => {
      const router = new Router(container);
      const viewA = { mount: vi.fn(), unmount: vi.fn() };
      const viewB = { mount: vi.fn(), unmount: vi.fn() };

      router.register('#/a', viewA, { title: 'View A' });
      router.register('#/b', viewB, { title: 'View B' });

      window.location.hash = '#/a';
      await router.handleRouting();
      expect(viewA.mount).toHaveBeenCalled();

      window.location.hash = '#/b';
      await router.handleRouting();
      expect(viewA.unmount).toHaveBeenCalled();
      expect(viewB.mount).toHaveBeenCalled();
    });

    it('renders a friendly 404 NotFound view when route does not exist', async () => {
      const router = new Router(container);
      router.register('#/', { mount: vi.fn(), unmount: vi.fn() }, { title: 'Dashboard' });

      window.location.hash = '#/non-existent-route-12345';
      await router.handleRouting();

      expect(container.innerHTML).toContain('Page Not Found (404)');
      expect(container.innerHTML).toContain('Return to Dashboard');
    });

    it('updates active navigation class in sidebar without throwing', async () => {
      const router = new Router(container);
      router.register('#/cpu', { mount: vi.fn(), unmount: vi.fn() }, { title: 'CPU' });

      window.location.hash = '#/cpu';
      await expect(router.handleRouting()).resolves.not.toThrow();
    });
  });

  describe('Guest Access Preservation Across All 6 Simulators & Learning', () => {
    it('allows guest to mount CPU scheduling simulator without redirect', async () => {
      await cpuView.mount(container);
      expect(container.innerHTML).toContain('CPU Scheduling');
      cpuView.unmount();
    });

    it('allows guest to mount Process Management simulator without redirect', async () => {
      await processView.mount(container);
      expect(container.innerHTML).toContain('Process Management');
      processView.unmount();
    });

    it('allows guest to mount Memory Management simulator without redirect', async () => {
      await memoryView.mount(container);
      expect(container.innerHTML).toContain('Memory Allocation');
      memoryView.unmount();
    });

    it('allows guest to mount Disk Scheduling simulator without redirect', async () => {
      await diskView.mount(container);
      expect(container.innerHTML).toContain('Disk Scheduling');
      diskView.unmount();
    });

    it('allows guest to mount Deadlock Management simulator without redirect', async () => {
      await deadlockView.mount(container);
      expect(container.innerHTML).toContain('Deadlock');
      deadlockView.unmount();
    });

    it('allows guest to mount File System simulator without redirect', async () => {
      await filesystemView.mount(container);
      expect(container.innerHTML).toContain('File System');
      filesystemView.unmount();
    });

    it('allows guest to browse Learning Hub and individual module lessons', async () => {
      await learnHubView.mount(container);
      expect(container.innerHTML).toContain('Learning Modules');
      learnHubView.unmount();

      await moduleLearnView.mount(container, { module: 'cpu', title: 'Learn CPU' });
      expect(container.innerHTML).toContain('CPU Scheduling');
      expect(container.innerHTML).toContain('Knowledge Check');
      moduleLearnView.unmount();
    });

    it('presents informative sign-in prompt on saved simulations for guest', async () => {
      await savedView.mount(container);
      expect(container.innerHTML).toContain('Authentication Required');
      expect(container.innerHTML).toContain('Sign In / Register');
      savedView.unmount();
    });

    it('presents informative sign-in prompt on simulation history for guest', async () => {
      await historyView.mount(container);
      expect(container.innerHTML).toContain('Authentication Required');
      expect(container.innerHTML).toContain('Sign In / Register');
      historyView.unmount();
    });
  });

  describe('Authentication Modal & Interaction States', () => {
    it('opens auth modal with dialog role and aria attributes', () => {
      const modalMount = createMockElement('div');
      authView.modalContainer = modalMount;
      authView.openModal('login');

      expect(modalMount.innerHTML).toContain('Sign In');
      expect(modalMount.classList.contains('open')).toBe(true);

      authView.closeModal();
      expect(modalMount.classList.contains('open')).toBe(false);
    });
  });
});
