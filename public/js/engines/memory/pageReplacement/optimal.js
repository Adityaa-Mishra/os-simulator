/**
 * OptimalPageReplacementEngine
 * Implements the Optimal (Bélády's) page replacement algorithm.
 * Evicts the page that will not be used for the longest period of time in the future.
 * Tie-breaker: lowest frame index.
 */

import { BasePageReplacementEngine } from './basePageReplacement.js';

export class OptimalPageReplacementEngine extends BasePageReplacementEngine {
  constructor() {
    super('page_replacement_optimal', 'Optimal Page Replacement');
  }

  getComplexity() {
    return {
      time: 'O(n * m * L)',
      space: 'O(m)',
      description: 'Scans future references for each resident page to identify the page unreferenced for the longest time.'
    };
  }

  selectVictimFrame(frames, referenceString, currentIndex) {
    let victimFrame = frames[0];
    let maxFutureDistance = -1;

    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i];
      let nextOccurrence = Infinity;

      // Scan future references from currentIndex + 1 onwards
      for (let j = currentIndex + 1; j < referenceString.length; j++) {
        if (referenceString[j] === frame.page) {
          nextOccurrence = j;
          break;
        }
      }

      // If page is never referenced again in the future
      if (nextOccurrence === Infinity) {
        // If victimFrame is not already at Infinity, or if this is the first Infinity we find
        if (maxFutureDistance !== Infinity) {
          maxFutureDistance = Infinity;
          victimFrame = frame;
        }
        // If multiple are at Infinity, tie-breaker keeps the earlier frame index (already lowest)
      } else if (nextOccurrence > maxFutureDistance) {
        maxFutureDistance = nextOccurrence;
        victimFrame = frame;
      }
    }

    return victimFrame;
  }
}
