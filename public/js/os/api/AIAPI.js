/**
 * public/js/os/api/AIAPI.js
 * Application-facing facade for the AdityyaOS AI Core Subsystem.
 * Strictly enforces 'ai.query' permission, isolates session/request ownership by PID,
 * guarantees non-agentic behavior, and prevents leaking Kernel/internal subsystem references.
 */

import { APIError } from './APIError.js';
import { PackagePermissions } from '../packages/PackagePermissions.js';
import { AIContext } from '../ai/AIContext.js';

export class AIAPI {
  /**
   * @param {Object} options
   * @param {import('../kernel/Kernel.js').Kernel} options.kernel
   * @param {import('./APIContext.js').APIContext} options.context
   */
  constructor({ kernel, context }) {
    if (!kernel) {
      throw new TypeError('AIAPI requires a kernel instance');
    }
    if (!context) {
      throw new TypeError('AIAPI requires an APIContext instance');
    }

    this._kernel = kernel;
    this._context = context;
    this._ownedSessionIds = new Set();
  }

  /**
   * Helper to verify 'ai.query' permission.
   * @private
   * @param {string} operation
   */
  _ensurePermission(operation) {
    if (!this._context.hasPermission(PackagePermissions.AI_QUERY)) {
      throw new APIError({
        code: 'EPERM',
        message: `Permission denied: '${PackagePermissions.AI_QUERY}' required for ${operation}`,
        operation,
        appId: this._context.appId
      });
    }
  }

  /**
   * Execute a single-turn AI query.
   * Requires 'ai.query' permission.
   * @param {string} prompt - Prompt string
   * @param {Object} [options={}]
   * @param {string} [options.systemPrompt]
   * @param {string} [options.model='adityya-sim-v1']
   * @param {number} [options.maxTokens=500]
   * @param {number} [options.temperature=0.7]
   * @param {Object} [options.context] - Optional application-supplied context data
   * @returns {Promise<Object>} Snapshot-safe AIResponse data
   */
  async query(prompt, options = {}) {
    this._ensurePermission('ai.query');

    // Construct strictly sanitized AIContext containing safe OS metadata
    const sanitizedContext = new AIContext({
      appId: this._context.appId,
      username: this._context.username,
      osVersion: this._kernel.state?.system?.version || '1.0.0',
      hostname: this._kernel.state?.system?.hostname || 'adityya-os',
      customData: options.context || {}
    });

    const response = await this._kernel.aiCore.query({
      pid: this._context.pid,
      prompt,
      systemPrompt: options.systemPrompt,
      model: options.model,
      maxTokens: options.maxTokens,
      temperature: options.temperature,
      context: sanitizedContext
    });

    return response.toJSON();
  }

  /**
   * Create a multi-turn conversation session bound strictly to this application PID.
   * Requires 'ai.query' permission.
   * @param {Object} [options={}]
   * @param {string} [options.model='adityya-sim-v1']
   * @param {string} [options.systemPrompt]
   * @returns {Object} Controlled session handle
   */
  createSession(options = {}) {
    this._ensurePermission('ai.createSession');

    const realSession = this._kernel.aiCore.createSession({
      pid: this._context.pid,
      model: options.model,
      systemPrompt: options.systemPrompt
    });

    this._ownedSessionIds.add(realSession.id);
    const self = this;

    // Controlled session wrapper that prevents exposing internal references
    return {
      id: realSession.id,
      pid: realSession.pid,
      model: realSession.model,
      systemPrompt: realSession.systemPrompt,

      async send(prompt, sendOptions = {}) {
        self._ensurePermission('ai.session.send');
        const resp = await realSession.send(prompt, sendOptions);
        return resp.toJSON();
      },

      getHistory() {
        return realSession.getHistory();
      },

      clearHistory() {
        realSession.clearHistory();
      },

      close() {
        self._ownedSessionIds.delete(realSession.id);
        realSession.close();
      },

      toJSON() {
        return realSession.toJSON();
      }
    };
  }

  /**
   * List available AI models and their capabilities.
   * Requires 'ai.query' permission.
   * @returns {Array<Object>}
   */
  getModels() {
    this._ensurePermission('ai.getModels');
    return JSON.parse(JSON.stringify(this._kernel.aiCore.getAvailableModels()));
  }

  /**
   * Get AI token usage strictly for this calling process/application.
   * Never exposes other processes' usage.
   * Requires 'ai.query' permission.
   * @returns {Object}
   */
  getUsage() {
    this._ensurePermission('ai.getUsage');
    return this._kernel.aiCore.getUsage(this._context.pid);
  }

  /**
   * Clean up all active sessions created by this API instance.
   */
  destroy() {
    for (const sessionId of this._ownedSessionIds) {
      try {
        this._kernel.aiCore.closeSession(sessionId);
      } catch {
        // Ignore close errors during destruction
      }
    }
    this._ownedSessionIds.clear();
  }
}
