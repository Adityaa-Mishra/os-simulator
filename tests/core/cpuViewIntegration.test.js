import { describe, it, expect, beforeEach, vi } from 'vitest';
import { simulationRegistry } from '../../public/js/core/simulationRegistry.js';
import '../../public/js/engines/cpu/index.js'; // Ensure CPU engines are registered
import { GanttRenderer, getProcessColor } from '../../public/js/visualizers/ganttRenderer.js';
import { PlaybackController } from '../../public/js/core/playback.js';
import { cpuView } from '../../public/js/views/cpuView.js';

// Minimal DOM mock helper for headless testing in Node environment
function createMockContainer() {
  const elements = new Map();

  const container = {
    _innerHTML: '',
    get innerHTML() {
      return this._innerHTML;
    },
    set innerHTML(html) {
      this._innerHTML = html;
    },
    querySelector: (sel) => {
      if (elements.has(sel)) return elements.get(sel);
      return null;
    },
    querySelectorAll: (sel) => {
      return [];
    }
  };

  return { container, elements };
}

describe('Phase 2B: CPU View, Gantt Renderer & Playback Integration Tests', () => {
  let docElements;

  beforeEach(() => {
    docElements = new Map();
    globalThis.document = {
      getElementById: (id) => {
        if (!docElements.has(id)) {
          docElements.set(id, {
            style: {},
            dataset: {},
            value: '',
            textContent: '',
            innerHTML: '',
            addEventListener: vi.fn(),
            closest: () => ({ dataset: { index: '0' } }),
            querySelectorAll: () => [],
            appendChild: vi.fn(),
            remove: vi.fn()
          });
        }
        return docElements.get(id);
      },
      querySelectorAll: () => [],
      createElement: () => ({
        style: {},
        className: '',
        innerHTML: '',
        appendChild: vi.fn(),
        remove: vi.fn()
      })
    };
  });

  afterEach(() => {
    delete globalThis.document;
  });

  // =========================================================================
  // 1. CPU View Initialization & Algorithm Registry Binding
  // =========================================================================
  describe('CPU View Initialization & Algorithm Switching', () => {
    it('should discover all 6 algorithms from simulationRegistry on mount', () => {
      const { container } = createMockContainer();
      cpuView.mount(container);

      expect(cpuView.algorithms.length).toBe(6);
      expect(cpuView.selectedAlgorithmId).toBe('fcfs');
      expect(cpuView.currentEngine.name).toContain('First-Come, First-Served');
      expect(cpuView.processes.length).toBe(3);
      expect(container.innerHTML).toContain('CPU Scheduling Simulator');
    });

    it('should correctly switch algorithm, update engine, and reset results', () => {
      const { container } = createMockContainer();
      cpuView.mount(container);

      // Simulate switching to Round Robin
      cpuView.selectedAlgorithmId = 'round_robin';
      cpuView.currentEngine = simulationRegistry.get('cpu', 'round_robin');
      expect(cpuView.currentEngine.requiresQuantum).toBe(true);
      expect(cpuView.currentEngine.requiresPriority).toBe(false);

      // Simulate switching to Preemptive Priority
      cpuView.selectedAlgorithmId = 'priority_preemptive';
      cpuView.currentEngine = simulationRegistry.get('cpu', 'priority_preemptive');
      expect(cpuView.currentEngine.requiresQuantum).toBe(false);
      expect(cpuView.currentEngine.requiresPriority).toBe(true);
    });

    it('should populate presets from currentEngine without duplication', () => {
      const { container } = createMockContainer();
      cpuView.mount(container);

      const fcfsPresets = cpuView.currentEngine.getPresets();
      expect(fcfsPresets.length).toBeGreaterThanOrEqual(2);

      // Load a preset
      cpuView.loadPresetData(fcfsPresets[0].data);
      expect(cpuView.processes.length).toBe(fcfsPresets[0].data.processes.length);
      expect(cpuView.processes[0].id).toBe(fcfsPresets[0].data.processes[0].id);
    });
  });

  // =========================================================================
  // 2. Process Input Validation & Parameter Handling
  // =========================================================================
  describe('Process Input Validation in View Workflow', () => {
    it('should validate inputs using the active engine validate() method', () => {
      const fcfs = simulationRegistry.get('cpu', 'fcfs');

      // Valid workload
      const validRes = fcfs.validate({
        processes: [{ id: 'P1', arrivalTime: 0, burstTime: 5 }]
      });
      expect(validRes.isValid).toBe(true);

      // Duplicate IDs
      const dupRes = fcfs.validate({
        processes: [
          { id: 'P1', arrivalTime: 0, burstTime: 5 },
          { id: 'P1', arrivalTime: 1, burstTime: 2 }
        ]
      });
      expect(dupRes.isValid).toBe(false);
      expect(dupRes.error).toContain('Duplicate process ID');

      // Non-positive burst
      const zeroBurstRes = fcfs.validate({
        processes: [{ id: 'P1', arrivalTime: 0, burstTime: 0 }]
      });
      expect(zeroBurstRes.isValid).toBe(false);
      expect(zeroBurstRes.error).toContain('positive burstTime');

      // Negative arrival
      const negArrRes = fcfs.validate({
        processes: [{ id: 'P1', arrivalTime: -2, burstTime: 4 }]
      });
      expect(negArrRes.isValid).toBe(false);
      expect(negArrRes.error).toContain('non-negative arrivalTime');
    });

    it('should enforce quantum requirement for Round Robin and reject invalid values', () => {
      const rr = simulationRegistry.get('cpu', 'round_robin');

      const noQuantum = rr.validate({
        processes: [{ id: 'P1', arrivalTime: 0, burstTime: 4 }]
      });
      expect(noQuantum.isValid).toBe(false);
      expect(noQuantum.error).toContain('positive time quantum');

      const negativeQuantum = rr.validate({
        processes: [{ id: 'P1', arrivalTime: 0, burstTime: 4 }],
        quantum: -1
      });
      expect(negativeQuantum.isValid).toBe(false);

      const validQuantum = rr.validate({
        processes: [{ id: 'P1', arrivalTime: 0, burstTime: 4 }],
        quantum: 2
      });
      expect(validQuantum.isValid).toBe(true);
    });

    it('should enforce priority requirement for Priority engines', () => {
      const priorityP = simulationRegistry.get('cpu', 'priority_preemptive');

      const noPriority = priorityP.validate({
        processes: [{ id: 'P1', arrivalTime: 0, burstTime: 4 }]
      });
      expect(noPriority.isValid).toBe(false);
      expect(noPriority.error).toContain('requires a numeric priority');

      const validPriority = priorityP.validate({
        processes: [{ id: 'P1', arrivalTime: 0, burstTime: 4, priority: 2 }]
      });
      expect(validPriority.isValid).toBe(true);
    });
  });

  // =========================================================================
  // 3. Gantt Rendering Data Transformation
  // =========================================================================
  describe('GanttRenderer Data Transformation', () => {
    it('should calculate accurate width percentages and labels for execution segments and idle periods', () => {
      const mockContainer = { innerHTML: '' };
      const ganttData = [
        { processId: null, start: 0, end: 2 },   // Idle: 2 units = 20%
        { processId: 'P1', start: 2, end: 6 },   // P1: 4 units = 40%
        { processId: 'P2', start: 6, end: 10 }   // P2: 4 units = 40%
      ];
      const totalTime = 10;

      GanttRenderer.render(mockContainer, ganttData, totalTime);

      expect(mockContainer.innerHTML).toContain('gantt-block-idle');
      expect(mockContainer.innerHTML).toContain('width: 20%;');
      expect(mockContainer.innerHTML).toContain('width: 40%;');
      expect(mockContainer.innerHTML).toContain('IDLE');
      expect(mockContainer.innerHTML).toContain('P1');
      expect(mockContainer.innerHTML).toContain('P2');
      expect(mockContainer.innerHTML).toContain('gantt-tick');
    });

    it('should handle empty or invalid data gracefully', () => {
      const mockContainer = { innerHTML: '' };
      GanttRenderer.render(mockContainer, [], 0);
      expect(mockContainer.innerHTML).toContain('No execution data');

      GanttRenderer.render(mockContainer, null, -1);
      expect(mockContainer.innerHTML).toContain('No execution data');
    });

    it('should update cursor position based on current time percentage', () => {
      const mockCursor = { style: { display: '', left: '' } };
      const mockContainer = {
        querySelector: (sel) => (sel === '#gantt-cursor-line' ? mockCursor : null)
      };

      GanttRenderer.updateCursor(mockContainer, 5, 10);
      expect(mockCursor.style.display).toBe('block');
      expect(mockCursor.style.left).toBe('50%');

      // Clamped above
      GanttRenderer.updateCursor(mockContainer, 15, 10);
      expect(mockCursor.style.left).toBe('100%');

      // Clamped below
      GanttRenderer.updateCursor(mockContainer, -2, 10);
      expect(mockCursor.style.left).toBe('0%');
    });

    it('should generate consistent process colors', () => {
      const color1 = getProcessColor('P1');
      const color2 = getProcessColor('P1');
      const color3 = getProcessColor('P2');

      expect(color1).toBe(color2);
      expect(color1).not.toBe(color3);
      expect(getProcessColor(null)).toBe('var(--bg-tertiary)');
    });
  });

  // =========================================================================
  // 4. Playback Controller Lifecycle, Cleanup & Stale State Management
  // =========================================================================
  describe('Playback Lifecycle & Stale State Cleanup', () => {
    it('should properly clean up active timers when unmounting or clearing results', () => {
      const snapshots = [
        { stepIndex: 0, timeUnit: 0, activeUnit: 'P1' },
        { stepIndex: 1, timeUnit: 1, activeUnit: 'P2' }
      ];

      vi.useFakeTimers();
      const controller = new PlaybackController(snapshots, { speed: 1 });
      controller.play();
      expect(controller.getIsPlaying()).toBe(true);

      // destroy cleans up timers and resets state
      controller.destroy();
      expect(controller.getIsPlaying()).toBe(false);
      expect(controller.getTotalSteps()).toBe(0);

      vi.advanceTimersByTime(2000);
      // Ensure no state changes occurred after destroy
      expect(controller.getCurrentIndex()).toBe(0);

      vi.useRealTimers();
    });

    it('should reset playback when changing presets or resetting the form', () => {
      const { container } = createMockContainer();
      cpuView.mount(container);

      // Mock an active playback controller
      const mockDestroy = vi.fn();
      cpuView.playbackController = { destroy: mockDestroy };

      cpuView.clearResults();
      expect(mockDestroy).toHaveBeenCalledTimes(1);
      expect(cpuView.playbackController).toBeNull();
      expect(cpuView.currentResult).toBeNull();
    });

    it('should safely unmount and release resources', () => {
      const { container } = createMockContainer();
      cpuView.mount(container);

      const mockDestroy = vi.fn();
      cpuView.playbackController = { destroy: mockDestroy };

      cpuView.unmount();
      expect(mockDestroy).toHaveBeenCalledTimes(1);
      expect(cpuView.playbackController).toBeNull();
    });
  });
});
