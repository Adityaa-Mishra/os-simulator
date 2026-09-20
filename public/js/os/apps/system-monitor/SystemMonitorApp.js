/**
 * public/js/os/apps/system-monitor/SystemMonitorApp.js
 * Native AdityyaOS System Monitor Application.
 * Strictly consumes telemetry via AdityyaOSAPI (api.system, api.memory, api.process).
 * ZERO direct access to Kernel, HardwareManager, ProcessManager, or MemoryManager.
 * Zero fabricated metrics.
 */

import { PackagePermissions } from '../../packages/PackagePermissions.js';
import { escapeHtml } from '../../../utils/sanitize.js';

export class SystemMonitorApp {
  /**
   * @param {import('../../api/AdityyaOSAPI.js').AdityyaOSAPI} api
   * @param {HTMLElement} container
   * @param {Object} [options={}]
   */
  constructor(api, container, options = {}) {
    this.api = api;
    this.container = container;
    this.options = options;

    this.history = [];
    this.maxHistory = 15;
    this.refreshInterval = null;
    this.cleanupListeners = [];

    this.render();
    this.update(false);
    if (this.options.autoStart !== false) {
      this.startAutoRefresh();
    }
  }

  get intervalId() {
    return this.refreshInterval;
  }

  get currentMetrics() {
    return {
      memory: this.api.memory.getUsage(),
      system: this.api.system.getInfo ? this.api.system.getInfo() : { uptime: this.api.system.getUptime(), status: this.api.system.getStatus() },
      processCount: this.api.process.list().length
    };
  }

  async sample() {
    return this.update(true);
  }

  render() {
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="os-sysmon-app os-system-monitor-app" role="region" aria-label="System Monitor">
        <!-- Top Stats Row -->
        <div class="os-sysmon-grid">
          <!-- CPU / Process Card -->
          <div class="os-sysmon-card">
            <div class="os-sysmon-card-header">
              <span class="os-sysmon-icon">⚙️</span>
              <span class="os-sysmon-title">CPU & Process Activity</span>
            </div>
            <div class="os-sysmon-value" id="sysmon-cpu-val">0 Active</div>
            <div class="os-sysmon-sub" id="sysmon-cpu-sub">0 total processes</div>
            <div class="os-sysmon-bar-track">
              <div class="os-sysmon-bar-fill" id="sysmon-cpu-bar" style="width: 0%;"></div>
            </div>
          </div>

          <!-- Memory Card -->
          <div class="os-sysmon-card">
            <div class="os-sysmon-card-header">
              <span class="os-sysmon-icon">🧠</span>
              <span class="os-sysmon-title">Memory Allocation</span>
            </div>
            <div class="os-sysmon-value" id="sysmon-mem-val">0 / 0 MB</div>
            <div class="os-sysmon-sub" id="sysmon-mem-sub">0% utilized</div>
            <div class="os-sysmon-bar-track">
              <div class="os-sysmon-bar-fill" id="sysmon-mem-bar" style="width: 0%;"></div>
            </div>
          </div>

          <!-- System Status Card -->
          <div class="os-sysmon-card">
            <div class="os-sysmon-card-header">
              <span class="os-sysmon-icon">⏱️</span>
              <span class="os-sysmon-title">System Uptime</span>
            </div>
            <div class="os-sysmon-value" id="sysmon-uptime-val">0s</div>
            <div class="os-sysmon-sub" id="sysmon-status-sub">Status: RUNNING</div>
          </div>
        </div>

        <!-- History Sparklines / Telemetry Trend -->
        <div class="os-sysmon-charts">
          <div class="os-sysmon-chart-box">
            <h4>Memory Utilization Trend (Last ${this.maxHistory} Samples)</h4>
            <div class="os-sysmon-sparkline" id="sysmon-mem-sparkline"></div>
          </div>
        </div>
      </div>
    `;
  }

  update(addToHistory = true) {
    try {
      // 1. Process telemetry via api.process.list()
      const processes = this.api.process.list();
      const totalProcs = processes.length;
      const activeProcs = processes.filter(p => p.state === 'RUNNING' || p.state === 'READY').length;

      const cpuValEl = this.container?.querySelector('#sysmon-cpu-val');
      const cpuSubEl = this.container?.querySelector('#sysmon-cpu-sub');
      const cpuBarEl = this.container?.querySelector('#sysmon-cpu-bar');

      if (cpuValEl) cpuValEl.textContent = `${activeProcs} Active`;
      if (cpuSubEl) cpuSubEl.textContent = `${totalProcs} total process${totalProcs === 1 ? '' : 'es'}`;
      if (cpuBarEl) {
        const pct = totalProcs > 0 ? Math.min(100, Math.round((activeProcs / totalProcs) * 100)) : 0;
        cpuBarEl.style.width = `${pct}%`;
      }

      // 2. Memory telemetry via api.memory.getUsage()
      const mem = this.api.memory.getUsage();
      const memValEl = this.container?.querySelector('#sysmon-mem-val');
      const memSubEl = this.container?.querySelector('#sysmon-mem-sub');
      const memBarEl = this.container?.querySelector('#sysmon-mem-bar');

      const memPct = mem.totalMemory > 0 ? Math.min(100, Math.round((mem.usedMemory / mem.totalMemory) * 100)) : 0;
      if (memValEl) memValEl.textContent = `${this.formatBytes(mem.usedMemory)} / ${this.formatBytes(mem.totalMemory)}`;
      if (memSubEl) memSubEl.textContent = `${memPct}% utilized (${this.formatBytes(mem.freeMemory)} free)`;
      if (memBarEl) memBarEl.style.width = `${memPct}%`;

      // 3. System status & uptime via api.system
      const uptime = this.api.system.getUptime();
      const status = this.api.system.getStatus();
      const uptimeValEl = this.container?.querySelector('#sysmon-uptime-val');
      const statusSubEl = this.container?.querySelector('#sysmon-status-sub');

      if (uptimeValEl) uptimeValEl.textContent = this.formatUptime(uptime);
      if (statusSubEl) statusSubEl.textContent = `Status: ${status}`;

      // Update history if requested
      if (addToHistory) {
        this.history.push({
          memory: memPct,
          activeProcs,
          totalProcs,
          timestamp: Date.now()
        });
        if (this.history.length > this.maxHistory) {
          this.history.shift();
        }
      }

      this.renderSparkline();
    } catch (err) {
      console.error('[SystemMonitorApp] Error updating telemetry:', err);
    }
  }

  renderSparkline() {
    const sparklineEl = this.container?.querySelector('#sysmon-mem-sparkline');
    if (!sparklineEl) return;

    sparklineEl.innerHTML = this.history.map(entry => {
      const pct = typeof entry === 'number' ? entry : (entry.memory || 0);
      return `
        <div class="os-sysmon-spark-bar-track" title="${pct}%">
          <div class="os-sysmon-spark-bar-fill" style="height: ${Math.max(4, pct)}%;"></div>
        </div>
      `;
    }).join('');
  }

  startAutoRefresh() {
    this.refreshInterval = setInterval(() => {
      this.update(true);
    }, 1500);
  }

  formatBytes(bytes) {
    if (typeof bytes !== 'number' || bytes === 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  formatUptime(sec) {
    if (typeof sec !== 'number' || isNaN(sec)) return '0s';
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    return `${h}h ${m}m ${s}s`;
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
 * Standard AdityyaOS Application Definition for System Monitor.
 */
export const systemMonitorApp = Object.freeze({
  id: 'system-monitor',
  name: 'System Monitor',
  version: '1.0.0',
  description: 'CPU, memory, and system telemetry',
  icon: '📈',
  category: 'System',
  permissions: Object.freeze([
    PackagePermissions.SYSTEM_READ,
    PackagePermissions.MEMORY_READ,
    PackagePermissions.PROCESS_READ,
    PackagePermissions.WINDOW_CONTROL,
    PackagePermissions.APPLICATION_LIFECYCLE
  ]),
  window: Object.freeze({
    title: 'System Monitor',
    icon: '📈',
    width: 620,
    height: 420,
    singleton: true
  }),
  entry: (api, container, options) => {
    const app = new SystemMonitorApp(api, container, options);
    return {
      destroy: () => app.destroy()
    };
  }
});
