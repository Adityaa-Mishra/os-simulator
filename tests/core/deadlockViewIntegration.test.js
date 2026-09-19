import { describe, it, expect, beforeEach, vi } from 'vitest';
import { simulationRegistry } from '../../public/js/core/simulationRegistry.js';
import '../../public/js/engines/deadlock/index.js'; // Ensure deadlock engines are registered
import { deadlockView } from '../../public/js/views/deadlockView.js';

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
      if (!elements.has(sel)) {
        elements.set(sel, {
          style: {},
          dataset: {},
          value: '',
          textContent: '',
          innerHTML: '',
          className: '',
          classList: {
            add: vi.fn(),
            remove: vi.fn(),
            contains: () => false
          },
          addEventListener: vi.fn(),
          closest: () => ({ dataset: { index: '0' } }),
          querySelectorAll: () => [],
          appendChild: vi.fn(),
          remove: vi.fn()
        });
      }
      return elements.get(sel);
    },
    querySelectorAll: (sel) => {
      return [];
    }
  };

  return { container, elements };
}

describe('Phase 6: Deadlock View Controller Integration Tests', () => {
  it('should verify both Banker safety and request engines are in simulationRegistry', () => {
    expect(simulationRegistry.get('deadlock', 'deadlock_bankers_safety')).toBeDefined();
    expect(simulationRegistry.get('deadlock', 'deadlock_bankers_request')).toBeDefined();
  });

  it('should mount cleanly in a container and render tabs and form controls', () => {
    const { container } = createMockContainer();
    deadlockView.mount(container);

    expect(container.innerHTML).toContain('Deadlock Management Simulator');
    expect(container.innerHTML).toContain('deadlock-tab-btn');
    expect(container.innerHTML).toContain('deadlock-procs-input');
    expect(container.innerHTML).toContain('deadlock-avail-input');
    expect(container.innerHTML).toContain('deadlock-max-input');
    expect(container.innerHTML).toContain('deadlock-alloc-input');
    expect(container.innerHTML).toContain('pane-safety');
    expect(container.innerHTML).toContain('pane-request');
    expect(container.innerHTML).toContain('pane-rag');
  });

  it('should parse matrix and vector inputs correctly', () => {
    const { container, elements } = createMockContainer();
    deadlockView.mount(container);

    // Mock input values
    elements.get('#deadlock-procs-input').value = 'P0, P1, P2';
    elements.get('#deadlock-avail-input').value = '3, 3, 2';
    elements.get('#deadlock-max-input').value = '7, 5, 3\n3, 2, 2\n9, 0, 2';
    elements.get('#deadlock-alloc-input').value = '0, 1, 0\n2, 0, 0\n3, 0, 2';

    const parsed = deadlockView.parseInputs();
    expect(parsed.processes).toEqual(['P0', 'P1', 'P2']);
    expect(parsed.available).toEqual([3, 3, 2]);
    expect(parsed.max).toEqual([
      [7, 5, 3],
      [3, 2, 2],
      [9, 0, 2]
    ]);
    expect(parsed.allocation).toEqual([
      [0, 1, 0],
      [2, 0, 0],
      [3, 0, 2]
    ]);
  });

  it('should switch tabs between safety, request, and rag', () => {
    const { container } = createMockContainer();
    deadlockView.mount(container);

    deadlockView.switchTab('request');
    expect(deadlockView.activeTab).toBe('request');

    deadlockView.switchTab('rag');
    expect(deadlockView.activeTab).toBe('rag');

    deadlockView.switchTab('safety');
    expect(deadlockView.activeTab).toBe('safety');
  });

  it('should unmount cleanly and destroy playback instance', () => {
    const { container } = createMockContainer();
    deadlockView.mount(container);

    deadlockView.unmount();
    expect(deadlockView.playbackController).toBeNull();
    expect(deadlockView.currentSafetyResult).toBeNull();
    expect(deadlockView.currentRequestResult).toBeNull();
  });
});
