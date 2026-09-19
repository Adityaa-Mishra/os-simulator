/**
 * CPU Scheduling View Controller
 * Orchestrates algorithm selection, process inputs, simulation execution,
 * Gantt chart visualization, and step-by-step playback controls.
 */

import { simulationRegistry } from '../core/simulationRegistry.js';
import { PlaybackController } from '../core/playback.js';
import { GanttRenderer, getProcessColor } from '../visualizers/ganttRenderer.js';
import { showToast } from '../utils/toast.js';
import { simulationTracker } from '../core/simulationTracker.js';

export const cpuView = {
  mount(container) {
    this.container = container;
    this.playbackController = null;
    this.currentEngine = null;
    this.currentResult = null;

    // Track module visit for authenticated learning progress
    simulationTracker.trackVisit('cpu');

    // Retrieve all registered CPU algorithms
    this.algorithms = simulationRegistry.getAlgorithmsByModule('cpu');
    if (this.algorithms.length === 0) {
      container.innerHTML = `<div class="card"><div class="card-body">No CPU scheduling engines registered.</div></div>`;
      return;
    }

    // Default to first algorithm
    this.selectedAlgorithmId = this.algorithms[0].id;
    this.currentEngine = this.algorithms[0].engine;

    // Default process list
    this.processes = [
      { id: 'P1', arrivalTime: 0, burstTime: 4, priority: 3 },
      { id: 'P2', arrivalTime: 1, burstTime: 3, priority: 1 },
      { id: 'P3', arrivalTime: 2, burstTime: 1, priority: 2 }
    ];

    // Check for pending simulation to load (from Saved Simulations or History)
    const pending = simulationTracker.getPendingSimulation('cpu');
    if (pending && pending.inputs) {
      if (pending.algorithm && this.algorithms.some(a => a.id === pending.algorithm)) {
        this.selectedAlgorithmId = pending.algorithm;
        this.currentEngine = simulationRegistry.get('cpu', this.selectedAlgorithmId);
      }
      if (Array.isArray(pending.inputs.processes) && pending.inputs.processes.length > 0) {
        this.processes = pending.inputs.processes;
      }
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
      <div class="cpu-container">
        <!-- Header & Controls Card -->
        <div class="cpu-header-card">
          <div class="cpu-header-top">
            <div>
              <h1 class="cpu-title">CPU Scheduling Simulator</h1>
              <p class="cpu-subtitle">
                Configure processes, execute scheduling algorithms, and analyze performance with interactive Gantt charts.
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

          <div class="cpu-controls-bar">
            <div class="form-group" style="margin-bottom: 0;">
              <label class="form-label" for="algorithm-select">Algorithm</label>
              <select id="algorithm-select" class="form-select">
                ${this.algorithms.map(a => `<option value="${a.id}">${a.name}</option>`).join('')}
              </select>
            </div>

            <div class="form-group" style="margin-bottom: 0;">
              <label class="form-label" for="preset-select">Load Preset</label>
              <select id="preset-select" class="form-select">
                <option value="">-- Choose a Preset --</option>
              </select>
            </div>

            <div id="quantum-control-group" class="form-group" style="margin-bottom: 0; display: none;">
              <label class="form-label" for="quantum-input">Time Quantum</label>
              <input type="number" id="quantum-input" class="form-input" value="2" min="1" max="100">
            </div>
          </div>

          <!-- Complexity & Info Panel -->
          <div id="complexity-panel" class="complexity-panel">
            <div class="complexity-item">
              <span>Time:</span>
              <span id="complexity-time" class="complexity-tag">O(n log n)</span>
            </div>
            <div class="complexity-item">
              <span>Space:</span>
              <span id="complexity-space" class="complexity-tag">O(n)</span>
            </div>
            <div class="complexity-item" style="flex: 1;">
              <span id="complexity-desc" style="color: var(--text-muted);"></span>
            </div>
          </div>
        </div>

        <!-- Process Table Card -->
        <div class="process-table-card">
          <div class="card-header">
            <div>
              <h3 class="card-title">Process Workload</h3>
              <p class="card-subtitle">Define arrival times, burst requirements, and priorities.</p>
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
                  <th id="th-priority">Priority</th>
                  <th style="width: 80px; text-align: center;">Actions</th>
                </tr>
              </thead>
              <tbody id="process-tbody">
                <!-- Dynamically populated rows -->
              </tbody>
            </table>
          </div>
        </div>

        <!-- Results Section (Hidden until simulation is run) -->
        <div id="results-section" style="display: none; flex-direction: column; gap: var(--space-6);">
          <!-- Gantt Chart Section -->
          <div class="gantt-section">
            <div class="gantt-header">
              <div>
                <h3 class="card-title">Gantt Chart Timeline</h3>
                <p class="card-subtitle">Visual timeline of process execution across time units.</p>
              </div>
              <span id="gantt-total-time-badge" class="badge badge-primary">Total Time: 0</span>
            </div>

            <div class="gantt-scroll-wrapper">
              <div id="gantt-chart-container"></div>
            </div>

            <!-- Playback Control Bar -->
            <div class="playback-bar">
              <div class="playback-buttons">
                <button id="playback-reset-btn" class="btn btn-secondary btn-sm" title="Reset to Start">⏮</button>
                <button id="playback-prev-btn" class="btn btn-secondary btn-sm" title="Previous Step">◀</button>
                <button id="playback-play-btn" class="btn btn-primary btn-sm" style="min-width: 70px;">▶ Play</button>
                <button id="playback-next-btn" class="btn btn-secondary btn-sm" title="Next Step">▶</button>
              </div>

              <div class="playback-slider-container">
                <input type="range" id="playback-slider" class="playback-slider" min="0" max="0" value="0">
                <span id="playback-step-counter" class="playback-status">Step 0 / 0</span>
              </div>

              <div style="display: flex; align-items: center; gap: var(--space-2);">
                <label for="playback-speed-select" class="form-label" style="margin: 0;">Speed:</label>
                <select id="playback-speed-select" class="form-select" style="width: auto; padding: var(--space-1) var(--space-2);">
                  <option value="0.5">0.5x</option>
                  <option value="1" selected>1.0x</option>
                  <option value="2">2.0x</option>
                  <option value="4">4.0x</option>
                </select>
              </div>
            </div>

            <!-- Step-by-Step State Display -->
            <div class="state-display-grid">
              <div class="state-card">
                <div class="state-card-title">Current State</div>
                <div style="display: flex; align-items: center; gap: var(--space-3); margin-top: var(--space-2);">
                  <div>
                    <span style="font-size: var(--text-xs); color: var(--text-muted);">Time Unit:</span>
                    <span id="state-time-unit" style="font-family: var(--font-mono); font-weight: 700; font-size: var(--text-lg); margin-left: var(--space-1);">0</span>
                  </div>
                  <div>
                    <span style="font-size: var(--text-xs); color: var(--text-muted);">Running:</span>
                    <span id="state-running-process" style="margin-left: var(--space-1); font-weight: 600;">IDLE</span>
                  </div>
                </div>
              </div>

              <div class="state-card">
                <div class="state-card-title">Ready Queue</div>
                <div id="state-ready-queue" class="queue-pill-list">
                  <span style="color: var(--text-muted); font-size: var(--text-xs);">Empty</span>
                </div>
              </div>

              <div class="state-card">
                <div class="state-card-title">Action Event</div>
                <div id="state-action-log" class="state-log-box">Simulation initialized.</div>
              </div>

              <div class="state-card">
                <div class="state-card-title">Educational Rationale</div>
                <div id="state-educational-note" class="state-note-box">Step through the timeline to view algorithmic decisions.</div>
              </div>
            </div>
          </div>

          <!-- Metrics Section -->
          <div class="metrics-section">
            <h3 class="card-title">Performance Metrics</h3>

            <!-- Aggregate Metric Cards -->
            <div class="metrics-summary-grid">
              <div class="metric-stat-card">
                <span class="metric-stat-label">Avg Turnaround Time</span>
                <span id="metric-avg-tat" class="metric-stat-value">0<span class="metric-stat-unit">units</span></span>
              </div>
              <div class="metric-stat-card">
                <span class="metric-stat-label">Avg Waiting Time</span>
                <span id="metric-avg-wt" class="metric-stat-value">0<span class="metric-stat-unit">units</span></span>
              </div>
              <div class="metric-stat-card">
                <span class="metric-stat-label">Avg Response Time</span>
                <span id="metric-avg-rt" class="metric-stat-value">0<span class="metric-stat-unit">units</span></span>
              </div>
              <div class="metric-stat-card">
                <span class="metric-stat-label">CPU Utilization</span>
                <span id="metric-cpu-util" class="metric-stat-value">0<span class="metric-stat-unit">%</span></span>
              </div>
              <div class="metric-stat-card">
                <span class="metric-stat-label">Throughput</span>
                <span id="metric-throughput" class="metric-stat-value">0<span class="metric-stat-unit">proc/unit</span></span>
              </div>
              <div class="metric-stat-card">
                <span class="metric-stat-label">Total / Idle Time</span>
                <span id="metric-times" class="metric-stat-value">0 / 0<span class="metric-stat-unit">units</span></span>
              </div>
            </div>

            <!-- Process Metrics Table -->
            <div class="card" style="margin-top: var(--space-4);">
              <div class="card-header">
                <h4 class="card-title" style="font-size: var(--text-sm);">Detailed Process Breakdown</h4>
              </div>
              <div class="process-table-wrapper">
                <table class="process-table">
                  <thead>
                    <tr>
                      <th>Process ID</th>
                      <th>Arrival Time</th>
                      <th>Burst Time</th>
                      <th>Priority</th>
                      <th>First Start</th>
                      <th>Completion (CT)</th>
                      <th>Turnaround (TAT)</th>
                      <th>Waiting (WT)</th>
                      <th>Response (RT)</th>
                    </tr>
                  </thead>
                  <tbody id="metrics-tbody">
                    <!-- Dynamically populated -->
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    this.renderProcessTable();
  },

  bindEvents() {
    const algoSelect = this.$('algorithm-select');
    if (algoSelect) {
      algoSelect.value = this.selectedAlgorithmId;
      algoSelect.addEventListener('change', (e) => {
        this.selectedAlgorithmId = e.target.value;
        this.currentEngine = simulationRegistry.get('cpu', this.selectedAlgorithmId);
        this.updateAlgorithmDetails();
        this.clearResults();
      });
    }

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
      simulationTracker.openSaveModal('cpu', () => this.collectInputs(), this.selectedAlgorithmId);
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
  },

  updateAlgorithmDetails() {
    if (!this.currentEngine) return;

    // Ensure processes have priority defaults if switching to a priority algorithm
    if (this.currentEngine.requiresPriority) {
      this.processes.forEach((p, i) => {
        if (p.priority === undefined || p.priority === null || isNaN(p.priority)) {
          p.priority = i + 1;
        }
      });
    }

    // Update quantum visibility
    const quantumGroup = this.$('quantum-control-group');
    if (quantumGroup) {
      quantumGroup.style.display = this.currentEngine.requiresQuantum ? 'flex' : 'none';
    }

    // Update priority column visibility
    const priorityHeader = this.$('th-priority');
    if (priorityHeader) {
      priorityHeader.style.display = this.currentEngine.requiresPriority ? 'table-cell' : 'none';
    }

    // Update complexity panel
    const complexity = this.currentEngine.getComplexity();
    const cTime = this.$('complexity-time');
    if (cTime) cTime.textContent = complexity.time;
    const cSpace = this.$('complexity-space');
    if (cSpace) cSpace.textContent = complexity.space;
    const cDesc = this.$('complexity-desc');
    if (cDesc) cDesc.textContent = complexity.description;

    // Populate presets
    const presetSelect = this.$('preset-select');
    if (presetSelect) {
      const presets = this.currentEngine.getPresets();
      presetSelect.innerHTML = `
        <option value="">-- Choose a Preset (${presets.length}) --</option>
        ${presets.map((p, idx) => `<option value="${idx}">${p.name}</option>`).join('')}
      `;
    }

    this.renderProcessTable();
  },

  renderProcessTable() {
    const tbody = this.$('process-tbody');
    if (!tbody) return;

    const showPriority = this.currentEngine ? this.currentEngine.requiresPriority : false;

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
        <td style="${showPriority ? '' : 'display: none;'}">
          <input type="number" class="table-input" value="${p.priority ?? 1}" data-field="priority">
        </td>
        <td style="text-align: center;">
          <button class="btn btn-outline btn-sm delete-proc-btn" data-index="${idx}" title="Remove Process" style="color: var(--accent-danger);">
            ✕
          </button>
        </td>
      </tr>
    `).join('');

    // Bind input and change events to local state
    tbody.querySelectorAll('.table-input').forEach(input => {
      const updateHandler = (e) => {
        const row = e.target.closest('tr');
        const idx = Number(row.dataset.index);
        const field = e.target.dataset.field;
        const val = e.target.value.trim();

        if (field === 'id') {
          this.processes[idx].id = val;
        } else {
          this.processes[idx][field] = Number(val);
        }
      };

      input.addEventListener('change', updateHandler);
      input.addEventListener('input', updateHandler);
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
      priority: nextNum
    });

    this.renderProcessTable();
  },

  loadPresetData(presetData) {
    if (Array.isArray(presetData.processes)) {
      this.processes = JSON.parse(JSON.stringify(presetData.processes));
    }
    if (presetData.quantum !== undefined) {
      const qInput = this.$('quantum-input');
      if (qInput) qInput.value = presetData.quantum;
    }
    this.renderProcessTable();
    this.clearResults();
    showToast('Preset loaded successfully.', 'info');
  },

  resetForm() {
    this.processes = [
      { id: 'P1', arrivalTime: 0, burstTime: 4, priority: 3 },
      { id: 'P2', arrivalTime: 1, burstTime: 3, priority: 1 },
      { id: 'P3', arrivalTime: 2, burstTime: 1, priority: 2 }
    ];
    const qInput = this.$('quantum-input');
    if (qInput) qInput.value = '2';
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

    const resultsSection = this.$('results-section');
    if (resultsSection) {
      resultsSection.style.display = 'none';
    }
  },

  collectInputs() {
    const rows = this.container?.querySelectorAll('#process-tbody tr');
    if (rows && rows.length > 0) {
      this.processes = Array.from(rows).map(row => {
        const idInput = row.querySelector('[data-field="id"]');
        const atInput = row.querySelector('[data-field="arrivalTime"]');
        const btInput = row.querySelector('[data-field="burstTime"]');
        const prioInput = row.querySelector('[data-field="priority"]');

        const atVal = atInput?.value.trim();
        const btVal = btInput?.value.trim();
        const prioVal = prioInput?.value.trim();

        return {
          id: idInput ? idInput.value.trim() : '',
          arrivalTime: atVal === '' ? NaN : Number(atVal),
          burstTime: btVal === '' ? NaN : Number(btVal),
          priority: this.currentEngine?.requiresPriority ? (prioVal === '' ? NaN : Number(prioVal)) : undefined
        };
      });
    }

    const inputs = {
      algorithm: this.selectedAlgorithmId,
      processes: this.processes.map(p => ({
        id: String(p.id).trim(),
        arrivalTime: Number(p.arrivalTime),
        burstTime: Number(p.burstTime),
        priority: p.priority !== undefined ? Number(p.priority) : undefined
      }))
    };

    if (this.currentEngine?.requiresQuantum) {
      const qVal = this.$('quantum-input')?.value.trim();
      inputs.quantum = qVal === '' ? NaN : Number(qVal);
    }

    return inputs;
  },

  runSimulation() {
    if (!this.currentEngine) return;

    const inputs = this.collectInputs();

    // Engine validation
    const validation = this.currentEngine.validate(inputs);
    if (!validation.isValid) {
      showToast(validation.error, 'error');
      return;
    }

    try {
      // Execute pure engine
      const result = this.currentEngine.run(inputs);
      this.currentResult = result;

      // Asynchronously record run in history & progress for authenticated users
      simulationTracker.recordRun('cpu', this.selectedAlgorithmId, inputs, result.metrics);

      // Display results section
      const resultsSection = this.$('results-section');
      if (resultsSection) {
        resultsSection.style.display = 'flex';
      }

      // Render Gantt chart
      const ganttContainer = this.$('gantt-chart-container');
      GanttRenderer.render(ganttContainer, result.metrics.ganttChart, result.metrics.totalTime);

      const totalTimeBadge = this.$('gantt-total-time-badge');
      if (totalTimeBadge) {
        totalTimeBadge.textContent = `Total Time: ${result.metrics.totalTime}`;
      }

      // Render Metrics
      this.renderMetrics(result.metrics);

      // Initialize Playback Controller
      this.initPlayback(result.snapshots, result.metrics.totalTime);

      showToast(`Simulation completed with ${result.snapshots.length} execution steps.`, 'success');
    } catch (err) {
      console.error('[CPU Simulation Error]', err);
      showToast(`Simulation error: ${err.message}`, 'error');
    }
  },

  renderMetrics(metrics) {
    // Summary cards
    const tatEl = this.$('metric-avg-tat');
    if (tatEl) tatEl.innerHTML = `${metrics.averageTurnaroundTime}<span class="metric-stat-unit">units</span>`;

    const wtEl = this.$('metric-avg-wt');
    if (wtEl) wtEl.innerHTML = `${metrics.averageWaitingTime}<span class="metric-stat-unit">units</span>`;

    const rtEl = this.$('metric-avg-rt');
    if (rtEl) rtEl.innerHTML = `${metrics.averageResponseTime}<span class="metric-stat-unit">units</span>`;

    const cpuEl = this.$('metric-cpu-util');
    if (cpuEl) cpuEl.innerHTML = `${metrics.cpuUtilization}<span class="metric-stat-unit">%</span>`;

    const tpEl = this.$('metric-throughput');
    if (tpEl) tpEl.innerHTML = `${metrics.throughput}<span class="metric-stat-unit">proc/unit</span>`;

    const timesEl = this.$('metric-times');
    if (timesEl) timesEl.innerHTML = `${metrics.totalTime} / ${metrics.idleTime}<span class="metric-stat-unit">units</span>`;

    // Detailed table
    const tbody = this.$('metrics-tbody');
    if (tbody) {
      tbody.innerHTML = metrics.processMetrics.map(p => `
        <tr>
          <td>
            <span class="process-badge" style="background-color: ${getProcessColor(p.id)};">
              ${p.id}
            </span>
          </td>
          <td>${p.arrivalTime}</td>
          <td>${p.burstTime}</td>
          <td>${p.priority !== null ? p.priority : '-'}</td>
          <td>${p.firstStartTime !== null ? p.firstStartTime : '-'}</td>
          <td style="font-weight: 600;">${p.completionTime}</td>
          <td>${p.turnaroundTime}</td>
          <td>${p.waitingTime}</td>
          <td>${p.responseTime}</td>
        </tr>
      `).join('');
    }
  },

  initPlayback(snapshots, totalTime) {
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

        // Update state display
        const timeEl = this.$('state-time-unit');
        if (timeEl) timeEl.textContent = snapshot.timeUnit;

        const runningEl = this.$('state-running-process');
        if (runningEl) {
          if (snapshot.activeUnit) {
            runningEl.innerHTML = `
              <span class="process-badge" style="background-color: ${getProcessColor(snapshot.activeUnit)};">
                ${snapshot.activeUnit}
              </span>
            `;
          } else {
            runningEl.innerHTML = `<span style="color: var(--text-muted); font-style: italic;">IDLE</span>`;
          }
        }

        // Ready queue badges
        const readyQueueEl = this.$('state-ready-queue');
        if (readyQueueEl) {
          if (snapshot.state.readyQueue.length > 0) {
            readyQueueEl.innerHTML = snapshot.state.readyQueue.map((id, i) => `
              <span class="process-badge" style="background-color: ${getProcessColor(id)};">${id}</span>
              ${i < snapshot.state.readyQueue.length - 1 ? '<span class="queue-arrow">➔</span>' : ''}
            `).join('');
          } else {
            readyQueueEl.innerHTML = `<span style="color: var(--text-muted); font-size: var(--text-xs);">Empty</span>`;
          }
        }

        // Action log & educational note
        const actionLogEl = this.$('state-action-log');
        if (actionLogEl) actionLogEl.textContent = snapshot.actionLog;

        const noteEl = this.$('state-educational-note');
        if (noteEl) noteEl.textContent = snapshot.educationalNote;

        // Update Gantt cursor line
        const ganttContainer = this.$('gantt-chart-container');
        GanttRenderer.updateCursor(ganttContainer, snapshot.timeUnit, totalTime);
      },
      onPlayStateChange: (isPlaying) => {
        if (playBtn) {
          playBtn.innerHTML = isPlaying ? '⏸ Pause' : '▶ Play';
          playBtn.className = isPlaying ? 'btn btn-secondary btn-sm' : 'btn btn-primary btn-sm';
        }
      }
    });

    // Trigger initial snapshot display
    this.playbackController.notifyStepChange();
  },

  unmount() {
    this.clearResults();
  }
};
