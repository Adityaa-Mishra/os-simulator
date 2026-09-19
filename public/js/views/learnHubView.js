/**
 * Learning Hub View Controller
 * Central entry point for all educational OS concepts, progress tracking, and keyword search.
 */

import { getAllLearningModules, searchLearningContent } from '../learning/learningData.js';
import { api } from '../core/apiClient.js';
import { store } from '../core/store.js';
import { escapeHtml } from '../utils/sanitize.js';

export const learnHubView = {
  async mount(container) {
    this.container = container;
    this.modules = getAllLearningModules();
    this.progressMap = {};

    this.render();
    await this.fetchProgress();
  },

  unmount() {
    this.container = null;
  },

  isAuthenticated() {
    return Boolean(store.getState('isAuthenticated') || store.getState('user'));
  },

  async fetchProgress() {
    if (!this.isAuthenticated()) return;

    try {
      const res = await api.get('/progress');
      if (res && Array.isArray(res.data)) {
        this.progressMap = {};
        for (const item of res.data) {
          this.progressMap[item.module] = item;
        }
        this.updateProgressBadges();
      }
    } catch {
      // Non-blocking
    }
  },

  updateProgressBadges() {
    if (!this.container) return;

    for (const mod of this.modules) {
      const badgeEl = this.container.querySelector(`#progress-badge-${mod.id}`);
      if (!badgeEl) continue;

      const progress = this.progressMap[mod.id];
      if (progress && progress.completed) {
        badgeEl.className = 'badge badge-success';
        badgeEl.textContent = 'Completed ✓';
      } else if (progress && progress.simulationsRun > 0) {
        badgeEl.className = 'badge badge-info';
        badgeEl.textContent = `In Progress (${progress.simulationsRun} runs)`;
      } else {
        badgeEl.className = 'badge badge-secondary';
        badgeEl.textContent = 'Not Started';
      }
    }
  },

  render() {
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="learn-hub-container">
        <!-- Hero Header & Search -->
        <div class="learn-hero">
          <span class="badge badge-primary" style="margin-bottom: var(--space-2);">Educational OS Lab</span>
          <h1 class="learn-hero-title">Operating System Concepts & Theory</h1>
          <p class="learn-hero-desc">
            Explore core operating system principles with guided lessons, worked mathematical examples, key terminology, and interactive knowledge checks. Connect theory directly to deterministic simulation engines.
          </p>

          <!-- Search Bar -->
          <div class="learn-search-wrap">
            <span class="learn-search-icon">🔍</span>
            <input 
              type="text" 
              id="learn-search-input" 
              class="learn-search-input" 
              placeholder="Search concepts, algorithms, key terms (e.g., 'paging', 'banker', 'fcfs')..."
              autocomplete="off"
            />
            <div id="search-results-mount" class="search-results-box" style="display: none;"></div>
          </div>
        </div>

        <!-- Section Title & Summary -->
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: var(--space-3);">
          <div>
            <h2 style="font-size: var(--text-xl); font-weight: 700; color: var(--text-primary);">Learning Modules</h2>
            <p style="font-size: var(--text-xs); color: var(--text-muted); margin-top: 2px;">
              Comprehensive coverage across all 6 core operating system domains.
            </p>
          </div>
          <div style="font-size: var(--text-xs); color: var(--text-secondary);">
            <span>6 Modules</span> · <span>18 Concepts</span> · <span>38 Quiz Questions</span>
          </div>
        </div>

        <!-- Modules Grid -->
        <div class="learn-grid">
          ${this.modules.map(mod => {
            const conceptCount = mod.concepts?.length || 0;
            const quizCount = mod.quiz?.length || 0;

            return `
              <div class="learn-card" data-module="${mod.id}">
                <div class="learn-card-body">
                  <div class="learn-card-header">
                    <span class="learn-card-icon">${mod.icon}</span>
                    <span id="progress-badge-${mod.id}" class="badge badge-secondary">
                      ${this.isAuthenticated() ? 'Not Started' : 'Guest Mode'}
                    </span>
                  </div>

                  <h3 class="learn-card-title">${mod.title}</h3>
                  <p class="learn-card-desc">${mod.description}</p>

                  <div class="learn-card-meta">
                    <span>📖 ${conceptCount} Concepts</span>
                    <span>📝 ${quizCount} Questions</span>
                    <span>💡 Worked Example</span>
                  </div>

                  <div class="learn-card-actions">
                    <a href="#/learn/${mod.id}" class="btn btn-primary btn-sm" style="flex: 1; text-align: center;">
                      Start Learning ➔
                    </a>
                    <a href="${mod.simulatorRoute}" class="btn btn-secondary btn-sm" title="Launch Simulator">
                      Simulate ⚙️
                    </a>
                  </div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;

    this.bindEvents();
  },

  bindEvents() {
    const searchInput = this.container?.querySelector('#learn-search-input');
    const resultsBox = this.container?.querySelector('#search-results-mount');

    if (searchInput && resultsBox) {
      searchInput.addEventListener('input', (e) => {
        const query = e.target.value.trim();
        if (query.length < 2) {
          resultsBox.style.display = 'none';
          resultsBox.innerHTML = '';
          return;
        }

        const matches = searchLearningContent(query);
        if (matches.length === 0) {
          resultsBox.style.display = 'block';
          resultsBox.innerHTML = `
            <div style="padding: var(--space-4); text-align: center; color: var(--text-muted); font-size: var(--text-sm);">
              No concepts or terms found matching "<strong>${escapeHtml(query)}</strong>"
            </div>
          `;
          return;
        }

        resultsBox.style.display = 'block';
        resultsBox.innerHTML = matches.map(res => `
          <div style="padding: var(--space-2) var(--space-4); background: var(--bg-surface-secondary); font-size: var(--text-xs); font-weight: 700; color: var(--accent-primary);">
            ${res.module.icon} ${res.module.title}
          </div>
          ${res.matches.map(m => `
            <div class="search-result-item" data-module="${res.module.id}">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
                <strong style="font-size: var(--text-sm); color: var(--text-primary);">${m.title}</strong>
                <span class="search-badge badge badge-primary">${m.type}</span>
              </div>
              <p style="font-size: var(--text-xs); color: var(--text-muted); margin: 0; line-height: 1.4;">${m.snippet}</p>
            </div>
          `).join('')}
        `).join('');

        // Bind clicks on search results
        resultsBox.querySelectorAll('.search-result-item').forEach(item => {
          item.addEventListener('click', () => {
            const modId = item.dataset.module;
            if (typeof window !== 'undefined') {
              window.location.hash = `#/learn/${modId}`;
            }
          });
        });
      });

      // Close search on blur/click outside
      if (typeof document !== 'undefined') {
        document.addEventListener('click', (e) => {
          if (!searchInput.contains(e.target) && !resultsBox.contains(e.target)) {
            resultsBox.style.display = 'none';
          }
        });
      }
    }
  }
};
