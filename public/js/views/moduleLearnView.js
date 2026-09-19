/**
 * Module Learning View Controller
 * Universal, accessible learning renderer for all 6 operating system modules.
 * Renders objectives, concepts, worked examples, simulator handoff, key terms,
 * interactive quizzes, and completion actions.
 */

import { getLearningModule } from '../learning/learningData.js';
import { simulationTracker } from '../core/simulationTracker.js';
import { api } from '../core/apiClient.js';
import { store } from '../core/store.js';
import { showToast } from '../utils/toast.js';
import { authView } from './authView.js';
import { escapeHtml } from '../utils/sanitize.js';

export const moduleLearnView = {
  async mount(container, metadata = {}) {
    this.container = container;

    // Resolve module ID from metadata or URL hash
    let moduleId = metadata.module;
    if (!moduleId && typeof window !== 'undefined' && window.location.hash) {
      const parts = window.location.hash.split('/');
      if (parts[1] === 'learn' && parts[2]) {
        moduleId = parts[2];
      }
    }

    this.module = getLearningModule(moduleId || 'cpu');
    if (!this.module) {
      this.container.innerHTML = `
        <div class="card" style="max-width: 600px; margin: var(--space-8) auto; text-align: center;">
          <div class="card-body">
            <h2 style="color: var(--accent-danger);">Module Not Found</h2>
            <p style="color: var(--text-muted); margin: var(--space-4) 0;">
              The requested learning module "${moduleId}" does not exist.
            </p>
            <a href="#/learn" class="btn btn-primary">Back to Learning Hub</a>
          </div>
        </div>
      `;
      return;
    }

    this.activeSection = 'all'; // 'all' or specific section id
    this.quizState = {
      selectedAnswers: {}, // { [questionId]: optionIndex }
      submittedQuestions: {}, // { [questionId]: boolean }
      score: 0
    };
    this.isCompleted = false;

    this.render();
    await this.fetchModuleStatus();
  },

  unmount() {
    this.container = null;
  },

  isAuthenticated() {
    return Boolean(store.getState('isAuthenticated') || store.getState('user'));
  },

  async fetchModuleStatus() {
    if (!this.isAuthenticated() || !this.module) return;

    try {
      const res = await api.get(`/progress/${this.module.id}`);
      if (res && res.data && res.data.completed) {
        this.isCompleted = true;
        this.updateCompletionUI(true);
      }
    } catch {
      // Non-blocking
    }
  },

  updateCompletionUI(completed) {
    const btn = this.container?.querySelector('#mark-completed-btn');
    const badge = this.container?.querySelector('#module-status-badge');

    if (btn) {
      btn.textContent = completed ? '✓ Completed' : 'Mark as Completed';
      btn.className = completed ? 'btn btn-secondary' : 'btn btn-primary';
    }
    if (badge) {
      badge.textContent = completed ? 'Completed ✓' : (this.isAuthenticated() ? 'In Progress' : 'Guest Mode');
      badge.className = completed ? 'badge badge-success' : 'badge badge-secondary';
    }
  },

  render() {
    if (!this.container || !this.module) return;

    const mod = this.module;

    this.container.innerHTML = `
      <div class="module-learn-container">
        <!-- Header Card -->
        <div class="learn-header-card">
          <div class="learn-breadcrumb">
            <a href="#/" style="color: var(--text-muted);">Home</a>
            <span>/</span>
            <a href="#/learn" style="color: var(--text-muted);">Learning</a>
            <span>/</span>
            <span style="color: var(--accent-primary); font-weight: 600;">${mod.title}</span>
          </div>

          <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: var(--space-4);">
            <div>
              <div style="display: flex; align-items: center; gap: var(--space-3); margin-bottom: var(--space-2);">
                <span style="font-size: 2.25rem;">${mod.icon}</span>
                <h1 style="font-size: var(--text-2xl); font-weight: 800; color: var(--text-primary); margin: 0;">
                  ${mod.title}
                </h1>
                <span id="module-status-badge" class="badge badge-secondary">
                  ${this.isAuthenticated() ? 'In Progress' : 'Guest Mode'}
                </span>
              </div>
              <p style="color: var(--text-secondary); font-size: var(--text-sm); max-width: 750px; line-height: 1.5; margin: 0;">
                ${mod.description}
              </p>
            </div>

            <div style="display: flex; gap: var(--space-2);">
              <a href="${mod.simulatorRoute}" class="btn btn-secondary btn-sm" title="Open Simulator">
                Launch Simulator ⚙️
              </a>
              <button id="mark-completed-btn" class="btn btn-primary btn-sm">
                ${this.isCompleted ? '✓ Completed' : 'Mark as Completed'}
              </button>
            </div>
          </div>

          <!-- Section Nav Pills -->
          <div class="learn-nav-pills">
            <button class="learn-pill-btn active" data-section="all">All Content</button>
            <button class="learn-pill-btn" data-section="objectives">Objectives</button>
            <button class="learn-pill-btn" data-section="concepts">Concepts (${mod.concepts?.length || 0})</button>
            <button class="learn-pill-btn" data-section="example">Worked Example</button>
            <button class="learn-pill-btn" data-section="terms">Key Terms (${mod.keyTerms?.length || 0})</button>
            <button class="learn-pill-btn" data-section="quiz">Knowledge Check (${mod.quiz?.length || 0})</button>
          </div>
        </div>

        <!-- Section: Objectives -->
        <div id="section-objectives" class="learn-content-card">
          <div class="learn-objectives-box">
            <div class="learn-objectives-title">
              <span>🎯</span> Learning Objectives
            </div>
            <ul style="margin-bottom: 0;">
              ${mod.objectives.map(obj => `<li>${obj}</li>`).join('')}
            </ul>
          </div>
        </div>

        <!-- Section: Concepts -->
        <div id="section-concepts" class="learn-content-card">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-4);">
            <h2 style="font-size: var(--text-xl); font-weight: 700; color: var(--text-primary); margin: 0;">
              Core Concepts & Principles
            </h2>
          </div>

          ${mod.concepts.map(c => `
            <div class="concept-block" style="margin-bottom: var(--space-6); padding-bottom: var(--space-4); border-bottom: 1px solid var(--border-color);">
              <h3 style="color: var(--accent-primary); font-size: var(--text-lg); margin-bottom: var(--space-2);">
                ${c.title}
              </h3>
              <div class="concept-body">
                ${this.renderMarkdown(c.content)}
              </div>
            </div>
          `).join('')}
        </div>

        <!-- Section: Worked Example -->
        <div id="section-example" class="learn-content-card">
          <h2 style="font-size: var(--text-xl); font-weight: 700; color: var(--text-primary); margin-bottom: var(--space-2);">
            ${mod.workedExample.title}
          </h2>
          <p style="color: var(--text-secondary); margin-bottom: var(--space-4);">
            ${mod.workedExample.description}
          </p>

          ${mod.workedExample.table ? `
            <div style="overflow-x: auto; margin-bottom: var(--space-6);">
              <table class="history-table">
                <thead>
                  <tr>
                    ${Object.keys(mod.workedExample.table[0]).map(k => `<th>${this.formatHeader(k)}</th>`).join('')}
                  </tr>
                </thead>
                <tbody>
                  ${mod.workedExample.table.map(row => `
                    <tr>
                      ${Object.values(row).map(val => `<td>${val}</td>`).join('')}
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          ` : ''}

          <div class="concept-body" style="margin-bottom: var(--space-6);">
            ${this.renderMarkdown(mod.workedExample.walkthrough)}
          </div>

          <!-- Simulator CTA -->
          <div class="simulator-cta-card">
            <div>
              <h3 style="font-size: var(--text-base); font-weight: 700; color: var(--text-primary); margin-bottom: var(--space-1);">
                Ready to experiment with this scenario?
              </h3>
              <p style="font-size: var(--text-xs); color: var(--text-secondary); margin: 0;">
                Load this exact worked example directly into the interactive ${mod.title} simulator.
              </p>
            </div>
            <button id="try-example-btn" class="btn btn-primary btn-sm">
              Try This Example in Simulator ➔
            </button>
          </div>
        </div>

        <!-- Section: Key Terms Glossary -->
        <div id="section-terms" class="learn-content-card">
          <h2 style="font-size: var(--text-xl); font-weight: 700; color: var(--text-primary); margin-bottom: var(--space-2);">
            Key Terminology Glossary
          </h2>
          <p style="color: var(--text-secondary); font-size: var(--text-sm); margin-bottom: var(--space-4);">
            Essential operating system terms and definitions for ${mod.title}.
          </p>

          <div class="key-terms-grid">
            ${mod.keyTerms.map(t => `
              <div class="term-card">
                <div class="term-name">${t.term}</div>
                <div class="term-desc">${t.definition}</div>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Section: Knowledge Check (Quiz) -->
        <div id="section-quiz" class="quiz-container">
          <div class="quiz-header">
            <div>
              <h2 style="font-size: var(--text-xl); font-weight: 700; color: var(--text-primary); margin: 0;">
                Knowledge Check
              </h2>
              <p style="font-size: var(--text-xs); color: var(--text-muted); margin-top: 2px;">
                Test your understanding with ${mod.quiz?.length || 0} concept questions. Instant feedback and explanations provided.
              </p>
            </div>
            <div id="quiz-score-display" style="font-size: var(--text-sm); font-weight: 700; color: var(--accent-primary);">
              Score: 0 / ${mod.quiz?.length || 0}
            </div>
          </div>

          <div class="quiz-questions-list">
            ${(mod.quiz || []).map((q, qIndex) => `
              <div class="quiz-question-card" data-qid="${q.id}">
                <div class="quiz-question-text">
                  <span style="color: var(--accent-primary);">Q${qIndex + 1}.</span> ${q.question}
                </div>

                <div class="quiz-options">
                  ${q.options.map((opt, optIndex) => `
                    <label class="quiz-option" data-qid="${q.id}" data-opt="${optIndex}">
                      <input type="radio" name="quiz-${q.id}" value="${optIndex}" />
                      <span class="quiz-option-text">${opt}</span>
                    </label>
                  `).join('')}
                </div>

                <div id="quiz-feedback-${q.id}" class="quiz-feedback" style="display: none;"></div>

                <div style="margin-top: var(--space-3); display: flex; justify-content: flex-end;">
                  <button class="btn btn-secondary btn-sm submit-answer-btn" data-qid="${q.id}">
                    Submit Answer
                  </button>
                </div>
              </div>
            `).join('')}
          </div>

          <div class="quiz-footer">
            <button id="retry-quiz-btn" class="btn btn-secondary btn-sm">
              🔄 Reset / Retry Quiz
            </button>
            <div style="display: flex; gap: var(--space-3); align-items: center;">
              <span id="quiz-summary-text" style="font-size: var(--text-xs); color: var(--text-muted);">
                Answer all questions to complete the knowledge check.
              </span>
            </div>
          </div>
        </div>

        <!-- Completion Card -->
        <div class="completion-banner">
          <div>
            <h3 style="font-size: var(--text-base); font-weight: 700; color: var(--text-primary); margin-bottom: var(--space-1);">
              ${mod.title} Mastery
            </h3>
            <p style="font-size: var(--text-xs); color: var(--text-secondary); margin: 0;">
              Mark this topic as completed to track your mastery on the dashboard and profile.
            </p>
          </div>
          <button id="footer-complete-btn" class="btn btn-primary btn-sm">
            ${this.isCompleted ? '✓ Completed' : 'Mark Topic as Completed'}
          </button>
        </div>
      </div>
    `;

    this.bindEvents();
  },

  bindEvents() {
    const mod = this.module;

    // Filter pills
    this.container?.querySelectorAll('.learn-pill-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const target = e.target.dataset.section;
        this.container?.querySelectorAll('.learn-pill-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');

        const sections = ['objectives', 'concepts', 'example', 'terms', 'quiz'];
        sections.forEach(secId => {
          const el = this.container?.querySelector(`#section-${secId}`);
          if (el) {
            if (target === 'all' || target === secId) {
              el.style.display = 'block';
            } else {
              el.style.display = 'none';
            }
          }
        });
      });
    });

    // Try Example in Simulator
    this.container?.querySelector('#try-example-btn')?.addEventListener('click', () => {
      if (mod.workedExample && mod.workedExample.sampleInputs) {
        simulationTracker.setPendingSimulation({
          module: mod.id,
          algorithm: mod.workedExample.sampleInputs.algorithm,
          inputs: mod.workedExample.sampleInputs.inputs,
          name: `${mod.title} Example`
        });
        showToast(`Loading worked example into ${mod.title} simulator...`, 'info');
        if (typeof window !== 'undefined') {
          window.location.hash = mod.simulatorRoute;
        }
      }
    });

    // Quiz radio selection
    this.container?.querySelectorAll('.quiz-option').forEach(optionLabel => {
      optionLabel.addEventListener('click', (e) => {
        const qid = optionLabel.dataset.qid;
        const optIdx = parseInt(optionLabel.dataset.opt, 10);

        if (this.quizState.submittedQuestions[qid]) return; // Already locked

        this.quizState.selectedAnswers[qid] = optIdx;

        // Highlight selected radio
        const parent = optionLabel.closest('.quiz-options');
        parent.querySelectorAll('.quiz-option').forEach(l => l.classList.remove('selected'));
        optionLabel.classList.add('selected');
      });
    });

    // Submit Answer for question
    this.container?.querySelectorAll('.submit-answer-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const qid = btn.dataset.qid;
        const qObj = mod.quiz.find(q => q.id === qid);
        const selectedOpt = this.quizState.selectedAnswers[qid];

        if (selectedOpt === undefined) {
          showToast('Please select an option first.', 'warning');
          return;
        }

        if (this.quizState.submittedQuestions[qid]) return;

        this.quizState.submittedQuestions[qid] = true;
        btn.disabled = true;

        const isCorrect = selectedOpt === qObj.correctAnswer;
        if (isCorrect) {
          this.quizState.score += 1;
        }

        // Render feedback
        const feedbackEl = this.container?.querySelector(`#quiz-feedback-${qid}`);
        if (feedbackEl) {
          feedbackEl.style.display = 'block';
          feedbackEl.className = `quiz-feedback ${isCorrect ? 'correct' : 'incorrect'}`;
          feedbackEl.innerHTML = `
            <strong>${isCorrect ? '✅ Correct!' : '❌ Incorrect.'}</strong> ${qObj.explanation}
          `;
        }

        // Highlight options
        const questionCard = btn.closest('.quiz-question-card');
        const selectedLabel = questionCard.querySelector(`.quiz-option[data-opt="${selectedOpt}"]`);
        const correctLabel = questionCard.querySelector(`.quiz-option[data-opt="${qObj.correctAnswer}"]`);

        if (isCorrect) {
          selectedLabel?.classList.add('correct');
        } else {
          selectedLabel?.classList.add('incorrect');
          correctLabel?.classList.add('correct');
        }

        // Update score
        this.updateScoreDisplay();
      });
    });

    // Retry Quiz
    this.container?.querySelector('#retry-quiz-btn')?.addEventListener('click', () => {
      this.quizState = {
        selectedAnswers: {},
        submittedQuestions: {},
        score: 0
      };

      this.container?.querySelectorAll('.quiz-option').forEach(l => {
        l.classList.remove('selected', 'correct', 'incorrect');
        const input = l.querySelector('input');
        if (input) input.checked = false;
      });

      this.container?.querySelectorAll('.quiz-feedback').forEach(f => {
        f.style.display = 'none';
        f.innerHTML = '';
      });

      this.container?.querySelectorAll('.submit-answer-btn').forEach(b => {
        b.disabled = false;
      });

      this.updateScoreDisplay();
      showToast('Quiz reset. Try again!', 'info');
    });

    // Mark Completed buttons
    const completeHandler = async () => {
      if (this.isCompleted) {
        showToast('Topic is already marked as completed.', 'info');
        return;
      }

      if (!this.isAuthenticated()) {
        this.isCompleted = true;
        this.updateCompletionUI(true);
        showToast('Topic completed locally. Sign in to save to your cloud profile!', 'info');
        return;
      }

      try {
        await api.patch(`/progress/${mod.id}`, { completed: true });
        this.isCompleted = true;
        this.updateCompletionUI(true);
        showToast(`${mod.title} marked as completed!`, 'success');
      } catch (err) {
        showToast(err.message || 'Failed to update progress', 'error');
      }
    };

    this.container?.querySelector('#mark-completed-btn')?.addEventListener('click', completeHandler);
    this.container?.querySelector('#footer-complete-btn')?.addEventListener('click', completeHandler);
  },

  updateScoreDisplay() {
    const total = this.module.quiz?.length || 0;
    const scoreEl = this.container?.querySelector('#quiz-score-display');
    const summaryEl = this.container?.querySelector('#quiz-summary-text');

    if (scoreEl) {
      scoreEl.textContent = `Score: ${this.quizState.score} / ${total}`;
    }

    const answered = Object.keys(this.quizState.submittedQuestions).length;
    if (summaryEl) {
      if (answered === total) {
        const pct = Math.round((this.quizState.score / total) * 100);
        summaryEl.textContent = `Completed! ${pct}% correct (${this.quizState.score}/${total}).`;
      } else {
        summaryEl.textContent = `${answered} of ${total} answered.`;
      }
    }
  },

  formatHeader(key) {
    return key
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase())
      .replace('Dist S S T F', 'Dist (SSTF)')
      .replace('Dist S C A N', 'Dist (SCAN)');
  },

  renderMarkdown(text) {
    if (!text) return '';
    return text
      .replace(/### (.*)/g, '<h3 style="color: var(--text-primary); font-size: var(--text-base); font-weight: 700; margin-top: var(--space-4); margin-bottom: var(--space-2);">$1</h3>')
      .replace(/#### (.*)/g, '<h4 style="color: var(--accent-primary); font-size: var(--text-sm); font-weight: 700; margin-top: var(--space-3); margin-bottom: var(--space-1);">$1</h4>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code style="background: var(--bg-surface-secondary); padding: 2px 5px; border-radius: 4px; font-family: var(--font-mono); font-size: var(--text-xs); color: var(--accent-primary);">$1</code>')
      .replace(/\\rightarrow/g, '➔')
      .replace(/\\times/g, '×')
      .replace(/\\ge/g, '≥')
      .replace(/\\le/g, '≤')
      .replace(/\\subset/g, '⊂')
      .replace(/\\text\{([^}]+)\}/g, '$1')
      .replace(/\$([^\$]+)\$/g, '<code style="font-family: var(--font-mono); font-size: var(--text-xs); color: var(--accent-primary);">$1</code>')
      .replace(/\n\n/g, '</p><p style="margin-bottom: var(--space-3); color: var(--text-secondary); line-height: 1.6;">')
      .replace(/\n- /g, '<br>• ');
  }
};
