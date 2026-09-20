/**
 * public/js/os/apps/editor/TextEditor.js
 * Native AdityyaOS Text Editor Application.
 * General text document editor operating entirely through AdityyaFS.
 * Strictly adheres to security rules: zero host file pickers or host filesystem access.
 */

import { PackagePermissions } from '../../packages/PackagePermissions.js';
import { escapeHtml } from '../../../utils/sanitize.js';

export class TextEditor {
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

    this.currentFilePath = this.options.filePath || null;
    this._content = '';
    this.isDirty = false;
    this.cleanupListeners = [];

    if (this.container) {
      this.init();
    }
  }

  /**
   * Mount editor into a DOM container.
   * @param {HTMLElement} container
   */
  mount(container) {
    if (!container) return;
    this.container = container;
    this.init();
  }

  async init() {
    this.render();
    if (this.currentFilePath) {
      this.loadFile(this.currentFilePath);
    } else {
      this.updateTitle();
    }
  }

  render() {
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="os-editor-app os-text-editor-app" role="region" aria-label="Text Editor">
        <!-- Toolbar -->
        <div class="os-editor-toolbar">
          <button class="os-editor-btn" id="btn-new" title="Create a new document">📄 New</button>
          <button class="os-editor-btn" id="btn-open" title="Open document from AdityyaFS">📂 Open</button>
          <button class="os-editor-btn primary" id="btn-save" title="Save document to AdityyaFS">💾 Save</button>
          <button class="os-editor-btn" id="btn-save-as" title="Save document as...">💾 Save As...</button>
          <span class="os-editor-path" id="editor-path">${escapeHtml(this.currentFilePath || 'Untitled')}</span>
          <span class="os-editor-dirty" id="editor-dirty" style="display: none;">● Unsaved</span>
        </div>

        <!-- Editor Area -->
        <div class="os-editor-body">
          <textarea class="os-editor-textarea" id="editor-textarea" placeholder="Start typing..."></textarea>
        </div>

        <!-- Status Bar -->
        <div class="os-editor-statusbar">
          <span id="editor-lines">Lines: 1</span>
          <span id="editor-chars">Characters: 0</span>
          <span id="editor-msg" class="os-editor-msg" style="display: none;"></span>
        </div>
      </div>
    `;

    this.bindEvents();
  }

  bindEvents() {
    const btnNew = this.container?.querySelector('#btn-new');
    const btnOpen = this.container?.querySelector('#btn-open');
    const btnSave = this.container?.querySelector('#btn-save');
    const btnSaveAs = this.container?.querySelector('#btn-save-as');
    const textarea = this.container?.querySelector('#editor-textarea');

    const onNew = () => this.newFile();
    const onOpen = () => this.promptOpenFile();
    const onSave = () => this.saveFile();
    const onSaveAs = () => this.promptSaveAs();
    const onInput = (e) => {
      this._content = e?.target?.value ?? textarea?.value ?? '';
      this.isDirty = true;
      this.updateStatus();
    };

    btnNew?.addEventListener('click', onNew);
    btnOpen?.addEventListener('click', onOpen);
    btnSave?.addEventListener('click', onSave);
    btnSaveAs?.addEventListener('click', onSaveAs);
    textarea?.addEventListener('input', onInput);

    this.cleanupListeners.push(() => {
      btnNew?.removeEventListener('click', onNew);
      btnOpen?.removeEventListener('click', onOpen);
      btnSave?.removeEventListener('click', onSave);
      btnSaveAs?.removeEventListener('click', onSaveAs);
      textarea?.removeEventListener('input', onInput);
    });
  }

  get currentPath() {
    return this.currentFilePath;
  }

  get content() {
    if (this._content !== undefined && this._content !== null) return this._content;
    const textarea = this.container?.querySelector('#editor-textarea');
    return textarea ? textarea.value : '';
  }

  setContent(text) {
    this._content = text;
    const textarea = this.container?.querySelector('#editor-textarea');
    if (textarea) {
      textarea.value = text;
    }
    this.isDirty = true;
    this.updateStatus();
  }

  async openFile(path) {
    return this.loadFile(path);
  }

  loadFile(path) {
    if (!this.api?.fs) {
      this.showMessage(`Filesystem API unavailable`, true);
      return;
    }

    try {
      const fileData = this.api.fs.readFile(path);
      const content = typeof fileData === 'string' ? fileData : (typeof fileData?.content === 'string' ? fileData.content : '');

      this._content = content;
      const textarea = this.container?.querySelector('#editor-textarea');
      if (textarea) {
        textarea.value = content;
      }

      this.currentFilePath = path;
      this.isDirty = false;
      this.updateStatus();
      this.updateTitle();
      this.showMessage(`Opened "${path}"`);
    } catch (err) {
      // Graceful handling of non-existent files (ENOENT) or read errors
      const isEnoent = err?.code === 'ENOENT' || err?.message?.includes('ENOENT') || err?.message?.includes('not found');
      const errorMsg = isEnoent ? `File "${path}" does not exist (ENOENT)` : `Failed to open "${path}": ${err.message}`;
      this.showMessage(errorMsg, true);

      if (typeof window !== 'undefined' && window.alert) {
        window.alert(errorMsg);
      }
    }
  }

  newFile() {
    if (this.isDirty) {
      const ok = typeof window !== 'undefined' && window.confirm ? window.confirm('Discard unsaved changes?') : true;
      if (!ok) return;
    }

    this._content = '';
    const textarea = this.container?.querySelector('#editor-textarea');
    if (textarea) textarea.value = '';

    this.currentFilePath = null;
    this.isDirty = false;
    this.updateStatus();
    this.updateTitle();
    this.showMessage('New document created');
  }

  promptOpenFile() {
    if (this.isDirty) {
      const ok = typeof window !== 'undefined' && window.confirm ? window.confirm('Discard unsaved changes?') : true;
      if (!ok) return;
    }

    const path = typeof window !== 'undefined' && window.prompt
      ? window.prompt('Enter AdityyaFS file path to open (e.g. /home/user/document.txt):', this.currentFilePath || '/home/user/')
      : null;
    if (!path || !path.trim()) return;

    this.loadFile(path.trim());
  }

  async saveFile(customPath = null) {
    if (customPath) {
      this.currentFilePath = customPath;
    }

    if (!this.currentFilePath) {
      return this.promptSaveAs();
    }

    const textarea = this.container?.querySelector('#editor-textarea');
    const content = this._content !== undefined && this._content !== null ? this._content : (textarea?.value || '');

    if (!this.api?.fs) {
      this.showMessage('Filesystem API unavailable', true);
      return;
    }

    try {
      this.api.fs.writeFile(this.currentFilePath, content);
      this.isDirty = false;
      this.updateStatus();
      this.updateTitle();
      this.showMessage(`Saved "${this.currentFilePath}"`);
    } catch (err) {
      this.showMessage(`Failed to save file: ${err.message}`, true);
      if (typeof window !== 'undefined' && window.alert) {
        window.alert(`Failed to save file: ${err.message}`);
      }
    }
  }

  promptSaveAs() {
    const path = typeof window !== 'undefined' && window.prompt
      ? window.prompt('Save file as (AdityyaFS path):', this.currentFilePath || '/home/user/Untitled.txt')
      : null;
    if (!path || !path.trim()) return;

    this.currentFilePath = path.trim();
    this.saveFile();
  }

  showMessage(msg, isError = false) {
    const msgEl = this.container?.querySelector('#editor-msg');
    if (!msgEl) return;
    msgEl.textContent = msg;
    msgEl.style.display = 'inline';
    msgEl.style.color = isError ? '#f87171' : '#4ade80';
    setTimeout(() => {
      if (msgEl) msgEl.style.display = 'none';
    }, 3000);
  }

  updateStatus() {
    const textarea = this.container?.querySelector('#editor-textarea');
    const dirtyEl = this.container?.querySelector('#editor-dirty');
    const linesEl = this.container?.querySelector('#editor-lines');
    const charsEl = this.container?.querySelector('#editor-chars');
    const pathEl = this.container?.querySelector('#editor-path');

    const content = this._content !== undefined && this._content !== null ? this._content : (textarea?.value || '');
    const lineCount = content ? content.split('\n').length : 1;

    if (dirtyEl) dirtyEl.style.display = this.isDirty ? 'inline' : 'none';
    if (linesEl) linesEl.textContent = `Lines: ${lineCount}`;
    if (charsEl) charsEl.textContent = `Characters: ${content.length}`;
    if (pathEl) pathEl.textContent = this.currentFilePath || 'Untitled';
  }

  updateTitle() {
    if (this.api?.window) {
      const fileName = this.currentFilePath ? this.currentFilePath.split('/').pop() : 'Untitled';
      const title = this.isDirty ? `* ${fileName} - Text Editor` : `${fileName} - Text Editor`;
      this.api.window.setTitle(title);
    }
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
export const TextEditorApp = TextEditor;

/**
 * Standard AdityyaOS Application Definition for Text Editor.
 */
export const textEditorApp = Object.freeze({
  id: 'text-editor',
  name: 'Text Editor',
  version: '1.0.0',
  description: 'AdityyaFS text document editor',
  icon: '📝',
  category: 'Productivity',
  permissions: Object.freeze([
    PackagePermissions.FILESYSTEM_READ,
    PackagePermissions.FILESYSTEM_WRITE,
    PackagePermissions.WINDOW_CONTROL,
    PackagePermissions.APPLICATION_LIFECYCLE
  ]),
  window: Object.freeze({
    title: 'Text Editor',
    icon: '📝',
    width: 640,
    height: 460,
    singleton: false
  }),
  entry: (api, container, options) => {
    const app = new TextEditor(api, container, options);
    return {
      destroy: () => app.destroy()
    };
  }
});

export const editorApp = Object.freeze({
  ...textEditorApp,
  id: 'editor'
});
