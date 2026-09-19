/**
 * BaseSimulationEngine
 * Abstract base class defining the standard contract for all OS simulation algorithms.
 * Guarantees determinism, framework independence, and decoupled computation.
 */

export class BaseSimulationEngine {
  constructor(moduleType, algorithmId, name) {
    if (new.target === BaseSimulationEngine) {
      throw new TypeError('Cannot construct BaseSimulationEngine instances directly');
    }
    this.moduleType = moduleType;     // e.g., 'cpu', 'memory', 'disk'
    this.algorithmId = algorithmId;   // e.g., 'fcfs', 'round_robin'
    this.name = name;                 // e.g., 'First-Come, First-Served'
  }

  /**
   * Validate the given input dataset before execution.
   * @param {any} inputs - User inputs
   * @returns {{ isValid: boolean, error?: string }}
   */
  validate(inputs) {
    throw new Error(`Method 'validate(inputs)' must be implemented by ${this.constructor.name}`);
  }

  /**
   * Execute the simulation algorithm deterministically.
   * Must NOT access DOM, window, or network.
   * @param {any} inputs - Verified input parameters
   * @returns {SimulationResult} Complete execution timeline and summary metrics
   */
  run(inputs) {
    throw new Error(`Method 'run(inputs)' must be implemented by ${this.constructor.name}`);
  }

  /**
   * Return theoretical complexity metadata for educational panels.
   * @returns {{ time: string, space: string, description: string }}
   */
  getComplexity() {
    return {
      time: 'N/A',
      space: 'N/A',
      description: 'Standard algorithmic complexity not documented.'
    };
  }

  /**
   * Provide pre-configured sample inputs for rapid demonstration and testing.
   * @returns {Array<{ name: string, description: string, data: any }>}
   */
  getPresets() {
    return [];
  }

  /**
   * Helper to construct a standardized timeline snapshot.
   */
  createSnapshot({
    stepIndex,
    timeUnit,
    activeUnit = null,
    state = {},
    actionLog = '',
    educationalNote = ''
  }) {
    return {
      stepIndex,
      timeUnit,
      activeUnit,
      state: JSON.parse(JSON.stringify(state)), // Deep clone state for immutability
      actionLog,
      educationalNote
    };
  }

  /**
   * Helper to format standardized simulation results.
   */
  formatResult({ parameters = {}, snapshots = [], metrics = {} }) {
    return {
      metadata: {
        module: this.moduleType,
        algorithm: this.algorithmId,
        algorithmName: this.name,
        timestamp: Date.now(),
        parameters
      },
      snapshots,
      metrics
    };
  }
}
