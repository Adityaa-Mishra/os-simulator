/**
 * public/js/os/ai/MockAIProvider.js
 * Deterministic mock AI provider for testing and offline simulation in AdityyaOS.
 * Provides predictable outputs, token estimation, and custom rule matching without external calls.
 */

import { AIProvider } from './AIProvider.js';
import { AIResponse } from './AIResponse.js';

export class MockAIProvider extends AIProvider {
  /**
   * @param {Object} [options={}]
   * @param {string} [options.id='mock-local']
   * @param {string} [options.name='AdityyaOS Local Simulated AI']
   * @param {number} [options.delayMs=0]
   */
  constructor(options = {}) {
    super({
      id: options.id || 'mock-local',
      name: options.name || 'AdityyaOS Local Simulated AI',
      capabilities: { text: true, chat: true, streaming: false },
      models: [
        {
          id: 'adityya-sim-v1',
          name: 'Adityya Simulated Model v1',
          maxTokens: 2048,
          description: 'Standard deterministic simulated language model for AdityyaOS.'
        },
        {
          id: 'adityya-fast',
          name: 'Adityya Fast Model',
          maxTokens: 1024,
          description: 'High-speed simulated model for low-latency queries.'
        }
      ]
    });

    this.delayMs = typeof options.delayMs === 'number' ? options.delayMs : 0;
    this.customRules = new Map();
    this.cannedResponse = null;
  }

  /**
   * Set a fixed canned response for all requests.
   * @param {string|null} response
   */
  setCannedResponse(response) {
    this.cannedResponse = response !== null ? String(response) : null;
  }

  /**
   * Add a custom regex rule to produce specific text.
   * @param {RegExp|string} pattern
   * @param {string} response
   */
  addRule(pattern, response) {
    this.customRules.set(pattern, String(response));
  }

  /**
   * Clear all custom rules and canned responses.
   */
  clearRules() {
    this.customRules.clear();
    this.cannedResponse = null;
  }

  /**
   * Estimate token count from string.
   * @private
   * @param {string} text
   * @returns {number}
   */
  _estimateTokens(text) {
    if (!text || typeof text !== 'string') return 0;
    const words = text.trim().split(/\s+/).filter(Boolean);
    return Math.max(1, words.length + Math.ceil(text.length / 10));
  }

  /**
   * Generate completion for an AI request.
   * @param {import('./AIRequest.js').AIRequest} request
   * @returns {Promise<AIResponse>}
   */
  async generate(request) {
    const startTime = Date.now();

    if (this.delayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, this.delayMs));
    }

    if (request.aborted) {
      return new AIResponse({
        requestId: request.id,
        text: '',
        model: request.model,
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        finishReason: 'aborted',
        durationMs: Date.now() - startTime
      });
    }

    let outputText = '';

    if (this.cannedResponse !== null) {
      outputText = this.cannedResponse;
    } else {
      const promptLower = request.prompt.toLowerCase();

      // Check custom rules
      let matchedRule = false;
      for (const [pattern, response] of this.customRules.entries()) {
        const regex = pattern instanceof RegExp ? pattern : new RegExp(pattern, 'i');
        if (regex.test(request.prompt)) {
          outputText = response;
          matchedRule = true;
          break;
        }
      }

      if (!matchedRule) {
        if (promptLower.includes('hello') || promptLower.includes('hi')) {
          outputText = 'Hello! I am AdityyaOS AI Core simulator. How can I help you today?';
        } else if (promptLower.includes('os') || promptLower.includes('system') || promptLower.includes('version')) {
          const ctx = request.context || {};
          outputText = `AdityyaOS Simulator v${ctx.osVersion || '1.0.0'} (${ctx.hostname || 'adityya-os'}) running for user ${ctx.username || 'user'}.`;
        } else {
          outputText = `AdityyaOS AI Core response to: "${request.prompt.slice(0, 50)}${request.prompt.length > 50 ? '...' : ''}"`;
        }
      }
    }

    const promptTokens = this._estimateTokens(request.prompt) + (request.systemPrompt ? this._estimateTokens(request.systemPrompt) : 0);
    const completionTokens = this._estimateTokens(outputText);

    return new AIResponse({
      requestId: request.id,
      text: outputText,
      model: request.model,
      usage: {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens
      },
      finishReason: 'stop',
      durationMs: Date.now() - startTime
    });
  }
}
