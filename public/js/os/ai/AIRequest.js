/**
 * public/js/os/ai/AIRequest.js
 * Structured AI inference request model for AdityyaOS.
 */

let reqSeq = 0;

export class AIRequest {
  /**
   * @param {Object} options
   * @param {string} [options.id]
   * @param {number} options.pid - Calling process ID
   * @param {string} options.prompt - Prompt text
   * @param {string} [options.systemPrompt=null] - Optional system instructions
   * @param {string} [options.model='adityya-sim-v1'] - Selected model ID
   * @param {number} [options.maxTokens=500] - Max output tokens
   * @param {number} [options.temperature=0.7] - Sampling temperature
   * @param {import('./AIContext.js').AIContext|Object} [options.context=null] - Sanitized context
   */
  constructor({
    id = null,
    pid,
    prompt,
    systemPrompt = null,
    model = 'adityya-sim-v1',
    maxTokens = 500,
    temperature = 0.7,
    context = null
  }) {
    if (typeof pid !== 'number' || isNaN(pid) || pid <= 0) {
      throw new TypeError('AIRequest requires a valid positive number pid');
    }
    if (typeof prompt !== 'string') {
      throw new TypeError('AIRequest requires a string prompt');
    }

    this.id = id || `aireq-${Date.now()}-${++reqSeq}`;
    this.pid = pid;
    this.prompt = prompt;
    this.systemPrompt = typeof systemPrompt === 'string' ? systemPrompt : null;
    this.model = String(model || 'adityya-sim-v1');
    this.maxTokens = typeof maxTokens === 'number' && maxTokens > 0 ? maxTokens : 500;
    this.temperature = typeof temperature === 'number' ? Math.max(0, Math.min(2, temperature)) : 0.7;
    this.context = context && typeof context.toJSON === 'function' ? context.toJSON() : (context || null);
    this.createdAt = Date.now();
    this.aborted = false;
  }

  /**
   * Abort this request.
   */
  abort() {
    this.aborted = true;
  }

  /**
   * Return a snapshot-safe serializable plain object.
   * @returns {Object}
   */
  toJSON() {
    return {
      id: this.id,
      pid: this.pid,
      prompt: this.prompt,
      systemPrompt: this.systemPrompt,
      model: this.model,
      maxTokens: this.maxTokens,
      temperature: this.temperature,
      context: this.context,
      createdAt: this.createdAt,
      aborted: this.aborted
    };
  }
}
