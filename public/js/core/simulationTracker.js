/**
 * Simulation Tracker & Persistence Orchestrator
 * Connects frontend simulation execution with backend history, progress, and saved simulations.
 * Pure simulation engines remain decoupled; all persistence is non-blocking and client-driven.
 */

import { api } from './apiClient.js';
import { store } from './store.js';
import { showToast } from '../utils/toast.js';
import { authView } from '../views/authView.js';

class SimulationTracker {
  constructor() {
    this.pendingSimulation = null;
  }

  /**
   * Check if user is currently authenticated
   */
  isAuthenticated() {
    return Boolean(store.getState('isAuthenticated') || store.getState('user'));
  }

  /**
   * Asynchronously record a completed simulation run in history & progress
   * Non-blocking: never fails or interrupts client-side simulation execution.
   */
  async recordRun(module, algorithm, inputs, metrics) {
    if (!this.isAuthenticated()) {
      return; // Guest mode - do not persist
    }

    try {
      // Strip large snapshot traces from metrics before sending
      const cleanMetrics = { ...(metrics || {}) };
      delete cleanMetrics.snapshots;
      delete cleanMetrics.trace;
      delete cleanMetrics.ganttChart;

      // Post to history
      const historyPromise = api.post('/history', {
        module,
        algorithm: String(algorithm || 'default'),
        inputs: inputs || {},
        metrics: cleanMetrics
      }).catch(err => {
        console.warn(`[SimulationTracker] History record failed: ${err.message}`);
      });

      // Update progress activity
      const progressPromise = api.post(`/progress/${module}/activity`).catch(err => {
        console.warn(`[SimulationTracker] Progress activity record failed: ${err.message}`);
      });

      await Promise.allSettled([historyPromise, progressPromise]);
    } catch (err) {
      console.warn(`[SimulationTracker] Unexpected tracking error: ${err.message}`);
    }
  }

  /**
   * Track module visit for authenticated user
   */
  async trackVisit(module) {
    if (!this.isAuthenticated()) return;

    try {
      await api.patch(`/progress/${module}`, { lastVisitedAt: new Date() });
    } catch (err) {
      console.warn(`[SimulationTracker] Failed to record module visit: ${err.message}`);
    }
  }

  /**
   * Set a pending simulation configuration to be loaded into a module
   */
  setPendingSimulation(config) {
    this.pendingSimulation = config;
    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem('os_pending_simulation', JSON.stringify(config));
      }
    } catch {
      // Fallback to in-memory only
    }
  }

  /**
   * Retrieve and clear pending simulation for a target module
   */
  getPendingSimulation(module) {
    let pending = this.pendingSimulation;

    if (!pending && typeof sessionStorage !== 'undefined') {
      try {
        const raw = sessionStorage.getItem('os_pending_simulation');
        if (raw) {
          pending = JSON.parse(raw);
        }
      } catch {
        pending = null;
      }
    }

    if (pending && (!module || pending.module === module)) {
      this.clearPendingSimulation();
      return pending;
    }

    return null;
  }

  /**
   * Clear any pending simulation
   */
  clearPendingSimulation() {
    this.pendingSimulation = null;
    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem('os_pending_simulation');
      }
    } catch {
      // Ignore
    }
  }

  /**
   * Open the Save Simulation dialog modal for the given module and inputs
   */
  openSaveModal(module, getInputsFn, defaultName = '') {
    if (!this.isAuthenticated()) {
      showToast('Please sign in to save simulation configurations', 'info');
      authView.openModal('login');
      return;
    }

    const modalContainer = document.getElementById('modal-container');
    if (!modalContainer) return;

    modalContainer.innerHTML = `
      <div class="modal-dialog">
        <div class="modal-header">
          <h3 class="card-title">Save Simulation Configuration</h3>
          <button id="close-save-modal-btn" class="btn btn-outline btn-sm">✕</button>
        </div>
        <div class="modal-body">
          <form id="save-simulation-form">
            <div class="form-group">
              <label class="form-label" for="save-sim-name">Simulation Name</label>
              <input type="text" id="save-sim-name" class="form-input" placeholder="e.g. My Custom Workload" value="${defaultName}" required maxlength="100">
            </div>

            <div class="form-group">
              <label class="form-label" for="save-sim-desc">Description (Optional)</label>
              <textarea id="save-sim-desc" class="form-input" rows="3" placeholder="Notes about this configuration..." maxlength="500"></textarea>
            </div>

            <div style="display: flex; justify-content: flex-end; gap: var(--space-2); margin-top: var(--space-4);">
              <button type="button" id="cancel-save-sim-btn" class="btn btn-secondary">Cancel</button>
              <button type="submit" id="submit-save-sim-btn" class="btn btn-primary">Save Simulation</button>
            </div>
          </form>
        </div>
      </div>
    `;

    modalContainer.classList.add('open');

    const closeModal = () => {
      modalContainer.classList.remove('open');
      modalContainer.innerHTML = '';
    };

    modalContainer.querySelector('#close-save-modal-btn')?.addEventListener('click', closeModal);
    modalContainer.querySelector('#cancel-save-sim-btn')?.addEventListener('click', closeModal);

    modalContainer.querySelector('#save-simulation-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = modalContainer.querySelector('#save-sim-name')?.value.trim();
      const description = modalContainer.querySelector('#save-sim-desc')?.value.trim() || '';
      const submitBtn = modalContainer.querySelector('#submit-save-sim-btn');

      if (!name) {
        showToast('Please enter a simulation name', 'error');
        return;
      }

      let inputs;
      try {
        inputs = typeof getInputsFn === 'function' ? getInputsFn() : getInputsFn;
      } catch (err) {
        showToast(`Failed to collect inputs: ${err.message}`, 'error');
        return;
      }

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Saving...';
      }

      try {
        const res = await api.post('/simulations', {
          module,
          name,
          description,
          inputs
        });

        if (res.success) {
          showToast(`Simulation "${name}" saved successfully!`, 'success');
          closeModal();
        }
      } catch (err) {
        showToast(err.message || 'Failed to save simulation', 'error');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Save Simulation';
        }
      }
    });
  }
}

export const simulationTracker = new SimulationTracker();
