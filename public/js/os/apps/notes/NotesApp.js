/**
 * public/js/os/apps/notes/NotesApp.js
 * Native AdityyaOS Notes Application.
 * Manages text notes stored in /home/user/Notes/ in AdityyaFS.
 */

import { PackagePermissions } from '../../packages/PackagePermissions.js';
import { escapeHtml } from '../../../utils/sanitize.js';

export class NotesApp {
  /**
   * @param {import('../../api/AdityyaOSAPI.js').AdityyaOSAPI} api
   * @param {HTMLElement} container
   * @param {Object} [options={}]
   */
  constructor(api, container, options = {}) {
    this.api = api;
    this.container = container;
    this.options = options;

    this.notesDir = '/home/user/Notes';
    this.notes = [];
    this.activeNote = null; // { name, content }
    this.isDirty = false;
    this.cleanupListeners = [];

    this.init();
  }

  async init() {
    this.ensureNotesDirectory();
    this.render();
    this.loadNotesList();
  }

  ensureNotesDirectory() {
    try {
      if (!this.api?.fs) return;
      if (!this.api.fs.exists('/home')) {
        this.api.fs.createDirectory('/home');
      }
      if (!this.api.fs.exists('/home/user')) {
        this.api.fs.createDirectory('/home/user');
      }
      if (!this.api.fs.exists(this.notesDir)) {
        this.api.fs.createDirectory(this.notesDir);
      }
    } catch (err) {
      // Ignored if filesystem root or parent is not yet initialized
    }
  }

  render() {
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="os-notes-app" role="region" aria-label="Notes">
        <!-- Sidebar -->
        <div class="os-notes-sidebar">
          <div class="os-notes-sidebar-header">
            <span>Notes</span>
            <button class="os-notes-btn" id="btn-new-note" title="Create a new note">➕</button>
          </div>
          <div class="os-notes-list" id="notes-list" role="listbox"></div>
        </div>

        <!-- Main Editor -->
        <div class="os-notes-main">
          <div class="os-notes-toolbar">
            <input type="text" class="os-notes-title-input" id="note-title" placeholder="Note Title" />
            <div class="os-notes-actions">
              <span class="os-notes-dirty-indicator" id="notes-dirty" style="display: none;">● Unsaved</span>
              <button class="os-notes-btn primary" id="btn-save-note" title="Save note">💾 Save</button>
              <button class="os-notes-btn danger" id="btn-delete-note" title="Delete note">🗑️ Delete</button>
            </div>
          </div>
          <textarea class="os-notes-editor" id="note-editor" placeholder="Write your note here..."></textarea>
        </div>
      </div>
    `;

    this.bindEvents();
  }

  bindEvents() {
    const btnNew = this.container.querySelector('#btn-new-note');
    const btnSave = this.container.querySelector('#btn-save-note');
    const btnDelete = this.container.querySelector('#btn-delete-note');
    const titleInput = this.container.querySelector('#note-title');
    const editor = this.container.querySelector('#note-editor');

    const onNew = () => this.createNewNote();
    const onSave = () => this.saveActiveNote();
    const onDelete = () => this.deleteActiveNote();
    const onInput = () => this.markDirty();

    btnNew?.addEventListener('click', onNew);
    btnSave?.addEventListener('click', onSave);
    btnDelete?.addEventListener('click', onDelete);
    titleInput?.addEventListener('input', onInput);
    editor?.addEventListener('input', onInput);

    this.cleanupListeners.push(() => {
      btnNew?.removeEventListener('click', onNew);
      btnSave?.removeEventListener('click', onSave);
      btnDelete?.removeEventListener('click', onDelete);
      titleInput?.removeEventListener('input', onInput);
      editor?.removeEventListener('input', onInput);
    });
  }

  loadNotesList() {
    try {
      if (!this.api?.fs || !this.api.fs.exists(this.notesDir)) {
        this.notes = [];
        this.renderNotesList();
        return;
      }
      const entries = this.api.fs.listDirectory(this.notesDir);
      this.notes = entries.filter(e => e.type === 'file' && (e.name.endsWith('.txt') || e.name.endsWith('.md')));
      this.renderNotesList();

      if (this.notes.length > 0 && !this.activeNote) {
        this.openNote(this.notes[0].name);
      } else if (this.notes.length === 0) {
        this.createNewNote();
      }
    } catch (err) {
      console.error('[NotesApp] Error loading notes list:', err);
    }
  }

  renderNotesList() {
    const listEl = this.container?.querySelector('#notes-list');
    if (!listEl) return;

    if (this.notes.length === 0) {
      listEl.innerHTML = '<div class="os-notes-empty">No notes yet</div>';
      return;
    }

    listEl.innerHTML = this.notes.map(n => `
      <div class="os-notes-item ${this.activeNote?.name === n.name ? 'active' : ''}" data-name="${escapeHtml(n.name)}">
        <span class="os-notes-item-icon">📝</span>
        <span class="os-notes-item-title">${escapeHtml(n.name.replace(/\.(txt|md)$/, ''))}</span>
      </div>
    `).join('');

    listEl.querySelectorAll('.os-notes-item').forEach(el => {
      el.addEventListener('click', () => {
        const name = el.getAttribute('data-name');
        if (name && name !== this.activeNote?.name) {
          this.openNote(name);
        }
      });
    });
  }

  openNote(name) {
    if (this.isDirty) {
      const ok = typeof window !== 'undefined' && window.confirm ? window.confirm('You have unsaved changes. Discard them?') : true;
      if (!ok) return;
    }

    const path = `${this.notesDir}/${name}`;
    try {
      const fileData = this.api.fs.readFile(path);
      const content = typeof fileData === 'string' ? fileData : (typeof fileData?.content === 'string' ? fileData.content : '');
      this.activeNote = { name, content };
      this.isDirty = false;

      const titleInput = this.container?.querySelector('#note-title');
      const editor = this.container?.querySelector('#note-editor');
      if (titleInput) titleInput.value = name.replace(/\.(txt|md)$/, '');
      if (editor) editor.value = content;

      this.updateDirtyIndicator();
      this.renderNotesList();
    } catch (err) {
      console.error('[NotesApp] Error opening note:', err);
    }
  }

  createNewNote() {
    if (this.isDirty) {
      const ok = typeof window !== 'undefined' && window.confirm ? window.confirm('You have unsaved changes. Discard them?') : true;
      if (!ok) return;
    }

    // Generate unique title
    let index = 1;
    let name = `Note-${index}.txt`;
    while (this.notes.some(n => n.name === name)) {
      index++;
      name = `Note-${index}.txt`;
    }

    this.activeNote = { name, content: '' };
    this.isDirty = false;

    const titleInput = this.container?.querySelector('#note-title');
    const editor = this.container?.querySelector('#note-editor');
    if (titleInput) titleInput.value = `Note-${index}`;
    if (editor) editor.value = '';

    this.updateDirtyIndicator();
    this.renderNotesList();
  }

  async createNote(name, content = '') {
    let fileName = name;
    if (!fileName.endsWith('.txt') && !fileName.endsWith('.md')) {
      fileName += '.txt';
    }
    const path = `${this.notesDir}/${fileName}`;
    this.api.fs.writeFile(path, content);
    this.activeNote = { name: fileName, content };
    this.isDirty = false;

    const titleInput = this.container?.querySelector('#note-title');
    const editor = this.container?.querySelector('#note-editor');
    if (titleInput) titleInput.value = fileName.replace(/\.(txt|md)$/, '');
    if (editor) editor.value = content;

    this.updateDirtyIndicator();
    this.loadNotesList();
    return this.activeNote;
  }

  setContent(newContent) {
    if (this.activeNote) {
      this.activeNote.content = newContent;
    }
    const editor = this.container?.querySelector('#note-editor');
    if (editor) editor.value = newContent;
    this.markDirty();
  }

  async saveCurrentNote() {
    return this.saveActiveNote();
  }

  saveActiveNote() {
    const titleInput = this.container?.querySelector('#note-title');
    const editor = this.container?.querySelector('#note-editor');

    let titleVal = titleInput?.value?.trim();
    let baseName = titleVal || this.activeNote?.name || 'Untitled';
    if (!baseName.endsWith('.txt') && !baseName.endsWith('.md')) {
      baseName += '.txt';
    }

    const content = this.activeNote?.content !== undefined ? this.activeNote.content : (editor?.value || '');
    const newPath = `${this.notesDir}/${baseName}`;

    try {
      // If note was renamed, delete or rename old one
      if (this.activeNote && this.activeNote.name !== baseName) {
        const oldPath = `${this.notesDir}/${this.activeNote.name}`;
        if (this.api.fs.exists(oldPath)) {
          this.api.fs.deleteFile(oldPath);
        }
      }

      this.api.fs.writeFile(newPath, content);
      this.activeNote = { name: baseName, content };
      this.isDirty = false;
      this.updateDirtyIndicator();
      this.loadNotesList();
    } catch (err) {
      if (typeof window !== 'undefined' && window.alert) {
        window.alert(`Failed to save note: ${err.message}`);
      }
    }
  }

  async deleteNote(name) {
    const path = `${this.notesDir}/${name}`;
    if (this.api.fs.exists(path)) {
      this.api.fs.deleteFile(path);
    }
    if (this.activeNote?.name === name) {
      this.activeNote = null;
      this.isDirty = false;
    }
    this.loadNotesList();
  }

  deleteActiveNote() {
    if (!this.activeNote) return;
    const ok = typeof window !== 'undefined' && window.confirm ? window.confirm(`Delete "${this.activeNote.name}"?`) : true;
    if (!ok) return;

    const path = `${this.notesDir}/${this.activeNote.name}`;
    try {
      if (this.api.fs.exists(path)) {
        this.api.fs.deleteFile(path);
      }
      this.activeNote = null;
      this.isDirty = false;
      this.loadNotesList();
    } catch (err) {
      if (typeof window !== 'undefined' && window.alert) {
        window.alert(`Failed to delete note: ${err.message}`);
      }
    }
  }

  markDirty() {
    this.isDirty = true;
    this.updateDirtyIndicator();
  }

  updateDirtyIndicator() {
    const dirtyEl = this.container?.querySelector('#notes-dirty');
    if (dirtyEl) {
      dirtyEl.style.display = this.isDirty ? 'inline' : 'none';
    }
    if (this.api.window) {
      const baseTitle = this.activeNote ? this.activeNote.name.replace(/\.(txt|md)$/, '') : 'Notes';
      this.api.window.setTitle(this.isDirty ? `* ${baseTitle} - Notes` : `${baseTitle} - Notes`);
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

/**
 * Standard AdityyaOS Application Definition for Notes.
 */
export const notesApp = Object.freeze({
  id: 'notes',
  name: 'Notes',
  version: '1.0.0',
  description: 'System scratchpad & text notes editor',
  icon: '📝',
  category: 'Productivity',
  permissions: Object.freeze([
    PackagePermissions.FILESYSTEM_READ,
    PackagePermissions.FILESYSTEM_WRITE,
    PackagePermissions.WINDOW_CONTROL,
    PackagePermissions.APPLICATION_LIFECYCLE
  ]),
  window: Object.freeze({
    title: 'Notes',
    icon: '📝',
    width: 600,
    height: 440,
    singleton: true
  }),
  entry: (api, container, options) => {
    const app = new NotesApp(api, container, options);
    return {
      destroy: () => app.destroy()
    };
  }
});
