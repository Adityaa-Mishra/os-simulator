/**
 * public/js/os/experiments/ExperimentState.js
 * Lifecycle states, error codes, and transition rules for AdityyaOS Experiments Sandbox.
 */

export const ExperimentState = Object.freeze({
  CREATED: 'CREATED',
  INITIALIZING: 'INITIALIZING',
  READY: 'READY',
  RUNNING: 'RUNNING',
  PAUSED: 'PAUSED',
  COMPLETED: 'COMPLETED',
  DISCARDED: 'DISCARDED',
  FAILED: 'FAILED'
});

export const VALID_EXPERIMENT_TRANSITIONS = Object.freeze({
  [ExperimentState.CREATED]: [ExperimentState.INITIALIZING, ExperimentState.DISCARDED, ExperimentState.FAILED],
  [ExperimentState.INITIALIZING]: [ExperimentState.READY, ExperimentState.DISCARDED, ExperimentState.FAILED],
  [ExperimentState.READY]: [ExperimentState.RUNNING, ExperimentState.COMPLETED, ExperimentState.DISCARDED, ExperimentState.FAILED],
  [ExperimentState.RUNNING]: [ExperimentState.PAUSED, ExperimentState.COMPLETED, ExperimentState.DISCARDED, ExperimentState.FAILED],
  [ExperimentState.PAUSED]: [ExperimentState.RUNNING, ExperimentState.DISCARDED, ExperimentState.FAILED],
  [ExperimentState.COMPLETED]: [ExperimentState.DISCARDED],
  [ExperimentState.DISCARDED]: [],
  [ExperimentState.FAILED]: [ExperimentState.DISCARDED]
});

/**
 * Validate whether an experiment state transition is allowed.
 * @param {string} from
 * @param {string} to
 * @returns {boolean}
 */
export function isValidExperimentTransition(from, to) {
  const allowed = VALID_EXPERIMENT_TRANSITIONS[from];
  return Array.isArray(allowed) && allowed.includes(to);
}
