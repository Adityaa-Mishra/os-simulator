/**
 * Deadlock Management Engines Index & Registration
 * Registers Banker's Safety and Banker's Resource Request engines into simulationRegistry.
 */

import { simulationRegistry } from '../../core/simulationRegistry.js';
import { BankersSafetyEngine, BankersRequestEngine } from './bankers.js';
import { BaseDeadlockEngine } from './baseDeadlock.js';

export const bankersSafetyEngine = new BankersSafetyEngine();
export const bankersRequestEngine = new BankersRequestEngine();

// Auto-register deadlock engines into simulationRegistry
simulationRegistry.register(bankersSafetyEngine);
simulationRegistry.register(bankersRequestEngine);

export {
  BaseDeadlockEngine,
  BankersSafetyEngine,
  BankersRequestEngine
};
