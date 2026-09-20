/**
 * public/js/os/runtime/ApplicationInstance.js
 * Represents an active, managed instance of an AdityyaOS application.
 * Enforces lifecycle state transitions, tracking, and snapshot safety.
 */

import { ApplicationState, isValidApplicationTransition } from './ApplicationState.js';

export class ApplicationInstance {
  /**
   * @param {Object} options
   * @param {string} options.instanceId
   * @param {string} options.appId
   * @param {number} options.pid
   * @param {Object} options.definition
   * @param {import('./ApplicationContext.js').ApplicationContext} [options.context]
   * @param {import('../shell/WindowState.js').WindowModel|null} [options.windowModel=null]
   * @param {string} [options.initialState=ApplicationState.LOADING]
   */
  constructor({
    instanceId,
    appId,
    pid,
    definition,
    context = null,
    windowModel = null,
    initialState = ApplicationState.LOADING
  }) {
    this.instanceId = instanceId;
    this.appId = appId;
    this.pid = pid;
    this.definition = definition;
    this.context = context;
    this.windowModel = windowModel;

    this.state = initialState;
    this.exitCode = null;
    this.error = null;

    this.createdAt = Date.now();
    this.startedAt = null;
    this.terminatedAt = null;
  }

  /**
   * Transition instance to a new lifecycle state.
   * @param {string} newState
   */
  setState(newState) {
    if (!isValidApplicationTransition(this.state, newState)) {
      throw new Error(`Invalid application state transition from "${this.state}" to "${newState}"`);
    }

    this.state = newState;

    if (newState === ApplicationState.RUNNING && !this.startedAt) {
      this.startedAt = Date.now();
    } else if (newState === ApplicationState.TERMINATED || newState === ApplicationState.FAILED) {
      this.terminatedAt = Date.now();
    }
  }

  /**
   * Get an immutable, snapshot-safe representation of this instance.
   * @returns {{
   *   instanceId: string,
   *   appId: string,
   *   pid: number,
   *   state: string,
   *   windowId: string|null,
   *   exitCode: number|null,
   *   error: { message: string, name: string }|null,
   *   createdAt: number,
   *   startedAt: number|null,
   *   terminatedAt: number|null
   * }}
   */
  getState() {
    return {
      instanceId: this.instanceId,
      appId: this.appId,
      pid: this.pid,
      state: this.state,
      windowId: this.windowModel?.id || null,
      exitCode: this.exitCode,
      error: this.error ? { message: this.error.message, name: this.error.name } : null,
      createdAt: this.createdAt,
      startedAt: this.startedAt,
      terminatedAt: this.terminatedAt
    };
  }

  /**
   * JSON serialization support.
   */
  toJSON() {
    return this.getState();
  }
}
