/**
 * Disk Scheduling View Controller
 * Interactive UI for configuring disk requests, executing algorithms
 * (FCFS, SSTF, SCAN, C-SCAN, LOOK, C-LOOK), visualizing cylinder seek trajectories,
 * and controlling step-by-step playback.
 */

import { simulationRegistry } from '../core/simulationRegistry.js';
import { PlaybackController } from '../core/playback.js';
import { DiskRenderer } from '../visualizers/diskRenderer.js';
import { showToast } from '../utils/toast.js';
import { simulationTracker } from '../core/simulationTracker.js';

export const diskView = {
  mount(container) {
    this.container = container;
    this.playbackController = null;
    this.currentResult = null;

    // Track module visit for authenticated learning progress
    simulationTracker.trackVisit('disk');

    // Retrieve registered disk algorithms
    this.algorithms = simulationRegistry.getAlgorithmsByModule('disk');
    if (this.algorithms.length === 0) {
      container.innerHTML = `<div class="card"><div class="card-body">No disk scheduling algorithms registered.</div></div>`;
      return;
    }

    this.selectedAlgorithmId = this.algorithms[0].id;
    this.currentEngine = this.algorithms[0].engine;

    // Default configuration (Classic textbook problem)
    this.requestsInput = '98, 183, 37, 122, 14, 124, 65, 67';
    this.initialHead = 53;
    this.diskSize = 200;
    this.direction = 'right';

    // Check for pending simulation to load (from Saved Simulations or History)
    const pending = simulationTracker.getPendingSimulation('disk');
    if (pending && pending.inputs) {
      if (pending.algorithm && this.algorithms.some(a => a.id === pending.algorithm)) {
        this.selectedAlgorithmId = pending.algorithm;
        this.currentEngine = simulationRegistry.get('disk', this.selectedAlgorithmId);
      }
      if (pending.inputs.requests) {
        this.requestsInput = Array.isArray(pending.inputs.requests) ? pending.inputs.requests.join(', ') : pending.inputs.requests;
      }
      if (pending.inputs.initialHead !== undefined) this.initialHead = pending.inputs.initialHead;
      if (pending.inputs.diskSize !== undefined) this.diskSize = pending.inputs.diskSize;
      if (pending.inputs.direction) this.direction = pending.inputs.direction;
    }

    this.renderLayout();
    this.bindEvents();
    this.updateAlgorithmDetails();
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
      <div class="disk-container">
        <!-- Header & Controls Card -->
        <div class="card" style="padding: var(--space-6);">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: var(--space-4);">
            <div>
              <h1 style="font-size: var(--text-2xl); font-weight: 800; color: var(--text-primary);">
                Disk Scheduling Simulator
              </h1>
              <p style="color: var(--text-secondary); font-size: var(--text-sm); margin-top: var(--space-1); max-width: 700px;">
                Simulate and compare hard disk arm scheduling policies (FCFS, SSTF, SCAN, C-SCAN, LOOK, C-LOOK) with seek trajectory graphs and cylinder track visualization.
              </p>
            </div>
            <div style="display: flex; gap: var(--space-2);">
              <button id="save-disk-btn" class="btn btn-secondary">
                <span>💾</span> Save
              </button>
              <button id="run-disk-btn" class="btn btn-primary">
                <span>▶</span> Run Simulation
              </button>
              <button id="reset-disk-btn" class="btn btn-secondary">
                Reset
              </button>
            </div>
          </div>

          <!-- Controls Bar -->
          <div style="display: flex; gap: var(--space-4); margin-top: var(--space-4); padding-top: var(--space-3); border-top: 1px solid var(--border-color); flex-wrap: wrap;">
            <div class="form-group" style="margin-bottom: 0; min-width: 240px;">
              <label class="form-label" for="disk-algo-select">Algorithm</label>
              <select id="disk-algo-select" class="form-select">
                ${this.algorithms.map(a => `<option value="${a.id}">${a.name}</option>`).join('')}
              </select>
            </div>

            <div class="form-group" style="margin-bottom: 0; min-width: 260px;">
              <label class="form-label" for="disk-preset-select">Load Preset</label>
              <select id="disk-preset-select" class="form-select">
                <option value="">-- Choose a Preset --</option>
              </select>
            </div>
          </div>

          <!-- Complexity Panel -->
          <div id="complexity-panel" style="margin-top: var(--space-3); display: flex; gap: var(--space-4); font-size: var(--text-xs); color: var(--text-muted);">
            <div><span>Time Complexity:</span> <strong id="complexity-time" style="color: var(--accent-primary); font-family: var(--font-mono);">O(n)</strong></div>
            <div><span>Space Complexity:</span> <strong id="complexity-space" style="color: var(--accent-primary); font-family: var(--font-mono);">O(1)</strong></div>
            <div id="complexity-desc" style="flex: 1;"></div>
          </div>
        </div>

        <!-- Input Parameters Card -->
        <div class="card" style="padding: var(--space-5);">
          <h3 class="card-title" style="margin-bottom: var(--space-3); font-size: var(--text-base);">Seek Parameters</h3>
          <div class="grid grid-cols-4" style="gap: var(--space-4); align-items: flex-end;">
            <div class="form-group" style="margin-bottom: 0; grid-column: span 2;">
              <label class="form-label" for="disk-requests-input">Cylinder Request Queue (comma-separated)</label>
              <input type="text" id="disk-requests-input" class="form-input" value="${this.requestsInput}" placeholder="e.g. 98, 183, 37, 122, 14, 124, 65, 67">
            </div>

            <div class="form-group" style="margin-bottom: 0;">
              <label class="form-label" for="disk-head-input">Initial Head Position</label>
              <input type="number" id="disk-head-input" class="form-input" value="${this.initialHead}" min="0">
            </div>

            <div class="form-group" style="margin-bottom: 0;">
              <label class="form-label" for="disk-size-input">Disk Size (Cylinders)</label>
              <input type="number" id="disk-size-input" class="form-input" value="${this.diskSize}" min="2">
            </div>

            <div class="form-group" style="margin-bottom: 0;">
              <label class="form-label" for="disk-dir-select">Initial Direction</label>
              <select id="disk-dir-select" class="form-select">
                <option value="right" ${this.direction === 'right' ? 'selected' : ''}>Right (Higher Cylinders ➔)</option>
                <option value="left" ${this.direction === 'left' ? 'selected' : ''}>Left (Lower Cylinders ⬅)</option>
              </select>
            </div>
          </div>
        </div>

        <!-- Simulation Results & Visualizers (Hidden until run) -->
        <div id="disk-results-section" style="display: none; flex-direction: column; gap: var(--space-6);">
          <!-- Playback Bar -->
          <div class="card" style="padding: var(--space-4);">
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: var(--space-4);">
              <div style="display: flex; gap: var(--space-2);">
                <button id="playback-reset-btn" class="btn btn-secondary btn-sm" title="Reset to Start">⏮</button>
                <button id="playback-prev-btn" class="btn btn-secondary btn-sm" title="Previous Step">◀</button>
                <button id="playback-play-btn" class="btn btn-primary btn-sm" style="min-width: 70px;">▶ Play</button>
                <button id="playback-next-btn" class="btn btn-secondary btn-sm" title="Next Step">▶</button>
              </div>

              <div style="flex: 1; max-width: 480px; display: flex; align-items: center; gap: var(--space-3);">
                <input type="range" id="playback-slider" class="playback-slider" min="0" max="0" value="0" style="flex: 1;">
                <span id="playback-step-counter" style="font-family: var(--font-mono); font-size: var(--text-xs); color: var(--text-muted); min-width: 90px;">
                  Step 0 / 0
                </span>
              </div>

              <div style="display: flex; align-items: center; gap: var(--space-2);">
                <label for="playback-speed-select" class="form-label" style="margin: 0; font-size: var(--text-xs);">Speed:</label>
                <select id="playback-speed-select" class="form-select" style="width: auto; padding: var(--space-1) var(--space-2); font-size: var(--text-xs);">
                  <option value="0.5">0.5x</option>
                  <option value="1" selected>1.0x</option>
                  <option value="2">2.0x</option>
                  <option value="4">4.0x</option>
                </select>
              </div>
            </div>

            <!-- Current Action & Educational Note -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3); margin-top: var(--space-3); padding-top: var(--space-3); border-top: 1px solid var(--border-color);">
              <div style="font-size: var(--text-xs);">
                <span style="color: var(--text-muted); font-weight: 600; text-transform: uppercase;">Current Action:</span>
                <div id="state-action-log" style="color: var(--text-primary); font-family: var(--font-mono); margin-top: var(--space-1);">Simulation initialized.</div>
              </div>
              <div style="font-size: var(--text-xs);">
                <span style="color: var(--text-muted); font-weight: 600; text-transform: uppercase;">Educational Rationale:</span>
                <div id="state-educational-note" style="color: var(--text-secondary); margin-top: var(--space-1);">Step through to observe head movements.</div>
              </div>
            </div>
          </div>

          <!-- Linear Cylinder Track Mount -->
          <div id="cylinder-track-mount"></div>

          <!-- 2D Seek Trajectory Graph Mount -->
          <div id="seek-trajectory-mount"></div>

          <!-- Performance Metrics Summary -->
          <div class="card" style="padding: var(--space-5);">
            <h3 class="card-title" style="margin-bottom: var(--space-4);">Seek Performance Metrics</h3>
            <div class="grid grid-cols-4" style="gap: var(--space-3);">
              <div class="card" style="padding: var(--space-3); background: var(--bg-tertiary);">
                <div style="font-size: var(--text-xs); color: var(--text-muted); text-transform: uppercase; font-weight: 600;">Total Head Movement</div>
                <div id="metric-total-movement" style="font-size: var(--text-2xl); font-weight: 800; font-family: var(--font-mono); margin-top: var(--space-1); color: var(--accent-primary);">0</div>
              </div>
              <div class="card" style="padding: var(--space-3); background: var(--bg-tertiary);">
                <div style="font-size: var(--text-xs); color: var(--text-muted); text-transform: uppercase; font-weight: 600;">Average Seek Length</div>
                <div id="metric-avg-movement" style="font-size: var(--text-2xl); font-weight: 800; font-family: var(--font-mono); margin-top: var(--space-1);">0 cyl/req</div>
              </div>
              <div class="card" style="padding: var(--space-3); background: var(--bg-tertiary);">
                <div style="font-size: var(--text-xs); color: var(--text-muted); text-transform: uppercase; font-weight: 600;">Max Individual Seek</div>
                <div id="metric-max-movement" style="font-size: var(--text-2xl); font-weight: 800; font-family: var(--font-mono); margin-top: var(--space-1);">0 cylinders</div>
              </div>
              <div class="card" style="padding: var(--space-3); background: var(--bg-tertiary);">
                <div style="font-size: var(--text-xs); color: var(--text-muted); text-transform: uppercase; font-weight: 600;">Head: Initial ➔ Final</div>
                <div id="metric-head-span" style="font-size: var(--text-xl); font-weight: 800; font-family: var(--font-mono); margin-top: var(--space-1);">0 ➔ 0</div>
              </div>
            </div>

            <!-- Service Order Sequence -->
            <div style="margin-top: var(--space-4); padding: var(--space-3); background: var(--bg-tertiary); border-radius: var(--radius-md); border: 1px solid var(--border-color);">
              <span style="font-size: var(--text-xs); font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Service Order Sequence:</span>
              <div id="metric-service-order" style="margin-top: var(--space-2); font-family: var(--font-mono); font-size: var(--text-sm); font-weight: 600; display: flex; flex-wrap: wrap; gap: var(--space-2);">
                <!-- Service order badges -->
              </div>
            </div>

            <!-- Event Trace Box -->
            <div style="margin-top: var(--space-4);">
              <span style="font-size: var(--text-xs); font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Chronological Event Trace:</span>
              <div id="disk-events-mount" class="disk-events-box" style="margin-top: var(--space-2);">
                <!-- Events -->
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  },

  bindEvents() {
    this.$('disk-algo-select')?.addEventListener('change', (e) => {
      this.selectedAlgorithmId = e.target.value;
      this.currentEngine = simulationRegistry.get('disk', this.selectedAlgorithmId);
      this.updateAlgorithmDetails();
      this.clearResults();
    });

    this.$('disk-preset-select')?.addEventListener('change', (e) => {
      const idx = e.target.value;
      if (idx !== '') {
        const presets = this.currentEngine.getPresets();
        const preset = presets[Number(idx)];
        if (preset && preset.data) {
          this.loadPresetData(preset.data);
        }
      }
    });

    this.$('save-disk-btn')?.addEventListener('click', () => {
      simulationTracker.openSaveModal('disk', () => this.collectInputs(), this.selectedAlgorithmId);
    });

    this.$('run-disk-btn')?.addEventListener('click', () => {
      this.runSimulation();
    });

    this.$('reset-disk-btn')?.addEventListener('click', () => {
      this.resetForm();
    });

    // Playback Controls
    this.$('playback-play-btn')?.addEventListener('click', () => {
      this.playbackController?.togglePlay();
    });

    this.$('playback-next-btn')?.addEventListener('click', () => {
      this.playbackController?.nextStep();
    });

    this.$('playback-prev-btn')?.addEventListener('click', () => {
      this.playbackController?.prevStep();
    });

    this.$('playback-reset-btn')?.addEventListener('click', () => {
      this.playbackController?.reset();
    });

    this.$('playback-slider')?.addEventListener('input', (e) => {
      this.playbackController?.goToStep(Number(e.target.value));
    });

    this.$('playback-speed-select')?.addEventListener('change', (e) => {
      this.playbackController?.setSpeed(Number(e.target.value));
    });
  },

  updateAlgorithmDetails() {
    if (!this.currentEngine) return;

    const comp = this.currentEngine.getComplexity();
    const timeEl = this.$('complexity-time');
    if (timeEl) timeEl.textContent = comp.time;
    const spaceEl = this.$('complexity-space');
    if (spaceEl) spaceEl.textContent = comp.space;
    const descEl = this.$('complexity-desc');
    if (descEl) descEl.textContent = comp.description;

    const presetSelect = this.$('disk-preset-select');
    if (presetSelect) {
      const presets = this.currentEngine.getPresets();
      presetSelect.innerHTML = `
        <option value="">-- Choose a Preset (${presets.length}) --</option>
        ${presets.map((p, idx) => `<option value="${idx}">${p.name}</option>`).join('')}
      `;
    }
  },

  parseRequests(inputStr) {
    if (!inputStr || typeof inputStr !== 'string') return [];
    return inputStr
      .split(/[,\s]+/)
      .map(s => s.trim())
      .filter(Boolean)
      .map(Number);
  },

  loadPresetData(presetData) {
    if (Array.isArray(presetData.requests)) {
      this.requestsInput = presetData.requests.join(', ');
      const reqIn = this.$('disk-requests-input');
      if (reqIn) reqIn.value = this.requestsInput;
    }
    if (presetData.initialHead !== undefined) {
      this.initialHead = presetData.initialHead;
      const headIn = this.$('disk-head-input');
      if (headIn) headIn.value = this.initialHead;
    }
    if (presetData.diskSize !== undefined) {
      this.diskSize = presetData.diskSize;
      const sizeIn = this.$('disk-size-input');
      if (sizeIn) sizeIn.value = this.diskSize;
    }
    if (presetData.direction !== undefined) {
      this.direction = presetData.direction;
      const dirIn = this.$('disk-dir-select');
      if (dirIn) dirIn.value = this.direction;
    }

    this.clearResults();
    showToast('Preset loaded successfully.', 'info');
  },

  resetForm() {
    this.requestsInput = '98, 183, 37, 122, 14, 124, 65, 67';
    this.initialHead = 53;
    this.diskSize = 200;
    this.direction = 'right';

    const reqIn = this.$('disk-requests-input');
    if (reqIn) reqIn.value = this.requestsInput;

    const headIn = this.$('disk-head-input');
    if (headIn) headIn.value = this.initialHead;

    const sizeIn = this.$('disk-size-input');
    if (sizeIn) sizeIn.value = this.diskSize;

    const dirIn = this.$('disk-dir-select');
    if (dirIn) dirIn.value = this.direction;

    const presetSelect = this.$('disk-preset-select');
    if (presetSelect) presetSelect.value = '';

    this.clearResults();
    showToast('Form reset to default parameters.', 'info');
  },

  clearResults() {
    this.playbackController?.destroy();
    this.playbackController = null;
    this.currentResult = null;

    const resultsSection = this.$('disk-results-section');
    if (resultsSection) resultsSection.style.display = 'none';
  },

  collectInputs() {
    const reqStr = this.$('disk-requests-input')?.value || this.requestsInput;
    const headVal = Number(this.$('disk-head-input')?.value ?? this.initialHead);
    const sizeVal = Number(this.$('disk-size-input')?.value ?? this.diskSize);
    const dirVal = this.$('disk-dir-select')?.value || this.direction;
    const requests = this.parseRequests(reqStr);
    return {
      requests,
      initialHead: headVal,
      diskSize: sizeVal,
      direction: dirVal
    };
  },

  runSimulation() {
    if (!this.currentEngine) return;

    const inputs = this.collectInputs();

    const val = this.currentEngine.validate(inputs);
    if (!val.isValid) {
      showToast(val.error, 'error');
      return;
    }

    try {
      const result = this.currentEngine.run(inputs);
      this.currentResult = result;

      // Track simulation run for authenticated user
      simulationTracker.recordRun('disk', this.selectedAlgorithmId, inputs, result.metrics);

      const resultsSection = this.$('disk-results-section');
      if (resultsSection) resultsSection.style.display = 'flex';

      // Render summary metrics
      const totEl = this.$('metric-total-movement');
      if (totEl) totEl.textContent = `${result.metrics.totalMovement} cylinders`;

      const avgEl = this.$('metric-avg-movement');
      if (avgEl) avgEl.textContent = `${result.metrics.averageMovement} cyl/req`;

      const maxEl = this.$('metric-max-movement');
      if (maxEl) maxEl.textContent = `${result.metrics.maxIndividualMovement} cylinders`;

      const spanEl = this.$('metric-head-span');
      if (spanEl) spanEl.textContent = `${result.metrics.initialHead} ➔ ${result.metrics.finalHead}`;

      // Render Service Order badges
      const orderMount = this.$('metric-service-order');
      if (orderMount) {
        orderMount.innerHTML = result.metrics.serviceOrder.map((cyl, idx) => `
          <span class="badge badge-primary" style="font-size: var(--text-xs);">
            #${idx + 1}: Cyl ${cyl}
          </span>
        `).join('');
      }

      // Render Event Trace
      const eventsMount = this.$('disk-events-mount');
      if (eventsMount && result.metrics.eventsLog) {
        eventsMount.innerHTML = result.metrics.eventsLog.map(evt => `
          <div class="disk-event-item">${evt}</div>
        `).join('');
      }

      // Initialize Playback
      this.initPlayback(result.snapshots, inputs.diskSize);
      showToast(`Simulation complete (${result.metrics.totalMovement} total cylinders moved).`, 'success');
    } catch (err) {
      console.error('[Disk Simulation Error]', err);
      showToast(`Simulation error: ${err.message}`, 'error');
    }
  },

  initPlayback(snapshots, diskSize) {
    this.playbackController?.destroy();

    const slider = this.$('playback-slider');
    if (slider) {
      slider.max = snapshots.length - 1;
      slider.value = 0;
    }

    const playBtn = this.$('playback-play-btn');

    this.playbackController = new PlaybackController(snapshots, {
      speed: Number(this.$('playback-speed-select')?.value || 1.0),
      onStepChange: (snapshot, index, total) => {
        if (!snapshot) return;

        if (slider) slider.value = index;
        const counter = this.$('playback-step-counter');
        if (counter) counter.textContent = `Step ${index} / ${total - 1}`;

        const actionEl = this.$('state-action-log');
        if (actionEl) actionEl.textContent = snapshot.actionLog;

        const noteEl = this.$('state-educational-note');
        if (noteEl) noteEl.textContent = snapshot.educationalNote;

        // Render linear cylinder track
        const trackMount = this.$('cylinder-track-mount');
        DiskRenderer.renderCylinderTrack(trackMount, snapshot, diskSize);

        // Render 2D seek trajectory SVG
        const trajMount = this.$('seek-trajectory-mount');
        DiskRenderer.renderSeekTrajectory(trajMount, snapshots, index, diskSize);
      },
      onPlayStateChange: (isPlaying) => {
        if (playBtn) {
          playBtn.innerHTML = isPlaying ? '⏸ Pause' : '▶ Play';
          playBtn.className = isPlaying ? 'btn btn-secondary btn-sm' : 'btn btn-primary btn-sm';
        }
      }
    });

    this.playbackController.notifyStepChange();
  },

  unmount() {
    this.clearResults();
  }
};
