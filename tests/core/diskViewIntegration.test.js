import { describe, it, expect, beforeEach, vi } from 'vitest';
import { simulationRegistry } from '../../public/js/core/simulationRegistry.js';
import '../../public/js/engines/disk/index.js'; // Ensure disk engines are registered
import { diskView } from '../../public/js/views/diskView.js';

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

describe('Phase 5: Disk View Controller Integration Tests', () => {
  it('should verify all 6 disk scheduling engines are available in simulationRegistry', () => {
    expect(simulationRegistry.get('disk', 'disk_fcfs')).toBeDefined();
    expect(simulationRegistry.get('disk', 'disk_sstf')).toBeDefined();
    expect(simulationRegistry.get('disk', 'disk_scan')).toBeDefined();
    expect(simulationRegistry.get('disk', 'disk_cscan')).toBeDefined();
    expect(simulationRegistry.get('disk', 'disk_look')).toBeDefined();
    expect(simulationRegistry.get('disk', 'disk_clook')).toBeDefined();
  });

  it('should mount cleanly in a container and render form controls', () => {
    const { container } = createMockContainer();
    diskView.mount(container);

    expect(container.innerHTML).toContain('Disk Scheduling Simulator');
    expect(container.innerHTML).toContain('disk-algo-select');
    expect(container.innerHTML).toContain('disk-requests-input');
    expect(container.innerHTML).toContain('disk-head-input');
    expect(container.innerHTML).toContain('run-disk-btn');
  });

  it('should parse comma and space-separated request strings correctly', () => {
    expect(diskView.parseRequests('98, 183, 37, 122')).toEqual([98, 183, 37, 122]);
    expect(diskView.parseRequests('98 183 37 122')).toEqual([98, 183, 37, 122]);
    expect(diskView.parseRequests('98,  183 , 37')).toEqual([98, 183, 37]);
    expect(diskView.parseRequests('')).toEqual([]);
    expect(diskView.parseRequests(null)).toEqual([]);
  });

  it('should unmount cleanly and destroy playback instance', () => {
    const { container } = createMockContainer();
    diskView.mount(container);

    diskView.unmount();
    expect(diskView.playbackController).toBeNull();
  });
});
