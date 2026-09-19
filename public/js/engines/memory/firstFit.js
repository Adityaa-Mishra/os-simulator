/**
 * FirstFitEngine
 * Implements the First Fit memory allocation algorithm.
 * Scans partitions sequentially from the beginning and allocates the first block that fits.
 */

import { BaseAllocationEngine } from './baseAllocation.js';

export class FirstFitEngine extends BaseAllocationEngine {
  constructor() {
    super('memory_first_fit', 'First Fit');
  }

  getComplexity() {
    return {
      time: 'O(n * m)',
      space: 'O(n + m)',
      description: 'Scans partitions sequentially from the first block for each process request until a suitable partition is found.'
    };
  }

  selectBlock(blocks, process) {
    for (const b of blocks) {
      if (b.isFree && b.size >= process.size) {
        return b;
      }
    }
    return null;
  }
}
