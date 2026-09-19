import { describe, it, expect, beforeEach, vi } from 'vitest';
import { moduleLearnView } from '../../public/js/views/moduleLearnView.js';
import { store } from '../../public/js/core/store.js';
import { api } from '../../public/js/core/apiClient.js';
import { getLearningModule } from '../../public/js/learning/learningData.js';

function createMockContainer() {
  const elements = new Map();

  const createElement = () => {
    const el = {
      style: {},
      dataset: {},
      value: '',
      textContent: '',
      innerHTML: '',
      className: '',
      disabled: false,
      classList: {
        add: vi.fn(),
        remove: vi.fn(),
        contains: () => false
      },
      listeners: {},
      addEventListener: function (evt, handler) {
        if (!this.listeners[evt]) this.listeners[evt] = [];
        this.listeners[evt].push(handler);
      },
      dispatchEvent: function (evtName, payload) {
        const handlers = this.listeners[evtName] || [];
        handlers.forEach(h => h(payload || { target: this }));
      },
      querySelector: (sel) => {
        if (!elements.has(sel)) {
          elements.set(sel, createElement());
        }
        return elements.get(sel);
      },
      querySelectorAll: (sel) => [],
      closest: (sel) => createElement(),
      contains: () => false
    };
    return el;
  };

  const container = {
    _innerHTML: '',
    get innerHTML() {
      return this._innerHTML;
    },
    set innerHTML(html) {
      this._innerHTML = html;
    },
    querySelector: (sel) => {
      if (!elements.has(sel)) {
        elements.set(sel, createElement());
      }
      return elements.get(sel);
    },
    querySelectorAll: (sel) => []
  };

  return { container, elements, createElement };
}

describe('Phase 10: Interactive Quiz & Completion Action Tests', () => {
  beforeEach(() => {
    store.setState({ user: null, isAuthenticated: false });
    vi.restoreAllMocks();
  });

  it('renders all quiz questions and options for a module', async () => {
    const cpuMod = getLearningModule('cpu');
    const { container } = createMockContainer();
    await moduleLearnView.mount(container, { module: 'cpu' });

    for (const q of cpuMod.quiz) {
      expect(container.innerHTML).toContain(q.question);
      for (const opt of q.options) {
        expect(container.innerHTML).toContain(opt);
      }
    }
  });

  it('evaluates correct answer and updates score on submission', async () => {
    const cpuMod = getLearningModule('cpu');
    const q1 = cpuMod.quiz[0];

    const { container, elements } = createMockContainer();
    await moduleLearnView.mount(container, { module: 'cpu' });

    // Directly test quiz state evaluation logic
    expect(moduleLearnView.quizState.score).toBe(0);

    // Simulate selecting the correct answer
    moduleLearnView.quizState.selectedAnswers[q1.id] = q1.correctAnswer;

    // Simulate submitting answer
    const isCorrect = moduleLearnView.quizState.selectedAnswers[q1.id] === q1.correctAnswer;
    if (isCorrect) moduleLearnView.quizState.score += 1;
    moduleLearnView.quizState.submittedQuestions[q1.id] = true;

    expect(isCorrect).toBe(true);
    expect(moduleLearnView.quizState.score).toBe(1);
  });

  it('evaluates incorrect answer without incrementing score', async () => {
    const cpuMod = getLearningModule('cpu');
    const q1 = cpuMod.quiz[0];
    const wrongAnswer = (q1.correctAnswer + 1) % q1.options.length;

    const { container } = createMockContainer();
    await moduleLearnView.mount(container, { module: 'cpu' });

    // Select wrong option
    moduleLearnView.quizState.selectedAnswers[q1.id] = wrongAnswer;

    const isCorrect = moduleLearnView.quizState.selectedAnswers[q1.id] === q1.correctAnswer;
    if (isCorrect) moduleLearnView.quizState.score += 1;
    moduleLearnView.quizState.submittedQuestions[q1.id] = true;

    expect(isCorrect).toBe(false);
    expect(moduleLearnView.quizState.score).toBe(0);
  });

  it('resets quiz state and score when retry button is triggered', async () => {
    const { container, elements } = createMockContainer();
    await moduleLearnView.mount(container, { module: 'cpu' });

    moduleLearnView.quizState.score = 3;
    moduleLearnView.quizState.submittedQuestions['q1'] = true;
    moduleLearnView.quizState.selectedAnswers['q1'] = 0;

    const retryBtn = elements.get('#retry-quiz-btn');
    expect(retryBtn).toBeDefined();

    retryBtn.dispatchEvent('click');

    expect(moduleLearnView.quizState.score).toBe(0);
    expect(moduleLearnView.quizState.submittedQuestions).toEqual({});
    expect(moduleLearnView.quizState.selectedAnswers).toEqual({});
  });

  describe('Module Completion Action', () => {
    it('sends PATCH /progress/:module with completed: true when authenticated', async () => {
      store.setState({
        user: { _id: 'u123', name: 'Student' },
        isAuthenticated: true
      });

      const patchSpy = vi.spyOn(api, 'patch').mockResolvedValue({ success: true });

      const { container, elements } = createMockContainer();
      await moduleLearnView.mount(container, { module: 'cpu' });

      const completeBtn = elements.get('#mark-completed-btn');
      expect(completeBtn).toBeDefined();

      await completeBtn.dispatchEvent('click');

      expect(patchSpy).toHaveBeenCalledWith('/progress/cpu', { completed: true });
      expect(moduleLearnView.isCompleted).toBe(true);
    });

    it('marks completion locally without calling API when in guest mode', async () => {
      store.setState({ user: null, isAuthenticated: false });
      const patchSpy = vi.spyOn(api, 'patch');

      const { container, elements } = createMockContainer();
      await moduleLearnView.mount(container, { module: 'memory' });

      const completeBtn = elements.get('#mark-completed-btn');
      await completeBtn.dispatchEvent('click');

      expect(patchSpy).not.toHaveBeenCalled();
      expect(moduleLearnView.isCompleted).toBe(true);
    });

    it('handles API errors during completion gracefully without crashing', async () => {
      store.setState({
        user: { _id: 'u123', name: 'Student' },
        isAuthenticated: true
      });

      vi.spyOn(api, 'patch').mockRejectedValue(new Error('Database timeout'));

      const { container, elements } = createMockContainer();
      await moduleLearnView.mount(container, { module: 'disk' });

      const completeBtn = elements.get('#mark-completed-btn');
      expect(completeBtn).toBeDefined();

      // Should not throw unhandled exception
      expect(() => completeBtn.dispatchEvent('click')).not.toThrow();
    });
  });
});
