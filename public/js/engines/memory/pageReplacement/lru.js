/**
 * LruPageReplacementEngine
 * Implements the Least Recently Used (LRU) page replacement algorithm.
 * Evicts the page that has not been accessed for the longest period (minimum lastAccessTime).
 */

import { BasePageReplacementEngine } from './basePageReplacement.js';

export class LruPageReplacementEngine extends BasePageReplacementEngine {
  constructor() {
    super('page_replacement_lru', 'LRU Page Replacement');
  }

  getComplexity() {
    return {
      time: 'O(n * m)',
      space: 'O(m)',
      description: 'Tracks access timestamps across frames and replaces the frame with the oldest access time.'
    };
  }

  selectVictimFrame(frames, referenceString, currentIndex) {
    let lruFrame = frames[0];
    for (let i = 1; i < frames.length; i++) {
      if (frames[i].lastAccessTime < lruFrame.lastAccessTime) {
        lruFrame = frames[i];
      }
    }
    return lruFrame;
  }
}
