/**
 * Simulation History View Controller (Vanilla JS ES6+)
 * View, filter, reload, and delete simulation history records.
 */

import { api } from '../core/apiClient.js';
import { store } from '../core/store.js';
import { showToast } from '../utils/toast.js';
import { authView } from './authView.js';
import { simulationTracker } from '../core/simulationTracker.js';
import { escapeHtml } from '../utils/sanitize.js';

export const historyView = {
  mount(container) {
    this.container = container;
    this.selectedModule = 'all';
    this.historyRecords = [];
    this.isLoading = false;

    this.render();
  },

  unmount() {
    this.container = null;
  },

  isAuthenticated() {
    return Boolean(store.getState('isAuthenticated') || store.getState('user'));
  },

  async render() {
    if (!this.container) return;

    if (!this.isAuthenticated()) {
      this.container.innerHTML = `
        <div style="max-width: 520px; margin: var(--space-10) auto;">
          <div class="card">
            <div class="card-header">
              <h3 class="card-title">Simulation History</h3>
              <span class="badge badge-secondary">Account Feature</span>
            </div>
            <div class="card-body" style="padding: var(--space-8) var(--space-6); text-align: center;">
              <div style="font-size: 2.5rem; margin-bottom: var(--space-3);" aria-hidden="true">📜</div>
              <h3 style="font-size: var(--text-lg); font-weight: 700; color: var(--text-primary); margin-bottom: var(--space-2);">
                Authentication Required
              </h3>
              <p style="color: var(--text-secondary); margin-bottom: var(--space-6); font-size: var(--text-sm); line-height: 1.5;">
                Sign in to automatically record your completed simulation runs and review performance benchmarks. All simulators remain fully accessible to guests.
              </p>
              <div style="display: flex; gap: var(--space-3); justify-content: center;">
                <button id="history-login-btn" class="btn btn-primary btn-sm">Sign In / Register</button>
                <a href="#/cpu" class="btn btn-secondary btn-sm">Explore Simulators</a>
              </div>
            </div>
          </div>
        </div>
      `;

      this.container.querySelector('#history-login-btn')?.addEventListener('click', () => {
        authView.openModal('login');
      });
      return;
    }

    this.container.innerHTML = `
      <div style="max-width: 1200px; margin: 0 auto; display: flex; flex-direction: column; gap: var(--space-5);">
        <!-- Header -->
        <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: var(--space-4);">
          <div>
            <h1 style="font-size: var(--text-2xl); font-weight: 800; color: var(--text-primary); margin-bottom: var(--space-1); letter-spacing: -0.02em;">
              Simulation History
            </h1>
            <p style="color: var(--text-secondary); font-size: var(--text-sm);">
              Review previously executed simulation runs and performance benchmarks across all modules.
            </p>
          </div>
          <button id="clear-all-history-btn" class="btn btn-danger btn-sm">Clear All History</button>
        </div>

        <!-- Filter Bar -->
        <div class="card" style="padding: var(--space-2) var(--space-3);">
          <div style="display: flex; gap: var(--space-2); flex-wrap: wrap;" role="tablist">
            <button class="btn btn-sm ${this.selectedModule === 'all' ? 'btn-primary' : 'btn-outline'} filter-btn" data-mod="all">All Modules</button>
            <button class="btn btn-sm ${this.selectedModule === 'cpu' ? 'btn-primary' : 'btn-outline'} filter-btn" data-mod="cpu">CPU Scheduling</button>
            <button class="btn btn-sm ${this.selectedModule === 'process' ? 'btn-primary' : 'btn-outline'} filter-btn" data-mod="process">Process</button>
            <button class="btn btn-sm ${this.selectedModule === 'memory' ? 'btn-primary' : 'btn-outline'} filter-btn" data-mod="memory">Memory</button>
            <button class="btn btn-sm ${this.selectedModule === 'disk' ? 'btn-primary' : 'btn-outline'} filter-btn" data-mod="disk">Disk</button>
            <button class="btn btn-sm ${this.selectedModule === 'deadlock' ? 'btn-primary' : 'btn-outline'} filter-btn" data-mod="deadlock">Deadlock</button>
            <button class="btn btn-sm ${this.selectedModule === 'filesystem' ? 'btn-primary' : 'btn-outline'} filter-btn" data-mod="filesystem">File System</button>
          </div>
        </div>

        <!-- Table Container -->
        <div id="history-table-container">
          <div class="loading-indicator">
            <div class="spinner"></div>
            <span>Loading history records...</span>
          </div>
        </div>
      </div>
    `;

    // Bind filter buttons
    this.container.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.selectedModule = e.target.dataset.mod;
        this.container.querySelectorAll('.filter-btn').forEach(b => {
          b.className = 'btn btn-sm btn-outline filter-btn';
        });
        e.target.className = 'btn btn-sm btn-primary filter-btn';
        this.fetchAndRenderHistory();
      });
    });

    // Bind Clear All
    this.container.querySelector('#clear-all-history-btn')?.addEventListener('click', async () => {
      if (confirm('Are you sure you want to clear all simulation history?')) {
        try {
          await api.delete('/history');
          showToast('All simulation history cleared', 'info');
          this.fetchAndRenderHistory();
        } catch (err) {
          showToast(err.message || 'Failed to clear history', 'error');
        }
      }
    });

    await this.fetchAndRenderHistory();
  },

  async fetchAndRenderHistory() {
    const tableContainer = this.container?.querySelector('#history-table-container');
    if (!tableContainer) return;

    try {
      let endpoint = '/history';
      if (this.selectedModule !== 'all') {
        endpoint += `?module=${this.selectedModule}`;
      }

      const res = await api.get(endpoint);
      this.historyRecords = res.data || [];

      if (this.historyRecords.length === 0) {
        tableContainer.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-icon" aria-hidden="true">📜</div>
            <div class="empty-state-title">No History Recorded</div>
            <div class="empty-state-desc">
              No completed simulation runs recorded ${this.selectedModule !== 'all' ? `for ${this.selectedModule.toUpperCase()}` : ''}. Run any simulation while signed in to automatically log runs and benchmarks.
            </div>
            <a href="#/cpu" class="btn btn-primary btn-sm">Run a Simulation</a>
          </div>
        `;
        return;
      }

      tableContainer.innerHTML = `
        <div class="card">
          <div class="table-responsive">
            <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: var(--text-sm);">
              <thead>
                <tr style="border-bottom: 1px solid var(--border-color); background-color: var(--bg-surface-muted);">
                  <th style="padding: var(--space-3) var(--space-4); font-size: var(--text-xs); font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.04em;">Date & Time</th>
                  <th style="padding: var(--space-3) var(--space-4); font-size: var(--text-xs); font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.04em;">Module</th>
                  <th style="padding: var(--space-3) var(--space-4); font-size: var(--text-xs); font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.04em;">Algorithm</th>
                  <th style="padding: var(--space-3) var(--space-4); font-size: var(--text-xs); font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.04em;">Key Metrics</th>
                  <th style="padding: var(--space-3) var(--space-4); font-size: var(--text-xs); font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.04em; text-align: right;">Actions</th>
                </tr>
              </thead>
              <tbody>
                ${this.historyRecords.map(item => {
                  const dateStr = item.completedAt ? new Date(item.completedAt).toLocaleString() : '';
                  const metricsPills = this.renderMetricPills(item.module, item.metrics);

                  return `
                    <tr style="border-bottom: 1px solid var(--border-color);" data-id="${item._id}">
                      <td style="padding: var(--space-3) var(--space-4); white-space: nowrap; font-size: var(--text-xs); color: var(--text-muted); font-family: var(--font-mono);">${escapeHtml(dateStr)}</td>
                      <td style="padding: var(--space-3) var(--space-4);"><span class="badge badge-primary">${escapeHtml(item.module.toUpperCase())}</span></td>
                      <td style="padding: var(--space-3) var(--space-4); font-weight: 600; color: var(--text-primary);">${escapeHtml(item.algorithm)}</td>
                      <td style="padding: var(--space-3) var(--space-4);">${metricsPills}</td>
                      <td style="padding: var(--space-3) var(--space-4); text-align: right; white-space: nowrap;">
                        <button class="btn btn-secondary btn-sm load-history-btn" data-id="${item._id}">Re-run ➔</button>
                        <button class="btn btn-outline btn-sm delete-history-btn" data-id="${item._id}" style="color: var(--accent-danger); margin-left: var(--space-1);" title="Delete entry">✕</button>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;

      // Bind Load / Re-run
      tableContainer.querySelectorAll('.load-history-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const id = e.target.dataset.id;
          const item = this.historyRecords.find(h => h._id === id);
          if (item) {
            simulationTracker.setPendingSimulation({
              module: item.module,
              algorithm: item.algorithm,
              inputs: item.inputs,
              name: `History Run (${item.algorithm})`
            });
            showToast(`Loading "${item.algorithm}" into ${item.module.toUpperCase()} simulator...`, 'info');
            window.location.hash = `#/${item.module}`;
          }
        });
      });

      // Bind Delete single
      tableContainer.querySelectorAll('.delete-history-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const id = e.target.dataset.id;
          try {
            await api.delete(`/history/${id}`);
            showToast('History entry deleted', 'info');
            this.fetchAndRenderHistory();
          } catch (err) {
            showToast(err.message || 'Failed to delete entry', 'error');
          }
        });
      });

    } catch (err) {
      tableContainer.innerHTML = `
        <div class="card" style="padding: var(--space-6); text-align: center; border-color: var(--accent-danger);">
          <p style="color: var(--accent-danger); font-size: var(--text-sm);">Failed to load history: ${escapeHtml(err.message)}</p>
        </div>
      `;
    }
  },

  renderMetricPills(module, metrics) {
    if (!metrics || typeof metrics !== 'object') return '<span style="color: var(--text-muted);">—</span>';

    const pills = [];
    const pillStyle = 'display: inline-block; padding: 2px 6px; font-size: 0.75rem; border-radius: 4px; background: var(--bg-surface-muted); border: 1px solid var(--border-color); color: var(--text-secondary); margin-right: 4px; margin-bottom: 2px; font-family: var(--font-mono);';

    if (metrics.averageTurnaroundTime !== undefined) {
      pills.push(`<span style="${pillStyle}">Avg TAT: ${Number(metrics.averageTurnaroundTime).toFixed(1)}</span>`);
    }
    if (metrics.averageWaitingTime !== undefined) {
      pills.push(`<span style="${pillStyle}">Avg WT: ${Number(metrics.averageWaitingTime).toFixed(1)}</span>`);
    }
    if (metrics.totalHeadMovement !== undefined) {
      pills.push(`<span style="${pillStyle}">Seek: ${metrics.totalHeadMovement}</span>`);
    }
    if (metrics.pageFaults !== undefined) {
      pills.push(`<span style="${pillStyle}">Faults: ${metrics.pageFaults}</span>`);
    }
    if (metrics.faultRatePercent !== undefined) {
      pills.push(`<span style="${pillStyle}">Fault Rate: ${Number(metrics.faultRatePercent).toFixed(1)}%</span>`);
    }
    if (metrics.isSafe !== undefined) {
      const color = metrics.isSafe ? 'var(--accent-success)' : 'var(--accent-danger)';
      pills.push(`<span style="${pillStyle} color: ${color}; font-weight: 600;">${metrics.isSafe ? 'Safe State' : 'Unsafe State'}</span>`);
    }
    if (metrics.diskUtilizationPercent !== undefined) {
      pills.push(`<span style="${pillStyle}">Disk: ${Number(metrics.diskUtilizationPercent).toFixed(1)}%</span>`);
    }
    if (metrics.allocatedProcesses !== undefined) {
      pills.push(`<span style="${pillStyle}">Allocated: ${metrics.allocatedProcesses}</span>`);
    }

    if (pills.length === 0) {
      const entries = Object.entries(metrics).slice(0, 3);
      for (const [k, v] of entries) {
        if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') {
          pills.push(`<span style="${pillStyle}">${escapeHtml(k)}: ${escapeHtml(String(v))}</span>`);
        }
      }
    }

    return pills.length > 0 ? pills.join('') : '<span style="color: var(--text-muted);">—</span>';
  }
};
