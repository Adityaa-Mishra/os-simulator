/**
 * public/js/os/ai/AIResponse.js
 * Structured AI inference response model for AdityyaOS.
 */

let respSeq = 0;

export class AIResponse {
  /**
   * @param {Object} options
   * @param {string} [options.id]
   * @param {string} options.requestId - Associated AIRequest ID
   * @param {string} [options.text=''] - Output completion text
   * @param {string} [options.model='adityya-sim-v1']
   * @param {Object} [options.usage]
   * @param {number} [options.usage.promptTokens=0]
   * @param {number} [options.usage.completionTokens=0]
   * @param {number} [options.usage.totalTokens=0]
   * @param {'stop'|'length'|'aborted'|'error'} [options.finishReason='stop']
   * @param {number} [options.durationMs=0]
   */
  constructor({
    id = null,
    requestId,
    text = '',
    model = 'adityya-sim-v1',
    usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    finishReason = 'stop',
    durationMs = 0
  }) {
    if (!requestId || typeof requestId !== 'string') {
      throw new TypeError('AIResponse requires a non-empty string requestId');
    }

    this.id = id || `airesp-${Date.now()}-${++respSeq}`;
    this.requestId = requestId;
    this.text = String(text || '');
    this.model = String(model || 'adityya-sim-v1');
    this.usage = {
      promptTokens: usage?.promptTokens || 0,
      completionTokens: usage?.completionTokens || 0,
      totalTokens: usage?.totalTokens || (usage?.promptTokens || 0) + (usage?.completionTokens || 0)
    };
    this.finishReason = finishReason;
    this.durationMs = typeof durationMs === 'number' ? durationMs : 0;
    this.createdAt = Date.now();
  }

  /**
   * Return a snapshot-safe serializable plain object.
   * @returns {Object}
   */
  toJSON() {
    return {
      id: this.id,
      requestId: this.requestId,
      text: this.text,
      model: this.model,
      usage: { ...this.usage },
      finishReason: this.finishReason,
      durationMs: this.durationMs,
      createdAt: this.createdAt
    };
  }
}
