import { describe, it, expect, beforeEach, vi } from 'vitest';
import { simulationRegistry } from '../../public/js/core/simulationRegistry.js';
import '../../public/js/engines/filesystem/index.js'; // Ensure filesystem engine is registered
import { filesystemView } from '../../public/js/views/filesystemView.js';

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

describe('Phase 7: File System View Controller Integration Tests', () => {
  it('should verify filesystem_simulator engine is registered in simulationRegistry', () => {
    expect(simulationRegistry.get('filesystem', 'filesystem_simulator')).toBeDefined();
  });

  it('should mount cleanly in a container and render form controls and tree/disk sections', () => {
    const { container } = createMockContainer();
    filesystemView.mount(container);

    expect(container.innerHTML).toContain('File System Simulator');
    expect(container.innerHTML).toContain('vfs-op-select');
    expect(container.innerHTML).toContain('vfs-path-input');
    expect(container.innerHTML).toContain('vfs-exec-btn');
    expect(container.innerHTML).toContain('vfs-reset-btn');
    expect(container.innerHTML).toContain('vfs-tree-container');
    expect(container.innerHTML).toContain('vfs-blockmap-container');
    expect(container.innerHTML).toContain('vfs-log-container');
  });

  it('should update form field displays dynamically based on operation', () => {
    const { container, elements } = createMockContainer();
    filesystemView.mount(container);

    // Test create op
    elements.get('#vfs-op-select').value = 'create';
    filesystemView.updateOperationFormFields();
    expect(elements.get('#vfs-size-group').style.display).toBe('block');
    expect(elements.get('#vfs-perm-group').style.display).toBe('block');

    // Test write op
    elements.get('#vfs-op-select').value = 'write';
    filesystemView.updateOperationFormFields();
    expect(elements.get('#vfs-size-group').style.display).toBe('block');
    expect(elements.get('#vfs-perm-group').style.display).toBe('none');

    // Test mkdir op
    elements.get('#vfs-op-select').value = 'mkdir';
    filesystemView.updateOperationFormFields();
    expect(elements.get('#vfs-size-group').style.display).toBe('none');
    expect(elements.get('#vfs-perm-group').style.display).toBe('block');
  });

  it('should execute operations via view controller and refresh playback', () => {
    const { container, elements } = createMockContainer();
    filesystemView.mount(container);

    // Create file
    container.querySelector('#vfs-op-select').value = 'create';
    container.querySelector('#vfs-path-input').value = '/hello.txt';
    container.querySelector('#vfs-size-input').value = '64';
    container.querySelector('#vfs-perm-select').value = 'rw-';

    filesystemView.executeSelectedOperation();

    expect(filesystemView.engine.resolvePath('/hello.txt').found).toBe(true);
    expect(filesystemView.playbackController.getTotalSteps()).toBeGreaterThanOrEqual(2);
  });

  it('should load presets correctly', () => {
    const { container } = createMockContainer();
    filesystemView.mount(container);

    filesystemView.loadPreset(1); // Empty File System
    expect(filesystemView.engine.nodes.size).toBe(1); // Only root
    expect(filesystemView.engine.calculateAllocationStats().allocatedBlocks).toBe(0);
  });

  it('should unmount cleanly and destroy playback instance', () => {
    const { container } = createMockContainer();
    filesystemView.mount(container);

    filesystemView.unmount();
    expect(filesystemView.playbackController).toBeNull();
    expect(filesystemView.selectedNode).toBeNull();
  });
});
