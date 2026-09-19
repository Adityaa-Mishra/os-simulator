/**
 * BasePageReplacementEngine
 * Abstract base class for virtual memory page replacement algorithms.
 * Handles validation, presets, snapshot generation, hit/fault evaluation, and metrics.
 */

import { BaseSimulationEngine } from '../../../core/simulationEngine.js';

export class BasePageReplacementEngine extends BaseSimulationEngine {
  constructor(algorithmId, name) {
    super('page_replacement', algorithmId, name);
  }

  getPresets() {
    return [
      {
        name: 'Classic Textbook String (3 Frames)',
        description: 'Standard reference string: [7, 0, 1, 2, 0, 3, 0, 4, 2, 3, 0, 3, 2, 1, 2, 0, 1, 7, 0, 1] with 3 frames.',
        data: {
          referenceString: [7, 0, 1, 2, 0, 3, 0, 4, 2, 3, 0, 3, 2, 1, 2, 0, 1, 7, 0, 1],
          frameCount: 3
        }
      },
      {
        name: "Belady's Anomaly Demonstration",
        description: 'Reference string [1, 2, 3, 4, 1, 2, 5, 1, 2, 3, 4, 5] often used to showcase FIFO anomaly.',
        data: {
          referenceString: [1, 2, 3, 4, 1, 2, 5, 1, 2, 3, 4, 5],
          frameCount: 3
        }
      },
      {
        name: 'High Locality of Reference (4 Frames)',
        description: 'Sequence with repeated access patterns to demonstrate LRU and Optimal effectiveness.',
        data: {
          referenceString: [2, 3, 2, 1, 5, 2, 4, 5, 3, 2, 5, 2],
          frameCount: 4
        }
      }
    ];
  }

  /**
   * Validate reference string and frame count.
   */
  validate(inputs) {
    if (!inputs || typeof inputs !== 'object') {
      return { isValid: false, error: 'Input configuration must be an object' };
    }

    if (!Array.isArray(inputs.referenceString) || inputs.referenceString.length === 0) {
      return { isValid: false, error: 'Reference string must be a non-empty array of page references' };
    }

    for (let i = 0; i < inputs.referenceString.length; i++) {
      const page = inputs.referenceString[i];
      if (page === undefined || page === null || String(page).trim() === '') {
        return { isValid: false, error: `Invalid page reference at index ${i}` };
      }
    }

    if (typeof inputs.frameCount !== 'number' || isNaN(inputs.frameCount) || inputs.frameCount < 1 || !Number.isInteger(inputs.frameCount)) {
      return { isValid: false, error: 'Frame count must be a positive integer (>= 1)' };
    }

    return { isValid: true };
  }

  /**
   * Victim selection strategy to be implemented by FIFO, LRU, Optimal.
   * @param {Array<Object>} frames - Current frame states
   * @param {Array<any>} referenceString - Full reference sequence
   * @param {number} currentIndex - Current index in referenceString
   * @returns {Object} Selected victim frame
   */
  selectVictimFrame(frames, referenceString, currentIndex) {
    throw new Error(`Method 'selectVictimFrame' must be implemented by ${this.constructor.name}`);
  }

  /**
   * Run deterministic page replacement simulation.
   */
  run(inputs) {
    const validation = this.validate(inputs);
    if (!validation.isValid) {
      throw new Error(validation.error);
    }

    const referenceString = inputs.referenceString.map(p => (typeof p === 'number' ? p : String(p).trim()));
    const frameCount = inputs.frameCount;

    // Initialize empty frames
    const frames = Array.from({ length: frameCount }, (_, idx) => ({
      frameIndex: idx,
      page: null,
      arrivalTime: null,
      lastAccessTime: null
    }));

    const snapshots = [];
    const eventsLog = [];
    let pageHits = 0;
    let pageFaults = 0;
    let replacementCount = 0;
    let stepIndex = 0;

    // Snapshot 0: Initial empty state
    snapshots.push(
      this.createSnapshot({
        stepIndex: stepIndex++,
        timeUnit: 0,
        activeUnit: null,
        state: {
          frames: frames.map(f => ({ ...f })),
          reference: null,
          referenceIndex: -1,
          isHit: false,
          isFault: false,
          replacedPage: null,
          frameIndexModified: null,
          currentHitCount: 0,
          currentFaultCount: 0
        },
        actionLog: `Page replacement system initialized with ${frameCount} physical frames.`,
        educationalNote: `Starting ${this.name} simulation. All ${frameCount} frames are initially empty.`
      })
    );

    // Process each reference
    for (let i = 0; i < referenceString.length; i++) {
      const page = referenceString[i];
      const timeUnit = i + 1;

      // Check for Page Hit
      const hitFrame = frames.find(f => f.page === page);

      let isHit = false;
      let isFault = false;
      let replacedPage = null;
      let frameIndexModified = null;
      let actionLog = '';
      let educationalNote = '';

      if (hitFrame) {
        // Page Hit
        isHit = true;
        pageHits += 1;
        frameIndexModified = hitFrame.frameIndex;
        hitFrame.lastAccessTime = timeUnit; // Update last accessed timestamp for LRU

        actionLog = `Page ${page} -> HIT. Already resident in Frame ${hitFrame.frameIndex}.`;
        educationalNote = `Page ${page} is already in memory. No replacement required.`;
        eventsLog.push(`Step ${timeUnit}: ${actionLog}`);
      } else {
        // Page Fault
        isFault = true;
        pageFaults += 1;

        // Check for empty frame available
        const emptyFrame = frames.find(f => f.page === null);

        if (emptyFrame) {
          // Cold load into empty frame
          emptyFrame.page = page;
          emptyFrame.arrivalTime = timeUnit;
          emptyFrame.lastAccessTime = timeUnit;
          frameIndexModified = emptyFrame.frameIndex;

          actionLog = `Page ${page} -> FAULT (Cold Load). Loaded into empty Frame ${emptyFrame.frameIndex}.`;
          educationalNote = `Page ${page} was not in memory. Placed into available empty frame without eviction.`;
          eventsLog.push(`Step ${timeUnit}: ${actionLog}`);
        } else {
          // All frames full: Replacement required
          replacementCount += 1;
          const victim = this.selectVictimFrame(frames, referenceString, i);
          replacedPage = victim.page;
          frameIndexModified = victim.frameIndex;

          victim.page = page;
          victim.arrivalTime = timeUnit;
          victim.lastAccessTime = timeUnit;

          actionLog = `Page ${page} -> FAULT (Replaced Page ${replacedPage} in Frame ${victim.frameIndex}).`;
          educationalNote = `${this.name} selected Page ${replacedPage} for replacement based on its eviction policy.`;
          eventsLog.push(`Step ${timeUnit}: ${actionLog}`);
        }
      }

      // Record snapshot for this reference
      snapshots.push(
        this.createSnapshot({
          stepIndex: stepIndex++,
          timeUnit,
          activeUnit: String(page),
          state: {
            frames: frames.map(f => ({ ...f })),
            reference: page,
            referenceIndex: i,
            isHit,
            isFault,
            replacedPage,
            frameIndexModified,
            currentHitCount: pageHits,
            currentFaultCount: pageFaults
          },
          actionLog,
          educationalNote
        })
      );
    }

    const totalReferences = referenceString.length;
    const hitRatio = totalReferences > 0
      ? Math.round(((pageHits / totalReferences) * 100) * 100) / 100
      : 0;
    const faultRatio = totalReferences > 0
      ? Math.round(((pageFaults / totalReferences) * 100) * 100) / 100
      : 0;

    const metrics = {
      totalReferences,
      frameCount,
      pageHits,
      pageFaults,
      hitRatio,
      faultRatio,
      replacementCount,
      eventsLog
    };

    return this.formatResult({
      parameters: { frameCount, referenceString },
      snapshots,
      metrics
    });
  }
}
