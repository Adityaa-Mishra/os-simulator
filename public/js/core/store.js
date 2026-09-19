/**
 * Reactive state store implementing the Observer pattern.
 * Manages global application state: auth user, theme, active module.
 */

class Store {
  constructor(initialState = {}) {
    let savedTheme = 'dark';
    if (typeof localStorage !== 'undefined') {
      try {
        savedTheme = localStorage.getItem('theme') || 'dark';
      } catch {
        savedTheme = 'dark';
      }
    }

    this.state = {
      user: null,
      theme: savedTheme,
      activeRoute: '#/',
      ...initialState
    };
    this.listeners = new Map();
  }

  /**
   * Get the current state or a specific key
   */
  getState(key) {
    return key ? this.state[key] : { ...this.state };
  }

  /**
   * Update state and notify subscribers
   */
  setState(updates) {
    const prevState = { ...this.state };
    this.state = { ...this.state, ...updates };

    for (const [key, callbackList] of this.listeners.entries()) {
      if (key in updates && updates[key] !== prevState[key]) {
        callbackList.forEach(callback => callback(this.state[key], prevState[key]));
      }
    }

    // Always notify global listeners if registered with '*'
    const globalListeners = this.listeners.get('*') || [];
    globalListeners.forEach(cb => cb(this.state, prevState));
  }

  /**
   * Subscribe to changes on a specific state key or '*' for all changes
   */
  subscribe(key, callback) {
    if (!this.listeners.has(key)) {
      this.listeners.set(key, []);
    }
    this.listeners.get(key).push(callback);

    // Return an unsubscribe function
    return () => {
      const callbacks = this.listeners.get(key) || [];
      this.listeners.set(
        key,
        callbacks.filter(cb => cb !== callback)
      );
    };
  }
}

export const store = new Store();
