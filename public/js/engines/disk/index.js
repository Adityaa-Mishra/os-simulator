/**
 * Disk Scheduling Engines Index & Registration
 * Registers FCFS, SSTF, SCAN, C-SCAN, LOOK, and C-LOOK with the central simulationRegistry.
 */

import { simulationRegistry } from '../../core/simulationRegistry.js';
import { FcfsDiskEngine } from './fcfs.js';
import { SstfDiskEngine } from './sstf.js';
import { ScanDiskEngine } from './scan.js';
import { CScanDiskEngine } from './cscan.js';
import { LookDiskEngine } from './look.js';
import { CLookDiskEngine } from './clook.js';

export const fcfsDiskEngine = new FcfsDiskEngine();
export const sstfDiskEngine = new SstfDiskEngine();
export const scanDiskEngine = new ScanDiskEngine();
export const cscanDiskEngine = new CScanDiskEngine();
export const lookDiskEngine = new LookDiskEngine();
export const clookDiskEngine = new CLookDiskEngine();

// Auto-register all 6 disk scheduling engines into simulationRegistry
simulationRegistry.register(fcfsDiskEngine);
simulationRegistry.register(sstfDiskEngine);
simulationRegistry.register(scanDiskEngine);
simulationRegistry.register(cscanDiskEngine);
simulationRegistry.register(lookDiskEngine);
simulationRegistry.register(clookDiskEngine);

export {
  FcfsDiskEngine,
  SstfDiskEngine,
  ScanDiskEngine,
  CScanDiskEngine,
  LookDiskEngine,
  CLookDiskEngine
};
