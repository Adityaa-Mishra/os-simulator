/**
 * FcfsDiskEngine
 * Implements the First-Come, First-Served (FCFS) disk scheduling algorithm.
 * Services requests strictly in their arrival / input order.
 */

import { BaseDiskEngine } from './baseDisk.js';

export class FcfsDiskEngine extends BaseDiskEngine {
  constructor() {
    super('disk_fcfs', 'First-Come, First-Served (FCFS)');
  }

  getComplexity() {
    return {
      time: 'O(n)',
      space: 'O(1)',
      description: 'Iterates through the request queue once in arrival order with zero reordering overhead.'
    };
  }

  computeSequence(requests, initialHead, diskSize, direction) {
    const steps = [];
    let currentHead = initialHead;

    for (let i = 0; i < requests.length; i++) {
      const targetHead = requests[i];
      const movement = Math.abs(targetHead - currentHead);
      const moveDir = targetHead >= currentHead ? 'right' : 'left';

      steps.push({
        targetHead,
        servicedRequest: targetHead,
        stepType: 'service',
        direction: moveDir,
        actionLog: `Head moved ${movement} cylinders from ${currentHead} to ${targetHead} to service request ${targetHead}.`,
        educationalNote: 'FCFS services requests in their exact input arrival order without seek reordering.'
      });

      currentHead = targetHead;
    }

    return steps;
  }
}
