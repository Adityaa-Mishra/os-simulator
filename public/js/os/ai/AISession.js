/**
 * public/js/os/ai/AISession.js
 * Multi-turn conversational AI session for AdityyaOS.
 * Tracks message history, accumulated token usage, and is strictly bound to the calling process PID.
 */

let sessSeq = 0;

export class AISession {
  /**
   * @param {Object} options
   * @param {string} [options.id]
   * @param {number} options.pid - Owning process ID
   * @param {string} [options.model='adityya-sim-v1']
   * @param {string} [options.systemPrompt=null]
   * @param {import('./AICore.js').AICore} [options.aiCore]
   */
  constructor({
    id = null,
    pid,
    model = 'adityya-sim-v1',
    systemPrompt = null,
    aiCore = null
  }) {
    if (typeof pid !== 'number' || isNaN(pid) || pid <= 0) {
      throw new TypeError('AISession requires a valid positive number pid');
    }

    this.id = id || `aisess-${Date.now()}-${++sessSeq}`;
    this.pid = pid;
    this.model = String(model || 'adityya-sim-v1');
    this.systemPrompt = typeof systemPrompt === 'string' ? systemPrompt : null;
    this._aiCore = aiCore;

    this.history = [];
    if (this.systemPrompt) {
      this.history.push({
        role: 'system',
        content: this.systemPrompt,
        timestamp: Date.now()
      });
    }

    this.tokenUsage = {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0
    };

    this.createdAt = Date.now();
    this.updatedAt = this.createdAt;
    this.closed = false;
  }

  /**
   * Send a prompt in this session and receive completion.
   * @param {string} prompt
   * @param {Object} [options={}]
   * @returns {Promise<import('./AIResponse.js').AIResponse>}
   */
  async send(prompt, options = {}) {
    if (this.closed) {
      const err = new Error('[ESESSIONCLOSED] Cannot send message to a closed AISession');
      err.code = 'ESESSIONCLOSED';
      throw err;
    }
    if (!prompt || typeof prompt !== 'string') {
      throw new TypeError('AISession.send requires a non-empty string prompt');
    }

    const userMsg = {
      role: 'user',
      content: prompt,
      timestamp: Date.now()
    };
    this.history.push(userMsg);

    if (!this._aiCore) {
      throw new Error('AISession has no AICore reference configured');
    }

    // Build accumulated conversation context for query
    const response = await this._aiCore.query({
      pid: this.pid,
      prompt,
      systemPrompt: this.systemPrompt,
      model: options.model || this.model,
      maxTokens: options.maxTokens,
      temperature: options.temperature,
      context: options.context,
      session: this
    });

    const assistantMsg = {
      role: 'assistant',
      content: response.text,
      timestamp: Date.now()
    };
    this.history.push(assistantMsg);

    // Accumulate token usage
    this.tokenUsage.promptTokens += response.usage.promptTokens;
    this.tokenUsage.completionTokens += response.usage.completionTokens;
    this.tokenUsage.totalTokens += response.usage.totalTokens;
    this.updatedAt = Date.now();

    return response;
  }

  /**
   * Get safe copy of conversation history.
   * @returns {Array<Object>}
   */
  getHistory() {
    return this.history.map(m => ({ ...m }));
  }

  /**
   * Clear session history.
   * Preserves system prompt if configured.
   */
  clearHistory() {
    this.history = [];
    if (this.systemPrompt) {
      this.history.push({
        role: 'system',
        content: this.systemPrompt,
        timestamp: Date.now()
      });
    }
    this.updatedAt = Date.now();
  }

  /**
   * Close this session.
   */
  close() {
    this.closed = true;
    if (this._aiCore) {
      this._aiCore._unregisterSession(this.id);
    }
  }

  /**
   * Return a snapshot-safe serializable plain object.
   * Strictly data only: no functions, no circular references.
   * @returns {Object}
   */
  toJSON() {
    return {
      id: this.id,
      pid: this.pid,
      model: this.model,
      systemPrompt: this.systemPrompt,
      history: this.getHistory(),
      tokenUsage: { ...this.tokenUsage },
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      closed: this.closed
    };
  }
}
