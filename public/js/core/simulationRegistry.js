/**
 * SimulationRegistry
 * Central registry decoupling views and UI components from specific algorithm implementations.
 */

import { BaseSimulationEngine } from './simulationEngine.js';

class SimulationRegistry {
  constructor() {
    // Map: moduleType -> Map(algorithmId -> engineInstance)
    this.modules = new Map();
  }

  /**
   * Register a simulation engine instance.
   * @param {BaseSimulationEngine} engineInstance
   */
  register(engineInstance) {
    if (!(engineInstance instanceof BaseSimulationEngine)) {
      throw new Error('Registered engine must extend BaseSimulationEngine');
    }

    const { moduleType, algorithmId } = engineInstance;

    if (!this.modules.has(moduleType)) {
      this.modules.set(moduleType, new Map());
    }

    const moduleEngines = this.modules.get(moduleType);
    if (moduleEngines.has(algorithmId)) {
      console.warn(`[SimulationRegistry] Overwriting existing algorithm '${algorithmId}' in module '${moduleType}'.`);
    }

    moduleEngines.set(algorithmId, engineInstance);
    return this;
  }

  /**
   * Retrieve an engine by its module type and algorithm ID.
   * @param {string} moduleType - e.g. 'cpu'
   * @param {string} algorithmId - e.g. 'round_robin'
   * @returns {BaseSimulationEngine|null}
   */
  get(moduleType, algorithmId) {
    const moduleEngines = this.modules.get(moduleType);
    if (!moduleEngines) return null;
    return moduleEngines.get(algorithmId) || null;
  }

  /**
   * Get all registered algorithms for a module.
   * @param {string} moduleType
   * @returns {Array<{ id: string, name: string, engine: BaseSimulationEngine }>}
   */
  getAlgorithmsByModule(moduleType) {
    const moduleEngines = this.modules.get(moduleType);
    if (!moduleEngines) return [];

    const list = [];
    for (const [id, engine] of moduleEngines.entries()) {
      list.push({
        id,
        name: engine.name,
        engine
      });
    }
    return list;
  }

  /**
   * Get all registered module types.
   * @returns {string[]}
   */
  getModules() {
    return Array.from(this.modules.keys());
  }

  /**
   * Clear registry (useful in test suites)
   */
  clear() {
    this.modules.clear();
  }
}

export const simulationRegistry = new SimulationRegistry();
