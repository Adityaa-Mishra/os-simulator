/**
 * public/js/os/apps/files/FileManager.js
 * Native AdityyaOS File Manager Application.
 * Full AdityyaFS directory navigation, file inspection, creation, renaming, and deletion.
 * Strictly operates through AdityyaOSAPI.fs; zero host filesystem access.
 */

import { PackagePermissions } from '../../packages/PackagePermissions.js';
import { escapeHtml } from '../../../utils/sanitize.js';

export class FileManager {
  /**
   * @param {import('../../api/AdityyaOSAPI.js').AdityyaOSAPI|Object} apiOrOptions
   * @param {HTMLElement} [container]
   * @param {Object} [options={}]
   */
  constructor(apiOrOptions, container = null, options = {}) {
    if (apiOrOptions && typeof apiOrOptions === 'object' && !apiOrOptions.fs && apiOrOptions.api) {
      this.api = apiOrOptions.api;
      this.container = apiOrOptions.container || container;
      this.options = apiOrOptions;
    } else {
      this.api = apiOrOptions;
      this.container = container;
      this.options = options;
    }

    this.currentPath = this.options.initialPath || '/home/user';
    this.selectedItem = null;
    this.viewMode = 'grid'; // 'grid' or 'list'
    this.cleanupListeners = [];

    if (this.container) {
      this.init();
    }
  }

  /**
   * Mount File Manager into a DOM container.
   * @param {HTMLElement} container
   */
  mount(container) {
    if (!container) return;
    this.container = container;
    this.init();
  }

  async init() {
    // Ensure currentPath exists; if not, fallback to /
    try {
      if (this.api?.fs && !this.api.fs.exists(this.currentPath)) {
        this.currentPath = '/';
      }
    } catch {
      this.currentPath = '/';
    }

    this.render();
    this.loadDirectory(this.currentPath);
  }

  render() {
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="os-files-app" role="region" aria-label="Files">
        <!-- Toolbar -->
        <div class="os-files-toolbar">
          <div class="os-files-nav-btns">
            <button class="os-files-btn" id="btn-up" title="Go up one directory (..)" aria-label="Up">⬆️ Up</button>
            <button class="os-files-btn" id="btn-refresh" title="Refresh directory" aria-label="Refresh">🔄</button>
          </div>
          <div class="os-files-breadcrumbs" id="files-breadcrumbs"></div>
          <div class="os-files-actions">
            <button class="os-files-btn" id="btn-new-folder" title="Create Directory (mkdir)">📁+ Folder</button>
            <button class="os-files-btn" id="btn-new-file" title="Create File">📄+ File</button>
            <button class="os-files-btn danger" id="btn-delete" title="Delete selected" disabled>🗑️</button>
            <button class="os-files-btn" id="btn-rename" title="Rename selected" disabled>✏️</button>
          </div>
        </div>

        <!-- Main Content: File Grid / List -->
        <div class="os-files-body">
          <div class="os-files-list ${this.viewMode === 'list' ? 'list-view' : 'grid-view'}" id="files-list" role="grid" aria-label="Directory contents"></div>
        </div>

        <!-- Status Bar -->
        <div class="os-files-statusbar" id="files-statusbar">
          <span id="status-count">0 items</span>
          <span id="status-selection">No selection</span>
          <span id="status-msg" class="os-files-msg" style="display: none;"></span>
        </div>
      </div>
    `;

    this.bindEvents();
  }

  bindEvents() {
    const btnUp = this.container?.querySelector('#btn-up');
    const btnRefresh = this.container?.querySelector('#btn-refresh');
    const btnNewFolder = this.container?.querySelector('#btn-new-folder');
    const btnNewFile = this.container?.querySelector('#btn-new-file');
    const btnDelete = this.container?.querySelector('#btn-delete');
    const btnRename = this.container?.querySelector('#btn-rename');

    const onUp = () => this.navigateUp();
    const onRefresh = () => this.loadDirectory(this.currentPath);
    const onNewFolder = () => this.promptNewFolder();
    const onNewFile = () => this.promptNewFile();
    const onDelete = () => this.deleteSelected();
    const onRename = () => this.promptRename();

    btnUp?.addEventListener('click', onUp);
    btnRefresh?.addEventListener('click', onRefresh);
    btnNewFolder?.addEventListener('click', onNewFolder);
    btnNewFile?.addEventListener('click', onNewFile);
    btnDelete?.addEventListener('click', onDelete);
    btnRename?.addEventListener('click', onRename);

    this.cleanupListeners.push(() => {
      btnUp?.removeEventListener('click', onUp);
      btnRefresh?.removeEventListener('click', onRefresh);
      btnNewFolder?.removeEventListener('click', onNewFolder);
      btnNewFile?.removeEventListener('click', onNewFile);
      btnDelete?.removeEventListener('click', onDelete);
      btnRename?.removeEventListener('click', onRename);
    });
  }

  loadDirectory(path) {
    if (!this.api?.fs) {
      const listEl = this.container?.querySelector('#files-list');
      if (listEl) {
        listEl.innerHTML = `<div class="os-files-error">Filesystem API unavailable</div>`;
      }
      return;
    }

    try {
      const entries = this.api.fs.listDirectory(path);
      this.currentPath = path;
      this.selectedItem = null;
      this.updateBreadcrumbs();
      this.renderEntries(entries);
      this.updateSelectionState();
    } catch (err) {
      const listEl = this.container?.querySelector('#files-list');
      if (listEl) {
        listEl.innerHTML = `<div class="os-files-error">Failed to list "${escapeHtml(path)}": ${escapeHtml(err.message)}</div>`;
      }
    }
  }

  updateBreadcrumbs() {
    const bcEl = this.container?.querySelector('#files-breadcrumbs');
    if (!bcEl) return;

    const parts = this.currentPath.split('/').filter(Boolean);
    let accum = '';
    const breadcrumbs = [{ name: 'root', path: '/' }];

    for (const part of parts) {
      accum += `/${part}`;
      breadcrumbs.push({ name: part, path: accum });
    }

    bcEl.innerHTML = breadcrumbs.map((b, idx) => `
      <span class="os-bc-segment ${idx === breadcrumbs.length - 1 ? 'active' : ''}" data-path="${escapeHtml(b.path)}">
        ${escapeHtml(b.name)}
      </span>
      ${idx < breadcrumbs.length - 1 ? '<span class="os-bc-sep">/</span>' : ''}
    `).join('');

    bcEl.querySelectorAll('.os-bc-segment').forEach(seg => {
      seg.addEventListener('click', () => {
        const p = seg.getAttribute('data-path');
        if (p) this.loadDirectory(p);
      });
    });
  }

  renderEntries(entries) {
    const listEl = this.container?.querySelector('#files-list');
    const countEl = this.container?.querySelector('#status-count');
    if (!listEl) return;

    if (!entries || entries.length === 0) {
      listEl.innerHTML = '<div class="os-files-empty">This directory is empty.</div>';
      if (countEl) countEl.textContent = '0 items';
      return;
    }

    // Sort: directories first, then alphabetically
    const sorted = [...entries].sort((a, b) => {
      if (a.type === 'directory' && b.type !== 'directory') return -1;
      if (a.type !== 'directory' && b.type === 'directory') return 1;
      return a.name.localeCompare(b.name);
    });

    if (countEl) countEl.textContent = `${sorted.length} item${sorted.length === 1 ? '' : 's'}`;

    listEl.innerHTML = sorted.map(item => {
      const isDir = item.type === 'directory';
      const icon = isDir ? '📁' : this.getFileIcon(item.name);
      return `
        <div class="os-files-item" data-name="${escapeHtml(item.name)}" data-type="${escapeHtml(item.type)}" tabindex="0" title="${escapeHtml(item.name)}">
          <span class="os-files-item-icon">${icon}</span>
          <span class="os-files-item-name">${escapeHtml(item.name)}</span>
          <span class="os-files-item-meta">${isDir ? 'Folder' : this.formatSize(item.size)}</span>
        </div>
      `;
    }).join('');

    listEl.querySelectorAll('.os-files-item').forEach(el => {
      const name = el.getAttribute('data-name');
      const type = el.getAttribute('data-type');
      const item = sorted.find(s => s.name === name);

      el.addEventListener('click', () => {
        listEl.querySelectorAll('.os-files-item').forEach(i => i.classList.remove('selected'));
        el.classList.add('selected');
        this.selectedItem = item;
        this.updateSelectionState();
      });

      el.addEventListener('dblclick', () => {
        if (type === 'directory') {
          const nextPath = this.currentPath === '/' ? `/${name}` : `${this.currentPath}/${name}`;
          this.loadDirectory(nextPath);
        } else {
          this.openFile(item);
        }
      });
    });
  }

  updateSelectionState() {
    const btnDelete = this.container?.querySelector('#btn-delete');
    const btnRename = this.container?.querySelector('#btn-rename');
    const selEl = this.container?.querySelector('#status-selection');

    if (this.selectedItem) {
      btnDelete?.removeAttribute('disabled');
      btnRename?.removeAttribute('disabled');
      if (selEl) selEl.textContent = `${this.selectedItem.name} (${this.selectedItem.type})`;
    } else {
      btnDelete?.setAttribute('disabled', 'true');
      btnRename?.setAttribute('disabled', 'true');
      if (selEl) selEl.textContent = 'No selection';
    }
  }

  navigateUp() {
    if (this.currentPath === '/') return;
    const parts = this.currentPath.split('/').filter(Boolean);
    parts.pop();
    const upPath = parts.length === 0 ? '/' : `/${parts.join('/')}`;
    this.loadDirectory(upPath);
  }

  getFileIcon(filename) {
    const ext = filename.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'png':
      case 'jpg':
      case 'jpeg':
      case 'svg':
      case 'gif':
      case 'webp':
        return '🖼️';
      case 'txt':
      case 'md':
      case 'doc':
        return '📄';
      case 'js':
      case 'json':
      case 'html':
      case 'css':
        return '📜';
      default:
        return '📄';
    }
  }

  formatSize(bytes) {
    if (typeof bytes !== 'number' || bytes === 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  openFile(item) {
    const fullPath = this.currentPath === '/' ? `/${item.name}` : `${this.currentPath}/${item.name}`;
    const ext = item.name.split('.').pop()?.toLowerCase();

    // Launch appropriate viewer / editor
    if (['png', 'jpg', 'jpeg', 'svg', 'gif', 'webp'].includes(ext)) {
      if (this.api?.app?._runtime) {
        this.api.app._runtime.launch('image-viewer', { filePath: fullPath });
      } else if (this.api?.window?.create) {
        this.api.window.create({ appId: 'image-viewer', filePath: fullPath });
      } else if (typeof this.options?.onOpenFile === 'function') {
        this.options.onOpenFile(fullPath, 'image-viewer');
      }
    } else {
      // Open in Text Editor
      if (this.api?.app?._runtime) {
        this.api.app._runtime.launch('text-editor', { filePath: fullPath });
      } else if (this.api?.window?.create) {
        this.api.window.create({ appId: 'text-editor', filePath: fullPath });
      } else if (typeof this.options?.onOpenFile === 'function') {
        this.options.onOpenFile(fullPath, 'text-editor');
      }
    }
  }

  promptNewFolder() {
    const folderName = typeof window !== 'undefined' && window.prompt
      ? window.prompt('Enter folder name (mkdir):')
      : null;
    if (!folderName || !folderName.trim()) return;

    const fullPath = this.currentPath === '/' ? `/${folderName.trim()}` : `${this.currentPath}/${folderName.trim()}`;
    try {
      this.api.fs.createDirectory(fullPath);
      this.loadDirectory(this.currentPath);
      this.showMessage(`Created folder "${folderName.trim()}"`);
    } catch (err) {
      this.showMessage(`Failed to create folder: ${err.message}`, true);
      if (typeof window !== 'undefined' && window.alert) {
        window.alert(`Failed to create folder: ${err.message}`);
      }
    }
  }

  promptNewFile() {
    const fileName = typeof window !== 'undefined' && window.prompt
      ? window.prompt('Enter file name:')
      : null;
    if (!fileName || !fileName.trim()) return;

    const fullPath = this.currentPath === '/' ? `/${fileName.trim()}` : `${this.currentPath}/${fileName.trim()}`;
    try {
      this.api.fs.createFile(fullPath);
      this.loadDirectory(this.currentPath);
      this.showMessage(`Created file "${fileName.trim()}"`);
    } catch (err) {
      this.showMessage(`Failed to create file: ${err.message}`, true);
      if (typeof window !== 'undefined' && window.alert) {
        window.alert(`Failed to create file: ${err.message}`);
      }
    }
  }

  deleteSelected() {
    if (!this.selectedItem) return;
    const confirm = typeof window !== 'undefined' && window.confirm
      ? window.confirm(`Are you sure you want to delete "${this.selectedItem.name}"?`)
      : true;
    if (!confirm) return;

    const fullPath = this.currentPath === '/' ? `/${this.selectedItem.name}` : `${this.currentPath}/${this.selectedItem.name}`;
    try {
      if (this.selectedItem.type === 'directory') {
        this.api.fs.deleteDirectory(fullPath, { recursive: true });
      } else {
        this.api.fs.deleteFile(fullPath);
      }
      this.loadDirectory(this.currentPath);
      this.showMessage(`Deleted "${this.selectedItem.name}"`);
    } catch (err) {
      this.showMessage(`Failed to delete: ${err.message}`, true);
      if (typeof window !== 'undefined' && window.alert) {
        window.alert(`Failed to delete: ${err.message}`);
      }
    }
  }

  promptRename() {
    if (!this.selectedItem) return;
    const newName = typeof window !== 'undefined' && window.prompt
      ? window.prompt(`Rename "${this.selectedItem.name}" to:`, this.selectedItem.name)
      : null;
    if (!newName || !newName.trim() || newName.trim() === this.selectedItem.name) return;

    const oldPath = this.currentPath === '/' ? `/${this.selectedItem.name}` : `${this.currentPath}/${this.selectedItem.name}`;
    const newPath = this.currentPath === '/' ? `/${newName.trim()}` : `${this.currentPath}/${newName.trim()}`;

    try {
      this.api.fs.rename(oldPath, newPath);
      this.loadDirectory(this.currentPath);
      this.showMessage(`Renamed to "${newName.trim()}"`);
    } catch (err) {
      this.showMessage(`Failed to rename: ${err.message}`, true);
      if (typeof window !== 'undefined' && window.alert) {
        window.alert(`Failed to rename: ${err.message}`);
      }
    }
  }

  showMessage(msg, isError = false) {
    const msgEl = this.container?.querySelector('#status-msg');
    if (!msgEl) return;
    msgEl.textContent = msg;
    msgEl.style.display = 'inline';
    msgEl.style.color = isError ? '#f87171' : '#4ade80';
    setTimeout(() => {
      if (msgEl) msgEl.style.display = 'none';
    }, 3000);
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

// Alias for backward compatibility
export const FilesApp = FileManager;

/**
 * Standard AdityyaOS Application Definition for Files.
 */
export const filesApp = Object.freeze({
  id: 'files',
  name: 'Files',
  version: '1.0.0',
  description: 'Virtual File System & Directory Explorer',
  icon: '📁',
  category: 'System',
  permissions: Object.freeze([
    PackagePermissions.FILESYSTEM_READ,
    PackagePermissions.FILESYSTEM_WRITE,
    PackagePermissions.WINDOW_CONTROL,
    PackagePermissions.APPLICATION_LIFECYCLE
  ]),
  window: Object.freeze({
    title: 'Files',
    icon: '📁',
    width: 680,
    height: 460,
    singleton: true
  }),
  entry: (api, container, options) => {
    const app = new FileManager(api, container, options);
    return {
      destroy: () => app.destroy()
    };
  }
});

export const fileManagerApp = Object.freeze({
  ...filesApp,
  id: 'file-manager'
});
