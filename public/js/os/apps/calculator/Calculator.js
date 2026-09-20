/**
 * public/js/os/apps/calculator/Calculator.js
 * Native AdityyaOS Calculator Application.
 * Safe, parser-based mathematical computation without eval or new Function.
 */

import { MathParser } from './MathParser.js';
import { PackagePermissions } from '../../packages/PackagePermissions.js';
import { escapeHtml } from '../../../utils/sanitize.js';

export class Calculator {
  /**
   * @param {import('../../api/AdityyaOSAPI.js').AdityyaOSAPI|Object} apiOrOptions
   * @param {HTMLElement} [container]
   * @param {Object} [options={}]
   */
  constructor(apiOrOptions, container = null, options = {}) {
    if (apiOrOptions && typeof apiOrOptions === 'object' && !apiOrOptions.window && apiOrOptions.api) {
      this.api = apiOrOptions.api;
      this.container = apiOrOptions.container || container;
      this.options = apiOrOptions;
    } else {
      this.api = apiOrOptions;
      this.container = container;
      this.options = options;
    }

    this.expression = '';
    this.result = '0';
    this.justEvaluated = false;
    this.cleanupListeners = [];

    if (this.container) {
      this.render();
    }
  }

  /**
   * Mount Calculator into a DOM container.
   * @param {HTMLElement} container
   */
  mount(container) {
    if (!container) return;
    this.container = container;
    this.render();
  }

  render() {
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="os-calculator-app" role="region" aria-label="Calculator">
        <div class="os-calc-screen">
          <div class="os-calc-history" id="calc-history">${escapeHtml(this.expression)}</div>
          <div class="os-calc-result" id="calc-result">${escapeHtml(this.result)}</div>
        </div>
        <div class="os-calc-pad">
          <button class="os-calc-btn fn" data-action="clear" title="Clear (Escape)">C</button>
          <button class="os-calc-btn fn" data-action="backspace" title="Backspace">⌫</button>
          <button class="os-calc-btn fn" data-insert="(" title="Open Parenthesis">(</button>
          <button class="os-calc-btn fn" data-insert=")" title="Close Parenthesis">)</button>

          <button class="os-calc-btn op" data-insert="^" title="Power">^</button>
          <button class="os-calc-btn op" data-insert="sqrt(" title="Square Root">√</button>
          <button class="os-calc-btn op" data-insert="%" title="Modulo">%</button>
          <button class="os-calc-btn op" data-insert="/" title="Divide">÷</button>

          <button class="os-calc-btn num" data-insert="7">7</button>
          <button class="os-calc-btn num" data-insert="8">8</button>
          <button class="os-calc-btn num" data-insert="9">9</button>
          <button class="os-calc-btn op" data-insert="*" title="Multiply">×</button>

          <button class="os-calc-btn num" data-insert="4">4</button>
          <button class="os-calc-btn num" data-insert="5">5</button>
          <button class="os-calc-btn num" data-insert="6">6</button>
          <button class="os-calc-btn op" data-insert="-" title="Subtract">−</button>

          <button class="os-calc-btn num" data-insert="1">1</button>
          <button class="os-calc-btn num" data-insert="2">2</button>
          <button class="os-calc-btn num" data-insert="3">3</button>
          <button class="os-calc-btn op" data-insert="+" title="Add">+</button>

          <button class="os-calc-btn num" data-insert="0">0</button>
          <button class="os-calc-btn num" data-insert=".">.</button>
          <button class="os-calc-btn equals" data-action="calculate" title="Calculate (Enter)">=</button>
        </div>
      </div>
    `;

    this.bindEvents();
  }

  bindEvents() {
    const pad = this.container?.querySelector('.os-calc-pad');
    if (!pad) return;

    const onClick = (e) => {
      const btn = e.target?.closest?.('.os-calc-btn');
      if (!btn) return;

      const insert = btn.getAttribute('data-insert');
      const action = btn.getAttribute('data-action');

      if (insert) {
        this.append(insert);
      } else if (action === 'clear') {
        this.clear();
      } else if (action === 'backspace') {
        this.backspace();
      } else if (action === 'calculate') {
        this.calculate();
      }
    };

    pad.addEventListener('click', onClick);
    this.cleanupListeners.push(() => pad.removeEventListener('click', onClick));

    // Keyboard support
    const onKeyDown = (e) => {
      if (typeof document !== 'undefined' && document.activeElement) {
        if (!this.container?.contains(document.activeElement) && document.activeElement !== this.container) {
          return;
        }
      }
      if (/[0-9+\-*/().%^]/.test(e.key)) {
        e.preventDefault();
        this.append(e.key);
      } else if (e.key === 'Enter' || e.key === '=') {
        e.preventDefault();
        this.calculate();
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        this.backspace();
      } else if (e.key === 'Escape' || e.key?.toLowerCase() === 'c') {
        e.preventDefault();
        this.clear();
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', onKeyDown);
      this.cleanupListeners.push(() => window.removeEventListener('keydown', onKeyDown));
    }
  }

  append(char) {
    if (this.justEvaluated) {
      if (/[0-9.]/.test(char)) {
        this.expression = '';
      }
      this.justEvaluated = false;
    }
    this.expression += char;
    this.updateScreen();
  }

  clear() {
    this.expression = '';
    this.result = '0';
    this.justEvaluated = false;
    this.updateScreen();
  }

  backspace() {
    if (this.expression.length > 0) {
      this.expression = this.expression.slice(0, -1);
      this.updateScreen();
    }
  }

  calculate() {
    if (!this.expression || !this.expression.trim()) return;

    try {
      const evaluated = MathParser.evaluate(this.expression);
      if (typeof evaluated === 'number') {
        if (isNaN(evaluated) || !isFinite(evaluated)) {
          this.result = 'Division by zero';
        } else {
          // Format reasonable precision
          this.result = String(Math.round(evaluated * 1e10) / 1e10);
        }
      } else {
        this.result = String(evaluated);
      }
      this.justEvaluated = true;
    } catch (err) {
      this.result = err?.message || 'Error';
      this.justEvaluated = true;
    }

    this.updateScreen();
  }

  updateScreen() {
    const historyEl = this.container?.querySelector('#calc-history');
    const resultEl = this.container?.querySelector('#calc-result');

    if (historyEl) historyEl.textContent = this.expression;
    if (resultEl) resultEl.textContent = this.result;
  }

  destroy() {
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

// Alias for backward compatibility
export const CalculatorApp = Calculator;

/**
 * Standard AdityyaOS Application Definition for Calculator.
 */
export const calculatorApp = Object.freeze({
  id: 'calculator',
  name: 'Calculator',
  version: '1.0.0',
  description: 'Scientific & programmer calculator',
  icon: '🧮',
  category: 'Utilities',
  permissions: Object.freeze([
    PackagePermissions.WINDOW_CONTROL,
    PackagePermissions.APPLICATION_LIFECYCLE
  ]),
  window: Object.freeze({
    title: 'Calculator',
    icon: '🧮',
    width: 320,
    height: 440,
    singleton: true
  }),
  entry: (api, container, options) => {
    const app = new Calculator(api, container, options);
    return {
      destroy: () => app.destroy()
    };
  }
});

export const calcApp = Object.freeze({
  ...calculatorApp,
  id: 'calc'
});
