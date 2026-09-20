/**
 * public/js/os/runtime/ApplicationState.js
 * Application lifecycle states and valid state transition rules for AdityyaOS.
 */

export const ApplicationState = Object.freeze({
  REGISTERED: 'REGISTERED',
  LOADING: 'LOADING',
  READY: 'READY',
  RUNNING: 'RUNNING',
  SUSPENDED: 'SUSPENDED',
  TERMINATING: 'TERMINATING',
  TERMINATED: 'TERMINATED',
  FAILED: 'FAILED'
});

export const VALID_APPLICATION_TRANSITIONS = Object.freeze({
  [ApplicationState.REGISTERED]: Object.freeze([
    ApplicationState.LOADING,
    ApplicationState.FAILED
  ]),
  [ApplicationState.LOADING]: Object.freeze([
    ApplicationState.READY,
    ApplicationState.FAILED
  ]),
  [ApplicationState.READY]: Object.freeze([
    ApplicationState.RUNNING,
    ApplicationState.TERMINATING,
    ApplicationState.FAILED
  ]),
  [ApplicationState.RUNNING]: Object.freeze([
    ApplicationState.SUSPENDED,
    ApplicationState.TERMINATING,
    ApplicationState.FAILED
  ]),
  [ApplicationState.SUSPENDED]: Object.freeze([
    ApplicationState.RUNNING,
    ApplicationState.TERMINATING,
    ApplicationState.FAILED
  ]),
  [ApplicationState.TERMINATING]: Object.freeze([
    ApplicationState.TERMINATED,
    ApplicationState.FAILED
  ]),
  [ApplicationState.TERMINATED]: Object.freeze([]),
  [ApplicationState.FAILED]: Object.freeze([])
});

/**
 * Validate whether a state transition is legal.
 * @param {string} from
 * @param {string} to
 * @returns {boolean}
 */
export function isValidApplicationTransition(from, to) {
  const allowed = VALID_APPLICATION_TRANSITIONS[from];
  return Array.isArray(allowed) && allowed.includes(to);
}
