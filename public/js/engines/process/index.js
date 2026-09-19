/**
 * Process Management Engines Index & Registration
 * Registers the Process Lifecycle & PCB simulation engine with the central simulationRegistry.
 */

import { simulationRegistry } from '../../core/simulationRegistry.js';
import { PcbSimulatorEngine } from './pcbSimulator.js';

export const pcbSimulatorEngine = new PcbSimulatorEngine();

// Auto-register the process management engine into the central registry
simulationRegistry.register(pcbSimulatorEngine);

export {
  PcbSimulatorEngine
};
