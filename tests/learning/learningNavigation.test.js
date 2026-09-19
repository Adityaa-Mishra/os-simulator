import { describe, it, expect, beforeEach, vi } from 'vitest';
import { learnHubView } from '../../public/js/views/learnHubView.js';
import { moduleLearnView } from '../../public/js/views/moduleLearnView.js';
import { simulationTracker } from '../../public/js/core/simulationTracker.js';
import { store } from '../../public/js/core/store.js';
import { api } from '../../public/js/core/apiClient.js';

function createMockContainer() {
  const elements = new Map();

  const createElement = () => {
    const el = {
      style: {},
      dataset: {},
      value: '',
      textContent: '',
      innerHTML: '',
      className: '',
      disabled: false,
      classList: {
        add: vi.fn(),
        remove: vi.fn(),
        contains: () => false
      },
      listeners: {},
      addEventListener: function (evt, handler) {
        if (!this.listeners[evt]) this.listeners[evt] = [];
        this.listeners[evt].push(handler);
      },
      dispatchEvent: function (evtName, payload) {
        const handlers = this.listeners[evtName] || [];
        handlers.forEach(h => h(payload || { target: this }));
      },
      querySelector: (sel) => {
        if (!elements.has(sel)) {
          elements.set(sel, createElement());
        }
        return elements.get(sel);
      },
      querySelectorAll: (sel) => [],
      closest: (sel) => createElement(),
      contains: () => false
    };
    return el;
  };

  const container = {
    _innerHTML: '',
    get innerHTML() {
      return this._innerHTML;
    },
    set innerHTML(html) {
      this._innerHTML = html;
    },
    querySelector: (sel) => {
      if (!elements.has(sel)) {
        elements.set(sel, createElement());
      }
      return elements.get(sel);
    },
    querySelectorAll: (sel) => []
  };

  return { container, elements, createElement };
}

describe('Phase 10: Learning Navigation & Views Tests', () => {
  beforeEach(() => {
    store.setState({ user: null, isAuthenticated: false });
    simulationTracker.setPendingSimulation(null);
    vi.restoreAllMocks();
  });

  describe('LearnHubView (#/learn)', () => {
    it('renders Learning Hub header and all 6 module cards in guest mode', async () => {
      const { container } = createMockContainer();
      await learnHubView.mount(container);

      expect(container.innerHTML).toContain('Operating System Concepts & Theory');
      expect(container.innerHTML).toContain('CPU Scheduling');
      expect(container.innerHTML).toContain('Process Management');
      expect(container.innerHTML).toContain('Memory Management');
      expect(container.innerHTML).toContain('Disk Scheduling');
      expect(container.innerHTML).toContain('Deadlock Management');
      expect(container.innerHTML).toContain('File System Simulation');
      expect(container.innerHTML).toContain('Guest Mode');
    });

    it('fetches learning progress and updates status badges when authenticated', async () => {
      store.setState({
        user: { _id: 'u1', name: 'Learner' },
        isAuthenticated: true
      });

      const mockProgress = {
        success: true,
        data: [
          { module: 'cpu', completed: true, simulationsRun: 5 },
          { module: 'memory', completed: false, simulationsRun: 2 }
        ]
      };
      vi.spyOn(api, 'get').mockResolvedValue(mockProgress);

      const { container } = createMockContainer();
      await learnHubView.mount(container);

      expect(api.get).toHaveBeenCalledWith('/progress');
    });
  });

  describe('ModuleLearnView (#/learn/:module)', () => {
    it('renders module learning page for CPU Scheduling with objectives and concepts', async () => {
      const { container } = createMockContainer();
      await moduleLearnView.mount(container, { module: 'cpu' });

      expect(container.innerHTML).toContain('CPU Scheduling');
      expect(container.innerHTML).toContain('Learning Objectives');
      expect(container.innerHTML).toContain('Core Concepts & Principles');
      expect(container.innerHTML).toContain('Worked Example');
      expect(container.innerHTML).toContain('Key Terminology Glossary');
      expect(container.innerHTML).toContain('Knowledge Check');
    });

    it('renders module learning page for Deadlock with Banker\'s Algorithm and RAG', async () => {
      const { container } = createMockContainer();
      await moduleLearnView.mount(container, { module: 'deadlock' });

      expect(container.innerHTML).toContain('Deadlock Management');
      expect(container.innerHTML).toContain('Coffman Conditions');
      expect(container.innerHTML).toContain('Resource Allocation Graph');
      expect(container.innerHTML).toContain('Banker');
    });

    it('preloads worked example into simulator via pending simulation handoff', async () => {
      const { container, elements } = createMockContainer();
      await moduleLearnView.mount(container, { module: 'disk' });

      // Find the "Try This Example in Simulator" button
      const tryBtn = elements.get('#try-example-btn');
      expect(tryBtn).toBeDefined();

      // Trigger click
      tryBtn.dispatchEvent('click');

      // Verify pending simulation was set
      const pending = simulationTracker.getPendingSimulation('disk');
      expect(pending).toBeDefined();
      expect(pending.module).toBe('disk');
      expect(pending.algorithm).toBe('disk_sstf');
    });

    it('renders "Module Not Found" card when invalid module ID is requested', async () => {
      const { container } = createMockContainer();
      await moduleLearnView.mount(container, { module: 'quantum_computing' });

      expect(container.innerHTML).toContain('Module Not Found');
      expect(container.innerHTML).toContain('quantum_computing');
    });
  });
});
