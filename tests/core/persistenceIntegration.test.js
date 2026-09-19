import { describe, it, expect, beforeEach, vi } from 'vitest';
import { api } from '../../public/js/core/apiClient.js';
import { store } from '../../public/js/core/store.js';
import { simulationTracker } from '../../public/js/core/simulationTracker.js';
import { savedView } from '../../public/js/views/savedView.js';
import { historyView } from '../../public/js/views/historyView.js';
import { dashboardView } from '../../public/js/views/dashboardView.js';

// DOM container helper for view testing
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
      querySelectorAll: (sel) => []
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

describe('Phase 9: Persistence, History & Learning Progress Integration Tests', () => {
  beforeEach(() => {
    store.setState({ user: null, isAuthenticated: false });
    simulationTracker.setPendingSimulation(null);
    vi.restoreAllMocks();
  });

  describe('SimulationTracker', () => {
    it('stores and retrieves pending simulations by matching module', () => {
      const config = {
        module: 'cpu',
        algorithm: 'cpu_fcfs',
        inputs: { processes: [{ id: 'P1', burstTime: 5 }] }
      };

      simulationTracker.setPendingSimulation(config);

      // Non-matching module returns null and leaves pending intact
      expect(simulationTracker.getPendingSimulation('disk')).toBeNull();

      // Matching module returns config and clears the pending slot
      const retrieved = simulationTracker.getPendingSimulation('cpu');
      expect(retrieved).toEqual(config);

      // Second retrieval returns null (consumed)
      expect(simulationTracker.getPendingSimulation('cpu')).toBeNull();
    });

    it('gracefully skips history and activity recording when user is guest', async () => {
      const postSpy = vi.spyOn(api, 'post');

      await simulationTracker.recordRun('disk', 'fcfs', { requests: [10, 20] }, { totalMovement: 50 });

      expect(postSpy).not.toHaveBeenCalled();
    });

    it('records history and increments progress activity when user is authenticated', async () => {
      store.setState({
        user: { _id: 'u123', name: 'Student' },
        isAuthenticated: true
      });

      const postSpy = vi.spyOn(api, 'post').mockResolvedValue({ success: true });

      await simulationTracker.recordRun(
        'cpu',
        'cpu_round_robin',
        { processes: [{ id: 'P1', burstTime: 4 }], quantum: 2 },
        { totalCycles: 4, averageTurnaround: 4 }
      );

      // Verify history call
      expect(postSpy).toHaveBeenCalledWith(
        '/history',
        expect.objectContaining({
          module: 'cpu',
          algorithm: 'cpu_round_robin'
        })
      );

      // Verify progress activity call
      expect(postSpy).toHaveBeenCalledWith('/progress/cpu/activity');
    });

    it('handles API errors without throwing or interrupting client simulation', async () => {
      store.setState({
        user: { _id: 'u123', name: 'Student' },
        isAuthenticated: true
      });

      vi.spyOn(api, 'post').mockRejectedValue(new Error('Network error or offline'));

      // Must not throw
      await expect(
        simulationTracker.recordRun('deadlock', 'deadlock_bankers_safety', {}, {})
      ).resolves.not.toThrow();
    });

    it('tracks module visit for authenticated user', async () => {
      store.setState({
        user: { _id: 'u123', name: 'Student' },
        isAuthenticated: true
      });

      const patchSpy = vi.spyOn(api, 'patch').mockResolvedValue({ success: true });

      await simulationTracker.trackVisit('filesystem');

      expect(patchSpy).toHaveBeenCalledWith(
        '/progress/filesystem',
        expect.objectContaining({
          lastVisitedAt: expect.any(Date)
        })
      );
    });
  });

  describe('SavedView (Saved Simulations)', () => {
    it('renders authentication required gate when user is not authenticated', () => {
      const { container } = createMockContainer();
      savedView.mount(container);

      expect(container.innerHTML).toContain('Authentication Required');
      expect(container.innerHTML).toContain('saved-login-btn');
    });

    it('fetches and renders saved simulations when user is authenticated', async () => {
      store.setState({
        user: { _id: 'u123', name: 'Student' },
        isAuthenticated: true
      });

      const mockSims = [
        {
          _id: 's1',
          name: 'My Custom CPU Test',
          module: 'cpu',
          algorithm: 'cpu_fcfs',
          description: 'A test run',
          inputs: { processes: [] },
          createdAt: new Date().toISOString()
        }
      ];

      vi.spyOn(api, 'get').mockResolvedValue({ success: true, count: 1, data: mockSims });

      const { container } = createMockContainer();
      savedView.mount(container);

      // Wait for async fetch
      await savedView.fetchAndRenderSimulations();

      const grid = container.querySelector('#saved-grid-container');
      expect(grid.innerHTML).toContain('My Custom CPU Test');
      expect(grid.innerHTML).toContain('CPU');
    });

    it('sets pending simulation and redirects when loading a saved simulation', () => {
      const sim = {
        _id: 's1',
        name: 'SSTF Benchmark',
        module: 'disk',
        algorithm: 'disk_sstf',
        inputs: { requests: [50, 100], initialHead: 53 }
      };

      simulationTracker.setPendingSimulation(sim);

      const pending = simulationTracker.getPendingSimulation('disk');
      expect(pending).toBeDefined();
      expect(pending.algorithm).toBe('disk_sstf');
      expect(pending.inputs.initialHead).toBe(53);
    });
  });

  describe('HistoryView (Simulation Run History)', () => {
    it('renders authentication required gate when user is not authenticated', () => {
      const { container } = createMockContainer();
      historyView.mount(container);

      expect(container.innerHTML).toContain('Authentication Required');
      expect(container.innerHTML).toContain('history-login-btn');
    });

    it('fetches and displays history records when authenticated', async () => {
      store.setState({
        user: { _id: 'u123', name: 'Student' },
        isAuthenticated: true
      });

      const mockHistory = [
        {
          _id: 'h1',
          module: 'memory',
          algorithm: 'lru',
          inputs: { pages: [1, 2, 3], frameCount: 3 },
          metrics: { pageFaults: 3, hitRate: 0 },
          completedAt: new Date().toISOString()
        }
      ];

      vi.spyOn(api, 'get').mockResolvedValue({ success: true, count: 1, data: mockHistory });

      const { container } = createMockContainer();
      historyView.mount(container);

      await historyView.fetchAndRenderHistory();

      const tableContainer = container.querySelector('#history-table-container');
      expect(tableContainer.innerHTML).toContain('MEMORY');
      expect(tableContainer.innerHTML).toContain('lru');
    });

    it('allows reloading a past run into the corresponding module simulator', () => {
      const record = {
        module: 'cpu',
        algorithm: 'cpu_priority',
        inputs: { processes: [{ id: 'P1', priority: 1, burstTime: 3 }] },
        name: 'History Run (cpu_priority)'
      };

      simulationTracker.setPendingSimulation(record);

      const pending = simulationTracker.getPendingSimulation('cpu');
      expect(pending).toBeDefined();
      expect(pending.algorithm).toBe('cpu_priority');
      expect(pending.inputs.processes).toHaveLength(1);
    });
  });

  describe('DashboardView (Topic Mastery & Learning Progress)', () => {
    it('renders topic cards for all 6 OS modules when authenticated', async () => {
      store.setState({
        user: { _id: 'u123', name: 'Student' },
        isAuthenticated: true
      });

      const mockProgress = {
        success: true,
        summary: { totalModules: 6, completedModules: 2, totalSimulationsRun: 15 },
        data: [
          { module: 'cpu', completed: true, simulationsRun: 6 },
          { module: 'process', completed: true, simulationsRun: 4 },
          { module: 'memory', completed: false, simulationsRun: 3 },
          { module: 'disk', completed: false, simulationsRun: 2 },
          { module: 'deadlock', completed: false, simulationsRun: 0 },
          { module: 'filesystem', completed: false, simulationsRun: 0 }
        ]
      };

      vi.spyOn(api, 'get').mockResolvedValue(mockProgress);

      const { container } = createMockContainer();
      dashboardView.mount(container);

      await dashboardView.loadLearningProgress();

      const progressMount = container.querySelector('#progress-cards-container');
      expect(progressMount.innerHTML).toContain('CPU Scheduling');
      expect(progressMount.innerHTML).toContain('Process Management');
      expect(progressMount.innerHTML).toContain('Memory Management');
      expect(progressMount.innerHTML).toContain('Disk Scheduling');
      expect(progressMount.innerHTML).toContain('Deadlock Management');
      expect(progressMount.innerHTML).toContain('File System');
    });

    it('renders guest learning cards with guest mode badges when user is not logged in', async () => {
      store.setState({ user: null, isAuthenticated: false });

      const { container } = createMockContainer();
      dashboardView.mount(container);

      await dashboardView.loadLearningProgress();

      const progressMount = container.querySelector('#progress-cards-container');
      expect(progressMount.innerHTML).toContain('Guest Mode');
      expect(progressMount.innerHTML).toContain('Untracked');
    });
  });
});
