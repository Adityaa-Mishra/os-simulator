/**
 * Window
 * DOM rendering and pointer interaction layer for an OS window.
 * Strictly acts as a view/interaction controller; all authoritative state mutations
 * are delegated to WindowManager.
 */

import { WindowState } from './WindowState.js';
import { escapeHtml } from '../../utils/sanitize.js';

export class Window {
  /**
   * @param {Object} options
   * @param {import('./WindowState.js').WindowModel} options.model
   * @param {import('./WindowManager.js').WindowManager} options.windowManager
   * @param {HTMLElement} options.container
   * @param {Object} [options.view]
   */
  constructor({ model, windowManager, container, view = null }) {
    this.model = model;
    this.windowManager = windowManager;
    this.container = container;
    this.view = view;

    this.element = null;
    this.titlebarEl = null;
    this.contentEl = null;
    this.maximizeBtn = null;

    // Active drag / resize cleanup tracking
    this.activePointerCleanup = null;

    this.render();
  }

  /**
   * Render the window DOM structure and attach interaction listeners.
   */
  render() {
    if (!this.container) return;

    this.element = document.createElement('div');
    this.element.className = 'os-window';
    this.element.setAttribute('data-window-id', this.model.id);
    this.element.setAttribute('role', 'dialog');
    this.element.setAttribute('aria-label', this.model.title);

    this.element.innerHTML = `
      <!-- Titlebar -->
      <div class="os-window-titlebar" role="toolbar" aria-label="Window Title Bar">
        <div class="os-window-title">
          <span class="os-window-icon" aria-hidden="true">${escapeHtml(this.model.icon)}</span>
          <span class="os-window-title-text">${escapeHtml(this.model.title)}</span>
        </div>
        <div class="os-window-controls" role="group" aria-label="Window Controls">
          <button class="os-window-control os-window-control-minimize" title="Minimize" aria-label="Minimize Window">
            <span>—</span>
          </button>
          <button class="os-window-control os-window-control-maximize" title="Maximize" aria-label="Maximize Window">
            <span>□</span>
          </button>
          <button class="os-window-control os-window-control-close" title="Close" aria-label="Close Window">
            <span>✕</span>
          </button>
        </div>
      </div>

      <!-- Window Content Container -->
      <div class="os-window-content" role="document"></div>

      <!-- 8 Resize Handles -->
      <div class="os-resize-handle n" data-handle="n"></div>
      <div class="os-resize-handle s" data-handle="s"></div>
      <div class="os-resize-handle e" data-handle="e"></div>
      <div class="os-resize-handle w" data-handle="w"></div>
      <div class="os-resize-handle ne" data-handle="ne"></div>
      <div class="os-resize-handle nw" data-handle="nw"></div>
      <div class="os-resize-handle se" data-handle="se"></div>
      <div class="os-resize-handle sw" data-handle="sw"></div>
    `;

    this.titlebarEl = this.element.querySelector('.os-window-titlebar');
    this.contentEl = this.element.querySelector('.os-window-content');
    this.maximizeBtn = this.element.querySelector('.os-window-control-maximize');

    this.bindWindowEvents();
    this.syncState();

    if (this.view) {
      this.mountContent(this.view);
    }

    this.container.appendChild(this.element);
  }

  /**
   * Bind titlebar dragging, control buttons, and resizing.
   */
  bindWindowEvents() {
    // Click window to focus
    this.element.addEventListener('mousedown', () => {
      if (!this.model.focused) {
        this.windowManager.focusWindow(this.model.id);
      }
    });

    // Control buttons
    const minBtn = this.element.querySelector('.os-window-control-minimize');
    minBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.windowManager.minimizeWindow(this.model.id);
    });

    this.maximizeBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.model.state === WindowState.MAXIMIZED) {
        this.windowManager.restoreWindow(this.model.id);
      } else {
        this.windowManager.maximizeWindow(this.model.id);
      }
    });

    const closeBtn = this.element.querySelector('.os-window-control-close');
    closeBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.windowManager.closeWindow(this.model.id);
    });

    // Titlebar double click to toggle maximize/restore
    this.titlebarEl?.addEventListener('dblclick', (e) => {
      if (e.target.closest('.os-window-controls')) return;
      if (this.model.state === WindowState.MAXIMIZED) {
        this.windowManager.restoreWindow(this.model.id);
      } else {
        this.windowManager.maximizeWindow(this.model.id);
      }
    });

    // Titlebar dragging
    this.titlebarEl?.addEventListener('mousedown', (e) => {
      if (e.target.closest('.os-window-controls')) return;
      if (this.model.state === WindowState.MAXIMIZED) return; // Cannot drag while maximized

      this.windowManager.focusWindow(this.model.id);
      this.initiateDrag(e);
    });

    // Resizing handles
    this.element.querySelectorAll('.os-resize-handle').forEach(handle => {
      handle.addEventListener('mousedown', (e) => {
        if (this.model.state === WindowState.MAXIMIZED) return; // Cannot resize while maximized
        e.stopPropagation();
        e.preventDefault();
        this.windowManager.focusWindow(this.model.id);
        const direction = handle.getAttribute('data-handle');
        this.initiateResize(e, direction);
      });
    });
  }

  /**
   * Initiate titlebar mouse drag.
   * @param {MouseEvent} e
   */
  initiateDrag(e) {
    this.cleanupPointerInteraction();

    const startX = e.clientX;
    const startY = e.clientY;
    const initialWindowX = this.model.x;
    const initialWindowY = this.model.y;

    this.element.classList.add('dragging');

    const onMouseMove = (moveEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;
      this.windowManager.moveWindow(this.model.id, initialWindowX + deltaX, initialWindowY + deltaY);
    };

    const onMouseUp = () => {
      this.cleanupPointerInteraction();
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    this.activePointerCleanup = () => {
      this.element?.classList.remove('dragging');
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      this.activePointerCleanup = null;
    };
  }

  /**
   * Initiate edge / corner mouse resize.
   * @param {MouseEvent} e
   * @param {string} direction - 'n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'
   */
  initiateResize(e, direction) {
    this.cleanupPointerInteraction();

    const startX = e.clientX;
    const startY = e.clientY;
    const initialX = this.model.x;
    const initialY = this.model.y;
    const initialWidth = this.model.width;
    const initialHeight = this.model.height;

    this.element.classList.add('resizing');

    const onMouseMove = (moveEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;

      let newWidth = initialWidth;
      let newHeight = initialHeight;
      let newX = initialX;
      let newY = initialY;

      // Horizontal resize
      if (direction.includes('e')) {
        newWidth = initialWidth + deltaX;
      } else if (direction.includes('w')) {
        const potentialWidth = initialWidth - deltaX;
        if (potentialWidth >= this.model.minWidth) {
          newWidth = potentialWidth;
          newX = initialX + deltaX;
        } else {
          newWidth = this.model.minWidth;
          newX = initialX + (initialWidth - this.model.minWidth);
        }
      }

      // Vertical resize
      if (direction.includes('s')) {
        newHeight = initialHeight + deltaY;
      } else if (direction.includes('n')) {
        const potentialHeight = initialHeight - deltaY;
        if (potentialHeight >= this.model.minHeight) {
          newHeight = potentialHeight;
          newY = initialY + deltaY;
        } else {
          newHeight = this.model.minHeight;
          newY = initialY + (initialHeight - this.model.minHeight);
        }
      }

      this.windowManager.resizeWindow(this.model.id, newWidth, newHeight, newX, newY);
    };

    const onMouseUp = () => {
      this.cleanupPointerInteraction();
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    this.activePointerCleanup = () => {
      this.element?.classList.remove('resizing');
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      this.activePointerCleanup = null;
    };
  }

  /**
   * Safely clean up any active drag or resize pointer listeners.
   */
  cleanupPointerInteraction() {
    if (typeof this.activePointerCleanup === 'function') {
      this.activePointerCleanup();
    }
  }

  /**
   * Mount application view inside content container.
   * @param {Object} view
   */
  mountContent(view) {
    this.view = view;
    if (!this.contentEl) return;

    if (view && typeof view.mount === 'function') {
      view.mount(this.contentEl);
    } else if (view instanceof HTMLElement) {
      this.contentEl.innerHTML = '';
      this.contentEl.appendChild(view);
    }
  }

  /**
   * Synchronize DOM presentation from authoritative WindowModel state.
   */
  syncState() {
    if (!this.element) return;

    // Visibility & display
    if (this.model.state === WindowState.MINIMIZED || !this.model.visible) {
      this.element.style.display = 'none';
      this.element.classList.add('minimized');
    } else {
      this.element.style.display = 'flex';
      this.element.classList.remove('minimized');
    }

    // Geometry & position
    if (this.model.state === WindowState.MAXIMIZED) {
      this.element.classList.add('maximized');
      this.element.style.left = '0px';
      this.element.style.top = '0px';
      this.element.style.width = '100%';
      this.element.style.height = '100%';
      if (this.maximizeBtn) {
        this.maximizeBtn.innerHTML = '<span>❐</span>';
        this.maximizeBtn.setAttribute('title', 'Restore');
      }
    } else {
      this.element.classList.remove('maximized');
      this.element.style.left = `${Math.round(this.model.x)}px`;
      this.element.style.top = `${Math.round(this.model.y)}px`;
      this.element.style.width = `${Math.round(this.model.width)}px`;
      this.element.style.height = `${Math.round(this.model.height)}px`;
      if (this.maximizeBtn) {
        this.maximizeBtn.innerHTML = '<span>□</span>';
        this.maximizeBtn.setAttribute('title', 'Maximize');
      }
    }

    // Stacking & focus
    this.element.style.zIndex = String(this.model.zIndex);
    if (this.model.focused) {
      this.element.classList.add('focused');
    } else {
      this.element.classList.remove('focused');
    }
  }

  /**
   * Destroy the window element, remove listeners, and unmount view.
   */
  destroy() {
    this.cleanupPointerInteraction();

    if (this.view && typeof this.view.unmount === 'function') {
      try {
        this.view.unmount();
      } catch (err) {
        console.error('[Window] Error unmounting view:', err);
      }
    }

    if (this.element && this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }

    this.element = null;
    this.titlebarEl = null;
    this.contentEl = null;
    this.maximizeBtn = null;
    this.container = null;
    this.view = null;
  }
}
