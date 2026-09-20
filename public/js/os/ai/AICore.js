/**
 * public/js/os/ai/AICore.js
 * Central AI Core subsystem for AdityyaOS.
 * Coordinates AI providers, model capability discovery, inference requests,
 * multi-turn sessions, token tracking, and process-bound lifecycle cleanup.
 */

import { MockAIProvider } from './MockAIProvider.js';
import { AIRequest } from './AIRequest.js';
import { AISession } from './AISession.js';
import { OSEvents } from '../kernel/OSEventEmitter.js';

export class AICore {
  /**
   * @param {import('../kernel/Kernel.js').Kernel} kernel
   * @param {Object} [config={}]
   */
  constructor(kernel, config = {}) {
    this.kernel = kernel;
    this.config = config;

    this.providers = new Map();
    this.activeRequests = new Map();
    this.activeSessions = new Map();

    this.stats = {
      totalRequests: 0,
      totalTokensUsed: {
        prompt: 0,
        completion: 0,
        total: 0
      }
    };

    this.initialize();
  }

  /**
   * Initialize AI Core with default provider.
   */
  initialize() {
    this.providers.clear();
    this.activeRequests.clear();
    this.activeSessions.clear();

    // Register default deterministic mock provider
    const defaultProvider = new MockAIProvider(this.config.mockProvider || {});
    this.registerProvider(defaultProvider);

    this.syncState();
  }

  /**
   * Reset AI Core subsystem.
   */
  reset() {
    // Abort all active requests
    for (const req of this.activeRequests.values()) {
      req.abort();
    }
    this.activeRequests.clear();

    // Close all sessions
    for (const sess of this.activeSessions.values()) {
      sess.close();
    }
    this.activeSessions.clear();

    this.stats = {
      totalRequests: 0,
      totalTokensUsed: {
        prompt: 0,
        completion: 0,
        total: 0
      }
    };

    this.initialize();
  }

  /**
   * Shutdown AI Core subsystem.
   */
  shutdown() {
    for (const req of this.activeRequests.values()) {
      req.abort();
    }
    this.activeRequests.clear();

    for (const sess of this.activeSessions.values()) {
      sess.close();
    }
    this.activeSessions.clear();

    this.syncState();
  }

  /**
   * Register an AI provider.
   * @param {import('./AIProvider.js').AIProvider} provider
   */
  registerProvider(provider) {
    if (!provider || !provider.id) {
      throw new TypeError('AICore.registerProvider requires a valid AIProvider with an id');
    }
    this.providers.set(provider.id, provider);
    this.syncState();
  }

  /**
   * Get provider by ID.
   * @param {string} id
   * @returns {import('./AIProvider.js').AIProvider|null}
   */
  getProvider(id) {
    return this.providers.get(id) || null;
  }

  /**
   * Get all registered providers.
   * @returns {Array<import('./AIProvider.js').AIProvider>}
   */
  getProviders() {
    return Array.from(this.providers.values());
  }

  /**
   * Get all available models across registered providers.
   * @returns {Array<Object>}
   */
  getAvailableModels() {
    const models = [];
    for (const provider of this.providers.values()) {
      for (const m of provider.models) {
        models.push({
          ...m,
          providerId: provider.id,
          providerName: provider.name
        });
      }
    }
    return models;
  }

  /**
   * Find provider that supports a given model.
   * @param {string} modelId
   * @returns {import('./AIProvider.js').AIProvider}
   */
  findProviderForModel(modelId) {
    for (const provider of this.providers.values()) {
      if (provider.models.some(m => m.id === modelId)) {
        return provider;
      }
    }
    // Fallback to first registered provider
    const first = this.providers.values().next().value;
    if (!first) {
      throw new Error('No AI providers registered in AICore');
    }
    return first;
  }

  /**
   * Execute an AI inference query.
   * @param {Object} options
   * @param {number} options.pid - Calling process ID
   * @param {string} options.prompt - Prompt text
   * @param {string} [options.systemPrompt]
   * @param {string} [options.model='adityya-sim-v1']
   * @param {number} [options.maxTokens=500]
   * @param {number} [options.temperature=0.7]
   * @param {Object} [options.context] - Sanitized context
   * @returns {Promise<import('./AIResponse.js').AIResponse>}
   */
  async query({
    pid,
    prompt,
    systemPrompt = null,
    model = 'adityya-sim-v1',
    maxTokens = 500,
    temperature = 0.7,
    context = null
  }) {
    if (typeof pid !== 'number' || isNaN(pid) || pid <= 0) {
      throw new TypeError('AICore.query requires a valid positive number pid');
    }
    if (typeof prompt !== 'string') {
      throw new TypeError('AICore.query requires a string prompt');
    }

    const provider = this.findProviderForModel(model);

    const request = new AIRequest({
      pid,
      prompt,
      systemPrompt,
      model,
      maxTokens,
      temperature,
      context
    });

    this.activeRequests.set(request.id, request);

    if (this.kernel && this.kernel.events) {
      this.kernel.events.emit(OSEvents.AI_REQUEST_STARTED, {
        requestId: request.id,
        pid: request.pid,
        model: request.model
      });
    }

    try {
      const response = await provider.generate(request);
      if (request.aborted) {
        response.finishReason = 'aborted';
      }

      this.activeRequests.delete(request.id);

      // Accumulate usage stats
      this.stats.totalRequests++;
      this.stats.totalTokensUsed.prompt += response.usage.promptTokens;
      this.stats.totalTokensUsed.completion += response.usage.completionTokens;
      this.stats.totalTokensUsed.total += response.usage.totalTokens;

      if (this.kernel && this.kernel.events) {
        this.kernel.events.emit(OSEvents.AI_REQUEST_COMPLETED, {
          requestId: request.id,
          pid: request.pid,
          usage: response.usage,
          finishReason: response.finishReason
        });
      }

      this.syncState();
      return response;
    } catch (err) {
      this.activeRequests.delete(request.id);

      if (this.kernel && this.kernel.events) {
        this.kernel.events.emit(OSEvents.AI_REQUEST_FAILED, {
          requestId: request.id,
          pid: request.pid,
          error: err.message
        });
      }

      this.syncState();
      throw err;
    }
  }

  /**
   * Create a new multi-turn conversation session bound to a process PID.
   * @param {Object} options
   * @param {number} options.pid - Calling process ID
   * @param {string} [options.model='adityya-sim-v1']
   * @param {string} [options.systemPrompt=null]
   * @returns {AISession}
   */
  createSession({ pid, model = 'adityya-sim-v1', systemPrompt = null }) {
    if (typeof pid !== 'number' || isNaN(pid) || pid <= 0) {
      throw new TypeError('AICore.createSession requires a valid positive number pid');
    }

    const session = new AISession({
      pid,
      model,
      systemPrompt,
      aiCore: this
    });

    this.activeSessions.set(session.id, session);

    if (this.kernel && this.kernel.events) {
      this.kernel.events.emit(OSEvents.AI_SESSION_CREATED, {
        sessionId: session.id,
        pid: session.pid,
        model: session.model
      });
    }

    this.syncState();
    return session;
  }

  /**
   * Get an active session by ID.
   * @param {string} id
   * @returns {AISession|null}
   */
  getSession(id) {
    return this.activeSessions.get(id) || null;
  }

  /**
   * Close a session by ID.
   * @param {string} id
   * @returns {boolean}
   */
  closeSession(id) {
    const session = this.activeSessions.get(id);
    if (!session) return false;
    session.close();
    return true;
  }

  /**
   * Unregister a session.
   * @internal
   * @param {string} sessionId
   */
  _unregisterSession(sessionId) {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      this.activeSessions.delete(sessionId);
      if (this.kernel && this.kernel.events) {
        this.kernel.events.emit(OSEvents.AI_SESSION_CLOSED, {
          sessionId,
          pid: session.pid
        });
      }
    }
    this.syncState();
  }

  /**
   * Abort a specific request by ID.
   * @param {string} requestId
   * @returns {boolean}
   */
  abortRequest(requestId) {
    const req = this.activeRequests.get(requestId);
    if (!req) return false;
    req.abort();
    this.activeRequests.delete(requestId);
    this.syncState();
    return true;
  }

  /**
   * Abort all active requests and close all sessions belonging to a specific process PID.
   * Called upon process termination.
   * @param {number} pid
   */
  abortProcessRequests(pid) {
    if (typeof pid !== 'number') return;

    // Abort active requests
    for (const [id, req] of this.activeRequests.entries()) {
      if (req.pid === pid) {
        req.abort();
        this.activeRequests.delete(id);
      }
    }

    // Close active sessions
    for (const sess of this.activeSessions.values()) {
      if (sess.pid === pid) {
        try {
          sess.close();
        } catch {
          // Ignore close errors during process termination
        }
      }
    }

    this.syncState();
  }

  /**
   * Get system-wide or process-specific usage statistics.
   * @param {number} [pid=null]
   * @returns {Object}
   */
  getUsage(pid = null) {
    if (pid !== null && typeof pid === 'number') {
      // Calculate usage for a specific process PID across its sessions
      const processUsage = {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        sessionCount: 0
      };
      for (const sess of this.activeSessions.values()) {
        if (sess.pid === pid) {
          processUsage.promptTokens += sess.tokenUsage.promptTokens;
          processUsage.completionTokens += sess.tokenUsage.completionTokens;
          processUsage.totalTokens += sess.tokenUsage.totalTokens;
          processUsage.sessionCount++;
        }
      }
      return processUsage;
    }

    return {
      totalRequests: this.stats.totalRequests,
      totalTokensUsed: { ...this.stats.totalTokensUsed },
      activeSessions: this.activeSessions.size
    };
  }

  /**
   * Return a snapshot-safe serializable plain object representing AI state.
   * Strictly data only: no functions, no live provider/session instances.
   * @returns {Object}
   */
  getAIState() {
    return {
      activeSessions: this.activeSessions.size,
      totalRequests: this.stats.totalRequests,
      totalTokensUsed: { ...this.stats.totalTokensUsed },
      providers: Array.from(this.providers.values()).map(p => p.toJSON())
    };
  }

  /**
   * Synchronize AI state to central OSState.
   */
  syncState() {
    if (this.kernel && this.kernel.state) {
      this.kernel.state.ai = this.getAIState();
    }
  }
}
