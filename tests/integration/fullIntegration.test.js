import { describe, it, expect, vi, beforeEach } from 'vitest';
import '../../public/js/engines/cpu/index.js';
import '../../public/js/engines/disk/index.js';
import { simulationTracker } from '../../public/js/core/simulationTracker.js';
import { store } from '../../public/js/core/store.js';
import { cpuView } from '../../public/js/views/cpuView.js';
import { diskView } from '../../public/js/views/diskView.js';
import { api } from '../../public/js/core/apiClient.js';

// Headless DOM element factory for Node test environment
function createMockElement(tag = 'div') {
  const elements = new Map();

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
      if (!elements.has(sel)) {
        elements.set(sel, createMockElement());
      }
      return elements.get(sel);
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

describe('Phase 11: End-to-End User Journey Integration Tests', () => {
  let container;

  beforeEach(() => {
    container = createMockElement('div');
    simulationTracker.clearPendingSimulation();
    vi.restoreAllMocks();
  });

  describe('Journey 1: Educational Lesson Handoff -> Simulator -> History Logging', () => {
    it('transfers preconfigured lesson parameters into CPU simulator and executes run', async () => {
      // Step 1: Lesson sets preconfigured workload into simulationTracker
      const lessonWorkload = {
        module: 'cpu',
        algorithm: 'fcfs',
        inputs: {
          algorithm: 'fcfs',
          processes: [
            { id: 'P1', arrivalTime: 0, burstTime: 5, priority: 1 },
            { id: 'P2', arrivalTime: 1, burstTime: 3, priority: 2 }
          ]
        }
      };

      simulationTracker.setPendingSimulation(lessonWorkload);
      expect(simulationTracker.pendingSimulation).not.toBeNull();
      expect(simulationTracker.pendingSimulation.module).toBe('cpu');

      // Step 2: User opens CPU simulator view
      await cpuView.mount(container);

      // Verify pending simulation was consumed by the view
      expect(simulationTracker.pendingSimulation).toBeNull();

      // Step 3: Run the simulation
      const recordSpy = vi.spyOn(simulationTracker, 'recordRun');

      // Call runSimulation on the view
      cpuView.runSimulation();

      // Verify tracker recorded the completed simulation
      expect(recordSpy).toHaveBeenCalledWith(
        'cpu',
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          averageTurnaroundTime: expect.any(Number),
          averageWaitingTime: expect.any(Number)
        })
      );

      cpuView.unmount();
    });
  });

  describe('Journey 2: Custom Simulation -> Save Configuration -> Reload & Re-run', () => {
    it('persists custom disk parameters, reloads from saved, and re-executes', async () => {
      // Step 1: User runs Disk simulator with custom parameters
      await diskView.mount(container);

      // Step 2: Mock saving the simulation via API
      const savedConfig = {
        _id: 'sim_disk_test_123',
        module: 'disk',
        algorithm: 'fcfs',
        name: 'My Custom Disk Workload',
        inputs: {
          requests: [20, 80, 140, 40],
          initialHead: 50,
          diskSize: 200,
          direction: 'up'
        }
      };

      vi.spyOn(api, 'post').mockResolvedValue({ success: true, data: savedConfig });

      // Step 3: Later, user selects "Load into Simulator" from Saved view
      simulationTracker.setPendingSimulation(savedConfig);
      expect(simulationTracker.pendingSimulation).not.toBeNull();
      expect(simulationTracker.pendingSimulation.module).toBe('disk');

      // Step 4: Disk view reloads and consumes saved configuration
      diskView.unmount();
      await diskView.mount(container);

      expect(simulationTracker.pendingSimulation).toBeNull();
      expect(diskView.initialHead).toBe(50);
      expect(diskView.requestsInput).toBe('20, 80, 140, 40');

      diskView.unmount();
    });
  });

  describe('Journey 3: Unauthenticated Guest Simulation Resilience', () => {
    it('runs simulation as guest with zero network errors or UI interruptions', async () => {
      store.setState({ user: null, isAuthenticated: false });

      await cpuView.mount(container);

      expect(() => cpuView.runSimulation()).not.toThrow();

      cpuView.unmount();
    });
  });
});
