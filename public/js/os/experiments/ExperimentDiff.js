/**
 * public/js/os/experiments/ExperimentDiff.js
 * Deterministic diff calculator for AdityyaOS Experiment Sandboxes.
 * Clearly categorizes differences into: created, modified, deleted, unchanged, and unsupported.
 */

export class ExperimentDiff {
  /**
   * Compute deterministic differences between a base snapshot and sandbox snapshot.
   * @param {import('./ExperimentSnapshot.js').ExperimentSnapshot} baseSnapshot
   * @param {import('./ExperimentSnapshot.js').ExperimentSnapshot} sandboxSnapshot
   * @returns {Object} Structured diff report
   */
  static compute(baseSnapshot, sandboxSnapshot) {
    const changes = [];
    const summary = {
      created: 0,
      modified: 0,
      deleted: 0,
      unchanged: 0,
      unsupported: 0
    };

    const baseFiles = baseSnapshot.files;
    const sandboxFiles = sandboxSnapshot.files;
    const username = sandboxSnapshot.username;

    // 1. Check files in sandbox against base
    for (const [path, sandboxFile] of sandboxFiles.entries()) {
      // Check if within allowed profile home directory
      const isAllowedScope = path.startsWith(`/home/${username}/`) || path === `/home/${username}`;
      if (!isAllowedScope && path !== '/tmp') {
        summary.unsupported++;
        changes.push({
          type: 'unsupported',
          path,
          reason: 'Changes outside owner profile home directory are not supported for apply'
        });
        continue;
      }

      if (!baseFiles.has(path)) {
        summary.created++;
        changes.push({
          type: 'created',
          path,
          fileType: sandboxFile.type,
          size: sandboxFile.content ? sandboxFile.content.length : 0
        });
      } else {
        const baseFile = baseFiles.get(path);
        const isContentDifferent = (sandboxFile.content || '') !== (baseFile.content || '');
        const isTypeDifferent = sandboxFile.type !== baseFile.type;

        if (isContentDifferent || isTypeDifferent) {
          summary.modified++;
          changes.push({
            type: 'modified',
            path,
            fileType: sandboxFile.type,
            oldSize: baseFile.content ? baseFile.content.length : 0,
            newSize: sandboxFile.content ? sandboxFile.content.length : 0
          });
        } else {
          summary.unchanged++;
          changes.push({
            type: 'unchanged',
            path
          });
        }
      }
    }

    // 2. Check for files deleted in sandbox
    for (const [path, baseFile] of baseFiles.entries()) {
      if (!sandboxFiles.has(path)) {
        const isAllowedScope = path.startsWith(`/home/${username}/`) || path === `/home/${username}`;
        if (!isAllowedScope) {
          summary.unsupported++;
          changes.push({
            type: 'unsupported',
            path,
            reason: 'Deletion outside owner profile home directory is not supported for apply'
          });
        } else {
          summary.deleted++;
          changes.push({
            type: 'deleted',
            path,
            fileType: baseFile.type
          });
        }
      }
    }

    // 3. Diff preferences
    const prefChanges = [];
    const basePrefs = baseSnapshot.preferences || {};
    const sandPrefs = sandboxSnapshot.preferences || {};

    const allKeys = new Set([...Object.keys(basePrefs), ...Object.keys(sandPrefs)]);
    for (const key of allKeys) {
      const bVal = JSON.stringify(basePrefs[key]);
      const sVal = JSON.stringify(sandPrefs[key]);
      if (bVal !== sVal) {
        prefChanges.push({
          key,
          oldValue: basePrefs[key],
          newValue: sandPrefs[key]
        });
      }
    }

    summary.totalChanges = summary.created + summary.modified + summary.deleted;

    return {
      summary,
      changes,
      created: changes.filter(c => c.type === 'created').map(c => c.path),
      modified: changes.filter(c => c.type === 'modified').map(c => c.path),
      deleted: changes.filter(c => c.type === 'deleted').map(c => c.path),
      preferences: prefChanges,
      hasChanges: summary.created > 0 || summary.modified > 0 || summary.deleted > 0 || prefChanges.length > 0,
      hasUnsupported: summary.unsupported > 0
    };
  }
}
