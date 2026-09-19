/**
 * PlaybackController
 * Universal playback and step scrubbing controller for simulation engines.
 * Operates purely on an immutable array of precomputed snapshots.
 * Zero DOM dependencies; fully testable in any environment.
 */

export class PlaybackController {
  constructor(snapshots = [], options = {}) {
    this.snapshots = Array.isArray(snapshots) ? snapshots : [];
    this.currentIndex = 0;
    this.isPlaying = false;
    this.speed = options.speed || 1.0;
    this.baseIntervalMs = options.baseIntervalMs || 1000;
    this.onStepChange = options.onStepChange || (() => {});
    this.onPlayStateChange = options.onPlayStateChange || (() => {});
    this.timerId = null;
  }

  /**
   * Set or replace the snapshots array and reset playback state.
   */
  setSnapshots(snapshots) {
    this.pause();
    this.snapshots = Array.isArray(snapshots) ? snapshots : [];
    this.currentIndex = 0;
    this.notifyStepChange();
  }

  /**
   * Get the current snapshot object.
   */
  getCurrentSnapshot() {
    return this.snapshots[this.currentIndex] || null;
  }

  /**
   * Get the current step index.
   */
  getCurrentIndex() {
    return this.currentIndex;
  }

  /**
   * Get the total number of snapshots.
   */
  getTotalSteps() {
    return this.snapshots.length;
  }

  /**
   * Check if playback is currently active.
   */
  getIsPlaying() {
    return this.isPlaying;
  }

  /**
   * Start playback.
   */
  play() {
    if (this.isPlaying || this.snapshots.length === 0) return;

    // If at the end, restart from step 0
    if (this.currentIndex >= this.snapshots.length - 1) {
      this.currentIndex = 0;
      this.notifyStepChange();
    }

    this.isPlaying = true;
    this.onPlayStateChange(true);
    this.scheduleNextTick();
  }

  /**
   * Pause playback.
   */
  pause() {
    if (!this.isPlaying) return;

    this.isPlaying = false;
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
    this.onPlayStateChange(false);
  }

  /**
   * Toggle between play and pause.
   */
  togglePlay() {
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  /**
   * Advance to the next step.
   * @returns {boolean} true if advanced, false if already at the end
   */
  nextStep() {
    if (this.currentIndex < this.snapshots.length - 1) {
      this.currentIndex += 1;
      this.notifyStepChange();
      return true;
    }
    return false;
  }

  /**
   * Move back to the previous step.
   * @returns {boolean} true if moved back, false if already at step 0
   */
  prevStep() {
    if (this.currentIndex > 0) {
      this.currentIndex -= 1;
      this.notifyStepChange();
      return true;
    }
    return false;
  }

  /**
   * Jump directly to a specific step index.
   */
  goToStep(index) {
    const clampedIndex = Math.max(0, Math.min(index, this.snapshots.length - 1));
    if (clampedIndex !== this.currentIndex) {
      this.currentIndex = clampedIndex;
      this.notifyStepChange();
    }
  }

  /**
   * Reset to step 0 and pause.
   */
  reset() {
    this.pause();
    this.currentIndex = 0;
    this.notifyStepChange();
  }

  /**
   * Set playback speed multiplier.
   * @param {number} multiplier - e.g. 0.5, 1.0, 2.0, 4.0
   */
  setSpeed(multiplier) {
    if (multiplier > 0) {
      this.speed = multiplier;
      if (this.isPlaying) {
        // Reschedule current tick with new interval
        if (this.timerId !== null) {
          clearTimeout(this.timerId);
        }
        this.scheduleNextTick();
      }
    }
  }

  /**
   * Internal scheduler for tick loops.
   */
  scheduleNextTick() {
    const interval = Math.max(50, Math.round(this.baseIntervalMs / this.speed));
    this.timerId = setTimeout(() => {
      if (!this.isPlaying) return;

      const hasNext = this.nextStep();
      if (hasNext) {
        this.scheduleNextTick();
      } else {
        // Reached end of snapshots, auto-stop
        this.pause();
      }
    }, interval);
  }

  /**
   * Notify listener of current step state.
   */
  notifyStepChange() {
    this.onStepChange(this.getCurrentSnapshot(), this.currentIndex, this.snapshots.length);
  }

  /**
   * Cleanup all timers and listeners to avoid memory leaks.
   */
  destroy() {
    this.pause();
    this.snapshots = [];
    this.onStepChange = () => {};
    this.onPlayStateChange = () => {};
  }
}
