/**
 * FifoPageReplacementEngine
 * Implements the First-In, First-Out (FIFO) page replacement algorithm.
 * Evicts the page that has been in memory for the longest duration (earliest arrivalTime).
 */

import { BasePageReplacementEngine } from './basePageReplacement.js';

export class FifoPageReplacementEngine extends BasePageReplacementEngine {
  constructor() {
    super('page_replacement_fifo', 'FIFO Page Replacement');
  }

  getComplexity() {
    return {
      time: 'O(n * m)',
      space: 'O(m)',
      description: 'Maintains a FIFO queue of frames; selects the oldest loaded frame in O(m) when replacement occurs.'
    };
  }

  selectVictimFrame(frames, referenceString, currentIndex) {
    let oldestFrame = frames[0];
    for (let i = 1; i < frames.length; i++) {
      if (frames[i].arrivalTime < oldestFrame.arrivalTime) {
        oldestFrame = frames[i];
      }
    }
    return oldestFrame;
  }
}
