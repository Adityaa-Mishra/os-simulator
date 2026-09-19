/**
 * SstfDiskEngine
 * Implements the Shortest Seek Time First (SSTF) disk scheduling algorithm.
 * Selects the pending request with the minimum seek distance from the current head.
 * Tie-breaker: lowest cylinder number.
 */

import { BaseDiskEngine } from './baseDisk.js';

export class SstfDiskEngine extends BaseDiskEngine {
  constructor() {
    super('disk_sstf', 'Shortest Seek Time First (SSTF)');
  }

  getComplexity() {
    return {
      time: 'O(n^2)',
      space: 'O(n)',
      description: 'Finds the nearest pending request in O(n) for each of the n requests.'
    };
  }

  computeSequence(requests, initialHead, diskSize, direction) {
    const steps = [];
    const pending = [...requests];
    let currentHead = initialHead;

    while (pending.length > 0) {
      let bestIdx = 0;
      let minDistance = Math.abs(pending[0] - currentHead);

      for (let i = 1; i < pending.length; i++) {
        const dist = Math.abs(pending[i] - currentHead);
        if (dist < minDistance) {
          minDistance = dist;
          bestIdx = i;
        } else if (dist === minDistance) {
          // Tie-breaking: choose lower cylinder number
          if (pending[i] < pending[bestIdx]) {
            bestIdx = i;
          }
        }
      }

      const targetHead = pending[bestIdx];
      pending.splice(bestIdx, 1);

      const movement = Math.abs(targetHead - currentHead);
      const moveDir = targetHead >= currentHead ? 'right' : 'left';

      steps.push({
        targetHead,
        servicedRequest: targetHead,
        stepType: 'service',
        direction: moveDir,
        actionLog: `Head moved ${movement} cylinders from ${currentHead} to ${targetHead} (seek distance: ${movement}).`,
        educationalNote: `SSTF chose cylinder ${targetHead} because it had the shortest seek distance (${movement} cylinders) from current head ${currentHead}.`
      });

      currentHead = targetHead;
    }

    return steps;
  }
}
