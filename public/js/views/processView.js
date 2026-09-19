/**
 * Process Management View Controller
 * Interactive UI for configuring processes, 5-state transitions,
 * PCB inspection, queue visualizer, and step-by-step playback.
 */

import { simulationRegistry } from '../core/simulationRegistry.js';
import { PlaybackController } from '../core/playback.js';
import { ProcessRenderer } from '../visualizers/processRenderer.js';
import { showToast } from '../utils/toast.js';
import { simulationTracker } from '../core/simulationTracker.js';

export const processView = {
  mount(container) {
    this.container = container;
    this.playbackController = null;
    this.currentResult = null;
    this.selectedProcessId = null;

    // Track module visit for authenticated learning progress
    simulationTracker.trackVisit('process');

    // Get the registered Process Management engine
    this.currentEngine = simulationRegistry.get('process', 'process_pcb');
    if (!this.currentEngine) {
      container.innerHTML = `<div class="card"><div class="card-body">Process Management engine not found in registry.</div></div>`;
      return;
    }

    // Default process workload
    this.processes = [
      { id: 'P1', arrivalTime: 0, burstTime: 5, priority: 1, ioStr: '2:2' },
      { id: 'P2', arrivalTime: 1, burstTime: 3, priority: 2, ioStr: '' },
      { id: 'P3', arrivalTime: 2, burstTime: 4, priority: 3, ioStr: '' }
    ];

    // Check for pending simulation to load
    const pending = simulationTracker.getPendingSimulation('process');
    if (pending && pending.inputs && Array.isArray(pending.inputs.processes) && pending.inputs.processes.length > 0) {
      this.processes = pending.inputs.processes.map(p => ({
        id: p.id,
        arrivalTime: p.arrivalTime,
        burstTime: p.burstTime,
        priority: p.priority,
        ioStr: Array.isArray(p.ioBursts) ? p.ioBursts.map(b => `${b.start}:${b.duration}`).join(',') : (p.ioStr || '')
      }));
    }

    this.renderLayout();
    this.bindEvents();
    this.populatePresets();
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
      <div class="process-container">
        <!-- Header Card -->
        <div class="process-header-card">
          <div class="process-header-top">
            <div>
              <h1 class="process-title">Process Management & PCB Simulator</h1>
              <p class="process-subtitle">
                Observe the 5-state process lifecycle (New, Ready, Running, Waiting, Terminated), inspect the Process Control Block (PCB), and analyze context switching and I/O wait cycles.
              </p>
            </div>
            <div style="display: flex; gap: var(--space-2);">
              <button id="save-sim-btn" class="btn btn-secondary">
                <span>💾</span> Save
              </button>
              <button id="run-sim-btn" class="btn btn-primary">
                <span>▶</span> Run Simulation
              </button>
              <button id="reset-btn" class="btn btn-secondary">
                Reset
              </button>
            </div>
          </div>

          <div class="process-controls-bar">
            <div class="form-group" style="margin-bottom: 0; min-width: 260px;">
              <label class="form-label" for="preset-select">Load Preset Scenario</label>
              <select id="preset-select" class="form-select">
                <option value="">-- Choose a Preset --</option>
              </select>
            </div>

            <div class="form-group" style="margin-bottom: 0; flex: 1;">
              <span class="form-label">Algorithm Policy</span>
              <div style="padding: var(--space-2) 0; font-size: var(--text-sm); font-weight: 600; color: var(--text-primary);">
                Deterministic Non-Preemptive FCFS with I/O Blocking
              </div>
            </div>
          </div>
        </div>

        <!-- Process Workload Table Card -->
        <div class="process-table-card">
          <div class="card-header">
            <div>
              <h3 class="card-title">Process Workload & I/O Specifications</h3>
              <p class="card-subtitle">
                Define arrival times, burst requirements, priorities, and optional I/O bursts (format: <code>start:duration</code>, e.g., <code>2:2</code>).
              </p>
            </div>
            <button id="add-process-btn" class="btn btn-outline btn-sm">
              + Add Process
            </button>
          </div>

          <div class="process-table-wrapper">
            <table class="process-table" id="process-table">
              <thead>
                <tr>
                  <th>Process ID</th>
                  <th>Arrival Time</th>
                  <th>Burst Time</th>
                  <th>Priority</th>
                  <th>I/O Bursts (start:duration)</th>
                  <th style="width: 80px; text-align: center;">Actions</th>
                </tr>
              </thead>
              <tbody id="process-tbody">
                <!-- Dynamically populated rows -->
              </tbody>
            </table>
          </div>
        </div>

        <!-- Simulation Results & Visualizers (Hidden until run) -->
        <div id="results-section" style="display: none; flex-direction: column; gap: var(--space-6);">
          <!-- Playback Bar -->
          <div class="card" style="padding: var(--space-4);">
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: var(--space-4);">
              <div style="display: flex; gap: var(--space-2);">
                <button id="playback-reset-btn" class="btn btn-secondary btn-sm" title="Reset to Start">⏮</button>
                <button id="playback-prev-btn" class="btn btn-secondary btn-sm" title="Previous Step">◀</button>
                <button id="playback-play-btn" class="btn btn-primary btn-sm" style="min-width: 70px;">▶ Play</button>
                <button id="playback-next-btn" class="btn btn-secondary btn-sm" title="Next Step">▶</button>
              </div>

              <div style="flex: 1; max-width: 500px; display: flex; align-items: center; gap: var(--space-3);">
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
                <span style="color: var(--text-muted); font-weight: 600; text-transform: uppercase;">Current Action (t=<span id="current-tick-label">0</span>):</span>
                <div id="state-action-log" style="color: var(--text-primary); font-family: var(--font-mono); margin-top: var(--space-1);">Simulation initialized.</div>
              </div>
              <div style="font-size: var(--text-xs);">
                <span style="color: var(--text-muted); font-weight: 600; text-transform: uppercase;">Educational Rationale:</span>
                <div id="state-educational-note" style="color: var(--text-secondary); margin-top: var(--space-1);">Step through to inspect state changes.</div>
              </div>
            </div>
          </div>

          <!-- 5-State Lanes Board -->
          <div class="state-board-container">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <h3 class="card-title">5-State Process Model</h3>
              <span class="badge badge-info">Click any process chip to inspect its PCB</span>
            </div>
            <div id="state-lanes-mount"></div>
          </div>

          <!-- Mid Section: PCB Inspector & Queues -->
          <div class="process-mid-grid">
            <!-- PCB Inspector -->
            <div class="pcb-inspector-card">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <h3 class="card-title">Process Control Block (PCB) Inspector</h3>
                <select id="pcb-process-select" class="form-select" style="width: auto; padding: var(--space-1) var(--space-3); font-size: var(--text-xs);">
                  <!-- Process options -->
                </select>
              </div>
              <div id="pcb-inspector-mount">
                <!-- PCB details rendered here -->
              </div>
            </div>

            <!-- Queues & Events Log -->
            <div class="queues-card">
              <div class="queue-section">
                <div class="queue-title">
                  <span>Ready Queue (FIFO)</span>
                  <span id="ready-queue-count" class="badge badge-primary" style="font-size: 0.65rem;">0</span>
                </div>
                <div id="ready-queue-mount" class="queue-list">
                  <span style="color: var(--text-muted); font-size: var(--text-xs);">Empty</span>
                </div>
              </div>

              <div class="queue-section">
                <div class="queue-title">
                  <span>Waiting Queue (I/O Pending)</span>
                  <span id="waiting-queue-count" class="badge badge-warning" style="font-size: 0.65rem;">0</span>
                </div>
                <div id="waiting-queue-mount" class="queue-list">
                  <span style="color: var(--text-muted); font-size: var(--text-xs);">Empty</span>
                </div>
              </div>

              <div class="queue-section">
                <div class="queue-title">
                  <span>System Event Trace</span>
                </div>
                <div id="events-log-mount" class="events-log-box">
                  <!-- Chronological events -->
                </div>
              </div>
            </div>
          </div>

          <!-- Performance Metrics Summary -->
          <div class="card" style="padding: var(--space-5);">
            <h3 class="card-title" style="margin-bottom: var(--space-4);">Simulation Performance Metrics</h3>
            <div class="grid grid-cols-4" style="gap: var(--space-3);">
              <div class="card" style="padding: var(--space-3); background: var(--bg-tertiary);">
                <div style="font-size: var(--text-xs); color: var(--text-muted); text-transform: uppercase; font-weight: 600;">Context Switches</div>
                <div id="metric-context-switches" style="font-size: var(--text-2xl); font-weight: 800; font-family: var(--font-mono); margin-top: var(--space-1);">0</div>
              </div>
              <div class="card" style="padding: var(--space-3); background: var(--bg-tertiary);">
                <div style="font-size: var(--text-xs); color: var(--text-muted); text-transform: uppercase; font-weight: 600;">CPU Utilization</div>
                <div id="metric-cpu-util" style="font-size: var(--text-2xl); font-weight: 800; font-family: var(--font-mono); margin-top: var(--space-1);">0%</div>
              </div>
              <div class="card" style="padding: var(--space-3); background: var(--bg-tertiary);">
                <div style="font-size: var(--text-xs); color: var(--text-muted); text-transform: uppercase; font-weight: 600;">Throughput</div>
                <div id="metric-throughput" style="font-size: var(--text-2xl); font-weight: 800; font-family: var(--font-mono); margin-top: var(--space-1);">0 proc/unit</div>
              </div>
              <div class="card" style="padding: var(--space-3); background: var(--bg-tertiary);">
                <div style="font-size: var(--text-xs); color: var(--text-muted); text-transform: uppercase; font-weight: 600;">CPU Busy / Idle</div>
                <div id="metric-cpu-times" style="font-size: var(--text-xl); font-weight: 800; font-family: var(--font-mono); margin-top: var(--space-1);">0 / 0 units</div>
              </div>
            </div>

            <!-- Process Breakdown Table -->
            <div class="process-table-wrapper" style="margin-top: var(--space-4);">
              <table class="process-table">
                <thead>
                  <tr>
                    <th>Process ID</th>
                    <th>PID</th>
                    <th>Arrival</th>
                    <th>Burst</th>
                    <th>I/O Total</th>
                    <th>First Start</th>
                    <th>Completion (CT)</th>
                    <th>Turnaround (TAT)</th>
                    <th>Waiting (WT)</th>
                    <th>Response (RT)</th>
                  </tr>
                </thead>
                <tbody id="metrics-tbody">
                  <!-- Dynamically populated metrics -->
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    `;

    this.renderProcessTable();
  },

  populatePresets() {
    const presetSelect = this.$('preset-select');
    if (!presetSelect || !this.currentEngine) return;

    const presets = this.currentEngine.getPresets();
    presetSelect.innerHTML = `
      <option value="">-- Choose a Preset (${presets.length}) --</option>
      ${presets.map((p, idx) => `<option value="${idx}">${p.name}</option>`).join('')}
    `;
  },

  bindEvents() {
    const presetSelect = this.$('preset-select');
    if (presetSelect) {
      presetSelect.addEventListener('change', (e) => {
        const idx = e.target.value;
        if (idx !== '') {
          const presets = this.currentEngine.getPresets();
          const preset = presets[Number(idx)];
          if (preset && preset.data) {
            this.loadPresetData(preset.data);
          }
        }
      });
    }

    this.$('add-process-btn')?.addEventListener('click', () => {
      this.addProcess();
    });

    this.$('save-sim-btn')?.addEventListener('click', () => {
      simulationTracker.openSaveModal('process', () => this.collectInputs(), 'Process Simulation');
    });

    this.$('run-sim-btn')?.addEventListener('click', () => {
      this.runSimulation();
    });

    this.$('reset-btn')?.addEventListener('click', () => {
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

    const slider = this.$('playback-slider');
    if (slider) {
      slider.addEventListener('input', (e) => {
        this.playbackController?.goToStep(Number(e.target.value));
      });
    }

    const speedSelect = this.$('playback-speed-select');
    if (speedSelect) {
      speedSelect.addEventListener('change', (e) => {
        this.playbackController?.setSpeed(Number(e.target.value));
      });
    }

    const pcbSelect = this.$('pcb-process-select');
    if (pcbSelect) {
      pcbSelect.addEventListener('change', (e) => {
        this.selectedProcessId = e.target.value;
        this.updateCurrentPcbView();
      });
    }
  },

  renderProcessTable() {
    const tbody = this.$('process-tbody');
    if (!tbody) return;

    tbody.innerHTML = this.processes.map((p, idx) => `
      <tr data-index="${idx}">
        <td>
          <input type="text" class="table-input" value="${p.id}" data-field="id" style="font-weight: 600;">
        </td>
        <td>
          <input type="number" class="table-input" value="${p.arrivalTime}" min="0" data-field="arrivalTime">
        </td>
        <td>
          <input type="number" class="table-input" value="${p.burstTime}" min="1" data-field="burstTime">
        </td>
        <td>
          <input type="number" class="table-input" value="${p.priority ?? (idx + 1)}" min="1" data-field="priority">
        </td>
        <td>
          <input type="text" class="table-input" value="${p.ioStr ?? ''}" placeholder="e.g. 2:2" data-field="ioStr">
        </td>
        <td style="text-align: center;">
          <button class="btn btn-outline btn-sm delete-proc-btn" data-index="${idx}" title="Remove Process" style="color: var(--accent-danger);">
            ✕
          </button>
        </td>
      </tr>
    `).join('');

    // Bind input updates
    tbody.querySelectorAll('.table-input').forEach(input => {
      const handler = (e) => {
        const row = e.target.closest('tr');
        const idx = Number(row.dataset.index);
        const field = e.target.dataset.field;
        const val = e.target.value.trim();

        if (field === 'id' || field === 'ioStr') {
          this.processes[idx][field] = val;
        } else {
          this.processes[idx][field] = Number(val);
        }
      };

      input.addEventListener('change', handler);
      input.addEventListener('input', handler);
    });

    // Bind delete buttons
    tbody.querySelectorAll('.delete-proc-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = Number(e.currentTarget.dataset.index);
        if (this.processes.length <= 1) {
          showToast('At least one process is required.', 'warning');
          return;
        }
        this.processes.splice(idx, 1);
        this.renderProcessTable();
      });
    });
  },

  addProcess() {
    const nextNum = this.processes.length + 1;
    const lastProc = this.processes[this.processes.length - 1];
    const newArrival = lastProc ? lastProc.arrivalTime + 1 : 0;

    this.processes.push({
      id: `P${nextNum}`,
      arrivalTime: newArrival,
      burstTime: 3,
      priority: nextNum,
      ioStr: ''
    });

    this.renderProcessTable();
  },

  loadPresetData(presetData) {
    if (Array.isArray(presetData.processes)) {
      this.processes = presetData.processes.map(p => {
        let ioStr = '';
        if (Array.isArray(p.ioBursts) && p.ioBursts.length > 0) {
          ioStr = p.ioBursts.map(io => `${io.start}:${io.duration}`).join(', ');
        }
        return {
          id: p.id,
          arrivalTime: p.arrivalTime,
          burstTime: p.burstTime,
          priority: p.priority ?? 1,
          ioStr
        };
      });
    }

    this.renderProcessTable();
    this.clearResults();
    showToast('Preset scenario loaded successfully.', 'info');
  },

  resetForm() {
    this.processes = [
      { id: 'P1', arrivalTime: 0, burstTime: 5, priority: 1, ioStr: '2:2' },
      { id: 'P2', arrivalTime: 1, burstTime: 3, priority: 2, ioStr: '' },
      { id: 'P3', arrivalTime: 2, burstTime: 4, priority: 3, ioStr: '' }
    ];

    const presetSelect = this.$('preset-select');
    if (presetSelect) presetSelect.value = '';

    this.renderProcessTable();
    this.clearResults();
    showToast('Form reset to default workload.', 'info');
  },

  clearResults() {
    this.playbackController?.destroy();
    this.playbackController = null;
    this.currentResult = null;
    this.selectedProcessId = null;

    const resultsSection = this.$('results-section');
    if (resultsSection) {
      resultsSection.style.display = 'none';
    }
  },

  parseIoBursts(ioStr, procId) {
    if (!ioStr || typeof ioStr !== 'string' || ioStr.trim() === '') {
      return [];
    }

    const bursts = [];
    const parts = ioStr.split(',').map(s => s.trim()).filter(Boolean);

    for (const part of parts) {
      const match = part.split(':').map(s => s.trim());
      if (match.length !== 2) {
        throw new Error(`Process "${procId}": Invalid I/O format "${part}". Use "start:duration" (e.g. 2:2)`);
      }
      const start = Number(match[0]);
      const duration = Number(match[1]);

      if (isNaN(start) || isNaN(duration)) {
        throw new Error(`Process "${procId}": Non-numeric I/O values in "${part}"`);
      }

      bursts.push({ start, duration });
    }

    return bursts;
  },

  collectInputs() {
    // Sync from DOM if rendered
    const rows = this.container?.querySelectorAll('#process-tbody tr');
    if (rows && rows.length > 0) {
      this.processes = Array.from(rows).map(row => {
        const idInput = row.querySelector('[data-field="id"]');
        const atInput = row.querySelector('[data-field="arrivalTime"]');
        const btInput = row.querySelector('[data-field="burstTime"]');
        const prioInput = row.querySelector('[data-field="priority"]');
        const ioInput = row.querySelector('[data-field="ioStr"]');

        const atVal = atInput?.value.trim();
        const btVal = btInput?.value.trim();
        const prioVal = prioInput?.value.trim();

        return {
          id: idInput ? idInput.value.trim() : '',
          arrivalTime: atVal === '' ? NaN : Number(atVal),
          burstTime: btVal === '' ? NaN : Number(btVal),
          priority: prioVal === '' ? NaN : Number(prioVal),
          ioStr: ioInput ? ioInput.value.trim() : ''
        };
      });
    }

    const parsedProcesses = this.processes.map(p => ({
      id: String(p.id).trim(),
      arrivalTime: Number(p.arrivalTime),
      burstTime: Number(p.burstTime),
      priority: p.priority !== undefined ? Number(p.priority) : 1,
      ioBursts: this.parseIoBursts(p.ioStr, p.id)
    }));

    return { processes: parsedProcesses };
  },

  runSimulation() {
    if (!this.currentEngine) return;

    let inputs;
    try {
      inputs = this.collectInputs();
    } catch (parseErr) {
      showToast(parseErr.message, 'error');
      return;
    }

    // Validate using engine
    const validation = this.currentEngine.validate(inputs);
    if (!validation.isValid) {
      showToast(validation.error, 'error');
      return;
    }

    try {
      const result = this.currentEngine.run(inputs);
      this.currentResult = result;

      // Track simulation run (non-blocking)
      simulationTracker.recordRun('process', 'process_pcb', inputs, result.metrics);

      // Show results
      const resultsSection = this.$('results-section');
      if (resultsSection) {
        resultsSection.style.display = 'flex';
      }

      // Populate PCB process select
      const pcbSelect = this.$('pcb-process-select');
      if (pcbSelect) {
        pcbSelect.innerHTML = inputs.processes.map(p => `
          <option value="${p.id}">${p.id}</option>
        `).join('');
        this.selectedProcessId = inputs.processes[0].id;
        pcbSelect.value = this.selectedProcessId;
      }

      // Populate Events Log
      const eventsLogMount = this.$('events-log-mount');
      if (eventsLogMount && result.metrics.eventsLog) {
        eventsLogMount.innerHTML = result.metrics.eventsLog.map(evt => `
          <div class="events-log-item">${evt}</div>
        `).join('');
      }

      // Render aggregate metrics
      this.renderMetrics(result.metrics);

      // Initialize Playback
      this.initPlayback(result.snapshots);

      showToast(`Simulation completed with ${result.snapshots.length} execution steps.`, 'success');
    } catch (err) {
      console.error('[Process Simulation Error]', err);
      showToast(`Simulation error: ${err.message}`, 'error');
    }
  },

  renderMetrics(metrics) {
    const csEl = this.$('metric-context-switches');
    if (csEl) csEl.textContent = metrics.contextSwitches;

    const cpuEl = this.$('metric-cpu-util');
    if (cpuEl) cpuEl.textContent = `${metrics.cpuUtilization}%`;

    const tpEl = this.$('metric-throughput');
    if (tpEl) tpEl.textContent = `${metrics.throughput} proc/unit`;

    const timesEl = this.$('metric-cpu-times');
    if (timesEl) timesEl.textContent = `${metrics.cpuBusyTime} / ${metrics.cpuIdleTime} units`;

    // Process breakdown table
    const tbody = this.$('metrics-tbody');
    if (tbody) {
      tbody.innerHTML = metrics.processMetrics.map(p => `
        <tr>
          <td><strong>${p.id}</strong></td>
          <td>${p.pid}</td>
          <td>${p.arrivalTime}</td>
          <td>${p.burstTime}</td>
          <td>${p.totalIoTime}</td>
          <td>${p.firstStartTime !== null ? p.firstStartTime : '-'}</td>
          <td style="font-weight: 700;">${p.completionTime}</td>
          <td>${p.turnaroundTime}</td>
          <td>${p.waitingTime}</td>
          <td>${p.responseTime}</td>
        </tr>
      `).join('');
    }
  },

  initPlayback(snapshots) {
    if (this.playbackController) {
      this.playbackController.destroy();
    }

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

        // Update slider & counter
        if (slider) slider.value = index;
        const counter = this.$('playback-step-counter');
        if (counter) counter.textContent = `Step ${index + 1} / ${total}`;

        const tickLabel = this.$('current-tick-label');
        if (tickLabel) tickLabel.textContent = snapshot.timeUnit;

        const actionLogEl = this.$('state-action-log');
        if (actionLogEl) actionLogEl.textContent = snapshot.actionLog;

        const noteEl = this.$('state-educational-note');
        if (noteEl) noteEl.textContent = snapshot.educationalNote;

        // Auto-select running process in PCB inspector if running
        if (snapshot.state.runningProcess && (!this.selectedProcessId || snapshot.state.runningProcess !== this.selectedProcessId)) {
          this.selectedProcessId = snapshot.state.runningProcess;
          const pcbSelect = this.$('pcb-process-select');
          if (pcbSelect) pcbSelect.value = this.selectedProcessId;
        }

        // Render 5-state lanes
        const lanesMount = this.$('state-lanes-mount');
        ProcessRenderer.renderStateBoard(lanesMount, snapshot, (selectedId) => {
          this.selectedProcessId = selectedId;
          const pcbSelect = this.$('pcb-process-select');
          if (pcbSelect) pcbSelect.value = selectedId;
          this.updateCurrentPcbView();
        }, this.selectedProcessId);

        // Render queues
        const readyMount = this.$('ready-queue-mount');
        const waitingMount = this.$('waiting-queue-mount');
        ProcessRenderer.renderQueues(readyMount, waitingMount, snapshot);

        const rqCount = this.$('ready-queue-count');
        if (rqCount) rqCount.textContent = snapshot.state.readyQueue.length;

        const wqCount = this.$('waiting-queue-count');
        if (wqCount) wqCount.textContent = snapshot.state.waitingQueue.length;

        // Update PCB Inspector
        this.updateCurrentPcbView();
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

  updateCurrentPcbView() {
    const currentSnapshot = this.playbackController?.getCurrentSnapshot();
    if (!currentSnapshot || !currentSnapshot.state) return;

    const targetId = this.selectedProcessId || currentSnapshot.state.runningProcess || currentSnapshot.state.processes[0]?.id;
    const pcb = currentSnapshot.state.processes.find(p => p.id === targetId);

    const pcbMount = this.$('pcb-inspector-mount');
    ProcessRenderer.renderPcbInspector(pcbMount, pcb);
  },

  unmount() {
    this.clearResults();
  }
};
