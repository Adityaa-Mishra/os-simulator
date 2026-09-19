/**
 * Memory Allocation Engines Index & Registration
 * Registers First Fit, Best Fit, and Worst Fit algorithms with the central simulationRegistry.
 */

import { simulationRegistry } from '../../core/simulationRegistry.js';
import { FirstFitEngine } from './firstFit.js';
import { BestFitEngine } from './bestFit.js';
import { WorstFitEngine } from './worstFit.js';

export const firstFitEngine = new FirstFitEngine();
export const bestFitEngine = new BestFitEngine();
export const worstFitEngine = new WorstFitEngine();

// Auto-register memory allocation engines into simulationRegistry
simulationRegistry.register(firstFitEngine);
simulationRegistry.register(bestFitEngine);
simulationRegistry.register(worstFitEngine);

export {
  FirstFitEngine,
  BestFitEngine,
  WorstFitEngine
};
