/**
 * File System Engine Index & Registration
 * Registers FileSystemSimulatorEngine in the central simulationRegistry.
 */

import { simulationRegistry } from '../../core/simulationRegistry.js';
import { FileSystemSimulatorEngine } from './fsSimulator.js';
import { BaseFileSystemEngine, VALID_PERMISSIONS, DEFAULT_DISK_CONFIG } from './baseFileSystem.js';

export const fileSystemSimulatorEngine = new FileSystemSimulatorEngine();

// Auto-register filesystem engine into simulationRegistry
simulationRegistry.register(fileSystemSimulatorEngine);

export {
  BaseFileSystemEngine,
  FileSystemSimulatorEngine,
  VALID_PERMISSIONS,
  DEFAULT_DISK_CONFIG
};
