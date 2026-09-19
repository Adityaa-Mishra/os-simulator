/**
 * CPU Scheduling Engines Index & Registration
 * Registers all CPU scheduling algorithms with the central simulationRegistry.
 */

import { simulationRegistry } from '../../core/simulationRegistry.js';
import { FcfsEngine } from './fcfs.js';
import { SjfEngine } from './sjf.js';
import { SrtfEngine } from './srtf.js';
import { RoundRobinEngine } from './roundRobin.js';
import { PriorityNonPreemptiveEngine } from './priorityNonPreemptive.js';
import { PriorityPreemptiveEngine } from './priorityPreemptive.js';

export const fcfsEngine = new FcfsEngine();
export const sjfEngine = new SjfEngine();
export const srtfEngine = new SrtfEngine();
export const roundRobinEngine = new RoundRobinEngine();
export const priorityNonPreemptiveEngine = new PriorityNonPreemptiveEngine();
export const priorityPreemptiveEngine = new PriorityPreemptiveEngine();

// Auto-register all CPU algorithms into the central registry
simulationRegistry.register(fcfsEngine);
simulationRegistry.register(sjfEngine);
simulationRegistry.register(srtfEngine);
simulationRegistry.register(roundRobinEngine);
simulationRegistry.register(priorityNonPreemptiveEngine);
simulationRegistry.register(priorityPreemptiveEngine);

export {
  FcfsEngine,
  SjfEngine,
  SrtfEngine,
  RoundRobinEngine,
  PriorityNonPreemptiveEngine,
  PriorityPreemptiveEngine
};
