/**
 * public/js/os/experiments/ExperimentPolicy.js
 * Resource limits and capability enforcement for AdityyaOS experiments.
 */

export const DEFAULT_EXPERIMENT_LIMITS = Object.freeze({
  maxFiles: 100,
  maxSnapshotSizeBytes: 512 * 1024, // 512 KB
  maxOperations: 50,
  maxConcurrentExperiments: 3
});

export class ExperimentPolicy {
  /**
   * Validate if an experiment exceeds configured resource limits.
   * @param {Object} experiment
   * @param {Object} [limits=DEFAULT_EXPERIMENT_LIMITS]
   * @returns {{ allowed: boolean, reason?: string }}
   */
  static checkLimits(experiment, limits = DEFAULT_EXPERIMENT_LIMITS) {
    const maxOps = limits.maxOperations || DEFAULT_EXPERIMENT_LIMITS.maxOperations;
    if (experiment.operationsCount > maxOps) {
      return { allowed: false, reason: `Operation limit exceeded (max ${maxOps} operations)` };
    }

    const sandbox = experiment.sandbox;
    if (sandbox && sandbox.files) {
      const maxFiles = limits.maxFiles || DEFAULT_EXPERIMENT_LIMITS.maxFiles;
      if (sandbox.files.size > maxFiles) {
        return { allowed: false, reason: `File count limit exceeded (max ${maxFiles} files)` };
      }

      let totalBytes = 0;
      for (const file of sandbox.files.values()) {
        totalBytes += (file.content ? file.content.length : 0);
      }

      const maxSize = limits.maxSnapshotSizeBytes || DEFAULT_EXPERIMENT_LIMITS.maxSnapshotSizeBytes;
      if (totalBytes > maxSize) {
        return { allowed: false, reason: `Snapshot size limit exceeded (max ${maxSize} bytes)` };
      }
    }

    return { allowed: true };
  }

  /**
   * Check whether a diff contains only allowlisted, safe change types.
   * Prohibits applying changes to Kernel internals, protected processes, hardware,
   * or paths outside the owner profile's home directory.
   * @param {Object} diff
   * @param {string} username
   * @returns {{ safe: boolean, error?: string }}
   */
  static validateApplySafety(diff, username) {
    if (!diff) {
      return { safe: false, error: 'Diff report is required' };
    }

    if (diff.hasUnsupported) {
      return { safe: false, error: 'Diff contains unsupported changes outside owner profile home' };
    }

    for (const change of diff.changes || []) {
      if (change.type === 'created' || change.type === 'modified' || change.type === 'deleted') {
        const p = change.path;
        if (!p.startsWith(`/home/${username}/`) && p !== `/home/${username}`) {
          return { safe: false, error: `Change at "${p}" is outside owner profile home "/home/${username}"` };
        }
      }
    }

    return { safe: true };
  }
}
