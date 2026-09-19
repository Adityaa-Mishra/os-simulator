/**
 * Deadlock Management View Controller
 * Tri-tab interactive UI:
 * 1. Banker's Safety Algorithm (Matrix configuration, presets, safe sequence, playback)
 * 2. Banker's Resource Request Algorithm (Process selector, request vector, tentative allocation, verdict)
 * 3. Resource Allocation Graph (RAG) (Deterministic SVG layout, cycle detection, edge highlighting)
 */

import { simulationRegistry } from '../core/simulationRegistry.js';
import { PlaybackController } from '../core/playback.js';
import { DeadlockRenderer } from '../visualizers/deadlockRenderer.js';
import { showToast } from '../utils/toast.js';
import { simulationTracker } from '../core/simulationTracker.js';

export const deadlockView = {
  mount(container) {
    this.container = container;
    this.playbackController = null;
    this.currentSafetyResult = null;
    this.currentRequestResult = null;
    this.activeTab = 'safety';

    // Track module visit for authenticated learning progress
    simulationTracker.trackVisit('deadlock');

    // Retrieve deadlock engines from registry
    this.safetyEngine = simulationRegistry.get('deadlock', 'deadlock_bankers_safety');
    this.requestEngine = simulationRegistry.get('deadlock', 'deadlock_bankers_request');

    // Default configuration (Classic Silberschatz textbook state)
    this.state = {
      processes: ['P0', 'P1', 'P2', 'P3', 'P4'],
      available: [3, 3, 2],
      max: [
        [7, 5, 3],
        [3, 2, 2],
        [9, 0, 2],
        [2, 2, 2],
        [4, 3, 3]
      ],
      allocation: [
        [0, 1, 0],
        [2, 0, 0],
        [3, 0, 2],
        [2, 1, 1],
        [0, 0, 2]
      ],
      request: {
        process: 'P1',
        resources: [1, 0, 2]
      }
    };

    // Check for pending simulation to load (from Saved Simulations or History)
    const pending = simulationTracker.getPendingSimulation('deadlock');
    if (pending && pending.inputs) {
      if (pending.inputs.processes) this.state.processes = pending.inputs.processes;
      if (pending.inputs.available) this.state.available = pending.inputs.available;
      if (pending.inputs.max) this.state.max = pending.inputs.max;
      if (pending.inputs.allocation) this.state.allocation = pending.inputs.allocation;
      if (pending.inputs.request) this.state.request = pending.inputs.request;
    }

    this.renderLayout();
    this.bindEvents();
    this.loadPresetsDropdown();
    this.runSafetySimulation();
  },

  $(id) {
    if (this.container && typeof this.container.querySelector === 'function') {
      const el = this.container.querySelector(`#${id}`);
      if (el) return el;
    }
    if (typeof document !== 'undefined' && typeof document.getElementById === 'function') {
      return document.getElementById(id);
    }
    return null;
  },

  renderLayout() {
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="deadlock-container">
        <!-- Header & Tabs Card -->
        <div class="card" style="padding: var(--space-6);">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: var(--space-4);">
            <div>
              <h1 style="font-size: var(--text-2xl); font-weight: 800; color: var(--text-primary);">
                Deadlock Management Simulator
              </h1>
              <p style="color: var(--text-secondary); font-size: var(--text-sm); margin-top: var(--space-1); max-width: 750px;">
                Explore deadlock avoidance using <strong>Banker's Safety</strong> and <strong>Resource Request</strong> algorithms, and inspect directed cycles on the <strong>Resource Allocation Graph (RAG)</strong>.
              </p>
            </div>
            <div style="display: flex; gap: var(--space-2);">
              <button id="save-deadlock-btn" class="btn btn-secondary">
                <span>💾</span> Save
              </button>
              <button id="run-deadlock-btn" class="btn btn-primary">
                <span>\u25B6</span> Run Algorithm
              </button>
              <button id="reset-deadlock-btn" class="btn btn-secondary">
                Reset
              </button>
            </div>
          </div>

          <!-- Navigation Tabs -->
          <div class="deadlock-tabs" style="margin-top: var(--space-5);">
            <button class="deadlock-tab-btn active" data-tab="safety">
              <span>\uD83D\uDEE1\uFE0F</span> 1. Banker's Safety
            </button>
            <button class="deadlock-tab-btn" data-tab="request">
              <span>\uD83D\uDD04</span> 2. Resource Request
            </button>
            <button class="deadlock-tab-btn" data-tab="rag">
              <span>\uD83D\uDD78\uFE0F</span> 3. Resource Allocation Graph (RAG)
            </button>
          </div>
        </div>

        <!-- Configuration & Matrices Card -->
        <div class="card" style="padding: var(--space-5);">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-4); flex-wrap: wrap; gap: var(--space-3);">
            <h3 class="card-title" style="margin-bottom: 0; font-size: var(--text-base);">System State Configuration</h3>
            <div class="form-group" style="margin-bottom: 0; min-width: 280px;">
              <select id="deadlock-preset-select" class="form-select">
                <option value="">-- Load Predefined Scenario --</option>
              </select>
            </div>
          </div>

          <div class="grid grid-cols-2" style="gap: var(--space-4);">
            <div class="form-group" style="margin-bottom: 0;">
              <label class="form-label" for="deadlock-procs-input">Processes (comma-separated)</label>
              <input type="text" id="deadlock-procs-input" class="form-input" value="${this.state.processes.join(', ')}">
            </div>

            <div class="form-group" style="margin-bottom: 0;">
              <label class="form-label" for="deadlock-avail-input">Available Vector (comma-separated for R0, R1, ...)</label>
              <input type="text" id="deadlock-avail-input" class="form-input" value="${this.state.available.join(', ')}">
            </div>

            <div class="form-group" style="margin-bottom: 0;">
              <label class="form-label" for="deadlock-max-input">Max Matrix (rows separated by newlines, cols by comma)</label>
              <textarea id="deadlock-max-input" class="form-input" rows="4" style="font-family: var(--font-mono); font-size: var(--text-xs); resize: vertical;">${this.state.max.map(r => r.join(', ')).join('\n')}</textarea>
            </div>

            <div class="form-group" style="margin-bottom: 0;">
              <label class="form-label" for="deadlock-alloc-input">Allocation Matrix (rows separated by newlines, cols by comma)</label>
              <textarea id="deadlock-alloc-input" class="form-input" rows="4" style="font-family: var(--font-mono); font-size: var(--text-xs); resize: vertical;">${this.state.allocation.map(r => r.join(', ')).join('\n')}</textarea>
            </div>
          </div>
        </div>

        <!-- Tab 1 Pane: Banker's Safety -->
        <div id="pane-safety" class="deadlock-tab-pane active">
          <!-- Matrices Display -->
          <div id="safety-matrices-container"></div>

          <!-- Playback Controls Card -->
          <div class="card" style="padding: var(--space-4);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-3); flex-wrap: wrap; gap: var(--space-2);">
              <span style="font-size: var(--text-xs); font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-primary);">
                Safety Algorithm Timeline Playback
              </span>
              <span id="safety-step-counter" style="font-family: var(--font-mono); font-size: var(--text-xs); color: var(--text-muted);">
                Step 0 / 0
              </span>
            </div>

            <div style="display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap;">
              <div style="display: flex; gap: var(--space-1);">
                <button id="safety-btn-first" class="btn btn-secondary btn-sm" title="First Step">⏮</button>
                <button id="safety-btn-prev" class="btn btn-secondary btn-sm" title="Previous Step">◀</button>
                <button id="safety-btn-play" class="btn btn-primary btn-sm" title="Play / Pause">▶ Play</button>
                <button id="safety-btn-next" class="btn btn-secondary btn-sm" title="Next Step">▶</button>
                <button id="safety-btn-last" class="btn btn-secondary btn-sm" title="Last Step">⏭</button>
              </div>

              <input type="range" id="safety-timeline-slider" min="0" max="0" value="0" style="flex: 1; min-width: 160px;">

              <div style="display: flex; align-items: center; gap: var(--space-2);">
                <label for="safety-speed-select" style="font-size: var(--text-xs); color: var(--text-muted);">Speed:</label>
                <select id="safety-speed-select" class="form-select form-select-sm" style="width: auto;">
                  <option value="1500">0.5×</option>
                  <option value="800" selected>1×</option>
                  <option value="400">2×</option>
                </select>
              </div>
            </div>
          </div>

          <!-- Active Step Card -->
          <div id="safety-step-display"></div>

          <!-- Summary Verdict Card -->
          <div id="safety-verdict-card"></div>
        </div>

        <!-- Tab 2 Pane: Resource Request -->
        <div id="pane-request" class="deadlock-tab-pane">
          <!-- Request Input Card -->
          <div class="card" style="padding: var(--space-5);">
            <h3 class="card-title" style="margin-bottom: var(--space-3); font-size: var(--text-base);">Resource Request Specification</h3>
            <div class="grid grid-cols-3" style="gap: var(--space-4); align-items: flex-end;">
              <div class="form-group" style="margin-bottom: 0;">
                <label class="form-label" for="req-proc-select">Requesting Process</label>
                <select id="req-proc-select" class="form-select">
                  ${this.state.processes.map(p => `<option value="${p}">${p}</option>`).join('')}
                </select>
              </div>

              <div class="form-group" style="margin-bottom: 0; grid-column: span 2;">
                <label class="form-label" for="req-vec-input">Requested Resources (comma-separated for R0, R1, ...)</label>
                <input type="text" id="req-vec-input" class="form-input" value="${this.state.request.resources.join(', ')}">
              </div>
            </div>
            <div style="margin-top: var(--space-4); display: flex; justify-content: flex-end;">
              <button id="evaluate-req-btn" class="btn btn-primary">
                <span>⚡</span> Evaluate Request
              </button>
            </div>
          </div>

          <!-- Decision Verdict Card -->
          <div id="request-decision-display"></div>

          <!-- Tentative Matrices (if granted or evaluated) -->
          <div id="request-tentative-matrices"></div>
        </div>

        <!-- Tab 3 Pane: Resource Allocation Graph (RAG) -->
        <div id="pane-rag" class="deadlock-tab-pane">
          <div id="rag-visualizer-container"></div>
        </div>
      </div>
    `;
  },

  bindEvents() {
    // Save button
    this.$('save-deadlock-btn')?.addEventListener('click', () => {
      simulationTracker.openSaveModal('deadlock', () => this.state, 'deadlock_bankers_safety');
    });

    // Run button
    const runBtn = this.$('run-deadlock-btn');
    if (runBtn) {
      runBtn.addEventListener('click', () => {
        if (this.activeTab === 'safety') {
          this.runSafetySimulation();
        } else if (this.activeTab === 'request') {
          this.runRequestSimulation();
        } else if (this.activeTab === 'rag') {
          this.renderRagView();
        }
      });
    }

    // Reset button
    const resetBtn = this.$('reset-deadlock-btn');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => this.resetSimulation());
    }

    // Tab buttons
    const tabBtns = this.container.querySelectorAll('.deadlock-tab-btn');
    tabBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tab = btn.dataset.tab;
        this.switchTab(tab);
      });
    });

    // Preset selector
    const presetSelect = this.$('deadlock-preset-select');
    if (presetSelect) {
      presetSelect.addEventListener('change', (e) => {
        const idx = parseInt(e.target.value, 10);
        if (!isNaN(idx)) {
          this.loadPreset(idx);
        }
      });
    }

    // Input changes
    const inputsToWatch = ['deadlock-procs-input', 'deadlock-avail-input', 'deadlock-max-input', 'deadlock-alloc-input'];
    inputsToWatch.forEach(id => {
      const el = this.$(id);
      if (el) {
        el.addEventListener('change', () => this.syncInputs());
      }
    });

    // Playback buttons
    const playBtn = this.$('safety-btn-play');
    if (playBtn) {
      playBtn.addEventListener('click', () => {
        if (!this.playbackController) return;
        if (this.playbackController.isPlaying) {
          this.playbackController.pause();
          playBtn.textContent = '▶ Play';
        } else {
          this.playbackController.play();
          playBtn.textContent = '⏸ Pause';
        }
      });
    }

    const prevBtn = this.$('safety-btn-prev');
    if (prevBtn) prevBtn.addEventListener('click', () => this.playbackController?.prev());

    const nextBtn = this.$('safety-btn-next');
    if (nextBtn) nextBtn.addEventListener('click', () => this.playbackController?.next());

    const firstBtn = this.$('safety-btn-first');
    if (firstBtn) firstBtn.addEventListener('click', () => this.playbackController?.first());

    const lastBtn = this.$('safety-btn-last');
    if (lastBtn) lastBtn.addEventListener('click', () => this.playbackController?.last());

    const slider = this.$('safety-timeline-slider');
    if (slider) {
      slider.addEventListener('input', (e) => {
        this.playbackController?.goTo(parseInt(e.target.value, 10));
      });
    }

    const speedSelect = this.$('safety-speed-select');
    if (speedSelect) {
      speedSelect.addEventListener('change', (e) => {
        this.playbackController?.setSpeed(parseInt(e.target.value, 10));
      });
    }
  },

  switchTab(tab) {
    this.activeTab = tab;

    // Update tab button classes
    const tabBtns = this.container.querySelectorAll('.deadlock-tab-btn');
    tabBtns.forEach(btn => {
      if (btn.dataset.tab === tab) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // Update pane visibility
    const panes = {
      safety: this.$('pane-safety'),
      request: this.$('pane-request'),
      rag: this.$('pane-rag')
    };

    Object.entries(panes).forEach(([k, pane]) => {
      if (pane) {
        if (k === tab) {
          pane.classList.add('active');
        } else {
          pane.classList.remove('active');
        }
      }
    });

    // Execute tab-specific action if needed
    if (tab === 'safety' && !this.currentSafetyResult) {
      this.runSafetySimulation();
    } else if (tab === 'request') {
      this.populateRequestProcSelect();
      this.runRequestSimulation();
    } else if (tab === 'rag') {
      this.renderRagView();
    }
  },

  loadPresetsDropdown() {
    const select = this.$('deadlock-preset-select');
    if (!select || !this.safetyEngine) return;

    const presets = this.safetyEngine.getPresets();
    select.innerHTML = `<option value="">-- Load Predefined Scenario --</option>` +
      presets.map((p, idx) => `<option value="${idx}">${p.name}</option>`).join('');
  },

  loadPreset(index) {
    const presets = this.safetyEngine.getPresets();
    const preset = presets[index];
    if (!preset) return;

    this.state = {
      processes: [...preset.data.processes],
      available: [...preset.data.available],
      max: preset.data.max.map(r => [...r]),
      allocation: preset.data.allocation.map(r => [...r]),
      request: preset.data.request
        ? { process: preset.data.request.process, resources: [...preset.data.request.resources] }
        : { process: preset.data.processes[0], resources: Array(preset.data.available.length).fill(0) }
    };

    // Update form controls
    const procsInput = this.$('deadlock-procs-input');
    if (procsInput) procsInput.value = this.state.processes.join(', ');

    const availInput = this.$('deadlock-avail-input');
    if (availInput) availInput.value = this.state.available.join(', ');

    const maxInput = this.$('deadlock-max-input');
    if (maxInput) maxInput.value = this.state.max.map(r => r.join(', ')).join('\n');

    const allocInput = this.$('deadlock-alloc-input');
    if (allocInput) allocInput.value = this.state.allocation.map(r => r.join(', ')).join('\n');

    this.populateRequestProcSelect();
    const reqVecInput = this.$('req-vec-input');
    if (reqVecInput) reqVecInput.value = this.state.request.resources.join(', ');

    showToast(`Loaded scenario: ${preset.name}`, 'info');

    // Run active tab
    if (this.activeTab === 'safety') {
      this.runSafetySimulation();
    } else if (this.activeTab === 'request') {
      this.runRequestSimulation();
    } else if (this.activeTab === 'rag') {
      this.renderRagView();
    }
  },

  populateRequestProcSelect() {
    const select = this.$('req-proc-select');
    if (!select) return;

    select.innerHTML = this.state.processes.map(p =>
      `<option value="${p}" ${p === this.state.request.process ? 'selected' : ''}>${p}</option>`
    ).join('');
  },

  parseInputs() {
    const procsStr = this.$('deadlock-procs-input')?.value || '';
    const availStr = this.$('deadlock-avail-input')?.value || '';
    const maxStr = this.$('deadlock-max-input')?.value || '';
    const allocStr = this.$('deadlock-alloc-input')?.value || '';

    const processes = procsStr.split(',').map(s => s.trim()).filter(Boolean);
    const available = availStr.split(',').map(s => parseInt(s.trim(), 10));

    const max = maxStr.trim().split('\n').map(row =>
      row.split(',').map(s => parseInt(s.trim(), 10))
    );

    const allocation = allocStr.trim().split('\n').map(row =>
      row.split(',').map(s => parseInt(s.trim(), 10))
    );

    return { processes, available, max, allocation };
  },

  syncInputs() {
    const parsed = this.parseInputs();
    this.state.processes = parsed.processes;
    this.state.available = parsed.available;
    this.state.max = parsed.max;
    this.state.allocation = parsed.allocation;
    this.populateRequestProcSelect();
  },

  runSafetySimulation() {
    this.syncInputs();

    try {
      const result = this.safetyEngine.run({
        processes: this.state.processes,
        available: this.state.available,
        max: this.state.max,
        allocation: this.state.allocation
      });

      this.currentSafetyResult = result;

      // Render Matrix tables
      const matrixContainer = this.$('safety-matrices-container');
      if (matrixContainer) {
        DeadlockRenderer.renderMatrixTables(matrixContainer, result.inputs);
      }

      // Initialize PlaybackController
      if (this.playbackController) {
        this.playbackController.destroy();
      }

      const slider = this.$('safety-timeline-slider');
      if (slider) {
        slider.max = result.snapshots.length - 1;
        slider.value = 0;
      }

      this.playbackController = new PlaybackController(result.snapshots, {
        onStep: (snapshot, index) => {
          this.renderSafetyPlaybackStep(snapshot, index);
        },
        onEnd: () => {
          const playBtn = this.$('safety-btn-play');
          if (playBtn) playBtn.textContent = '▶ Play';
        },
        speed: parseInt(this.$('safety-speed-select')?.value || '800', 10)
      });

      // Render Step 0
      this.renderSafetyPlaybackStep(result.snapshots[0], 0);

      // Render Verdict Card
      this.renderSafetyVerdict(result);

      // Track simulation run for authenticated user
      simulationTracker.recordRun('deadlock', 'deadlock_bankers_safety', {
        processes: this.state.processes,
        available: this.state.available,
        max: this.state.max,
        allocation: this.state.allocation
      }, {
        safe: result.safe,
        safeSequence: result.safeSequence,
        workSnapshotsCount: result.snapshots?.length
      });

      showToast(`Banker's Safety executed: ${result.safe ? 'SAFE state' : 'UNSAFE state'}`, result.safe ? 'success' : 'warning');
    } catch (err) {
      showToast(err.message, 'error');
    }
  },

  renderSafetyPlaybackStep(snapshot, index) {
    const counter = this.$('safety-step-counter');
    if (counter && this.currentSafetyResult) {
      counter.textContent = `Step ${index} / ${this.currentSafetyResult.snapshots.length - 1}`;
    }

    const slider = this.$('safety-timeline-slider');
    if (slider) slider.value = index;

    const display = this.$('safety-step-display');
    if (display && this.currentSafetyResult) {
      DeadlockRenderer.renderSafetyStep(display, snapshot, this.currentSafetyResult.inputs.processes);
    }
  },

  renderSafetyVerdict(result) {
    const card = this.$('safety-verdict-card');
    if (!card) return;

    card.innerHTML = `
      <div class="card" style="padding: var(--space-5); border-left: 4px solid ${result.safe ? '#10b981' : '#ef4444'};">
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: var(--space-3);">
          <div>
            <div style="display: flex; align-items: center; gap: var(--space-2);">
              <span style="font-size: var(--text-lg);">${result.safe ? '✅' : '⚠️'}</span>
              <span style="font-weight: 700; font-size: var(--text-base); color: ${result.safe ? '#10b981' : '#ef4444'};">
                ${result.safe ? 'SYSTEM IS IN A SAFE STATE' : 'SYSTEM IS IN AN UNSAFE STATE'}
              </span>
            </div>
            <p style="font-size: var(--text-xs); color: var(--text-secondary); margin-top: var(--space-1); max-width: 600px;">
              ${result.explanation}
            </p>
          </div>
          ${result.safe ? `
            <div style="text-align: right;">
              <span style="font-size: var(--text-xs); color: var(--text-muted); display: block;">Safe Execution Sequence:</span>
              <span style="font-family: var(--font-mono); font-weight: 700; color: #10b981; font-size: var(--text-sm);">
                &lt;${result.safeSequence.join(', ')}&gt;
              </span>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  },

  runRequestSimulation() {
    this.syncInputs();

    const proc = this.$('req-proc-select')?.value || this.state.processes[0];
    const reqStr = this.$('req-vec-input')?.value || '';
    const resources = reqStr.split(',').map(s => parseInt(s.trim(), 10));

    this.state.request = { process: proc, resources };

    try {
      const result = this.requestEngine.run({
        processes: this.state.processes,
        available: this.state.available,
        max: this.state.max,
        allocation: this.state.allocation,
        request: this.state.request
      });

      this.currentRequestResult = result;
      this.renderRequestDecision(result);

      if (result.tentativeState) {
        const matrixWrap = this.$('request-tentative-matrices');
        if (matrixWrap) {
          matrixWrap.innerHTML = `
            <div style="margin-top: var(--space-4);">
              <h4 style="font-size: var(--text-sm); font-weight: 700; margin-bottom: var(--space-3); color: var(--text-primary);">
                Tentative System State (Under Request Evaluation)
              </h4>
            </div>
          `;
          const subDiv = document.createElement('div');
          matrixWrap.appendChild(subDiv);
          DeadlockRenderer.renderMatrixTables(subDiv, {
            processes: result.inputs.processes,
            available: result.tentativeState.available,
            max: result.inputs.max,
            allocation: result.tentativeState.allocation,
            need: result.tentativeState.need
          }, { highlightProcess: proc });
        }
      } else {
        const matrixWrap = this.$('request-tentative-matrices');
        if (matrixWrap) matrixWrap.innerHTML = '';
      }

      // Track simulation run for authenticated user
      simulationTracker.recordRun('deadlock', 'deadlock_bankers_request', {
        processes: this.state.processes,
        available: this.state.available,
        max: this.state.max,
        allocation: this.state.allocation,
        request: this.state.request
      }, {
        granted: result.granted,
        status: result.status,
        reason: result.reason
      });

      showToast(`Request evaluation: ${result.granted ? 'GRANTED' : 'DENIED'}`, result.granted ? 'success' : 'warning');
    } catch (err) {
      showToast(err.message, 'error');
    }
  },

  renderRequestDecision(result) {
    const container = this.$('request-decision-display');
    if (!container) return;

    let bannerClass = 'status-granted';
    let bannerIcon = '\u2705';
    let titleText = 'REQUEST GRANTED';

    if (result.status === 'error_exceeds_claim') {
      bannerClass = 'status-denied';
      bannerIcon = '\u274C';
      titleText = 'ERROR: MAXIMUM CLAIM EXCEEDED';
    } else if (result.status === 'must_wait') {
      bannerClass = 'status-wait';
      bannerIcon = '\u23F3';
      titleText = 'REQUEST DENIED: PROCESS MUST WAIT';
    } else if (result.status === 'denied_unsafe') {
      bannerClass = 'status-denied';
      bannerIcon = '\u26A0\uFE0F';
      titleText = 'REQUEST DENIED: WOULD CAUSE UNSAFE STATE';
    }

    container.innerHTML = `
      <div class="request-decision-card">
        <div class="decision-status-banner ${bannerClass}">
          <span>${bannerIcon}</span>
          <span>${titleText}</span>
        </div>

        <div class="decision-detail-list">
          <div class="decision-detail-item">
            <span class="decision-detail-lbl">Requesting Process:</span>
            <span class="decision-detail-val">${result.inputs.request.process}</span>
          </div>
          <div class="decision-detail-item">
            <span class="decision-detail-lbl">Resource Vector:</span>
            <span class="decision-detail-val">[${result.inputs.request.resources.join(', ')}]</span>
          </div>
          <div class="decision-detail-item">
            <span class="decision-detail-lbl">Detailed Reason:</span>
            <span class="decision-detail-val" style="color: var(--text-secondary); font-family: var(--font-sans);">${result.reason}</span>
          </div>
          ${result.safetyResult && result.safetyResult.safeSequence.length > 0 ? `
            <div class="decision-detail-item">
              <span class="decision-detail-lbl">Safe Sequence:</span>
              <span class="decision-detail-val" style="color: #10b981;">&lt;${result.safetyResult.safeSequence.join(', ')}&gt;</span>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  },

  renderRagView() {
    this.syncInputs();
    const need = this.safetyEngine.calculateNeed(this.state.max, this.state.allocation);
    const container = this.$('rag-visualizer-container');
    if (container) {
      DeadlockRenderer.renderRag(container, {
        processes: this.state.processes,
        available: this.state.available,
        max: this.state.max,
        allocation: this.state.allocation,
        need
      });
    }
  },

  resetSimulation() {
    if (this.playbackController) {
      this.playbackController.destroy();
      this.playbackController = null;
    }
    this.currentSafetyResult = null;
    this.currentRequestResult = null;
    this.renderLayout();
    this.bindEvents();
    this.loadPresetsDropdown();
    this.runSafetySimulation();
    showToast('Simulation reset to default state.', 'info');
  },

  unmount() {
    if (this.playbackController) {
      this.playbackController.destroy();
      this.playbackController = null;
    }
    this.currentSafetyResult = null;
    this.currentRequestResult = null;
    if (this.container) {
      this.container.innerHTML = '';
    }
  }
};
