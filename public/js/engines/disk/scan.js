/**
 * ScanDiskEngine
 * Implements the SCAN (Elevator) disk scheduling algorithm.
 * Moves in one direction servicing all requests until reaching the physical boundary,
 * then reverses direction and services requests in the opposite direction.
 */

import { BaseDiskEngine } from './baseDisk.js';

export class ScanDiskEngine extends BaseDiskEngine {
  constructor() {
    super('disk_scan', 'SCAN (Elevator)');
  }

  getComplexity() {
    return {
      time: 'O(n log n)',
      space: 'O(n)',
      description: 'Sorts requests into directional partitions and sweeps across cylinders to the boundary.'
    };
  }

  computeSequence(requests, initialHead, diskSize, direction) {
    const steps = [];
    let currentHead = initialHead;

    if (direction === 'right') {
      const rightRequests = requests.filter(r => r >= initialHead).sort((a, b) => a - b);
      const leftRequests = requests.filter(r => r < initialHead).sort((a, b) => b - a);

      // Service requests in right direction
      for (const req of rightRequests) {
        const movement = Math.abs(req - currentHead);
        steps.push({
          targetHead: req,
          servicedRequest: req,
          stepType: 'service',
          direction: 'right',
          actionLog: `Head moved ${movement} cylinders right from ${currentHead} to ${req} to service request.`,
          educationalNote: 'SCAN sweeps continuously towards higher cylinders servicing requests along the track.'
        });
        currentHead = req;
      }

      // If pending requests exist behind, sweep to the physical right boundary
      if (leftRequests.length > 0) {
        const rightBoundary = diskSize - 1;
        if (currentHead < rightBoundary) {
          const movement = Math.abs(rightBoundary - currentHead);
          steps.push({
            targetHead: rightBoundary,
            servicedRequest: null,
            stepType: 'boundary',
            direction: 'right',
            actionLog: `Head reached right disk boundary at cylinder ${rightBoundary} (${movement} cylinders) and reversed direction to left.`,
            educationalNote: 'SCAN travels to the physical boundary before reversing direction.'
          });
          currentHead = rightBoundary;
        }

        // Service remaining requests moving left
        for (const req of leftRequests) {
          const movement = Math.abs(req - currentHead);
          steps.push({
            targetHead: req,
            servicedRequest: req,
            stepType: 'service',
            direction: 'left',
            actionLog: `Head moved ${movement} cylinders left from ${currentHead} to ${req} to service request.`,
            educationalNote: 'SCAN services remaining requests on the return sweep towards cylinder 0.'
          });
          currentHead = req;
        }
      }
    } else {
      // Direction is 'left'
      const leftRequests = requests.filter(r => r <= initialHead).sort((a, b) => b - a);
      const rightRequests = requests.filter(r => r > initialHead).sort((a, b) => a - b);

      // Service requests in left direction
      for (const req of leftRequests) {
        const movement = Math.abs(req - currentHead);
        steps.push({
          targetHead: req,
          servicedRequest: req,
          stepType: 'service',
          direction: 'left',
          actionLog: `Head moved ${movement} cylinders left from ${currentHead} to ${req} to service request.`,
          educationalNote: 'SCAN sweeps continuously towards lower cylinders servicing requests along the track.'
        });
        currentHead = req;
      }

      // If pending requests exist behind, sweep to physical left boundary
      if (rightRequests.length > 0) {
        const leftBoundary = 0;
        if (currentHead > leftBoundary) {
          const movement = Math.abs(leftBoundary - currentHead);
          steps.push({
            targetHead: leftBoundary,
            servicedRequest: null,
            stepType: 'boundary',
            direction: 'left',
            actionLog: `Head reached left disk boundary at cylinder ${leftBoundary} (${movement} cylinders) and reversed direction to right.`,
            educationalNote: 'SCAN travels to the physical boundary before reversing direction.'
          });
          currentHead = leftBoundary;
        }

        // Service remaining requests moving right
        for (const req of rightRequests) {
          const movement = Math.abs(req - currentHead);
          steps.push({
            targetHead: req,
            servicedRequest: req,
            stepType: 'service',
            direction: 'right',
            actionLog: `Head moved ${movement} cylinders right from ${currentHead} to ${req} to service request.`,
            educationalNote: 'SCAN services remaining requests on the return sweep towards higher cylinders.'
          });
          currentHead = req;
        }
      }
    }

    return steps;
  }
}
