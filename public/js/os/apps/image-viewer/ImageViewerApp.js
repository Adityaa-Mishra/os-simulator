/**
 * public/js/os/apps/image-viewer/ImageViewerApp.js
 * Native AdityyaOS Image Viewer Application.
 * Safely renders supported image data from AdityyaFS (data URLs, SVG, base64).
 * Strictly displays a controlled unsupported-format state when data is not a recognized image.
 */

import { PackagePermissions } from '../../packages/PackagePermissions.js';
import { escapeHtml } from '../../../utils/sanitize.js';

export class ImageViewerApp {
  /**
   * @param {import('../../api/AdityyaOSAPI.js').AdityyaOSAPI} api
   * @param {HTMLElement} container
   * @param {Object} [options={}]
   */
  constructor(api, container, options = {}) {
    this.api = api;
    this.container = container;
    this.options = options;

    this.currentFilePath = options.filePath || null;
    this.currentSrc = null;
    this.unsupportedMsg = null;
    this.currentFileSize = null;
    this.zoom = 1.0;
    this.cleanupListeners = [];

    this.init();
  }

  async init() {
    this.render();
    if (this.currentFilePath) {
      this.loadImage(this.currentFilePath);
    }
  }

  render() {
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="os-image-viewer-app" role="region" aria-label="Image Viewer">
        <!-- Toolbar -->
        <div class="os-iv-toolbar">
          <button class="os-iv-btn" id="btn-open-img">📂 Open</button>
          <button class="os-iv-btn" id="btn-zoom-in" title="Zoom in">🔍+</button>
          <button class="os-iv-btn" id="btn-zoom-out" title="Zoom out">🔍−</button>
          <button class="os-iv-btn" id="btn-zoom-reset" title="Reset zoom (100%)">1:1</button>
          <button class="os-iv-btn" id="btn-fit" title="Fit to window">⛶ Fit</button>
          <span class="os-iv-zoom-label" id="zoom-label">${Math.round(this.zoom * 100)}%</span>
          <span class="os-iv-path" id="img-path">${escapeHtml(this.currentFilePath || 'No image loaded')}</span>
        </div>

        <!-- Viewport -->
        <div class="os-iv-viewport" id="iv-viewport">
          <div class="os-iv-placeholder" id="iv-placeholder" style="${this.currentSrc || this.unsupportedMsg ? 'display: none;' : ''}">
            <span>🖼️</span>
            <p>No image loaded. Click "Open" to load an image from AdityyaFS.</p>
          </div>
          <img class="os-iv-img" id="iv-img" src="${this.currentSrc ? this.currentSrc : ''}" style="${this.currentSrc ? `display: block; transform: scale(${this.zoom});` : 'display: none;'}" alt="Viewer image" />
          <div class="os-iv-unsupported" id="iv-unsupported" style="${this.unsupportedMsg ? 'display: block;' : 'display: none;'}">
            <span>⚠️</span>
            <p><strong>Unsupported Format</strong></p>
            <p>${escapeHtml(this.unsupportedMsg || 'This file does not contain supported image data (data URL, SVG, or base64).')}</p>
          </div>
        </div>

        <!-- Status Bar -->
        <div class="os-iv-statusbar">
          <span id="img-dimensions">— × —</span>
          <span id="img-size">${this.currentFileSize || '—'}</span>
        </div>
      </div>
    `;

    this.bindEvents();
  }

  bindEvents() {
    const btnOpen = this.container.querySelector('#btn-open-img');
    const btnZoomIn = this.container.querySelector('#btn-zoom-in');
    const btnZoomOut = this.container.querySelector('#btn-zoom-out');
    const btnZoomReset = this.container.querySelector('#btn-zoom-reset');
    const btnFit = this.container.querySelector('#btn-fit');
    const img = this.container.querySelector('#iv-img');

    const onOpen = () => this.promptOpenImage();
    const onZoomIn = () => this.setZoom(this.zoom + 0.25);
    const onZoomOut = () => this.setZoom(Math.max(0.25, this.zoom - 0.25));
    const onZoomReset = () => this.setZoom(1.0);
    const onFit = () => this.fitToWindow();

    btnOpen?.addEventListener('click', onOpen);
    btnZoomIn?.addEventListener('click', onZoomIn);
    btnZoomOut?.addEventListener('click', onZoomOut);
    btnZoomReset?.addEventListener('click', onZoomReset);
    btnFit?.addEventListener('click', onFit);

    if (img) {
      img.addEventListener('load', () => this.onImageLoaded());
      img.addEventListener('error', () => this.showUnsupported('Image decoding failed'));
    }

    this.cleanupListeners.push(() => {
      btnOpen?.removeEventListener('click', onOpen);
      btnZoomIn?.removeEventListener('click', onZoomIn);
      btnZoomOut?.removeEventListener('click', onZoomOut);
      btnZoomReset?.removeEventListener('click', onZoomReset);
      btnFit?.removeEventListener('click', onFit);
    });
  }

  get currentPath() {
    return this.currentFilePath;
  }

  get zoomLevel() {
    return this.zoom;
  }

  zoomIn() {
    this.setZoom(this.zoom + 0.25);
  }

  zoomOut() {
    this.setZoom(Math.max(0.25, this.zoom - 0.25));
  }

  resetZoom() {
    this.setZoom(1.0);
  }

  promptOpenImage() {
    const path = typeof window !== 'undefined' && window.prompt ? window.prompt('Enter simulated AdityyaFS image path (e.g. /home/user/photo.png):', this.currentFilePath || '/home/user/') : null;
    if (!path || !path.trim()) return;
    this.loadImage(path.trim());
  }

  loadImage(path) {
    this.currentFilePath = path;

    try {
      const fileData = this.api.fs.readFile(path);
      const rawContent = typeof fileData === 'string' ? fileData : fileData?.content;

      if (!rawContent) {
        this.showUnsupported('File is empty');
        return;
      }

      let srcUrl = null;

      if (typeof rawContent === 'string') {
        const trimmed = rawContent.trim();
        if (trimmed.startsWith('data:image/')) {
          srcUrl = trimmed;
        } else if (trimmed.startsWith('<svg') || trimmed.includes('<svg')) {
          srcUrl = `data:image/svg+xml;utf8,${encodeURIComponent(trimmed)}`;
        } else if (/^[A-Za-z0-9+/=]+$/.test(trimmed) && trimmed.length > 50) {
          srcUrl = `data:image/png;base64,${trimmed}`;
        }
      }

      if (!srcUrl) {
        this.showUnsupported('Unrecognized image format');
        return;
      }

      this.currentSrc = srcUrl;
      this.unsupportedMsg = null;
      const sz = fileData.size || (typeof rawContent === 'string' ? rawContent.length : 0);
      this.currentFileSize = `${(sz / 1024).toFixed(1)} KB`;
      this.render();

      if (this.api.window) {
        const name = path.split('/').pop();
        this.api.window.setTitle(`${name} - Image Viewer`);
      }
    } catch (err) {
      this.showUnsupported(err.message);
    }
  }

  onImageLoaded() {
    const img = this.container?.querySelector('#iv-img');
    const dimEl = this.container?.querySelector('#img-dimensions');
    if (img && dimEl) {
      dimEl.textContent = `${img.naturalWidth || img.clientWidth} × ${img.naturalHeight || img.clientHeight}`;
    }
  }

  showUnsupported(msg) {
    this.currentSrc = null;
    this.unsupportedMsg = msg;
    this.render();
  }

  setZoom(z) {
    this.zoom = Math.max(0.1, Math.min(5.0, z));
    const img = this.container?.querySelector('#iv-img');
    const label = this.container?.querySelector('#zoom-label');

    if (img) {
      img.style.transform = `scale(${this.zoom})`;
      img.style.maxWidth = 'none';
      img.style.maxHeight = 'none';
    }
    if (label) {
      label.textContent = `${Math.round(this.zoom * 100)}%`;
    }
  }

  fitToWindow() {
    const img = this.container?.querySelector('#iv-img');
    const label = this.container?.querySelector('#zoom-label');

    if (img) {
      img.style.transform = 'none';
      img.style.maxWidth = '100%';
      img.style.maxHeight = '100%';
    }
    this.zoom = 1.0;
    if (label) label.textContent = 'Fit';
  }

  destroy() {
    for (const cleanup of this.cleanupListeners) {
      try { cleanup(); } catch {}
    }
    this.cleanupListeners = [];
    if (this.container) {
      this.container.innerHTML = '';
      this.container = null;
    }
  }
}

/**
 * Standard AdityyaOS Application Definition for Image Viewer.
 */
export const imageViewerApp = Object.freeze({
  id: 'image-viewer',
  name: 'Image Viewer',
  version: '1.0.0',
  description: 'AdityyaFS image data viewer',
  icon: '🖼️',
  category: 'Media',
  permissions: Object.freeze([
    PackagePermissions.FILESYSTEM_READ,
    PackagePermissions.WINDOW_CONTROL,
    PackagePermissions.APPLICATION_LIFECYCLE
  ]),
  window: Object.freeze({
    title: 'Image Viewer',
    icon: '🖼️',
    width: 640,
    height: 480,
    singleton: false
  }),
  entry: (api, container, options) => {
    const app = new ImageViewerApp(api, container, options);
    return {
      destroy: () => app.destroy()
    };
  }
});
