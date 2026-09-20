/**
 * public/js/os/api/EventAPI.js
 * Controlled application interface for safe event subscription and publication.
 * Tracks all registered listeners, guarantees 100% cleanup upon destroy(),
 * and enforces 'events.subscribe' and 'events.emit' permissions.
 */

import { APIError } from './APIError.js';

export class EventAPI {
  /**
   * @param {Object} options
   * @param {import('../kernel/OSEventEmitter.js').OSEventEmitter} options.events
   * @param {import('./APIContext.js').APIContext} options.context
   */
  constructor({ events, context }) {
    this._events = events;
    this._context = context;
    this._listeners = new Set();
  }

  /**
   * Subscribe to an event with tracking for automatic lifecycle cleanup.
   * Requires 'events.subscribe' permission.
   * @param {string} event
   * @param {Function} handler
   * @returns {this}
   */
  on(event, handler) {
    this._context?.assertPermission('events.subscribe', 'events.on');

    if (typeof event !== 'string' || !event) {
      throw new APIError({
        code: 'EINVAL',
        message: 'Event name must be a non-empty string',
        operation: 'events.on',
        appId: this._context?.appId
      });
    }
    if (typeof handler !== 'function') {
      throw new APIError({
        code: 'EINVAL',
        message: 'Event handler must be a function',
        operation: 'events.on',
        appId: this._context?.appId
      });
    }

    if (this._events) {
      this._events.on(event, handler);
      this._listeners.add({ event, handler });
    }
    return this;
  }

  /**
   * Unsubscribe from an event.
   * @param {string} event
   * @param {Function} handler
   * @returns {this}
   */
  off(event, handler) {
    if (this._events) {
      this._events.off(event, handler);
      for (const entry of this._listeners) {
        if (entry.event === event && entry.handler === handler) {
          this._listeners.delete(entry);
          break;
        }
      }
    }
    return this;
  }

  /**
   * Emit an event scoped with application identity.
   * Requires 'events.emit' permission.
   * @param {string} event
   * @param {Object} [data={}]
   * @returns {boolean}
   */
  emit(event, data = {}) {
    this._context?.assertPermission('events.emit', 'events.emit');

    if (typeof event !== 'string' || !event) {
      throw new APIError({
        code: 'EINVAL',
        message: 'Event name must be a non-empty string',
        operation: 'events.emit',
        appId: this._context?.appId
      });
    }

    if (this._events) {
      const payload = typeof data === 'object' && data !== null ? { ...data } : { data };
      payload.appId = this._context?.appId;
      payload.pid = this._context?.pid;
      return this._events.emit(event, payload);
    }
    return false;
  }

  /**
   * Automatically remove all listeners registered by this application instance.
   */
  destroy() {
    if (this._events) {
      for (const { event, handler } of this._listeners) {
        try {
          this._events.off(event, handler);
        } catch {
          // Ignore errors during mass cleanup
        }
      }
    }
    this._listeners.clear();
  }
}
