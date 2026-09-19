/**
 * Dashboard View Controller (Vanilla JS ES6+)
 * High-Contrast Light-Themed OS Laboratory Overview.
 */

import { api } from '../core/apiClient.js';
import { store } from '../core/store.js';
import { showToast } from '../utils/toast.js';
import { authView } from './authView.js';
import { escapeHtml } from '../utils/sanitize.js';

export const dashboardView = {
  async mount(container) {
    this.container = container;
    this.progressData = [];

    this.renderBaseLayout();
    await this.loadLearningProgress();
  },

  unmount() {
    this.container = null;
  },

  isAuthenticated() {
    return Boolean(store.getState('isAuthenticated') || store.getState('user'));
  },

  renderBaseLayout() {
    if (!this.container) return;

    this.container.innerHTML = `
      <div style="max-width: 1200px; margin: 0 auto; display: flex; flex-direction: column; gap: var(--space-6);">
        <!-- OS Laboratory Hero -->
        <div class="card" style="border-top: 3px solid var(--accent-primary);">
          <div class="card-body" style="padding: var(--space-8) var(--space-6);">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: var(--space-4);">
              <div style="max-width: 720px;">
                <div style="display: flex; align-items: center; gap: var(--space-2); margin-bottom: var(--space-2);">
                  <span class="badge badge-primary">OS Lab Platform</span>
                  <span class="badge badge-success">v1.0.0 Verified</span>
                </div>
                <h1 style="font-size: var(--text-2xl); font-weight: 800; color: var(--text-primary); margin-bottom: var(--space-2); letter-spacing: -0.02em;">
                  Operating Systems Simulator & Lab
                </h1>
                <p style="color: var(--text-secondary); font-size: var(--text-base); line-height: 1.6;">
                  A deterministic, client-side simulation suite covering CPU scheduling, process lifecycles, virtual memory, disk head movement, deadlock avoidance, and file system allocation.
                </p>
              </div>
              <div style="display: flex; gap: var(--space-3); flex-wrap: wrap;">
                <a href="#/learn" class="btn btn-primary">📚 Explore Learning Hub</a>
                <a href="#/cpu" class="btn btn-secondary">⚡ Open CPU Simulator</a>
              </div>
            </div>
          </div>
        </div>

        <!-- Continue Learning Recommendation Mount -->
        <div id="continue-learning-mount"></div>

        <!-- Simulation Modules Grid -->
        <div>
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-4);">
            <h2 style="font-size: var(--text-lg); font-weight: 700; color: var(--text-primary);">
              Simulation Modules
            </h2>
            <span class="badge badge-primary">6 Interactive Labs</span>
          </div>

          <div class="grid grid-cols-3">
            <!-- CPU Scheduling -->
            <div class="card" style="border-top: 2px solid var(--accent-primary);">
              <div class="card-body" style="display: flex; flex-direction: column; height: 100%;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-2);">
                  <span style="font-size: 1.25rem;">⚡</span>
                  <span class="badge badge-primary">CPU</span>
                </div>
                <h3 class="card-title" style="margin-bottom: var(--space-1);">CPU Scheduling</h3>
                <p style="color: var(--text-secondary); font-size: var(--text-xs); line-height: 1.5; margin-bottom: var(--space-4); flex: 1;">
                  FCFS, SJF, SRTF, Round Robin, and Priority Scheduling with real-time Gantt charts, waiting time, and turnaround benchmarks.
                </p>
                <div style="display: flex; gap: var(--space-2);">
                  <a href="#/learn/cpu" class="btn btn-outline btn-sm" style="flex: 1; text-align: center;">Learn</a>
                  <a href="#/cpu" class="btn btn-secondary btn-sm" style="flex: 1; text-align: center;">Simulate ➔</a>
                </div>
              </div>
            </div>

            <!-- Process Management -->
            <div class="card" style="border-top: 2px solid var(--accent-primary);">
              <div class="card-body" style="display: flex; flex-direction: column; height: 100%;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-2);">
                  <span style="font-size: 1.25rem;">🔄</span>
                  <span class="badge badge-primary">Process</span>
                </div>
                <h3 class="card-title" style="margin-bottom: var(--space-1);">Process Management</h3>
                <p style="color: var(--text-secondary); font-size: var(--text-xs); line-height: 1.5; margin-bottom: var(--space-4); flex: 1;">
                  5-state process lifecycle (New, Ready, Running, Waiting, Terminated) with active PCB inspector, registers, and CPU/IO timeline.
                </p>
                <div style="display: flex; gap: var(--space-2);">
                  <a href="#/learn/process" class="btn btn-outline btn-sm" style="flex: 1; text-align: center;">Learn</a>
                  <a href="#/process" class="btn btn-secondary btn-sm" style="flex: 1; text-align: center;">Simulate ➔</a>
                </div>
              </div>
            </div>

            <!-- Memory Management -->
            <div class="card" style="border-top: 2px solid var(--accent-primary);">
              <div class="card-body" style="display: flex; flex-direction: column; height: 100%;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-2);">
                  <span style="font-size: 1.25rem;">💾</span>
                  <span class="badge badge-primary">Memory</span>
                </div>
                <h3 class="card-title" style="margin-bottom: var(--space-1);">Memory Management</h3>
                <p style="color: var(--text-secondary); font-size: var(--text-xs); line-height: 1.5; margin-bottom: var(--space-4); flex: 1;">
                  Fixed Partition Allocation (First, Best, Worst Fit) and Page Replacement (FIFO, LRU, Optimal) with page fault counters.
                </p>
                <div style="display: flex; gap: var(--space-2);">
                  <a href="#/learn/memory" class="btn btn-outline btn-sm" style="flex: 1; text-align: center;">Learn</a>
                  <a href="#/memory" class="btn btn-secondary btn-sm" style="flex: 1; text-align: center;">Simulate ➔</a>
                </div>
              </div>
            </div>

            <!-- Disk Scheduling -->
            <div class="card" style="border-top: 2px solid var(--accent-primary);">
              <div class="card-body" style="display: flex; flex-direction: column; height: 100%;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-2);">
                  <span style="font-size: 1.25rem;">💿</span>
                  <span class="badge badge-primary">Disk</span>
                </div>
                <h3 class="card-title" style="margin-bottom: var(--space-1);">Disk Scheduling</h3>
                <p style="color: var(--text-secondary); font-size: var(--text-xs); line-height: 1.5; margin-bottom: var(--space-4); flex: 1;">
                  FCFS, SSTF, SCAN, C-SCAN, LOOK, and C-LOOK cylinder head movement simulation with 2D seek trajectory graphing.
                </p>
                <div style="display: flex; gap: var(--space-2);">
                  <a href="#/learn/disk" class="btn btn-outline btn-sm" style="flex: 1; text-align: center;">Learn</a>
                  <a href="#/disk" class="btn btn-secondary btn-sm" style="flex: 1; text-align: center;">Simulate ➔</a>
                </div>
              </div>
            </div>

            <!-- Deadlock Management -->
            <div class="card" style="border-top: 2px solid var(--accent-primary);">
              <div class="card-body" style="display: flex; flex-direction: column; height: 100%;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-2);">
                  <span style="font-size: 1.25rem;">🔒</span>
                  <span class="badge badge-primary">Deadlock</span>
                </div>
                <h3 class="card-title" style="margin-bottom: var(--space-1);">Deadlock Management</h3>
                <p style="color: var(--text-secondary); font-size: var(--text-xs); line-height: 1.5; margin-bottom: var(--space-4); flex: 1;">
                  Banker's Algorithm for deadlock avoidance, safe sequence determination, resource requests, and Resource Allocation Graphs (RAG).
                </p>
                <div style="display: flex; gap: var(--space-2);">
                  <a href="#/learn/deadlock" class="btn btn-outline btn-sm" style="flex: 1; text-align: center;">Learn</a>
                  <a href="#/deadlock" class="btn btn-secondary btn-sm" style="flex: 1; text-align: center;">Simulate ➔</a>
                </div>
              </div>
            </div>

            <!-- File System Simulation -->
            <div class="card" style="border-top: 2px solid var(--accent-primary);">
              <div class="card-body" style="display: flex; flex-direction: column; height: 100%;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-2);">
                  <span style="font-size: 1.25rem;">📁</span>
                  <span class="badge badge-primary">VFS</span>
                </div>
                <h3 class="card-title" style="margin-bottom: var(--space-1);">File System Simulation</h3>
                <p style="color: var(--text-secondary); font-size: var(--text-xs); line-height: 1.5; margin-bottom: var(--space-4); flex: 1;">
                  Hierarchical directory tree, contiguous first-fit allocation, disk fragmentation tracking, permissions, and file operations.
                </p>
                <div style="display: flex; gap: var(--space-2);">
                  <a href="#/learn/filesystem" class="btn btn-outline btn-sm" style="flex: 1; text-align: center;">Learn</a>
                  <a href="#/filesystem" class="btn btn-secondary btn-sm" style="flex: 1; text-align: center;">Simulate ➔</a>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Learning Progress Section -->
        <div class="card">
          <div class="card-header">
            <div>
              <h2 class="card-title">Learning Progress & Topic Mastery</h2>
              <p class="card-subtitle">Track completed simulations, topic mastery, and quizzes across all operating systems domains.</p>
            </div>
            <div id="progress-header-actions">
              <!-- Dynamically populated -->
            </div>
          </div>
          <div class="card-body">
            <div id="progress-cards-container" class="grid grid-cols-3">
              <div class="loading-indicator" style="grid-column: 1 / -1;">
                <div class="spinner"></div>
                <span>Loading learning progress...</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  },

  async loadLearningProgress() {
    const container = this.container?.querySelector('#progress-cards-container');
    const headerActions = this.container?.querySelector('#progress-header-actions');
    if (!container) return;

    const moduleMeta = {
      cpu: { title: 'CPU Scheduling', icon: '⚡' },
      process: { title: 'Process Management', icon: '🔄' },
      memory: { title: 'Memory Management', icon: '💾' },
      disk: { title: 'Disk Scheduling', icon: '💿' },
      deadlock: { title: 'Deadlock Management', icon: '🔒' },
      filesystem: { title: 'File System', icon: '📁' }
    };

    const continueMount = this.container?.querySelector('#continue-learning-mount');

    if (!this.isAuthenticated()) {
      if (continueMount) {
        continueMount.innerHTML = `
          <div class="card" style="background: var(--bg-surface); border-left: 4px solid var(--accent-primary);">
            <div class="card-body" style="padding: var(--space-4) var(--space-5);">
              <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: var(--space-3);">
                <div>
                  <div style="display: flex; align-items: center; gap: var(--space-2); margin-bottom: 2px;">
                    <span class="badge badge-primary">Guest Workspace</span>
                    <strong style="color: var(--text-primary); font-size: var(--text-sm);">Full Simulator Access Available</strong>
                  </div>
                  <p style="font-size: var(--text-xs); color: var(--text-secondary); margin: 0;">
                    Run simulations and explore educational lessons freely. Sign in if you want to sync progress, save configurations, and record history.
                  </p>
                </div>
                <div style="display: flex; gap: var(--space-2);">
                  <button id="hero-login-btn" class="btn btn-primary btn-sm">Sign In / Register</button>
                  <a href="#/learn" class="btn btn-secondary btn-sm">Browse Lessons</a>
                </div>
              </div>
            </div>
          </div>
        `;
        continueMount.querySelector('#hero-login-btn')?.addEventListener('click', () => {
          authView.openModal('login');
        });
      }

      if (headerActions) {
        headerActions.innerHTML = `
          <span class="badge badge-secondary">Guest Mode</span>
        `;
      }

      container.innerHTML = Object.entries(moduleMeta).map(([mod, meta]) => `
        <div class="card progress-card" style="padding: var(--space-4);">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-2);">
            <div style="font-weight: 600; font-size: var(--text-sm); color: var(--text-primary);">
              <span>${meta.icon}</span> ${meta.title}
            </div>
            <span class="badge badge-secondary">Guest Mode</span>
          </div>
          <div class="progress-stats" style="display: flex; justify-content: space-between; font-size: var(--text-xs); color: var(--text-muted); margin-bottom: var(--space-2);">
            <span>Simulations: —</span>
            <span>Status: Untracked</span>
          </div>
          <div style="display: flex; gap: var(--space-2); margin-top: var(--space-3);">
            <a href="#/learn/${mod}" class="btn btn-outline btn-sm" style="flex: 1; text-align: center;">Lesson</a>
            <a href="#/${mod}" class="btn btn-secondary btn-sm" style="flex: 1; text-align: center;">Simulate</a>
          </div>
        </div>
      `).join('');
      return;
    }

    try {
      const res = await api.get('/progress');
      this.progressData = res.data || [];

      const completedCount = this.progressData.filter(p => p.completed).length;
      if (headerActions) {
        headerActions.innerHTML = `
          <span class="badge badge-primary">${completedCount} of 6 Completed</span>
        `;
      }

      // Continue Learning recommendation
      if (continueMount) {
        const incomplete = this.progressData.filter(p => !p.completed);
        incomplete.sort((a, b) => new Date(b.lastVisitedAt || 0) - new Date(a.lastVisitedAt || 0));
        const continueMod = incomplete[0];

        if (continueMod) {
          const cMeta = moduleMeta[continueMod.module] || { title: continueMod.module, icon: '⚡' };
          continueMount.innerHTML = `
            <div class="card" style="border-left: 4px solid var(--accent-primary);">
              <div class="card-body" style="padding: var(--space-4) var(--space-5);">
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: var(--space-3);">
                  <div>
                    <div style="display: flex; align-items: center; gap: var(--space-2); margin-bottom: 2px;">
                      <span class="badge badge-primary">Continue Learning</span>
                      <strong style="color: var(--text-primary); font-size: var(--text-sm);">${cMeta.icon} ${cMeta.title}</strong>
                    </div>
                    <p style="font-size: var(--text-xs); color: var(--text-secondary); margin: 0;">
                      Resume where you left off, review worked examples, and complete the knowledge check.
                    </p>
                  </div>
                  <div style="display: flex; gap: var(--space-2);">
                    <a href="#/learn/${continueMod.module}" class="btn btn-primary btn-sm">Resume Lesson ➔</a>
                    <a href="#/${continueMod.module}" class="btn btn-secondary btn-sm">Open Simulator</a>
                  </div>
                </div>
              </div>
            </div>
          `;
        } else {
          continueMount.innerHTML = `
            <div class="card" style="border-left: 4px solid var(--accent-success);">
              <div class="card-body" style="padding: var(--space-4) var(--space-5);">
                <div style="display: flex; align-items: center; gap: var(--space-3);">
                  <span style="font-size: 1.5rem;">🎉</span>
                  <div>
                    <strong style="color: var(--accent-success); font-size: var(--text-sm);">All 6 Modules Completed!</strong>
                    <p style="font-size: var(--text-xs); color: var(--text-secondary); margin: 0;">
                      You have mastered all core operating systems modules. Test custom edge cases using the simulator tools!
                    </p>
                  </div>
                </div>
              </div>
            </div>
          `;
        }
      }

      container.innerHTML = this.progressData.map(p => {
        const meta = moduleMeta[p.module] || { title: p.module, icon: '⚙️' };
        const statusBadge = p.completed
          ? '<span class="badge badge-success">Completed</span>'
          : (p.simulationsRun > 0 ? '<span class="badge badge-info">In Progress</span>' : '<span class="badge badge-secondary">Not Started</span>');
        const lastVisited = p.lastVisitedAt ? new Date(p.lastVisitedAt).toLocaleDateString() : 'Never';

        return `
          <div class="card" style="padding: var(--space-4);" data-module="${p.module}">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-2);">
              <div style="font-weight: 600; font-size: var(--text-sm); color: var(--text-primary);">
                <span>${meta.icon}</span> ${meta.title}
              </div>
              ${statusBadge}
            </div>
            <div style="display: flex; justify-content: space-between; font-size: var(--text-xs); color: var(--text-muted); margin-bottom: var(--space-3);">
              <span>Runs: <strong style="color: var(--text-primary);">${p.simulationsRun || 0}</strong></span>
              <span>Visited: <strong style="color: var(--text-secondary);">${lastVisited}</strong></span>
            </div>
            <div style="display: flex; gap: var(--space-2);">
              <a href="#/learn/${p.module}" class="btn btn-outline btn-sm" style="flex: 1; text-align: center;">Lesson</a>
              <a href="#/${p.module}" class="btn btn-secondary btn-sm" style="flex: 1; text-align: center;">Simulate</a>
              <button class="btn btn-outline btn-sm toggle-complete-btn" data-module="${p.module}" data-completed="${p.completed}">
                ${p.completed ? 'Undo' : '✓'}
              </button>
            </div>
          </div>
        `;
      }).join('');

      // Bind toggle complete buttons
      container.querySelectorAll('.toggle-complete-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const mod = e.target.dataset.module;
          const currentCompleted = e.target.dataset.completed === 'true';
          e.target.disabled = true;

          try {
            await api.patch(`/progress/${mod}`, { completed: !currentCompleted });
            showToast(`Updated ${moduleMeta[mod]?.title || mod} status`, 'success');
            await this.loadLearningProgress();
          } catch (err) {
            showToast(err.message || 'Failed to update status', 'error');
            e.target.disabled = false;
          }
        });
      });

    } catch (err) {
      container.innerHTML = `
        <div style="color: var(--accent-danger); text-align: center; grid-column: 1 / -1; padding: var(--space-4); font-size: var(--text-sm);">
          Failed to load progress: ${escapeHtml(err.message)}
        </div>
      `;
    }
  }
};
