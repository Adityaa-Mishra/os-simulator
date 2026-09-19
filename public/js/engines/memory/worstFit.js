/**
 * WorstFitEngine
 * Implements the Worst Fit memory allocation algorithm.
 * Searches all available partitions to allocate the process into the largest free block,
 * leaving the largest possible leftover partition.
 */

import { BaseAllocationEngine } from './baseAllocation.js';

export class WorstFitEngine extends BaseAllocationEngine {
  constructor() {
    super('memory_worst_fit', 'Worst Fit');
  }

  getComplexity() {
    return {
      time: 'O(n * m)',
      space: 'O(n + m)',
      description: 'Examines all available blocks to locate the partition with the largest remaining capacity.'
    };
  }

  selectBlock(blocks, process) {
    let worstBlock = null;
    let maxDifference = -1;

    for (const b of blocks) {
      if (b.isFree && b.size >= process.size) {
        const diff = b.size - process.size;
        if (diff > maxDifference) {
          maxDifference = diff;
          worstBlock = b;
        }
      }
    }

    return worstBlock;
  }
}
