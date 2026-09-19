/**
 * CScanDiskEngine
 * Implements the Circular SCAN (C-SCAN) disk scheduling algorithm.
 * Moves in one direction servicing requests to the physical boundary,
 * wraps directly to the opposite boundary, and continues in the same direction.
 */

import { BaseDiskEngine } from './baseDisk.js';

export class CScanDiskEngine extends BaseDiskEngine {
  constructor() {
    super('disk_cscan', 'Circular SCAN (C-SCAN)');
  }

  getComplexity() {
    return {
      time: 'O(n log n)',
      space: 'O(n)',
      description: 'Sorts requests and sweeps circularly across cylinders in a single direction.'
    };
  }

  computeSequence(requests, initialHead, diskSize, direction) {
    const steps = [];
    let currentHead = initialHead;

    if (direction === 'right') {
      const rightRequests = requests.filter(r => r >= initialHead).sort((a, b) => a - b);
      const leftRequests = requests.filter(r => r < initialHead).sort((a, b) => a - b);

      // Service requests moving right
      for (const req of rightRequests) {
        const movement = Math.abs(req - currentHead);
        steps.push({
          targetHead: req,
          servicedRequest: req,
          stepType: 'service',
          direction: 'right',
          actionLog: `Head moved ${movement} cylinders right from ${currentHead} to ${req} to service request.`,
          educationalNote: 'C-SCAN provides more uniform wait times by sweeping in one continuous direction.'
        });
        currentHead = req;
      }

      // If pending requests remain on the other side, sweep to boundary and wrap
      if (leftRequests.length > 0) {
        const rightBoundary = diskSize - 1;
        if (currentHead < rightBoundary) {
          const movement = Math.abs(rightBoundary - currentHead);
          steps.push({
            targetHead: rightBoundary,
            servicedRequest: null,
            stepType: 'boundary',
            direction: 'right',
            actionLog: `Head reached right boundary at cylinder ${rightBoundary} (${movement} cylinders).`,
            educationalNote: 'C-SCAN moves to the outer boundary before circular wrap.'
          });
          currentHead = rightBoundary;
        }

        // Wrap to opposite boundary (cylinder 0)
        const wrapMovement = Math.abs(0 - currentHead);
        steps.push({
          targetHead: 0,
          servicedRequest: null,
          stepType: 'wrap',
          direction: 'right',
          actionLog: `Head wrapped from cylinder ${currentHead} to opposite boundary at cylinder 0 (${wrapMovement} cylinders).`,
          educationalNote: 'C-SCAN returns to the start without servicing requests on the wrap trajectory.'
        });
        currentHead = 0;

        // Service remaining requests moving right
        for (const req of leftRequests) {
          const movement = Math.abs(req - currentHead);
          steps.push({
            targetHead: req,
            servicedRequest: req,
            stepType: 'service',
            direction: 'right',
            actionLog: `Head moved ${movement} cylinders right from ${currentHead} to ${req} to service request.`,
            educationalNote: 'C-SCAN resumes servicing in the original direction.'
          });
          currentHead = req;
        }
      }
    } else {
      // Direction is 'left'
      const leftRequests = requests.filter(r => r <= initialHead).sort((a, b) => b - a);
      const rightRequests = requests.filter(r => r > initialHead).sort((a, b) => b - a);

      // Service requests moving left
      for (const req of leftRequests) {
        const movement = Math.abs(req - currentHead);
        steps.push({
          targetHead: req,
          servicedRequest: req,
          stepType: 'service',
          direction: 'left',
          actionLog: `Head moved ${movement} cylinders left from ${currentHead} to ${req} to service request.`,
          educationalNote: 'C-SCAN sweeps towards cylinder 0 servicing requests along the track.'
        });
        currentHead = req;
      }

      // If pending requests remain on the other side, sweep to boundary and wrap
      if (rightRequests.length > 0) {
        const leftBoundary = 0;
        if (currentHead > leftBoundary) {
          const movement = Math.abs(leftBoundary - currentHead);
          steps.push({
            targetHead: leftBoundary,
            servicedRequest: null,
            stepType: 'boundary',
            direction: 'left',
            actionLog: `Head reached left boundary at cylinder ${leftBoundary} (${movement} cylinders).`,
            educationalNote: 'C-SCAN moves to the inner boundary before circular wrap.'
          });
          currentHead = leftBoundary;
        }

        // Wrap to opposite boundary (cylinder diskSize - 1)
        const rightBoundary = diskSize - 1;
        const wrapMovement = Math.abs(rightBoundary - currentHead);
        steps.push({
          targetHead: rightBoundary,
          servicedRequest: null,
          stepType: 'wrap',
          direction: 'left',
          actionLog: `Head wrapped from cylinder ${currentHead} to opposite boundary at cylinder ${rightBoundary} (${wrapMovement} cylinders).`,
          educationalNote: 'C-SCAN returns to the upper end without servicing requests on the wrap trajectory.'
        });
        currentHead = rightBoundary;

        // Service remaining requests moving left
        for (const req of rightRequests) {
          const movement = Math.abs(req - currentHead);
          steps.push({
            targetHead: req,
            servicedRequest: req,
            stepType: 'service',
            direction: 'left',
            actionLog: `Head moved ${movement} cylinders left from ${currentHead} to ${req} to service request.`,
            educationalNote: 'C-SCAN resumes servicing in the original direction.'
          });
          currentHead = req;
        }
      }
    }

    return steps;
  }
}
