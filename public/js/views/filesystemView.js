/**
 * File System View Controller
 * Interactive UI for:
 * 1. Virtual File System operations (mkdir, rmdir, create, delete, read, write, open, close, cd, ls).
 * 2. Visual VFS tree hierarchy with node metadata inspector.
 * 3. 32-block contiguous disk allocation map with external fragmentation warnings.
 * 4. Step-by-step playback of filesystem operations via PlaybackController.
 * 5. Real-time metrics and operation log.
 */

import { simulationRegistry } from '../core/simulationRegistry.js';
import { PlaybackController } from '../core/playback.js';
import { FileSystemRenderer } from '../visualizers/fileSystemRenderer.js';
import { showToast } from '../utils/toast.js';
import { simulationTracker } from '../core/simulationTracker.js';

export const filesystemView = {
  mount(container) {
    this.container = container;
    this.playbackController = null;
    this.selectedNode = null;

    // Track module visit for authenticated learning progress
    simulationTracker.trackVisit('filesystem');

    this.engine = simulationRegistry.get('filesystem', 'filesystem_simulator');
    if (!this.engine) {
      container.innerHTML = `<div class="card"><div class="card-body">File System Simulator engine not found.</div></div>`;
      return;
    }

    // Check for pending simulation to load (from Saved Simulations or History)
    const pending = simulationTracker.getPendingSimulation('filesystem');
    if (pending && pending.inputs && pending.inputs.initialNodes) {
      this.engine.reset(pending.inputs.initialNodes, pending.inputs.config);
    } else {
      // Initialize with default preset
      const defaultPreset = this.engine.getPresets()[0];
      this.engine.reset(defaultPreset.data.initialNodes, defaultPreset.data.config);
    }

    this.renderLayout();
    this.bindEvents();
    this.loadPresetsDropdown();
    this.updateOperationFormFields();
    this.initPlayback();
    this.renderAll();
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
      <div class="filesystem-container">
        <!-- Header & Top Controls Card -->
        <div class="card" style="padding: var(--space-6);">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: var(--space-4);">
            <div>
              <h1 style="font-size: var(--text-2xl); font-weight: 800; color: var(--text-primary);">
                File System Simulator
              </h1>
              <p style="color: var(--text-secondary); font-size: var(--text-sm); margin-top: var(--space-1); max-width: 750px;">
                Explore a virtual in-memory file system with <strong>contiguous First-Fit block allocation</strong>, open/close file states, permissions, and <strong>external fragmentation</strong> analysis.
              </p>
            </div>
            <div style="display: flex; gap: var(--space-2);">
              <button id="save-vfs-btn" class="btn btn-secondary">
                <span>💾</span> Save
              </button>
              <button id="vfs-reset-btn" class="btn btn-secondary">
                Reset File System
              </button>
            </div>
          </div>

          <!-- Preset Selector -->
          <div style="display: flex; gap: var(--space-4); margin-top: var(--space-4); padding-top: var(--space-3); border-top: 1px solid var(--border-color); flex-wrap: wrap; align-items: flex-end;">
            <div class="form-group" style="margin-bottom: 0; min-width: 280px;">
              <label class="form-label" for="vfs-preset-select">Load Preset Scenario</label>
              <select id="vfs-preset-select" class="form-select">
                <option value="">-- Choose a Preset --</option>
              </select>
            </div>

            <!-- Current Working Directory Indicator -->
            <div style="display: flex; align-items: center; gap: var(--space-2); margin-left: auto; font-family: var(--font-mono); font-size: var(--text-xs); background: var(--bg-surface); padding: var(--space-2) var(--space-3); border-radius: var(--radius-md); border: 1px solid var(--border-color);">
              <span style="color: var(--text-muted);">Working Dir (cwd):</span>
              <strong id="vfs-cwd-display" style="color: var(--accent-primary);">${this.engine.currentPath}</strong>
            </div>
          </div>
        </div>

        <!-- Operations Controls Card -->
        <div class="card" style="padding: var(--space-5);">
          <h3 class="card-title" style="margin-bottom: var(--space-3); font-size: var(--text-base);">Execute File System Operation</h3>
          <div class="grid grid-cols-4" style="gap: var(--space-4); align-items: flex-end;">
            <div class="form-group" style="margin-bottom: 0;">
              <label class="form-label" for="vfs-op-select">Operation</label>
              <select id="vfs-op-select" class="form-select">
                <option value="create">create (File)</option>
                <option value="delete">delete (File)</option>
                <option value="mkdir">mkdir (Directory)</option>
                <option value="rmdir">rmdir (Directory)</option>
                <option value="read">read (File)</option>
                <option value="write">write / resize (File)</option>
                <option value="open">open (File)</option>
                <option value="close">close (File)</option>
                <option value="cd">cd (Change Dir)</option>
                <option value="ls">ls (List Dir)</option>
              </select>
            </div>

            <div class="form-group" style="margin-bottom: 0; grid-column: span 2;">
              <label class="form-label" for="vfs-path-input">Target Path (absolute or relative)</label>
              <input type="text" id="vfs-path-input" class="form-input font-mono" placeholder="e.g. /home/notes.txt or ./data" value="/home/test.txt">
            </div>

            <!-- Dynamic Size Field -->
            <div id="vfs-size-group" class="form-group" style="margin-bottom: 0;">
              <label id="vfs-size-label" class="form-label" for="vfs-size-input">File Size (Bytes)</label>
              <input type="number" id="vfs-size-input" class="form-input font-mono" value="120" min="0" step="1">
            </div>

            <!-- Dynamic Permissions Field -->
            <div id="vfs-perm-group" class="form-group" style="margin-bottom: 0;">
              <label class="form-label" for="vfs-perm-select">Permissions</label>
              <select id="vfs-perm-select" class="form-select font-mono">
                <option value="rw-" selected>rw- (Read/Write)</option>
                <option value="r--">r-- (Read Only)</option>
                <option value="r-x">r-x (Read/Exec)</option>
                <option value="rwx">rwx (Full)</option>
              </select>
            </div>

            <!-- Execute Button -->
            <div style="margin-bottom: 0;">
              <button id="vfs-exec-btn" class="btn btn-primary" style="width: 100%;">
                <span>▶</span> Execute
              </button>
            </div>
          </div>
        </div>

        <!-- Playback Controls Card -->
        <div class="card" style="padding: var(--space-4);">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-3); flex-wrap: wrap; gap: var(--space-2);">
            <span style="font-size: var(--text-xs); font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-primary);">
              Operation History Timeline Playback
            </span>
            <span id="vfs-step-counter" style="font-family: var(--font-mono); font-size: var(--text-xs); color: var(--text-muted);">
              Step 0 / 0
            </span>
          </div>

          <div style="display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap;">
            <div style="display: flex; gap: var(--space-1);">
              <button id="vfs-btn-first" class="btn btn-secondary btn-sm" title="First Step">⏮</button>
              <button id="vfs-btn-prev" class="btn btn-secondary btn-sm" title="Previous Step">◀</button>
              <button id="vfs-btn-play" class="btn btn-primary btn-sm" title="Play / Pause">▶ Play</button>
              <button id="vfs-btn-next" class="btn btn-secondary btn-sm" title="Next Step">▶</button>
              <button id="vfs-btn-last" class="btn btn-secondary btn-sm" title="Last Step">⏭</button>
            </div>

            <input type="range" id="vfs-timeline-slider" min="0" max="0" value="0" style="flex: 1; min-width: 160px;">

            <div style="display: flex; align-items: center; gap: var(--space-2);">
              <label for="vfs-speed-select" style="font-size: var(--text-xs); color: var(--text-muted);">Speed:</label>
              <select id="vfs-speed-select" class="form-select form-select-sm" style="width: auto;">
                <option value="0.5">0.5×</option>
                <option value="1.0" selected>1×</option>
                <option value="2.0">2×</option>
                <option value="4.0">4×</option>
              </select>
            </div>
          </div>
        </div>

        <!-- Tree & Metadata Row -->
        <div class="grid grid-cols-2" style="gap: var(--space-5); align-items: start;">
          <div id="vfs-tree-container"></div>
          <div id="vfs-details-container"></div>
        </div>

        <!-- 32-Block Disk Map -->
        <div id="vfs-blockmap-container"></div>

        <!-- Operation Log & Metrics Row -->
        <div class="grid grid-cols-2" style="gap: var(--space-5); align-items: start;">
          <!-- Operation Log -->
          <div class="vfs-log-card">
            <div class="vfs-log-header">
              <span class="vfs-tree-title">Chronological Operation Log</span>
              <span id="vfs-log-count" class="vfs-node-count">0 operations</span>
            </div>
            <div id="vfs-log-container" class="vfs-log-body">
              <!-- Log entries -->
            </div>
          </div>

          <!-- Metrics Summary Card -->
          <div class="card" style="padding: var(--space-4);">
            <div class="vfs-tree-header" style="margin-bottom: var(--space-3);">
              <span class="vfs-tree-title">System Metrics Summary</span>
              <span class="vfs-node-count">Real-Time VFS State</span>
            </div>
            <div id="vfs-metrics-container" class="grid grid-cols-2" style="gap: var(--space-3); font-size: var(--text-xs);">
              <!-- Metrics pills -->
            </div>
          </div>
        </div>
      </div>
    `;
  },

  bindEvents() {
    // Save button
    this.$('save-vfs-btn')?.addEventListener('click', () => {
      simulationTracker.openSaveModal('filesystem', () => ({
        initialNodes: this.engine.nodes ? Array.from(this.engine.nodes.values()) : [],
        config: this.engine.config
      }), 'filesystem_simulator');
    });

    // Operation selector changes form fields
    this.$('vfs-op-select')?.addEventListener('change', () => {
      this.updateOperationFormFields();
    });

    // Execute button
    this.$('vfs-exec-btn')?.addEventListener('click', () => {
      this.executeSelectedOperation();
    });

    // Reset button
    this.$('vfs-reset-btn')?.addEventListener('click', () => {
      this.resetSimulation();
    });

    // Preset selector
    this.$('vfs-preset-select')?.addEventListener('change', (e) => {
      const idx = parseInt(e.target.value, 10);
      if (!isNaN(idx)) {
        this.loadPreset(idx);
      }
    });

    // Playback Buttons
    this.$('vfs-btn-play')?.addEventListener('click', () => {
      this.playbackController?.togglePlay();
    });

    this.$('vfs-btn-prev')?.addEventListener('click', () => this.playbackController?.prevStep());
    this.$('vfs-btn-next')?.addEventListener('click', () => this.playbackController?.nextStep());
    this.$('vfs-btn-first')?.addEventListener('click', () => this.playbackController?.reset());
    this.$('vfs-btn-last')?.addEventListener('click', () => {
      if (this.playbackController) {
        this.playbackController.goToStep(this.engine.snapshots.length - 1);
      }
    });

    this.$('vfs-timeline-slider')?.addEventListener('input', (e) => {
      this.playbackController?.goToStep(parseInt(e.target.value, 10));
    });

    this.$('vfs-speed-select')?.addEventListener('change', (e) => {
      this.playbackController?.setSpeed(parseFloat(e.target.value));
    });
  },

  updateOperationFormFields() {
    const op = this.$('vfs-op-select')?.value || 'create';
    const sizeGroup = this.$('vfs-size-group');
    const sizeLabel = this.$('vfs-size-label');
    const permGroup = this.$('vfs-perm-group');

    if (op === 'create') {
      if (sizeGroup) sizeGroup.style.display = 'block';
      if (sizeLabel) sizeLabel.textContent = 'File Size (Bytes)';
      if (permGroup) permGroup.style.display = 'block';
    } else if (op === 'write') {
      if (sizeGroup) sizeGroup.style.display = 'block';
      if (sizeLabel) sizeLabel.textContent = 'New File Size (Bytes)';
      if (permGroup) permGroup.style.display = 'none';
    } else if (op === 'mkdir') {
      if (sizeGroup) sizeGroup.style.display = 'none';
      if (permGroup) permGroup.style.display = 'block';
    } else {
      if (sizeGroup) sizeGroup.style.display = 'none';
      if (permGroup) permGroup.style.display = 'none';
    }
  },

  loadPresetsDropdown() {
    const select = this.$('vfs-preset-select');
    if (!select || !this.engine) return;

    const presets = this.engine.getPresets();
    select.innerHTML = `<option value="">-- Choose a Preset --</option>` +
      presets.map((p, idx) => `<option value="${idx}">${p.name}</option>`).join('');
  },

  loadPreset(index) {
    const presets = this.engine.getPresets();
    const preset = presets[index];
    if (!preset) return;

    this.engine.reset(preset.data.initialNodes, preset.data.config);
    this.selectedNode = null;
    this.initPlayback();
    this.renderAll();
    showToast(`Loaded scenario: ${preset.name}`, 'info');
  },

  initPlayback() {
    if (this.playbackController) {
      this.playbackController.destroy();
    }

    const slider = this.$('vfs-timeline-slider');
    if (slider) {
      slider.max = Math.max(0, this.engine.snapshots.length - 1);
      slider.value = this.engine.snapshots.length - 1;
    }

    this.playbackController = new PlaybackController(this.engine.snapshots, {
      onStepChange: (snapshot, index) => {
        this.renderPlaybackStep(snapshot, index);
      },
      onPlayStateChange: (isPlaying) => {
        const playBtn = this.$('vfs-btn-play');
        if (playBtn) playBtn.textContent = isPlaying ? '⏸ Pause' : '▶ Play';
      },
      speed: parseFloat(this.$('vfs-speed-select')?.value || '1.0')
    });

    // Point playback to the most recent snapshot initially
    this.playbackController.goToStep(this.engine.snapshots.length - 1);
  },

  executeSelectedOperation() {
    const op = this.$('vfs-op-select')?.value || 'create';
    const path = this.$('vfs-path-input')?.value || '';
    const size = parseInt(this.$('vfs-size-input')?.value || '0', 10);
    const permissions = this.$('vfs-perm-select')?.value || 'rw-';

    let result = null;

    switch (op) {
      case 'create':
        result = this.engine.create(path, size, permissions);
        break;
      case 'delete':
        result = this.engine.delete(path);
        break;
      case 'mkdir':
        result = this.engine.mkdir(path, permissions);
        break;
      case 'rmdir':
        result = this.engine.rmdir(path);
        break;
      case 'read':
        result = this.engine.read(path);
        break;
      case 'write':
        result = this.engine.write(path, size);
        break;
      case 'open':
        result = this.engine.open(path);
        break;
      case 'close':
        result = this.engine.close(path);
        break;
      case 'cd':
        result = this.engine.cd(path);
        break;
      case 'ls':
        result = this.engine.ls(path);
        break;
      default:
        break;
    }

    if (result) {
      if (result.success) {
        showToast(result.message, 'success');
        // Track simulation run for authenticated user
        simulationTracker.recordRun('filesystem', 'filesystem_simulator', {
          operation: op,
          path,
          size,
          permissions
        }, this.engine.getMetrics ? this.engine.getMetrics() : {});
      } else {
        showToast(`[${result.errorCode}] ${result.message}`, 'error');
      }
    }

    // Refresh playback slider and render latest state
    const slider = this.$('vfs-timeline-slider');
    if (slider) {
      slider.max = this.engine.snapshots.length - 1;
      slider.value = this.engine.snapshots.length - 1;
    }

    if (this.playbackController) {
      this.playbackController.setSnapshots(this.engine.snapshots);
      this.playbackController.goToStep(this.engine.snapshots.length - 1);
    }

    this.renderAll();
  },

  renderPlaybackStep(snapshot, index) {
    const counter = this.$('vfs-step-counter');
    if (counter) {
      counter.textContent = `Step ${index} / ${this.engine.snapshots.length - 1}`;
    }

    const slider = this.$('vfs-timeline-slider');
    if (slider) slider.value = index;

    const cwdDisplay = this.$('vfs-cwd-display');
    if (cwdDisplay) cwdDisplay.textContent = snapshot.currentPath;

    // Render tree from snapshot
    const treeContainer = this.$('vfs-tree-container');
    if (treeContainer) {
      FileSystemRenderer.renderTree(treeContainer, snapshot.fileSystemTree, snapshot.activeNodeId, (node) => {
        this.selectedNode = node;
        const detailsContainer = this.$('vfs-details-container');
        if (detailsContainer) FileSystemRenderer.renderNodeDetails(detailsContainer, node);
        const pathInput = this.$('vfs-path-input');
        if (pathInput) pathInput.value = this.getNodePath(node, snapshot.fileSystemTree);
      });
    }

    // Render block map from snapshot
    const blockmapContainer = this.$('vfs-blockmap-container');
    if (blockmapContainer) {
      FileSystemRenderer.renderBlockMap(blockmapContainer, snapshot.blockMap, snapshot.fileSystemTree, {
        highlightFileId: snapshot.activeNodeId
      });
    }

    // Render node details
    const detailsContainer = this.$('vfs-details-container');
    if (detailsContainer) {
      const activeNode = snapshot.activeNodeId
        ? snapshot.fileSystemTree.find(n => n.id === snapshot.activeNodeId)
        : this.selectedNode;
      FileSystemRenderer.renderNodeDetails(detailsContainer, activeNode);
    }
  },

  renderAll() {
    const currentNodes = Array.from(this.engine.nodes.values());

    // CWD
    const cwdDisplay = this.$('vfs-cwd-display');
    if (cwdDisplay) cwdDisplay.textContent = this.engine.currentPath;

    // Tree
    const treeContainer = this.$('vfs-tree-container');
    if (treeContainer) {
      FileSystemRenderer.renderTree(treeContainer, currentNodes, this.selectedNode?.id, (node) => {
        this.selectedNode = node;
        const detailsContainer = this.$('vfs-details-container');
        if (detailsContainer) FileSystemRenderer.renderNodeDetails(detailsContainer, node);
        const pathInput = this.$('vfs-path-input');
        if (pathInput) pathInput.value = this.getNodePath(node, currentNodes);
      });
    }

    // Details
    const detailsContainer = this.$('vfs-details-container');
    if (detailsContainer) {
      FileSystemRenderer.renderNodeDetails(detailsContainer, this.selectedNode);
    }

    // Block Map
    const blockmapContainer = this.$('vfs-blockmap-container');
    if (blockmapContainer) {
      FileSystemRenderer.renderBlockMap(blockmapContainer, this.engine.blockMap, currentNodes, {
        highlightFileId: this.selectedNode?.id
      });
    }

    // Operation Log
    this.renderOperationLog();

    // Metrics
    this.renderMetrics();
  },

  getNodePath(node, nodesList) {
    if (!node) return '/';
    if (node.id === 'root') return '/';

    const pathParts = [node.name];
    let curr = node;
    const map = new Map(nodesList.map(n => [n.id, n]));

    while (curr && curr.parentId && curr.parentId !== 'root') {
      curr = map.get(curr.parentId);
      if (curr) pathParts.unshift(curr.name);
    }

    return '/' + pathParts.join('/');
  },

  renderOperationLog() {
    const logContainer = this.$('vfs-log-container');
    const countEl = this.$('vfs-log-count');
    if (!logContainer) return;

    if (countEl) countEl.textContent = `${this.engine.operationLog.length} operations`;

    if (this.engine.operationLog.length === 0) {
      logContainer.innerHTML = `<div style="color: var(--text-muted); font-size: 11px;">No operations recorded yet.</div>`;
      return;
    }

    logContainer.innerHTML = this.engine.operationLog.slice().reverse().map((entry, idx) => {
      const num = this.engine.operationLog.length - idx;
      return `
        <div class="vfs-log-entry">
          <span style="color: var(--text-muted); min-width: 28px;">[${num}]</span>
          <span class="log-op">${entry.operation.toUpperCase()}</span>
          <span style="color: var(--text-primary); font-family: var(--font-mono);">${entry.path}</span>
          <span class="log-badge ${entry.success ? 'success' : 'failure'}">${entry.success ? 'SUCCESS' : (entry.errorCode || 'FAILED')}</span>
          <span class="log-msg">${entry.message}</span>
        </div>
      `;
    }).join('');
  },

  renderMetrics() {
    const container = this.$('vfs-metrics-container');
    if (!container) return;

    const m = this.engine.getMetrics();

    container.innerHTML = `
      <div class="metric-pill"><span class="pill-lbl">Files:</span> <strong class="pill-val">${m.fileCount}</strong></div>
      <div class="metric-pill"><span class="pill-lbl">Directories:</span> <strong class="pill-val">${m.directoryCount}</strong></div>
      <div class="metric-pill"><span class="pill-lbl">Allocated Blocks:</span> <strong class="pill-val" style="color: #3b82f6;">${m.allocatedBlocks} / ${m.totalDiskBlocks}</strong></div>
      <div class="metric-pill"><span class="pill-lbl">Free Blocks:</span> <strong class="pill-val" style="color: #10b981;">${m.freeBlocks}</strong></div>
      <div class="metric-pill"><span class="pill-lbl">Disk Utilization:</span> <strong class="pill-val">${m.diskUtilizationPercent}%</strong></div>
      <div class="metric-pill"><span class="pill-lbl">Max Contiguous:</span> <strong class="pill-val" style="color: #10b981;">${m.largestFreeContiguousRegion} blocks</strong></div>
      <div class="metric-pill"><span class="pill-lbl">External Frag:</span> <strong class="pill-val" style="color: ${m.externalFragmentationBlocks > 0 ? '#ef4444' : 'var(--text-muted)'};">${m.externalFragmentationBlocks} blocks</strong></div>
      <div class="metric-pill"><span class="pill-lbl">Operations:</span> <strong class="pill-val">${m.operationCount} (${m.successfulOperations} ok, ${m.failedOperations} err)</strong></div>
    `;
  },

  resetSimulation() {
    const defaultPreset = this.engine.getPresets()[0];
    this.engine.reset(defaultPreset.data.initialNodes, defaultPreset.data.config);
    this.selectedNode = null;
    this.initPlayback();
    this.renderAll();
    showToast('File system reset to default state.', 'info');
  },

  unmount() {
    if (this.playbackController) {
      this.playbackController.destroy();
      this.playbackController = null;
    }
    this.selectedNode = null;
    if (this.container) {
      this.container.innerHTML = '';
    }
  }
};
