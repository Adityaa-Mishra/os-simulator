/**
 * Saved Simulations View Controller (Vanilla JS ES6+)
 * Browse, load, and delete saved simulation configurations.
 */

import { api } from '../core/apiClient.js';
import { store } from '../core/store.js';
import { showToast } from '../utils/toast.js';
import { authView } from './authView.js';
import { simulationTracker } from '../core/simulationTracker.js';
import { escapeHtml } from '../utils/sanitize.js';

export const savedView = {
  mount(container) {
    this.container = container;
    this.selectedModule = 'all';
    this.simulations = [];
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
              <h3 class="card-title">Saved Simulations</h3>
              <span class="badge badge-secondary">Account Feature</span>
            </div>
            <div class="card-body" style="padding: var(--space-8) var(--space-6); text-align: center;">
              <div style="font-size: 2.5rem; margin-bottom: var(--space-3);" aria-hidden="true">🔒</div>
              <h3 style="font-size: var(--text-lg); font-weight: 700; color: var(--text-primary); margin-bottom: var(--space-2);">
                Authentication Required
              </h3>
              <p style="color: var(--text-secondary); margin-bottom: var(--space-6); font-size: var(--text-sm); line-height: 1.5;">
                Sign in to save, organize, and reload custom simulation configurations across devices. All simulators remain fully accessible to guests.
              </p>
              <div style="display: flex; gap: var(--space-3); justify-content: center;">
                <button id="saved-login-btn" class="btn btn-primary btn-sm">Sign In / Register</button>
                <a href="#/cpu" class="btn btn-secondary btn-sm">Explore Simulators</a>
              </div>
            </div>
          </div>
        </div>
      `;

      this.container.querySelector('#saved-login-btn')?.addEventListener('click', () => {
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
              Saved Simulations
            </h1>
            <p style="color: var(--text-secondary); font-size: var(--text-sm);">
              Browse, load, and manage your saved simulation workloads and presets.
            </p>
          </div>
          <a href="#/cpu" class="btn btn-primary btn-sm">⚡ Run New Simulation</a>
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

        <!-- Grid Container -->
        <div id="saved-grid-container">
          <div class="loading-indicator">
            <div class="spinner"></div>
            <span>Loading saved configurations...</span>
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
        this.fetchAndRenderSimulations();
      });
    });

    await this.fetchAndRenderSimulations();
  },

  async fetchAndRenderSimulations() {
    const gridContainer = this.container?.querySelector('#saved-grid-container');
    if (!gridContainer) return;

    try {
      let endpoint = '/simulations';
      if (this.selectedModule !== 'all') {
        endpoint += `?module=${this.selectedModule}`;
      }

      const res = await api.get(endpoint);
      this.simulations = res.data || [];

      if (this.simulations.length === 0) {
        gridContainer.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-icon" aria-hidden="true">💾</div>
            <div class="empty-state-title">No Saved Simulations Found</div>
            <div class="empty-state-desc">
              You haven't saved any simulations ${this.selectedModule !== 'all' ? `for ${this.selectedModule.toUpperCase()}` : ''} yet. Execute any simulation and click "Save Simulation" to preserve your parameters.
            </div>
            <a href="#/cpu" class="btn btn-primary btn-sm">Launch CPU Simulator</a>
          </div>
        `;
        return;
      }

      gridContainer.innerHTML = `
        <div class="grid grid-cols-3">
          ${this.simulations.map(sim => {
            const dateStr = sim.createdAt ? new Date(sim.createdAt).toLocaleDateString() : '';
            return `
              <div class="card" data-id="${sim._id}">
                <div class="card-body" style="display: flex; flex-direction: column; height: 100%;">
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-2);">
                    <span class="badge badge-primary">${escapeHtml(sim.module.toUpperCase())}</span>
                    <span style="font-size: var(--text-xs); color: var(--text-muted);">${escapeHtml(dateStr)}</span>
                  </div>
                  <h3 style="font-size: var(--text-base); font-weight: 700; color: var(--text-primary); margin-bottom: var(--space-1);">
                    ${escapeHtml(sim.name)}
                  </h3>
                  <p style="color: var(--text-secondary); font-size: var(--text-xs); line-height: 1.5; margin-bottom: var(--space-4); flex: 1;">
                    ${escapeHtml(sim.description || 'No description provided.')}
                  </p>
                  <div style="display: flex; gap: var(--space-2); border-top: 1px solid var(--border-color); padding-top: var(--space-3);">
                    <button class="btn btn-outline btn-sm delete-sim-btn" data-id="${sim._id}" style="color: var(--accent-danger);">Delete</button>
                    <button class="btn btn-primary btn-sm load-sim-btn" data-id="${sim._id}" style="flex: 1;">Load into Simulator ➔</button>
                  </div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;

      // Bind Load buttons
      gridContainer.querySelectorAll('.load-sim-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const id = e.target.dataset.id;
          const sim = this.simulations.find(s => s._id === id);
          if (sim) {
            simulationTracker.setPendingSimulation(sim);
            showToast(`Loading "${sim.name}" into ${sim.module.toUpperCase()} simulator...`, 'info');
            window.location.hash = `#/${sim.module}`;
          }
        });
      });

      // Bind Delete buttons
      gridContainer.querySelectorAll('.delete-sim-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const id = e.target.dataset.id;
          const sim = this.simulations.find(s => s._id === id);
          if (!sim) return;

          e.target.disabled = true;
          e.target.textContent = 'Deleting...';

          try {
            await api.delete(`/simulations/${id}`);
            showToast(`Simulation "${sim.name}" deleted`, 'success');
            this.fetchAndRenderSimulations();
          } catch (err) {
            showToast(err.message || 'Failed to delete simulation', 'error');
            e.target.disabled = false;
            e.target.textContent = 'Delete';
          }
        });
      });

    } catch (err) {
      gridContainer.innerHTML = `
        <div class="card" style="padding: var(--space-6); text-align: center; border-color: var(--accent-danger);">
          <p style="color: var(--accent-danger); font-size: var(--text-sm);">Failed to load saved simulations: ${escapeHtml(err.message)}</p>
        </div>
      `;
    }
  }
};
