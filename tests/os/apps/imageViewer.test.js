/**
 * tests/os/apps/imageViewer.test.js
 * Automated tests for native Image Viewer application.
 * Verifies image loading (SVG/data URLs), zoom controls, and unsupported format handling.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ImageViewerApp, imageViewerApp } from '../../../public/js/os/apps/image-viewer/ImageViewerApp.js';
import { Kernel } from '../../../public/js/os/kernel/Kernel.js';
import { APIContext } from '../../../public/js/os/api/APIContext.js';
import { AdityyaOSAPI } from '../../../public/js/os/api/AdityyaOSAPI.js';

function createMockElement(tag = 'div') {
  const el = {
    tagName: tag.toUpperCase(),
    style: {},
    dataset: {},
    value: '',
    textContent: '',
    _innerHTML: '',
    get innerHTML() { return this._innerHTML; },
    set innerHTML(val) {
      this._innerHTML = String(val);
      this._children = [];
    },
    className: '',
    classList: {
      _classes: new Set(),
      add: function (...cls) { cls.forEach(c => this._classes.add(c)); },
      remove: function (...cls) { cls.forEach(c => this._classes.delete(c)); },
      contains: function (c) { return this._classes.has(c); }
    },
    attributes: new Map(),
    setAttribute: function (name, val) { this.attributes.set(name, String(val)); },
    getAttribute: function (name) { return this.attributes.get(name) || null; },
    removeAttribute: function (name) { this.attributes.delete(name); },
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
      handlers.forEach(h => h(payload || { target: this, preventDefault: vi.fn(), stopPropagation: vi.fn() }));
    },
    querySelector: function (sel) {
      const dummy = createMockElement('div');
      dummy.className = sel.replace(/[#.\[\]="]/g, ' ').trim();
      return dummy;
    },
    querySelectorAll: function () {
      return [];
    },
    appendChild: function (child) { return child; },
    removeChild: function (child) { return child; },
    contains: function () { return true; },
    focus: vi.fn(),
    blur: vi.fn()
  };
  return el;
}

describe('Phase 23: Image Viewer Native Application', () => {
  let kernel;
  let context;
  let api;
  let container;

  beforeEach(() => {
    kernel = new Kernel();
    kernel.boot();
    container = createMockElement('div');
    context = new APIContext({
      appId: 'image-viewer',
      instanceId: 'iv-1',
      pid: 10,
      permissions: [...imageViewerApp.permissions]
    });
    api = new AdityyaOSAPI({ kernel, context });
  });

  afterEach(() => {
    kernel.shutdown();
  });

  it('conforms to standard Application Definition schema', () => {
    expect(imageViewerApp.id).toBe('image-viewer');
    expect(imageViewerApp.name).toBe('Image Viewer');
    expect(imageViewerApp.category).toBe('Media');
    expect(typeof imageViewerApp.entry).toBe('function');
    expect(imageViewerApp.permissions).toContain('filesystem.read');
    expect(imageViewerApp.permissions).toContain('window.control');
    expect(imageViewerApp.permissions).toContain('application.lifecycle');
    // Read-only: no filesystem.write
    expect(imageViewerApp.permissions).not.toContain('filesystem.write');
  });

  it('mounts with empty state when no image path is provided', () => {
    const app = new ImageViewerApp(api, container);
    expect(app.currentPath).toBeNull();
    expect(container.innerHTML).toContain('No image loaded');
    app.destroy();
  });

  it('loads and displays SVG images correctly', async () => {
    const svgData = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle cx="50" cy="50" r="40" fill="red"/></svg>';
    kernel.fileSystemManager.createFile('/home/user/circle.svg');
    kernel.fileSystemManager.writeFile('/home/user/circle.svg', svgData);

    const app = new ImageViewerApp(api, container);
    await app.loadImage('/home/user/circle.svg');

    expect(app.currentPath).toBe('/home/user/circle.svg');
    expect(container.innerHTML).toContain('data:image/svg+xml;utf8');
    app.destroy();
  });

  it('handles zoom controls (zoom in, zoom out, reset zoom)', () => {
    const app = new ImageViewerApp(api, container);
    expect(app.zoomLevel).toBe(1.0);

    app.zoomIn();
    expect(app.zoomLevel).toBeGreaterThan(1.0);

    app.zoomOut();
    app.zoomOut();
    expect(app.zoomLevel).toBeLessThan(1.0);

    app.resetZoom();
    expect(app.zoomLevel).toBe(1.0);
    app.destroy();
  });

  it('displays controlled unsupported format message for non-image content', async () => {
    kernel.fileSystemManager.createFile('/home/user/random.bin');
    kernel.fileSystemManager.writeFile('/home/user/random.bin', 'RAW_BINARY_DATA_NOT_IMAGE');

    const app = new ImageViewerApp(api, container);
    await app.loadImage('/home/user/random.bin');

    expect(container.innerHTML).toContain('Unsupported');
    app.destroy();
  });
});
