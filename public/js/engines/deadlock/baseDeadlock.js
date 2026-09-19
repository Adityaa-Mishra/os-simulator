/**
 * BaseDeadlockEngine
 * Common base class for Banker's Algorithm and Deadlock Management engines.
 * Implements validation, Need matrix calculation, and standard presets.
 */

import { BaseSimulationEngine } from '../../core/simulationEngine.js';

export class BaseDeadlockEngine extends BaseSimulationEngine {
  constructor(algorithmId, name) {
    super('deadlock', algorithmId, name);
  }

  getPresets() {
    return [
      {
        name: 'Classic Textbook Safe State',
        description: 'Standard 5-process, 3-resource safe state from Silberschatz et al. with safe sequence [P1, P3, P0, P2, P4] under deterministic tie-breaking.',
        data: {
          processes: ['P0', 'P1', 'P2', 'P3', 'P4'],
          available: [3, 3, 2],
          max: [
            [7, 5, 3],
            [3, 2, 2],
            [9, 0, 2],
            [2, 2, 2],
            [4, 3, 3]
          ],
          allocation: [
            [0, 1, 0],
            [2, 0, 0],
            [3, 0, 2],
            [2, 1, 1],
            [0, 0, 2]
          ]
        }
      },
      {
        name: 'Unsafe State (Deadlock Potential)',
        description: 'State where remaining available resources cannot satisfy any pending process needs.',
        data: {
          processes: ['P0', 'P1', 'P2'],
          available: [1, 0, 0],
          max: [
            [3, 2, 2],
            [2, 2, 2],
            [2, 1, 3]
          ],
          allocation: [
            [1, 1, 1],
            [1, 0, 1],
            [1, 1, 1]
          ]
        }
      },
      {
        name: 'Grantable Resource Request',
        description: 'P1 requests [1, 0, 2] in the classic state; tentative allocation results in a verified safe sequence.',
        data: {
          processes: ['P0', 'P1', 'P2', 'P3', 'P4'],
          available: [3, 3, 2],
          max: [
            [7, 5, 3],
            [3, 2, 2],
            [9, 0, 2],
            [2, 2, 2],
            [4, 3, 3]
          ],
          allocation: [
            [0, 1, 0],
            [2, 0, 0],
            [3, 0, 2],
            [2, 1, 1],
            [0, 0, 2]
          ],
          request: {
            process: 'P1',
            resources: [1, 0, 2]
          }
        }
      },
      {
        name: 'Denied Resource Request (Unsafe State)',
        description: 'P4 requests [3, 3, 0]; available is sufficient but tentative state is unsafe (no process can finish), so request must be denied.',
        data: {
          processes: ['P0', 'P1', 'P2', 'P3', 'P4'],
          available: [3, 3, 2],
          max: [
            [7, 5, 3],
            [3, 2, 2],
            [9, 0, 2],
            [2, 2, 2],
            [4, 3, 3]
          ],
          allocation: [
            [0, 1, 0],
            [2, 0, 0],
            [3, 0, 2],
            [2, 1, 1],
            [0, 0, 2]
          ],
          request: {
            process: 'P4',
            resources: [3, 3, 0]
          }
        }
      },
      {
        name: 'Denied Resource Request (Exceeds Need)',
        description: 'P1 requests [2, 3, 1] which exceeds its declared maximum need of [1, 2, 2].',
        data: {
          processes: ['P0', 'P1', 'P2', 'P3', 'P4'],
          available: [3, 3, 2],
          max: [
            [7, 5, 3],
            [3, 2, 2],
            [9, 0, 2],
            [2, 2, 2],
            [4, 3, 3]
          ],
          allocation: [
            [0, 1, 0],
            [2, 0, 0],
            [3, 0, 2],
            [2, 1, 1],
            [0, 0, 2]
          ],
          request: {
            process: 'P1',
            resources: [2, 3, 1]
          }
        }
      }
    ];
  }

  /**
   * Validate banker's state inputs.
   */
  validate(inputs) {
    if (!inputs || typeof inputs !== 'object') {
      return { isValid: false, error: 'Input configuration must be an object' };
    }

    // Validate processes
    if (!Array.isArray(inputs.processes) || inputs.processes.length === 0) {
      return { isValid: false, error: 'At least one process must be provided in processes array' };
    }

    const seenProc = new Set();
    for (let i = 0; i < inputs.processes.length; i++) {
      const p = inputs.processes[i];
      if (typeof p !== 'string' || p.trim() === '') {
        return { isValid: false, error: `Process at index ${i} must be a non-empty string identifier` };
      }
      const pId = p.trim();
      if (seenProc.has(pId)) {
        return { isValid: false, error: `Duplicate process ID detected: "${pId}"` };
      }
      seenProc.add(pId);
    }
    const numProcesses = inputs.processes.length;

    // Validate available vector
    if (!Array.isArray(inputs.available) || inputs.available.length === 0) {
      return { isValid: false, error: 'At least one resource type must be provided in available vector' };
    }

    for (let j = 0; j < inputs.available.length; j++) {
      const a = inputs.available[j];
      if (typeof a !== 'number' || isNaN(a) || a < 0 || !Number.isInteger(a)) {
        return { isValid: false, error: `Available resource at index ${j} must be a non-negative integer` };
      }
    }
    const numResources = inputs.available.length;

    // Validate max matrix
    if (!Array.isArray(inputs.max) || inputs.max.length !== numProcesses) {
      return { isValid: false, error: `Max matrix must have exactly ${numProcesses} rows (matching process count)` };
    }

    for (let i = 0; i < numProcesses; i++) {
      const row = inputs.max[i];
      if (!Array.isArray(row) || row.length !== numResources) {
        return { isValid: false, error: `Max matrix row ${i} must have exactly ${numResources} elements (matching resource count)` };
      }
      for (let j = 0; j < numResources; j++) {
        const val = row[j];
        if (typeof val !== 'number' || isNaN(val) || val < 0 || !Number.isInteger(val)) {
          return { isValid: false, error: `Max matrix [${i}][${j}] must be a non-negative integer` };
        }
      }
    }

    // Validate allocation matrix
    if (!Array.isArray(inputs.allocation) || inputs.allocation.length !== numProcesses) {
      return { isValid: false, error: `Allocation matrix must have exactly ${numProcesses} rows (matching process count)` };
    }

    for (let i = 0; i < numProcesses; i++) {
      const row = inputs.allocation[i];
      if (!Array.isArray(row) || row.length !== numResources) {
        return { isValid: false, error: `Allocation matrix row ${i} must have exactly ${numResources} elements (matching resource count)` };
      }
      for (let j = 0; j < numResources; j++) {
        const allocVal = row[j];
        if (typeof allocVal !== 'number' || isNaN(allocVal) || allocVal < 0 || !Number.isInteger(allocVal)) {
          return { isValid: false, error: `Allocation matrix [${i}][${j}] must be a non-negative integer` };
        }
        const maxVal = inputs.max[i][j];
        if (allocVal > maxVal) {
          return {
            isValid: false,
            error: `Allocation [${allocVal}] exceeds Max [${maxVal}] for process "${inputs.processes[i]}" and resource ${j}`
          };
        }
      }
    }

    return { isValid: true };
  }

  /**
   * Calculate Need matrix: Need[i][j] = Max[i][j] - Allocation[i][j].
   */
  calculateNeed(max, allocation) {
    return max.map((maxRow, i) =>
      maxRow.map((maxVal, j) => maxVal - allocation[i][j])
    );
  }
}
