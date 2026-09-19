/**
 * BestFitEngine
 * Implements the Best Fit memory allocation algorithm.
 * Searches all available partitions to find the smallest block that fits the process,
 * minimizing internal fragmentation.
 */

import { BaseAllocationEngine } from './baseAllocation.js';

export class BestFitEngine extends BaseAllocationEngine {
  constructor() {
    super('memory_best_fit', 'Best Fit');
  }

  getComplexity() {
    return {
      time: 'O(n * m)',
      space: 'O(n + m)',
      description: 'Examines all available blocks for each process request to identify the partition with minimum leftover space.'
    };
  }

  selectBlock(blocks, process) {
    let bestBlock = null;
    let minDifference = Infinity;

    for (const b of blocks) {
      if (b.isFree && b.size >= process.size) {
        const diff = b.size - process.size;
        if (diff < minDifference) {
          minDifference = diff;
          bestBlock = b;
        }
      }
    }

    return bestBlock;
  }
}
