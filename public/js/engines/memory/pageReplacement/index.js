/**
 * Page Replacement Engines Index & Registration
 * Registers FIFO, LRU, and Optimal algorithms with the central simulationRegistry.
 */

import { simulationRegistry } from '../../../core/simulationRegistry.js';
import { FifoPageReplacementEngine } from './fifo.js';
import { LruPageReplacementEngine } from './lru.js';
import { OptimalPageReplacementEngine } from './optimal.js';

export const fifoPageReplacementEngine = new FifoPageReplacementEngine();
export const lruPageReplacementEngine = new LruPageReplacementEngine();
export const optimalPageReplacementEngine = new OptimalPageReplacementEngine();

// Auto-register page replacement engines into simulationRegistry
simulationRegistry.register(fifoPageReplacementEngine);
simulationRegistry.register(lruPageReplacementEngine);
simulationRegistry.register(optimalPageReplacementEngine);

export {
  FifoPageReplacementEngine,
  LruPageReplacementEngine,
  OptimalPageReplacementEngine
};
