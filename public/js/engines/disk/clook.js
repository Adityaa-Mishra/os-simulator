/**
 * CLookDiskEngine
 * Implements the Circular LOOK (C-LOOK) disk scheduling algorithm.
 * Moves in one direction servicing requests up to the final request in that direction,
 * then jumps directly to the furthest request on the opposite end without boundary travel.
 */

import { BaseDiskEngine } from './baseDisk.js';

export class CLookDiskEngine extends BaseDiskEngine {
  constructor() {
    super('disk_clook', 'Circular LOOK (C-LOOK)');
  }

  getComplexity() {
    return {
      time: 'O(n log n)',
      space: 'O(n)',
      description: 'Sorts requests and sweeps circularly between extreme request cylinders.'
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
          educationalNote: 'C-LOOK sweeps towards higher cylinders servicing requests along the path.'
        });
        currentHead = req;
      }

      // If pending requests remain on the left, wrap directly to the lowest request
      if (leftRequests.length > 0) {
        const firstWrapReq = leftRequests[0];
        const wrapMovement = Math.abs(firstWrapReq - currentHead);
        steps.push({
          targetHead: firstWrapReq,
          servicedRequest: firstWrapReq,
          stepType: 'wrap',
          direction: 'right',
          actionLog: `Head wrapped ${wrapMovement} cylinders from ${currentHead} directly to cylinder ${firstWrapReq} to service request ${firstWrapReq}.`,
          educationalNote: 'C-LOOK jumps directly to the lowest request without seeking to physical boundaries.'
        });
        currentHead = firstWrapReq;

        // Service remaining requests moving right
        for (let i = 1; i < leftRequests.length; i++) {
          const req = leftRequests[i];
          const movement = Math.abs(req - currentHead);
          steps.push({
            targetHead: req,
            servicedRequest: req,
            stepType: 'service',
            direction: 'right',
            actionLog: `Head moved ${movement} cylinders right from ${currentHead} to ${req} to service request.`,
            educationalNote: 'C-LOOK continues sweeping right to service remaining requests.'
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
          educationalNote: 'C-LOOK sweeps towards lower cylinders servicing requests along the path.'
        });
        currentHead = req;
      }

      // If pending requests remain on the right, wrap directly to the highest request
      if (rightRequests.length > 0) {
        const firstWrapReq = rightRequests[0];
        const wrapMovement = Math.abs(firstWrapReq - currentHead);
        steps.push({
          targetHead: firstWrapReq,
          servicedRequest: firstWrapReq,
          stepType: 'wrap',
          direction: 'left',
          actionLog: `Head wrapped ${wrapMovement} cylinders from ${currentHead} directly to cylinder ${firstWrapReq} to service request ${firstWrapReq}.`,
          educationalNote: 'C-LOOK jumps directly to the highest request without seeking to physical boundaries.'
        });
        currentHead = firstWrapReq;

        // Service remaining requests moving left
        for (let i = 1; i < rightRequests.length; i++) {
          const req = rightRequests[i];
          const movement = Math.abs(req - currentHead);
          steps.push({
            targetHead: req,
            servicedRequest: req,
            stepType: 'service',
            direction: 'left',
            actionLog: `Head moved ${movement} cylinders left from ${currentHead} to ${req} to service request.`,
            educationalNote: 'C-LOOK continues sweeping left to service remaining requests.'
          });
          currentHead = req;
        }
      }
    }

    return steps;
  }
}
