/**
 * LookDiskEngine
 * Implements the LOOK disk scheduling algorithm.
 * Moves in one direction servicing requests until reaching the last pending request
 * in that direction, then reverses immediately without traveling to the physical boundary.
 */

import { BaseDiskEngine } from './baseDisk.js';

export class LookDiskEngine extends BaseDiskEngine {
  constructor() {
    super('disk_look', 'LOOK');
  }

  getComplexity() {
    return {
      time: 'O(n log n)',
      space: 'O(n)',
      description: 'Sorts requests into directional partitions and reverses at the extreme pending request.'
    };
  }

  computeSequence(requests, initialHead, diskSize, direction) {
    const steps = [];
    let currentHead = initialHead;

    if (direction === 'right') {
      const rightRequests = requests.filter(r => r >= initialHead).sort((a, b) => a - b);
      const leftRequests = requests.filter(r => r < initialHead).sort((a, b) => b - a);

      // Service requests moving right
      for (const req of rightRequests) {
        const movement = Math.abs(req - currentHead);
        steps.push({
          targetHead: req,
          servicedRequest: req,
          stepType: 'service',
          direction: 'right',
          actionLog: `Head moved ${movement} cylinders right from ${currentHead} to ${req} to service request.`,
          educationalNote: 'LOOK moves in the given direction servicing requests along the path.'
        });
        currentHead = req;
      }

      // If pending requests remain on the left, reverse immediately at the highest request
      for (const req of leftRequests) {
        const movement = Math.abs(req - currentHead);
        steps.push({
          targetHead: req,
          servicedRequest: req,
          stepType: 'service',
          direction: 'left',
          actionLog: `Head moved ${movement} cylinders left from ${currentHead} to ${req} to service request.`,
          educationalNote: 'LOOK reverses at the last request without seeking to the physical disk boundary.'
        });
        currentHead = req;
      }
    } else {
      // Direction is 'left'
      const leftRequests = requests.filter(r => r <= initialHead).sort((a, b) => b - a);
      const rightRequests = requests.filter(r => r > initialHead).sort((a, b) => a - b);

      // Service requests moving left
      for (const req of leftRequests) {
        const movement = Math.abs(req - currentHead);
        steps.push({
          targetHead: req,
          servicedRequest: req,
          stepType: 'service',
          direction: 'left',
          actionLog: `Head moved ${movement} cylinders left from ${currentHead} to ${req} to service request.`,
          educationalNote: 'LOOK moves in the given direction servicing requests along the path.'
        });
        currentHead = req;
      }

      // If pending requests remain on the right, reverse immediately at the lowest request
      for (const req of rightRequests) {
        const movement = Math.abs(req - currentHead);
        steps.push({
          targetHead: req,
          servicedRequest: req,
          stepType: 'service',
          direction: 'right',
          actionLog: `Head moved ${movement} cylinders right from ${currentHead} to ${req} to service request.`,
          educationalNote: 'LOOK reverses at the last request without seeking to the physical disk boundary.'
        });
        currentHead = req;
      }
    }

    return steps;
  }
}
