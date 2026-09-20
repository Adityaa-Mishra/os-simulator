/**
 * tests/os/apps/calculator.test.js
 * Automated tests for Calculator application and MathParser.
 * Strictly verifies mathematical correctness and zero dynamic code execution.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MathParser } from '../../../public/js/os/apps/calculator/MathParser.js';
import { CalculatorApp, calculatorApp } from '../../../public/js/os/apps/calculator/CalculatorApp.js';
import { Kernel } from '../../../public/js/os/kernel/Kernel.js';
import { APIContext } from '../../../public/js/os/api/APIContext.js';
import { AdityyaOSAPI } from '../../../public/js/os/api/AdityyaOSAPI.js';

if (typeof globalThis.window === 'undefined') {
  globalThis.window = {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  };
}
if (typeof globalThis.document === 'undefined') {
  globalThis.document = {
    activeElement: null
  };
}

// DOM mock helper
function createMockElement(tag = 'div') {
  const el = {
    tagName: tag.toUpperCase(),
    style: {},
    dataset: {},
    value: '',
    textContent: '',
    _innerHTML: '',
    get innerHTML() { return this._innerHTML; },
    set innerHTML(val) {
      this._innerHTML = String(val);
      this._children = [];
    },
    className: '',
    classList: {
      _classes: new Set(),
      add: function (...cls) { cls.forEach(c => this._classes.add(c)); },
      remove: function (...cls) { cls.forEach(c => this._classes.delete(c)); },
      contains: function (c) { return this._classes.has(c); }
    },
    attributes: new Map(),
    setAttribute: function (name, val) { this.attributes.set(name, String(val)); },
    getAttribute: function (name) { return this.attributes.get(name) || null; },
    removeAttribute: function (name) { this.attributes.delete(name); },
    listeners: {},
    addEventListener: function (evt, handler) {
      if (!this.listeners[evt]) this.listeners[evt] = [];
      this.listeners[evt].push(handler);
    },
    removeEventListener: function (evt, handler) {
      if (!this.listeners[evt]) return;
      this.listeners[evt] = this.listeners[evt].filter(h => h !== handler);
    },
    dispatchEvent: function (evtName, payload) {
      const handlers = this.listeners[evtName] || [];
      handlers.forEach(h => h(payload || { target: this, preventDefault: vi.fn(), stopPropagation: vi.fn() }));
    },
    querySelector: function (sel) {
      const dummy = createMockElement('div');
      dummy.className = sel.replace(/[#.\[\]="]/g, ' ').trim();
      return dummy;
    },
    querySelectorAll: function () {
      return [];
    },
    contains: function () { return true; }
  };
  return el;
}

describe('Phase 23: Calculator Application & MathParser', () => {
  describe('MathParser Arithmetic & Evaluation', () => {
    it('evaluates basic arithmetic expressions', () => {
      expect(MathParser.evaluate('2 + 3')).toBe(5);
      expect(MathParser.evaluate('10 - 4')).toBe(6);
      expect(MathParser.evaluate('6 * 7')).toBe(42);
      expect(MathParser.evaluate('15 / 3')).toBe(5);
      expect(MathParser.evaluate('10 % 3')).toBe(1);
      expect(MathParser.evaluate('2 ^ 3')).toBe(8);
    });

    it('respects standard operator precedence', () => {
      expect(MathParser.evaluate('2 + 3 * 4')).toBe(14);
      expect(MathParser.evaluate('(2 + 3) * 4')).toBe(20);
      expect(MathParser.evaluate('2 * 3 ^ 2')).toBe(18);
      expect(MathParser.evaluate('10 - 2 * 3 + 4 / 2')).toBe(6);
    });

    it('evaluates unary plus and minus', () => {
      expect(MathParser.evaluate('-5 + 10')).toBe(5);
      expect(MathParser.evaluate('-(3 + 2)')).toBe(-5);
      expect(MathParser.evaluate('+7')).toBe(7);
      expect(MathParser.evaluate('-2 ^ 2')).toBe(4);
    });

    it('evaluates decimal numbers correctly', () => {
      expect(MathParser.evaluate('0.5 + 0.25')).toBe(0.75);
      expect(MathParser.evaluate('1.5 * 2')).toBe(3);
    });

    it('evaluates mathematical functions and constants', () => {
      expect(MathParser.evaluate('sqrt(16)')).toBe(4);
      expect(MathParser.evaluate('abs(-42)')).toBe(42);
      expect(MathParser.evaluate('sin(0)')).toBe(0);
      expect(MathParser.evaluate('cos(0)')).toBe(1);
      expect(MathParser.evaluate('log(100)')).toBe(2);
      expect(MathParser.evaluate('pi')).toBeCloseTo(Math.PI);
      expect(MathParser.evaluate('e')).toBeCloseTo(Math.E);
    });

    it('handles division by zero with a descriptive error', () => {
      expect(() => MathParser.evaluate('10 / 0')).toThrow(/division by zero/i);
      expect(() => MathParser.evaluate('5 % 0')).toThrow(/division by zero/i);
    });

    it('rejects malformed expressions with syntax errors', () => {
      expect(() => MathParser.evaluate('2 + * 3')).toThrow();
      expect(() => MathParser.evaluate('(2 + 3')).toThrow();
      expect(() => MathParser.evaluate('2 + 3)')).toThrow();
      expect(() => MathParser.evaluate('foo(5)')).toThrow();
    });

    it('returns 0 for empty or whitespace expressions', () => {
      expect(MathParser.evaluate('')).toBe(0);
      expect(MathParser.evaluate('   ')).toBe(0);
    });
  });

  describe('CalculatorApp UI & Interaction', () => {
    let kernel;
    let context;
    let api;
    let container;

    beforeEach(() => {
      kernel = new Kernel();
      kernel.boot();
      container = createMockElement('div');
      context = new APIContext({
        appId: 'calculator',
        instanceId: 'calc-1',
        pid: 10,
        permissions: [...calculatorApp.permissions]
      });
      api = new AdityyaOSAPI({ kernel, context });
    });

    afterEach(() => {
      kernel.shutdown();
    });

    it('initializes and mounts with default 0 result', () => {
      const app = new CalculatorApp(api, container);
      expect(app.expression).toBe('');
      expect(app.result).toBe('0');
      expect(container.innerHTML).toContain('os-calculator-app');
      app.destroy();
    });

    it('appends characters and evaluates correctly', () => {
      const app = new CalculatorApp(api, container);

      app.append('2');
      app.append('+');
      app.append('3');
      expect(app.expression).toBe('2+3');

      app.calculate();
      expect(app.result).toBe('5');

      app.clear();
      expect(app.expression).toBe('');
      expect(app.result).toBe('0');

      app.destroy();
    });

    it('handles backspace correctly', () => {
      const app = new CalculatorApp(api, container);

      app.append('1');
      app.append('2');
      app.append('3');
      expect(app.expression).toBe('123');

      app.backspace();
      expect(app.expression).toBe('12');

      app.destroy();
    });

    it('handles division by zero in UI gracefully', () => {
      const app = new CalculatorApp(api, container);

      app.append('5');
      app.append('/');
      app.append('0');
      app.calculate();

      expect(app.result).toMatch(/division by zero/i);
      app.destroy();
    });

    it('conforms to standard Application Definition schema', () => {
      expect(calculatorApp.id).toBe('calculator');
      expect(calculatorApp.name).toBe('Calculator');
      expect(calculatorApp.category).toBe('Utilities');
      expect(typeof calculatorApp.entry).toBe('function');
      expect(calculatorApp.permissions).toContain('window.control');
      expect(calculatorApp.permissions).toContain('application.lifecycle');
      // Zero filesystem or process permissions needed
      expect(calculatorApp.permissions).not.toContain('filesystem.read');
      expect(calculatorApp.permissions).not.toContain('process.read');
    });
  });
});
