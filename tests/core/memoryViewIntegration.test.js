import { describe, it, expect, beforeEach, vi } from 'vitest';
import { simulationRegistry } from '../../public/js/core/simulationRegistry.js';
import '../../public/js/engines/memory/index.js'; // Ensure allocation engines are registered
import '../../public/js/engines/memory/pageReplacement/index.js'; // Ensure PR engines are registered
import { memoryView } from '../../public/js/views/memoryView.js';

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

describe('Phase 4: Memory View Controller Integration Tests', () => {
  it('should verify all 6 memory engines are available in simulationRegistry', () => {
    expect(simulationRegistry.get('memory', 'memory_first_fit')).toBeDefined();
    expect(simulationRegistry.get('memory', 'memory_best_fit')).toBeDefined();
    expect(simulationRegistry.get('memory', 'memory_worst_fit')).toBeDefined();
    expect(simulationRegistry.get('page_replacement', 'page_replacement_fifo')).toBeDefined();
    expect(simulationRegistry.get('page_replacement', 'page_replacement_lru')).toBeDefined();
    expect(simulationRegistry.get('page_replacement', 'page_replacement_optimal')).toBeDefined();
  });

  it('should mount cleanly in a container with allocation tab active by default', () => {
    const { container } = createMockContainer();
    memoryView.mount(container);

    expect(container.innerHTML).toContain('Memory Allocation Simulator');
    expect(container.innerHTML).toContain('Page Replacement Simulator');
    expect(container.innerHTML).toContain('tab-btn-alloc');
    expect(container.innerHTML).toContain('tab-btn-pr');
  });

  it('should switch tabs between allocation and page replacement', () => {
    const { container } = createMockContainer();
    memoryView.mount(container);

    expect(memoryView.activeTab).toBe('allocation');

    memoryView.switchTab('page_replacement');
    expect(memoryView.activeTab).toBe('page_replacement');

    memoryView.switchTab('allocation');
    expect(memoryView.activeTab).toBe('allocation');
  });

  it('should parse comma and space-separated reference strings correctly', () => {
    expect(memoryView.parseReferenceString('7, 0, 1, 2')).toEqual([7, 0, 1, 2]);
    expect(memoryView.parseReferenceString('7 0 1 2')).toEqual([7, 0, 1, 2]);
    expect(memoryView.parseReferenceString('7,  0,  1 , 2')).toEqual([7, 0, 1, 2]);
    expect(memoryView.parseReferenceString('A, B, C')).toEqual(['A', 'B', 'C']);
    expect(memoryView.parseReferenceString('')).toEqual([]);
    expect(memoryView.parseReferenceString(null)).toEqual([]);
  });

  it('should unmount cleanly and destroy playback instances', () => {
    const { container } = createMockContainer();
    memoryView.mount(container);

    memoryView.unmount();
    expect(memoryView.allocPlayback).toBeNull();
    expect(memoryView.prPlayback).toBeNull();
  });
});
