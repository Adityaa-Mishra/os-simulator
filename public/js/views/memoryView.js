/**
 * Memory Management View Controller
 * Dual-tab interface supporting:
 * 1. Contiguous Memory Allocation (First Fit, Best Fit, Worst Fit)
 * 2. Virtual Memory Page Replacement (FIFO, LRU, Optimal)
 */

import { simulationRegistry } from '../core/simulationRegistry.js';
import { PlaybackController } from '../core/playback.js';
import { MemoryRenderer } from '../visualizers/memoryRenderer.js';
import { showToast } from '../utils/toast.js';
import { simulationTracker } from '../core/simulationTracker.js';

export const memoryView = {
  mount(container) {
    this.container = container;
    this.activeTab = 'allocation'; // 'allocation' | 'page_replacement'
    this.allocPlayback = null;
    this.prPlayback = null;

    // Track module visit for authenticated learning progress
    simulationTracker.trackVisit('memory');

    // Allocation State
    this.allocAlgorithms = simulationRegistry.getAlgorithmsByModule('memory');
    this.selectedAllocAlgoId = this.allocAlgorithms[0]?.id || 'memory_first_fit';
    this.currentAllocEngine = simulationRegistry.get('memory', this.selectedAllocAlgoId);

    this.blocks = [
      { id: 'B1', size: 100 },
      { id: 'B2', size: 500 },
      { id: 'B3', size: 200 },
      { id: 'B4', size: 300 },
      { id: 'B5', size: 600 }
    ];

    this.processes = [
      { id: 'P1', size: 212 },
      { id: 'P2', size: 417 },
      { id: 'P3', size: 112 },
      { id: 'P4', size: 426 }
    ];

    // Page Replacement State
    this.prAlgorithms = simulationRegistry.getAlgorithmsByModule('page_replacement');
    this.selectedPrAlgoId = this.prAlgorithms[0]?.id || 'page_replacement_fifo';
    this.currentPrEngine = simulationRegistry.get('page_replacement', this.selectedPrAlgoId);

    this.referenceStringInput = '7, 0, 1, 2, 0, 3, 0, 4, 2, 3, 0, 3, 2, 1, 2, 0, 1, 7, 0, 1';
    this.frameCountInput = 3;

    // Check for pending simulation to load (from Saved Simulations or History)
    const pending = simulationTracker.getPendingSimulation('memory');
    if (pending && pending.inputs) {
      if (pending.inputs.blocks && pending.inputs.processes) {
        this.activeTab = 'allocation';
        this.blocks = pending.inputs.blocks;
        this.processes = pending.inputs.processes;
        if (pending.algorithm) {
          this.selectedAllocAlgoId = pending.algorithm;
          this.currentAllocEngine = simulationRegistry.get('memory', this.selectedAllocAlgoId);
        }
      } else if (pending.inputs.referenceString) {
        this.activeTab = 'page_replacement';
        this.referenceStringInput = Array.isArray(pending.inputs.referenceString) ? pending.inputs.referenceString.join(', ') : pending.inputs.referenceString;
        if (pending.inputs.frameCount) this.frameCountInput = pending.inputs.frameCount;
        if (pending.algorithm) {
          this.selectedPrAlgoId = pending.algorithm;
          this.currentPrEngine = simulationRegistry.get('page_replacement', this.selectedPrAlgoId);
        }
      }
    }

    this.renderLayout();
    this.bindEvents();
    this.updateAllocAlgorithmDetails();
    this.updatePrAlgorithmDetails();
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
      <div class="memory-container">
        <!-- Tab Navigation -->
        <div class="memory-tabs">
          <button id="tab-btn-alloc" class="memory-tab-btn ${this.activeTab === 'allocation' ? 'active' : ''}">
            <span>💾</span> Memory Allocation (Contiguous)
          </button>
          <button id="tab-btn-pr" class="memory-tab-btn ${this.activeTab === 'page_replacement' ? 'active' : ''}">
            <span>🔄</span> Page Replacement (Virtual Memory)
          </button>
        </div>

        <!-- TAB 1: MEMORY ALLOCATION PANEL -->
        <div id="panel-allocation" class="memory-tab-panel ${this.activeTab === 'allocation' ? 'active' : ''}">
          <!-- Header Card -->
          <div class="card" style="padding: var(--space-6);">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: var(--space-4);">
              <div>
                <h1 style="font-size: var(--text-2xl); font-weight: 800; color: var(--text-primary);">
                  Memory Allocation Simulator
                </h1>
                <p style="color: var(--text-secondary); font-size: var(--text-sm); margin-top: var(--space-1); max-width: 700px;">
                  Simulate contiguous fixed-partition memory allocation using First Fit, Best Fit, and Worst Fit strategies. Inspect internal and external fragmentation in real time.
                </p>
              </div>
              <div style="display: flex; gap: var(--space-2);">
                <button id="save-alloc-btn" class="btn btn-secondary">
                  <span>💾</span> Save
                </button>
                <button id="run-alloc-btn" class="btn btn-primary">
                  <span>▶</span> Run Allocation
                </button>
                <button id="reset-alloc-btn" class="btn btn-secondary">
                  Reset
                </button>
              </div>
            </div>

            <div style="display: flex; gap: var(--space-4); margin-top: var(--space-4); padding-top: var(--space-3); border-top: 1px solid var(--border-color); flex-wrap: wrap;">
              <div class="form-group" style="margin-bottom: 0; min-width: 220px;">
                <label class="form-label" for="alloc-algo-select">Algorithm</label>
                <select id="alloc-algo-select" class="form-select">
                  ${this.allocAlgorithms.map(a => `<option value="${a.id}">${a.name}</option>`).join('')}
                </select>
              </div>

              <div class="form-group" style="margin-bottom: 0; min-width: 260px;">
                <label class="form-label" for="alloc-preset-select">Load Preset Scenario</label>
                <select id="alloc-preset-select" class="form-select">
                  <option value="">-- Choose a Preset --</option>
                </select>
              </div>
            </div>
          </div>

          <!-- Workload Configuration Grid (Blocks & Processes) -->
          <div class="grid grid-cols-2" style="gap: var(--space-4);">
            <!-- Blocks Table -->
            <div class="card" style="padding: var(--space-4);">
              <div class="card-header" style="padding: 0 0 var(--space-3) 0;">
                <div>
                  <h3 class="card-title" style="font-size: var(--text-base);">Memory Partitions / Blocks</h3>
                  <p class="card-subtitle">Define initial physical memory block sizes (KB).</p>
                </div>
                <button id="add-block-btn" class="btn btn-outline btn-sm">+ Add Block</button>
              </div>
              <div class="process-table-wrapper">
                <table class="process-table" id="blocks-table">
                  <thead>
                    <tr>
                      <th>Block ID</th>
                      <th>Size (KB)</th>
                      <th style="width: 60px; text-align: center;">Action</th>
                    </tr>
                  </thead>
                  <tbody id="blocks-tbody">
                    <!-- Dynamically populated -->
                  </tbody>
                </table>
              </div>
            </div>

            <!-- Processes Table -->
            <div class="card" style="padding: var(--space-4);">
              <div class="card-header" style="padding: 0 0 var(--space-3) 0;">
                <div>
                  <h3 class="card-title" style="font-size: var(--text-base);">Process Requests</h3>
                  <p class="card-subtitle">Define processes requesting contiguous memory (KB).</p>
                </div>
                <button id="add-proc-btn" class="btn btn-outline btn-sm">+ Add Process</button>
              </div>
              <div class="process-table-wrapper">
                <table class="process-table" id="procs-table">
                  <thead>
                    <tr>
                      <th>Process ID</th>
                      <th>Size (KB)</th>
                      <th style="width: 60px; text-align: center;">Action</th>
                    </tr>
                  </thead>
                  <tbody id="procs-tbody">
                    <!-- Dynamically populated -->
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <!-- Allocation Results Section (Hidden until run) -->
          <div id="alloc-results-section" style="display: none; flex-direction: column; gap: var(--space-5);">
            <!-- Playback Bar -->
            <div class="card" style="padding: var(--space-4);">
              <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: var(--space-4);">
                <div style="display: flex; gap: var(--space-2);">
                  <button id="alloc-play-reset-btn" class="btn btn-secondary btn-sm" title="Reset to Start">⏮</button>
                  <button id="alloc-play-prev-btn" class="btn btn-secondary btn-sm" title="Previous Step">◀</button>
                  <button id="alloc-play-toggle-btn" class="btn btn-primary btn-sm" style="min-width: 70px;">▶ Play</button>
                  <button id="alloc-play-next-btn" class="btn btn-secondary btn-sm" title="Next Step">▶</button>
                </div>

                <div style="flex: 1; max-width: 480px; display: flex; align-items: center; gap: var(--space-3);">
                  <input type="range" id="alloc-slider" class="playback-slider" min="0" max="0" value="0" style="flex: 1;">
                  <span id="alloc-step-counter" style="font-family: var(--font-mono); font-size: var(--text-xs); color: var(--text-muted); min-width: 90px;">
                    Step 0 / 0
                  </span>
                </div>

                <div style="display: flex; align-items: center; gap: var(--space-2);">
                  <label for="alloc-speed-select" class="form-label" style="margin: 0; font-size: var(--text-xs);">Speed:</label>
                  <select id="alloc-speed-select" class="form-select" style="width: auto; padding: var(--space-1) var(--space-2); font-size: var(--text-xs);">
                    <option value="0.5">0.5x</option>
                    <option value="1" selected>1.0x</option>
                    <option value="2">2.0x</option>
                  </select>
                </div>
              </div>

              <!-- Action & Educational Note -->
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3); margin-top: var(--space-3); padding-top: var(--space-3); border-top: 1px solid var(--border-color);">
                <div style="font-size: var(--text-xs);">
                  <span style="color: var(--text-muted); font-weight: 600; text-transform: uppercase;">Current Action:</span>
                  <div id="alloc-action-log" style="color: var(--text-primary); font-family: var(--font-mono); margin-top: var(--space-1);">Allocation initialized.</div>
                </div>
                <div style="font-size: var(--text-xs);">
                  <span style="color: var(--text-muted); font-weight: 600; text-transform: uppercase;">Educational Rationale:</span>
                  <div id="alloc-educational-note" style="color: var(--text-secondary); margin-top: var(--space-1);">Step through to observe block selection.</div>
                </div>
              </div>
            </div>

            <!-- Memory Map Mount Point -->
            <div id="alloc-map-mount"></div>

            <!-- Aggregate Metrics Summary Cards -->
            <div class="card" style="padding: var(--space-5);">
              <h3 class="card-title" style="margin-bottom: var(--space-4);">Allocation Metrics</h3>
              <div class="grid grid-cols-3" style="gap: var(--space-3);">
                <div class="card" style="padding: var(--space-3); background: var(--bg-tertiary);">
                  <div style="font-size: var(--text-xs); color: var(--text-muted); text-transform: uppercase; font-weight: 600;">Total / Allocated Memory</div>
                  <div id="metric-alloc-memory" style="font-size: var(--text-xl); font-weight: 800; font-family: var(--font-mono); margin-top: var(--space-1);">0 / 0 KB</div>
                </div>
                <div class="card" style="padding: var(--space-3); background: var(--bg-tertiary);">
                  <div style="font-size: var(--text-xs); color: var(--text-muted); text-transform: uppercase; font-weight: 600;">Memory Utilization</div>
                  <div id="metric-alloc-util" style="font-size: var(--text-xl); font-weight: 800; font-family: var(--font-mono); margin-top: var(--space-1);">0%</div>
                </div>
                <div class="card" style="padding: var(--space-3); background: var(--bg-tertiary);">
                  <div style="font-size: var(--text-xs); color: var(--text-muted); text-transform: uppercase; font-weight: 600;">Internal Fragmentation</div>
                  <div id="metric-alloc-internal-frag" style="font-size: var(--text-xl); font-weight: 800; font-family: var(--font-mono); margin-top: var(--space-1); color: var(--accent-warning);">0 KB</div>
                </div>
                <div class="card" style="padding: var(--space-3); background: var(--bg-tertiary);">
                  <div style="font-size: var(--text-xs); color: var(--text-muted); text-transform: uppercase; font-weight: 600;">External Fragmentation</div>
                  <div id="metric-alloc-external-frag" style="font-size: var(--text-xl); font-weight: 800; font-family: var(--font-mono); margin-top: var(--space-1); color: var(--accent-danger);">0 KB</div>
                </div>
                <div class="card" style="padding: var(--space-3); background: var(--bg-tertiary);">
                  <div style="font-size: var(--text-xs); color: var(--text-muted); text-transform: uppercase; font-weight: 600;">Successful Allocations</div>
                  <div id="metric-alloc-success" style="font-size: var(--text-xl); font-weight: 800; font-family: var(--font-mono); margin-top: var(--space-1); color: var(--accent-success);">0</div>
                </div>
                <div class="card" style="padding: var(--space-3); background: var(--bg-tertiary);">
                  <div style="font-size: var(--text-xs); color: var(--text-muted); text-transform: uppercase; font-weight: 600;">Failed Allocations</div>
                  <div id="metric-alloc-failed" style="font-size: var(--text-xl); font-weight: 800; font-family: var(--font-mono); margin-top: var(--space-1);">0</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- TAB 2: PAGE REPLACEMENT PANEL -->
        <div id="panel-page-replacement" class="memory-tab-panel ${this.activeTab === 'page_replacement' ? 'active' : ''}">
          <!-- Header Card -->
          <div class="card" style="padding: var(--space-6);">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: var(--space-4);">
              <div>
                <h1 style="font-size: var(--text-2xl); font-weight: 800; color: var(--text-primary);">
                  Page Replacement Simulator
                </h1>
                <p style="color: var(--text-secondary); font-size: var(--text-sm); margin-top: var(--space-1); max-width: 700px;">
                  Simulate virtual memory page replacement policies: First-In First-Out (FIFO), Least Recently Used (LRU), and Optimal (Bélády's). Analyze hit/fault ratios step-by-step.
                </p>
              </div>
              <div style="display: flex; gap: var(--space-2);">
                <button id="save-pr-btn" class="btn btn-secondary">
                  <span>💾</span> Save
                </button>
                <button id="run-pr-btn" class="btn btn-primary">
                  <span>▶</span> Run Simulation
                </button>
                <button id="reset-pr-btn" class="btn btn-secondary">
                  Reset
                </button>
              </div>
            </div>

            <div style="display: flex; gap: var(--space-4); margin-top: var(--space-4); padding-top: var(--space-3); border-top: 1px solid var(--border-color); flex-wrap: wrap;">
              <div class="form-group" style="margin-bottom: 0; min-width: 220px;">
                <label class="form-label" for="pr-algo-select">Algorithm</label>
                <select id="pr-algo-select" class="form-select">
                  ${this.prAlgorithms.map(a => `<option value="${a.id}">${a.name}</option>`).join('')}
                </select>
              </div>

              <div class="form-group" style="margin-bottom: 0; min-width: 260px;">
                <label class="form-label" for="pr-preset-select">Load Preset Scenario</label>
                <select id="pr-preset-select" class="form-select">
                  <option value="">-- Choose a Preset --</option>
                </select>
              </div>
            </div>
          </div>

          <!-- Page Replacement Configuration -->
          <div class="card" style="padding: var(--space-5);">
            <div class="grid grid-cols-3" style="gap: var(--space-4); align-items: flex-end;">
              <div class="form-group" style="margin-bottom: 0; grid-column: span 2;">
                <label class="form-label" for="pr-ref-input">Page Reference String (comma or space separated)</label>
                <input type="text" id="pr-ref-input" class="form-input" value="${this.referenceStringInput}" placeholder="e.g. 7, 0, 1, 2, 0, 3, 0, 4">
              </div>

              <div class="form-group" style="margin-bottom: 0;">
                <label class="form-label" for="pr-frames-input">Number of Frames</label>
                <input type="number" id="pr-frames-input" class="form-input" value="${this.frameCountInput}" min="1" max="10">
              </div>
            </div>
          </div>

          <!-- Page Replacement Results Section (Hidden until run) -->
          <div id="pr-results-section" style="display: none; flex-direction: column; gap: var(--space-5);">
            <!-- Playback Bar -->
            <div class="card" style="padding: var(--space-4);">
              <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: var(--space-4);">
                <div style="display: flex; gap: var(--space-2);">
                  <button id="pr-play-reset-btn" class="btn btn-secondary btn-sm" title="Reset to Start">⏮</button>
                  <button id="pr-play-prev-btn" class="btn btn-secondary btn-sm" title="Previous Step">◀</button>
                  <button id="pr-play-toggle-btn" class="btn btn-primary btn-sm" style="min-width: 70px;">▶ Play</button>
                  <button id="pr-play-next-btn" class="btn btn-secondary btn-sm" title="Next Step">▶</button>
                </div>

                <div style="flex: 1; max-width: 480px; display: flex; align-items: center; gap: var(--space-3);">
                  <input type="range" id="pr-slider" class="playback-slider" min="0" max="0" value="0" style="flex: 1;">
                  <span id="pr-step-counter" style="font-family: var(--font-mono); font-size: var(--text-xs); color: var(--text-muted); min-width: 90px;">
                    Step 0 / 0
                  </span>
                </div>

                <div style="display: flex; align-items: center; gap: var(--space-2);">
                  <label for="pr-speed-select" class="form-label" style="margin: 0; font-size: var(--text-xs);">Speed:</label>
                  <select id="pr-speed-select" class="form-select" style="width: auto; padding: var(--space-1) var(--space-2); font-size: var(--text-xs);">
                    <option value="0.5">0.5x</option>
                    <option value="1" selected>1.0x</option>
                    <option value="2">2.0x</option>
                  </select>
                </div>
              </div>

              <!-- Action & Educational Note -->
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3); margin-top: var(--space-3); padding-top: var(--space-3); border-top: 1px solid var(--border-color);">
                <div style="font-size: var(--text-xs);">
                  <span style="color: var(--text-muted); font-weight: 600; text-transform: uppercase;">Current Action:</span>
                  <div id="pr-action-log" style="color: var(--text-primary); font-family: var(--font-mono); margin-top: var(--space-1);">Simulation initialized.</div>
                </div>
                <div style="font-size: var(--text-xs);">
                  <span style="color: var(--text-muted); font-weight: 600; text-transform: uppercase;">Educational Rationale:</span>
                  <div id="pr-educational-note" style="color: var(--text-secondary); margin-top: var(--space-1);">Step through to inspect page hits and faults.</div>
                </div>
              </div>
            </div>

            <!-- Page Replacement Matrix Mount Point -->
            <div id="pr-matrix-mount"></div>

            <!-- Summary Metrics Cards -->
            <div class="card" style="padding: var(--space-5);">
              <h3 class="card-title" style="margin-bottom: var(--space-4);">Page Replacement Performance</h3>
              <div class="grid grid-cols-3" style="gap: var(--space-3);">
                <div class="card" style="padding: var(--space-3); background: var(--bg-tertiary);">
                  <div style="font-size: var(--text-xs); color: var(--text-muted); text-transform: uppercase; font-weight: 600;">Total References</div>
                  <div id="metric-pr-refs" style="font-size: var(--text-xl); font-weight: 800; font-family: var(--font-mono); margin-top: var(--space-1);">0</div>
                </div>
                <div class="card" style="padding: var(--space-3); background: var(--bg-tertiary);">
                  <div style="font-size: var(--text-xs); color: var(--text-muted); text-transform: uppercase; font-weight: 600;">Page Faults (Misses)</div>
                  <div id="metric-pr-faults" style="font-size: var(--text-xl); font-weight: 800; font-family: var(--font-mono); margin-top: var(--space-1); color: var(--accent-danger);">0</div>
                </div>
                <div class="card" style="padding: var(--space-3); background: var(--bg-tertiary);">
                  <div style="font-size: var(--text-xs); color: var(--text-muted); text-transform: uppercase; font-weight: 600;">Page Hits</div>
                  <div id="metric-pr-hits" style="font-size: var(--text-xl); font-weight: 800; font-family: var(--font-mono); margin-top: var(--space-1); color: var(--accent-success);">0</div>
                </div>
                <div class="card" style="padding: var(--space-3); background: var(--bg-tertiary);">
                  <div style="font-size: var(--text-xs); color: var(--text-muted); text-transform: uppercase; font-weight: 600;">Fault Ratio</div>
                  <div id="metric-pr-fault-ratio" style="font-size: var(--text-xl); font-weight: 800; font-family: var(--font-mono); margin-top: var(--space-1);">0%</div>
                </div>
                <div class="card" style="padding: var(--space-3); background: var(--bg-tertiary);">
                  <div style="font-size: var(--text-xs); color: var(--text-muted); text-transform: uppercase; font-weight: 600;">Hit Ratio</div>
                  <div id="metric-pr-hit-ratio" style="font-size: var(--text-xl); font-weight: 800; font-family: var(--font-mono); margin-top: var(--space-1);">0%</div>
                </div>
                <div class="card" style="padding: var(--space-3); background: var(--bg-tertiary);">
                  <div style="font-size: var(--text-xs); color: var(--text-muted); text-transform: uppercase; font-weight: 600;">Evictions (Replacements)</div>
                  <div id="metric-pr-replacements" style="font-size: var(--text-xl); font-weight: 800; font-family: var(--font-mono); margin-top: var(--space-1);">0</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    this.renderBlocksTable();
    this.renderProcsTable();
  },

  bindEvents() {
    // Tab switching
    this.$('tab-btn-alloc')?.addEventListener('click', () => this.switchTab('allocation'));
    this.$('tab-btn-pr')?.addEventListener('click', () => this.switchTab('page_replacement'));

    // Allocation Events
    this.$('alloc-algo-select')?.addEventListener('change', (e) => {
      this.selectedAllocAlgoId = e.target.value;
      this.currentAllocEngine = simulationRegistry.get('memory', this.selectedAllocAlgoId);
      this.updateAllocAlgorithmDetails();
      this.clearAllocResults();
    });

    this.$('alloc-preset-select')?.addEventListener('change', (e) => {
      const idx = e.target.value;
      if (idx !== '') {
        const presets = this.currentAllocEngine.getPresets();
        const preset = presets[Number(idx)];
        if (preset && preset.data) {
          this.blocks = JSON.parse(JSON.stringify(preset.data.blocks));
          this.processes = JSON.parse(JSON.stringify(preset.data.processes));
          this.renderBlocksTable();
          this.renderProcsTable();
          this.clearAllocResults();
          showToast('Allocation preset loaded.', 'info');
        }
      }
    });

    this.$('add-block-btn')?.addEventListener('click', () => {
      const nextNum = this.blocks.length + 1;
      this.blocks.push({ id: `B${nextNum}`, size: 250 });
      this.renderBlocksTable();
    });

    this.$('add-proc-btn')?.addEventListener('click', () => {
      const nextNum = this.processes.length + 1;
      this.processes.push({ id: `P${nextNum}`, size: 150 });
      this.renderProcsTable();
    });

    this.$('save-alloc-btn')?.addEventListener('click', () => {
      simulationTracker.openSaveModal('memory', () => ({
        algorithm: this.selectedAllocAlgoId,
        blocks: this.blocks,
        processes: this.processes
      }), this.selectedAllocAlgoId);
    });

    this.$('run-alloc-btn')?.addEventListener('click', () => this.runAllocation());
    this.$('reset-alloc-btn')?.addEventListener('click', () => this.resetAllocation());

    // Alloc Playback
    this.$('alloc-play-toggle-btn')?.addEventListener('click', () => this.allocPlayback?.togglePlay());
    this.$('alloc-play-next-btn')?.addEventListener('click', () => this.allocPlayback?.nextStep());
    this.$('alloc-play-prev-btn')?.addEventListener('click', () => this.allocPlayback?.prevStep());
    this.$('alloc-play-reset-btn')?.addEventListener('click', () => this.allocPlayback?.reset());

    this.$('alloc-slider')?.addEventListener('input', (e) => {
      this.allocPlayback?.goToStep(Number(e.target.value));
    });

    this.$('alloc-speed-select')?.addEventListener('change', (e) => {
      this.allocPlayback?.setSpeed(Number(e.target.value));
    });

    // Page Replacement Events
    this.$('pr-algo-select')?.addEventListener('change', (e) => {
      this.selectedPrAlgoId = e.target.value;
      this.currentPrEngine = simulationRegistry.get('page_replacement', this.selectedPrAlgoId);
      this.updatePrAlgorithmDetails();
      this.clearPrResults();
    });

    this.$('save-pr-btn')?.addEventListener('click', () => {
      simulationTracker.openSaveModal('memory', () => ({
        algorithm: this.selectedPrAlgoId,
        referenceString: this.parseReferenceString(this.$('pr-ref-input')?.value || this.referenceStringInput),
        frameCount: Number(this.$('pr-frames-input')?.value || this.frameCountInput)
      }), this.selectedPrAlgoId);
    });

    this.$('pr-preset-select')?.addEventListener('change', (e) => {
      const idx = e.target.value;
      if (idx !== '') {
        const presets = this.currentPrEngine.getPresets();
        const preset = presets[Number(idx)];
        if (preset && preset.data) {
          this.referenceStringInput = preset.data.referenceString.join(', ');
          this.frameCountInput = preset.data.frameCount;
          const refIn = this.$('pr-ref-input');
          if (refIn) refIn.value = this.referenceStringInput;
          const frameIn = this.$('pr-frames-input');
          if (frameIn) frameIn.value = this.frameCountInput;
          this.clearPrResults();
          showToast('Page replacement preset loaded.', 'info');
        }
      }
    });

    this.$('run-pr-btn')?.addEventListener('click', () => this.runPageReplacement());
    this.$('reset-pr-btn')?.addEventListener('click', () => this.resetPageReplacement());

    // PR Playback
    this.$('pr-play-toggle-btn')?.addEventListener('click', () => this.prPlayback?.togglePlay());
    this.$('pr-play-next-btn')?.addEventListener('click', () => this.prPlayback?.nextStep());
    this.$('pr-play-prev-btn')?.addEventListener('click', () => this.prPlayback?.prevStep());
    this.$('pr-play-reset-btn')?.addEventListener('click', () => this.prPlayback?.reset());

    this.$('pr-slider')?.addEventListener('input', (e) => {
      this.prPlayback?.goToStep(Number(e.target.value));
    });

    this.$('pr-speed-select')?.addEventListener('change', (e) => {
      this.prPlayback?.setSpeed(Number(e.target.value));
    });
  },

  switchTab(tabName) {
    this.activeTab = tabName;

    const tabAlloc = this.$('tab-btn-alloc');
    const tabPr = this.$('tab-btn-pr');
    const panelAlloc = this.$('panel-allocation');
    const panelPr = this.$('panel-page-replacement');

    if (tabAlloc) tabAlloc.className = `memory-tab-btn ${tabName === 'allocation' ? 'active' : ''}`;
    if (tabPr) tabPr.className = `memory-tab-btn ${tabName === 'page_replacement' ? 'active' : ''}`;

    if (panelAlloc) panelAlloc.className = `memory-tab-panel ${tabName === 'allocation' ? 'active' : ''}`;
    if (panelPr) panelPr.className = `memory-tab-panel ${tabName === 'page_replacement' ? 'active' : ''}`;
  },

  updateAllocAlgorithmDetails() {
    const presetSelect = this.$('alloc-preset-select');
    if (presetSelect && this.currentAllocEngine) {
      const presets = this.currentAllocEngine.getPresets();
      presetSelect.innerHTML = `
        <option value="">-- Choose a Preset (${presets.length}) --</option>
        ${presets.map((p, idx) => `<option value="${idx}">${p.name}</option>`).join('')}
      `;
    }
  },

  updatePrAlgorithmDetails() {
    const presetSelect = this.$('pr-preset-select');
    if (presetSelect && this.currentPrEngine) {
      const presets = this.currentPrEngine.getPresets();
      presetSelect.innerHTML = `
        <option value="">-- Choose a Preset (${presets.length}) --</option>
        ${presets.map((p, idx) => `<option value="${idx}">${p.name}</option>`).join('')}
      `;
    }
  },

  renderBlocksTable() {
    const tbody = this.$('blocks-tbody');
    if (!tbody) return;

    tbody.innerHTML = this.blocks.map((b, idx) => `
      <tr data-index="${idx}">
        <td><input type="text" class="table-input" value="${b.id}" data-field="id" style="font-weight: 600;"></td>
        <td><input type="number" class="table-input" value="${b.size}" min="1" data-field="size"></td>
        <td style="text-align: center;">
          <button class="btn btn-outline btn-sm delete-block-btn" data-index="${idx}" style="color: var(--accent-danger);">✕</button>
        </td>
      </tr>
    `).join('');

    tbody.querySelectorAll('.table-input').forEach(input => {
      input.addEventListener('change', (e) => {
        const idx = Number(e.target.closest('tr').dataset.index);
        const field = e.target.dataset.field;
        this.blocks[idx][field] = field === 'id' ? e.target.value.trim() : Number(e.target.value);
      });
    });

    tbody.querySelectorAll('.delete-block-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = Number(e.currentTarget.dataset.index);
        if (this.blocks.length <= 1) {
          showToast('At least one block is required.', 'warning');
          return;
        }
        this.blocks.splice(idx, 1);
        this.renderBlocksTable();
      });
    });
  },

  renderProcsTable() {
    const tbody = this.$('procs-tbody');
    if (!tbody) return;

    tbody.innerHTML = this.processes.map((p, idx) => `
      <tr data-index="${idx}">
        <td><input type="text" class="table-input" value="${p.id}" data-field="id" style="font-weight: 600;"></td>
        <td><input type="number" class="table-input" value="${p.size}" min="1" data-field="size"></td>
        <td style="text-align: center;">
          <button class="btn btn-outline btn-sm delete-proc-btn" data-index="${idx}" style="color: var(--accent-danger);">✕</button>
        </td>
      </tr>
    `).join('');

    tbody.querySelectorAll('.table-input').forEach(input => {
      input.addEventListener('change', (e) => {
        const idx = Number(e.target.closest('tr').dataset.index);
        const field = e.target.dataset.field;
        this.processes[idx][field] = field === 'id' ? e.target.value.trim() : Number(e.target.value);
      });
    });

    tbody.querySelectorAll('.delete-proc-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = Number(e.currentTarget.dataset.index);
        if (this.processes.length <= 1) {
          showToast('At least one process is required.', 'warning');
          return;
        }
        this.processes.splice(idx, 1);
        this.renderProcsTable();
      });
    });
  },

  runAllocation() {
    if (!this.currentAllocEngine) return;

    // Collect inputs
    const inputs = {
      blocks: this.blocks.map(b => ({ id: String(b.id).trim(), size: Number(b.size) })),
      processes: this.processes.map(p => ({ id: String(p.id).trim(), size: Number(p.size) }))
    };

    const val = this.currentAllocEngine.validate(inputs);
    if (!val.isValid) {
      showToast(val.error, 'error');
      return;
    }

    try {
      const result = this.currentAllocEngine.run(inputs);

      const resultsSection = this.$('alloc-results-section');
      if (resultsSection) resultsSection.style.display = 'flex';

      // Render metrics
      const memEl = this.$('metric-alloc-memory');
      if (memEl) memEl.textContent = `${result.metrics.totalMemory} / ${result.metrics.allocatedMemory} KB`;

      const utilEl = this.$('metric-alloc-util');
      if (utilEl) utilEl.textContent = `${result.metrics.memoryUtilization}%`;

      const intFragEl = this.$('metric-alloc-internal-frag');
      if (intFragEl) intFragEl.textContent = `${result.metrics.totalInternalFragmentation} KB`;

      const extFragEl = this.$('metric-alloc-external-frag');
      if (extFragEl) extFragEl.textContent = `${result.metrics.externalFragmentation} KB`;

      const succEl = this.$('metric-alloc-success');
      if (succEl) succEl.textContent = result.metrics.successfulAllocations;

      const failEl = this.$('metric-alloc-failed');
      if (failEl) failEl.textContent = result.metrics.failedAllocations;

      // Initialize Playback
      this.initAllocPlayback(result.snapshots);
      simulationTracker.recordRun('memory', this.selectedAllocAlgoId, inputs, result.metrics);
      showToast(`Allocation complete (${result.snapshots.length - 1} steps).`, 'success');
    } catch (err) {
      console.error('[Memory Allocation Error]', err);
      showToast(`Allocation error: ${err.message}`, 'error');
    }
  },

  initAllocPlayback(snapshots) {
    this.allocPlayback?.destroy();

    const slider = this.$('alloc-slider');
    if (slider) {
      slider.max = snapshots.length - 1;
      slider.value = 0;
    }

    const playBtn = this.$('alloc-play-toggle-btn');

    this.allocPlayback = new PlaybackController(snapshots, {
      speed: Number(this.$('alloc-speed-select')?.value || 1.0),
      onStepChange: (snapshot, index, total) => {
        if (!snapshot) return;

        if (slider) slider.value = index;
        const counter = this.$('alloc-step-counter');
        if (counter) counter.textContent = `Step ${index} / ${total - 1}`;

        const actionEl = this.$('alloc-action-log');
        if (actionEl) actionEl.textContent = snapshot.actionLog;

        const noteEl = this.$('alloc-educational-note');
        if (noteEl) noteEl.textContent = snapshot.educationalNote;

        const mount = this.$('alloc-map-mount');
        MemoryRenderer.renderAllocationLayout(mount, snapshot);
      },
      onPlayStateChange: (isPlaying) => {
        if (playBtn) {
          playBtn.innerHTML = isPlaying ? '⏸ Pause' : '▶ Play';
          playBtn.className = isPlaying ? 'btn btn-secondary btn-sm' : 'btn btn-primary btn-sm';
        }
      }
    });

    this.allocPlayback.notifyStepChange();
  },

  resetAllocation() {
    this.blocks = [
      { id: 'B1', size: 100 },
      { id: 'B2', size: 500 },
      { id: 'B3', size: 200 },
      { id: 'B4', size: 300 },
      { id: 'B5', size: 600 }
    ];
    this.processes = [
      { id: 'P1', size: 212 },
      { id: 'P2', size: 417 },
      { id: 'P3', size: 112 },
      { id: 'P4', size: 426 }
    ];

    this.renderBlocksTable();
    this.renderProcsTable();
    this.clearAllocResults();
    showToast('Allocation reset to default.', 'info');
  },

  clearAllocResults() {
    this.allocPlayback?.destroy();
    this.allocPlayback = null;
    const resultsSection = this.$('alloc-results-section');
    if (resultsSection) resultsSection.style.display = 'none';
  },

  parseReferenceString(str) {
    if (!str || typeof str !== 'string') return [];
    return str
      .split(/[,\s]+/)
      .map(s => s.trim())
      .filter(Boolean)
      .map(s => (isNaN(Number(s)) ? s : Number(s)));
  },

  runPageReplacement() {
    if (!this.currentPrEngine) return;

    const refStr = this.parseReferenceString(this.$('pr-ref-input')?.value || this.referenceStringInput);
    const frameCount = Number(this.$('pr-frames-input')?.value || this.frameCountInput);

    const inputs = {
      referenceString: refStr,
      frameCount
    };

    const val = this.currentPrEngine.validate(inputs);
    if (!val.isValid) {
      showToast(val.error, 'error');
      return;
    }

    try {
      const result = this.currentPrEngine.run(inputs);

      const resultsSection = this.$('pr-results-section');
      if (resultsSection) resultsSection.style.display = 'flex';

      // Render metrics
      const refsEl = this.$('metric-pr-refs');
      if (refsEl) refsEl.textContent = result.metrics.totalReferences;

      const faultsEl = this.$('metric-pr-faults');
      if (faultsEl) faultsEl.textContent = result.metrics.pageFaults;

      const hitsEl = this.$('metric-pr-hits');
      if (hitsEl) hitsEl.textContent = result.metrics.pageHits;

      const faultRatioEl = this.$('metric-pr-fault-ratio');
      if (faultRatioEl) faultRatioEl.textContent = `${result.metrics.faultRatio}%`;

      const hitRatioEl = this.$('metric-pr-hit-ratio');
      if (hitRatioEl) hitRatioEl.textContent = `${result.metrics.hitRatio}%`;

      const repEl = this.$('metric-pr-replacements');
      if (repEl) repEl.textContent = result.metrics.replacementCount;

      // Initialize Playback
      this.initPrPlayback(result.snapshots);
      simulationTracker.recordRun('memory', this.selectedPrAlgoId, inputs, result.metrics);
      showToast(`Page replacement complete (${result.metrics.pageFaults} faults).`, 'success');
    } catch (err) {
      console.error('[Page Replacement Error]', err);
      showToast(`Page replacement error: ${err.message}`, 'error');
    }
  },

  initPrPlayback(snapshots) {
    this.prPlayback?.destroy();

    const slider = this.$('pr-slider');
    if (slider) {
      slider.max = snapshots.length - 1;
      slider.value = 0;
    }

    const playBtn = this.$('pr-play-toggle-btn');

    this.prPlayback = new PlaybackController(snapshots, {
      speed: Number(this.$('pr-speed-select')?.value || 1.0),
      onStepChange: (snapshot, index, total) => {
        if (!snapshot) return;

        if (slider) slider.value = index;
        const counter = this.$('pr-step-counter');
        if (counter) counter.textContent = `Step ${index} / ${total - 1}`;

        const actionEl = this.$('pr-action-log');
        if (actionEl) actionEl.textContent = snapshot.actionLog;

        const noteEl = this.$('pr-educational-note');
        if (noteEl) noteEl.textContent = snapshot.educationalNote;

        const mount = this.$('pr-matrix-mount');
        MemoryRenderer.renderPageReplacementTimeline(mount, snapshots, index);
      },
      onPlayStateChange: (isPlaying) => {
        if (playBtn) {
          playBtn.innerHTML = isPlaying ? '⏸ Pause' : '▶ Play';
          playBtn.className = isPlaying ? 'btn btn-secondary btn-sm' : 'btn btn-primary btn-sm';
        }
      }
    });

    this.prPlayback.notifyStepChange();
  },

  resetPageReplacement() {
    this.referenceStringInput = '7, 0, 1, 2, 0, 3, 0, 4, 2, 3, 0, 3, 2, 1, 2, 0, 1, 7, 0, 1';
    this.frameCountInput = 3;

    const refIn = this.$('pr-ref-input');
    if (refIn) refIn.value = this.referenceStringInput;
    const frameIn = this.$('pr-frames-input');
    if (frameIn) frameIn.value = this.frameCountInput;

    this.clearPrResults();
    showToast('Page replacement reset to default.', 'info');
  },

  clearPrResults() {
    this.prPlayback?.destroy();
    this.prPlayback = null;
    const resultsSection = this.$('pr-results-section');
    if (resultsSection) resultsSection.style.display = 'none';
  },

  unmount() {
    this.clearAllocResults();
    this.clearPrResults();
  }
};
