/**
 * public/js/os/ai/AIProvider.js
 * Abstract base class for AI providers in AdityyaOS.
 * Defines the contract for model discovery and text generation.
 */

export class AIProvider {
  /**
   * @param {Object} options
   * @param {string} options.id - Unique provider identifier
   * @param {string} options.name - Human-readable provider name
   * @param {Object} [options.capabilities]
   * @param {boolean} [options.capabilities.text=true]
   * @param {boolean} [options.capabilities.chat=true]
   * @param {boolean} [options.capabilities.streaming=false]
   * @param {Array<Object>} [options.models=[]]
   */
  constructor({
    id,
    name,
    capabilities = { text: true, chat: true, streaming: false },
    models = []
  }) {
    if (!id || typeof id !== 'string') {
      throw new TypeError('AIProvider requires a non-empty string id');
    }
    if (!name || typeof name !== 'string') {
      throw new TypeError('AIProvider requires a non-empty string name');
    }

    this.id = id;
    this.name = name;
    this.capabilities = {
      text: capabilities?.text ?? true,
      chat: capabilities?.chat ?? true,
      streaming: capabilities?.streaming ?? false
    };
    this.models = Array.isArray(models) ? [...models] : [];
  }

  /**
   * Generate completion for an AI request.
   * @abstract
   * @param {import('./AIRequest.js').AIRequest} request
   * @returns {Promise<import('./AIResponse.js').AIResponse>}
   */
  async generate(request) {
    throw new Error('AIProvider.generate must be implemented by subclass');
  }

  /**
   * Return a snapshot-safe serializable plain object.
   * Strictly metadata only: no functions or private state.
   * @returns {Object}
   */
  toJSON() {
    return {
      id: this.id,
      name: this.name,
      capabilities: { ...this.capabilities },
      models: this.models.map(m => ({ ...m }))
    };
  }
}
