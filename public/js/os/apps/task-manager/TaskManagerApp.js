/**
 * public/js/os/apps/task-manager/TaskManagerApp.js
 * Native AdityyaOS Task Manager Application.
 * Strictly operates through AdityyaOSAPI.process (api.process.list(), api.process.terminate(pid)).
 * ZERO direct access to Kernel, ProcessManager, or OSState internals.
 */

import { PackagePermissions } from '../../packages/PackagePermissions.js';
import { escapeHtml } from '../../../utils/sanitize.js';

export class TaskManagerApp {
  /**
   * @param {import('../../api/AdityyaOSAPI.js').AdityyaOSAPI} api
   * @param {HTMLElement} container
   * @param {Object} [options={}]
   */
  constructor(api, container, options = {}) {
    this.api = api;
    this.container = container;
    this.options = options;

    this.processes = [];
    this.selectedPid = null;
    this.searchQuery = '';
    this.refreshInterval = null;
    this.cleanupListeners = [];

    this.render();
    this.refresh();
    this.startAutoRefresh();
  }

  render() {
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="os-taskmanager-app os-task-manager-app" role="region" aria-label="Task Manager">
        <!-- Top Toolbar -->
        <div class="os-tm-toolbar">
          <div class="os-tm-summary" id="tm-summary">
            <span>Processes: <strong>0</strong></span>
            <span>Active: <strong>0</strong></span>
            <span>Allocated: <strong>0 B</strong></span>
          </div>
          <div class="os-tm-actions">
            <input type="text" class="os-tm-search" id="tm-search" placeholder="Search processes..." aria-label="Search processes" />
            <button class="os-tm-btn" id="btn-tm-refresh" title="Refresh process list">🔄 Refresh</button>
            <button class="os-tm-btn danger" id="btn-tm-kill" title="End selected process" disabled>🛑 End Task</button>
          </div>
        </div>

        <!-- Process Table -->
        <div class="os-tm-table-container">
          <table class="os-tm-table" id="tm-table">
            <thead>
              <tr>
                <th style="width: 70px;">PID</th>
                <th>Process Name</th>
                <th style="width: 100px;">State</th>
                <th style="width: 80px;">Priority</th>
                <th style="width: 110px;">Memory</th>
              </tr>
            </thead>
            <tbody id="tm-tbody"></tbody>
          </table>
        </div>

        <!-- Status Bar -->
        <div class="os-tm-statusbar" id="tm-statusbar">
          <span id="tm-selection-status">No process selected</span>
        </div>
      </div>
    `;

    this.bindEvents();
  }

  bindEvents() {
    const searchInput = this.container.querySelector('#tm-search');
    const btnRefresh = this.container.querySelector('#btn-tm-refresh');
    const btnKill = this.container.querySelector('#btn-tm-kill');

    const onSearch = (e) => {
      this.searchQuery = e.target.value.toLowerCase().trim();
      this.renderTable();
    };

    const onRefresh = () => this.refresh();
    const onKill = () => this.terminateSelected();

    searchInput?.addEventListener('input', onSearch);
    btnRefresh?.addEventListener('click', onRefresh);
    btnKill?.addEventListener('click', onKill);

    this.cleanupListeners.push(() => {
      searchInput?.removeEventListener('input', onSearch);
      btnRefresh?.removeEventListener('click', onRefresh);
      btnKill?.removeEventListener('click', onKill);
    });
  }

  refresh() {
    try {
      // Strictly uses api.process.list()
      this.processes = this.api.process.list();
      this.updateSummary();
      this.renderTable();
    } catch (err) {
      console.error('[TaskManagerApp] Error fetching process list:', err);
    }
  }

  startAutoRefresh() {
    this.refreshInterval = setInterval(() => {
      this.refresh();
    }, 2000);
  }

  updateSummary() {
    const summaryEl = this.container?.querySelector('#tm-summary');
    if (!summaryEl) return;

    const total = this.processes.length;
    const active = this.processes.filter(p => p.state === 'RUNNING' || p.state === 'READY').length;
    const totalMem = this.processes.reduce((sum, p) => sum + (p.allocatedMemory || p.memoryRequired || 0), 0);

    summaryEl.innerHTML = `
      <span>Processes: <strong>${total}</strong></span>
      <span>Active: <strong>${active}</strong></span>
      <span>Allocated: <strong>${this.formatMemory(totalMem)}</strong></span>
    `;
  }

  renderTable() {
    const tbody = this.container?.querySelector('#tm-tbody');
    if (!tbody) return;

    let filtered = this.processes;
    if (this.searchQuery) {
      filtered = this.processes.filter(p =>
        p.name.toLowerCase().includes(this.searchQuery) ||
        String(p.pid).includes(this.searchQuery)
      );
    }

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="os-tm-empty">No matching processes found</td></tr>`;
      this.updateSelectionState();
      return;
    }

    tbody.innerHTML = filtered.map(p => {
      const isSelected = this.selectedPid === p.pid;
      const isSystem = p.pid === 0 || p.pid === 1 || p.name === 'idle' || p.name === 'init' || p.name === 'kernel';
      return `
        <tr class="os-tm-row ${isSelected ? 'selected' : ''}" data-pid="${p.pid}">
          <td><strong>${p.pid}</strong></td>
          <td>
            ${escapeHtml(p.name)}
            ${isSystem ? '<span class="badge system">System</span>' : ''}
          </td>
          <td><span class="badge state-${escapeHtml(p.state.toLowerCase())}">${escapeHtml(p.state)}</span></td>
          <td>${p.priority}</td>
          <td>${this.formatMemory(p.allocatedMemory || p.memoryRequired || 0)}</td>
        </tr>
      `;
    }).join('');

    tbody.querySelectorAll('.os-tm-row').forEach(row => {
      row.addEventListener('click', () => {
        const pid = parseInt(row.getAttribute('data-pid'), 10);
        this.selectedPid = pid;
        this.renderTable();
        this.updateSelectionState();
      });
    });

    this.updateSelectionState();
  }

  updateSelectionState() {
    const btnKill = this.container?.querySelector('#btn-tm-kill');
    const statusEl = this.container?.querySelector('#tm-selection-status');

    if (this.selectedPid !== null) {
      const p = this.processes.find(proc => proc.pid === this.selectedPid);
      if (p) {
        const isSystem = p.pid === 0 || p.pid === 1 || p.name === 'idle' || p.name === 'init' || p.name === 'kernel';
        if (btnKill) {
          if (isSystem) {
            btnKill.setAttribute('disabled', 'true');
            btnKill.title = 'System processes cannot be terminated';
          } else {
            btnKill.removeAttribute('disabled');
            btnKill.title = `End task: ${p.name} (PID ${p.pid})`;
          }
        }
        if (statusEl) {
          statusEl.textContent = `Selected: ${p.name} (PID ${p.pid}) - ${p.state}`;
        }
        return;
      }
    }

    btnKill?.setAttribute('disabled', 'true');
    if (statusEl) statusEl.textContent = 'No process selected';
  }

  setFilter(query) {
    this.searchQuery = String(query || '').toLowerCase().trim();
    this.renderTable();
  }

  getFilteredProcesses() {
    if (!this.searchQuery) return this.processes;
    return this.processes.filter(p =>
      p.name.toLowerCase().includes(this.searchQuery) ||
      String(p.pid).includes(this.searchQuery)
    );
  }

  async terminateProcess(pid) {
    try {
      this.api.process.terminate(pid);
      this.refresh();
      return true;
    } catch (err) {
      this.errorMessage = err.message;
      return false;
    }
  }

  terminateSelected() {
    if (this.selectedPid === null) return;

    const p = this.processes.find(proc => proc.pid === this.selectedPid);
    if (!p) return;

    const ok = typeof window !== 'undefined' && window.confirm ? window.confirm(`Are you sure you want to terminate "${p.name}" (PID ${p.pid})?`) : true;
    if (!ok) return;

    try {
      // Strictly uses api.process.terminate(pid)
      this.api.process.terminate(p.pid);
      this.selectedPid = null;
      this.refresh();
    } catch (err) {
      if (typeof window !== 'undefined' && window.alert) {
        window.alert(`Failed to terminate process: ${err.message}`);
      }
    }
  }

  formatMemory(bytes) {
    if (typeof bytes !== 'number' || bytes === 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  destroy() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
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
 * Standard AdityyaOS Application Definition for Task Manager.
 */
export const taskManagerApp = Object.freeze({
  id: 'task-manager',
  name: 'Task Manager',
  version: '1.0.0',
  description: 'Process list & resource management',
  icon: '📊',
  category: 'System',
  permissions: Object.freeze([
    PackagePermissions.SYSTEM_READ,
    PackagePermissions.PROCESS_READ,
    PackagePermissions.PROCESS_TERMINATE,
    PackagePermissions.MEMORY_READ,
    PackagePermissions.WINDOW_CONTROL,
    PackagePermissions.APPLICATION_LIFECYCLE
  ]),
  window: Object.freeze({
    title: 'Task Manager',
    icon: '📊',
    width: 620,
    height: 440,
    singleton: true
  }),
  entry: (api, container, options) => {
    const app = new TaskManagerApp(api, container, options);
    return {
      destroy: () => app.destroy()
    };
  }
});
