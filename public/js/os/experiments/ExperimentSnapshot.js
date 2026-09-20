/**
 * public/js/os/experiments/ExperimentSnapshot.js
 * Decoupled, snapshot-safe container for an AdityyaOS Experiment Sandbox.
 * Holds deep-cloned virtual filesystem state strictly scoped to the owning profile.
 * Guarantees zero live references to Kernel, subsystem managers, DOM, or event listeners.
 */

import { PathResolver } from '../filesystem/PathResolver.js';
import { ProfilePolicy } from '../profiles/ProfilePolicy.js';

export class ExperimentSnapshot {
  /**
   * @param {Object} options
   * @param {string} options.id
   * @param {string} options.username - Owning profile username
   * @param {Map<string, Object>} [options.files]
   * @param {Object} [options.preferences]
   * @param {number} [options.createdAt]
   */
  constructor({
    id,
    username,
    files = new Map(),
    preferences = {},
    createdAt = Date.now()
  }) {
    this.id = id;
    this.username = username;
    this.createdAt = createdAt;
    this.preferences = JSON.parse(JSON.stringify(preferences || {}));

    // In-memory virtual file table: path -> { content: string, type: 'file'|'directory', permissions: string, mtime: number }
    this.files = new Map();
    if (files instanceof Map) {
      for (const [k, v] of files.entries()) {
        this.files.set(k, JSON.parse(JSON.stringify(v)));
      }
    } else if (files && typeof files === 'object') {
      for (const [k, v] of Object.entries(files)) {
        this.files.set(k, JSON.parse(JSON.stringify(v)));
      }
    }
  }

  /**
   * Capture a scoped snapshot from live AdityyaFS.
   * Strictly includes only files in /home/<username> and /tmp.
   * Never captures foreign profile directories or internal Kernel structures.
   * @param {Object} params
   * @param {string} params.id
   * @param {string} params.username
   * @param {import('../kernel/FileSystemManager.js').FileSystemManager} params.fsManager
   * @param {Object} [params.preferences={}]
   * @returns {ExperimentSnapshot}
   */
  static capture({ id, username, fsManager, preferences = {} }) {
    const files = new Map();

    if (fsManager && typeof fsManager.listDirectory === 'function') {
      const scanDir = (dirPath) => {
        try {
          const listRes = fsManager.listDirectory(dirPath);
          if (!listRes.success || !Array.isArray(listRes.data)) return;

          for (const entry of listRes.data) {
            const entryPath = PathResolver.normalize(entry.name, dirPath);

            // Strictly enforce profile boundary: only capture owner profile home and /tmp
            if (!ProfilePolicy.isPathAllowed(entryPath, username)) {
              continue;
            }

            if (entry.type === 'directory') {
              files.set(entryPath, {
                type: 'directory',
                permissions: entry.permissions || 'rwx',
                mtime: entry.mtime || entry.modified || Date.now()
              });
              scanDir(entryPath);
            } else {
              const readRes = fsManager.readFile(entryPath);
              const content = readRes.success ? (typeof readRes.data === 'string' ? readRes.data : readRes.data?.content || '') : '';
              files.set(entryPath, {
                type: 'file',
                content,
                permissions: entry.permissions || 'rw-',
                mtime: entry.mtime || entry.modified || Date.now()
              });
            }
          }
        } catch {}
      };

      // Ensure user home directory is scanned
      const userHome = `/home/${username}`;
      files.set(userHome, { type: 'directory', permissions: 'rwx', mtime: Date.now() });
      scanDir(userHome);

      // Scan /tmp if present
      if (fsManager.exists('/tmp')) {
        files.set('/tmp', { type: 'directory', permissions: 'rwx', mtime: Date.now() });
        scanDir('/tmp');
      }
    }

    return new ExperimentSnapshot({
      id,
      username,
      files,
      preferences
    });
  }

  /**
   * Clone this snapshot deeply for independent sandbox mutation.
   * @param {string} newId
   * @returns {ExperimentSnapshot}
   */
  clone(newId) {
    return new ExperimentSnapshot({
      id: newId,
      username: this.username,
      files: this.files,
      preferences: this.preferences,
      createdAt: Date.now()
    });
  }

  /* =========================================================================
   * In-Memory Sandbox Filesystem Operations (mutate only this snapshot)
   * ========================================================================= */

  readFile(path) {
    const normalized = PathResolver.normalize(path, `/home/${this.username}`);
    const file = this.files.get(normalized);
    if (!file || file.type !== 'file') {
      const err = new Error(`File "${normalized}" not found in sandbox`);
      err.code = 'ENOENT';
      throw err;
    }
    return { content: file.content, path: normalized, permissions: file.permissions };
  }

  writeFile(path, content = '') {
    const normalized = PathResolver.normalize(path, `/home/${this.username}`);
    if (!ProfilePolicy.isPathAllowed(normalized, this.username)) {
      const err = new Error(`Permission denied: Sandbox cannot write to foreign directory "${normalized}"`);
      err.code = 'EACCES';
      throw err;
    }

    this.files.set(normalized, {
      type: 'file',
      content: String(content),
      permissions: 'rw-',
      mtime: Date.now()
    });
    return { success: true, path: normalized };
  }

  createDirectory(path) {
    const normalized = PathResolver.normalize(path, `/home/${this.username}`);
    if (!ProfilePolicy.isPathAllowed(normalized, this.username)) {
      const err = new Error(`Permission denied: Sandbox cannot create foreign directory "${normalized}"`);
      err.code = 'EACCES';
      throw err;
    }

    this.files.set(normalized, {
      type: 'directory',
      permissions: 'rwx',
      mtime: Date.now()
    });
    return { success: true, path: normalized };
  }

  deleteFile(path) {
    const normalized = PathResolver.normalize(path, `/home/${this.username}`);
    if (!this.files.has(normalized)) {
      const err = new Error(`Path "${normalized}" not found in sandbox`);
      err.code = 'ENOENT';
      throw err;
    }
    this.files.delete(normalized);
    return { success: true, path: normalized };
  }

  rename(oldPath, newPath) {
    const normOld = PathResolver.normalize(oldPath, `/home/${this.username}`);
    const normNew = PathResolver.normalize(newPath, `/home/${this.username}`);

    if (!ProfilePolicy.isPathAllowed(normNew, this.username)) {
      const err = new Error(`Permission denied: Sandbox cannot rename to foreign directory "${normNew}"`);
      err.code = 'EACCES';
      throw err;
    }

    const item = this.files.get(normOld);
    if (!item) {
      const err = new Error(`Path "${normOld}" not found in sandbox`);
      err.code = 'ENOENT';
      throw err;
    }

    this.files.delete(normOld);
    this.files.set(normNew, item);
    return { success: true, from: normOld, to: normNew };
  }

  listDirectory(path = '.') {
    const normalized = PathResolver.normalize(path, `/home/${this.username}`);
    const entries = [];

    for (const [filePath, file] of this.files.entries()) {
      if (filePath === normalized) continue;
      const parent = PathResolver.splitPath(filePath).parentPath;
      if (parent === normalized) {
        entries.push({
          name: PathResolver.splitPath(filePath).name,
          path: filePath,
          type: file.type,
          size: file.content ? file.content.length : 0
        });
      }
    }

    return entries;
  }

  exists(path) {
    const normalized = PathResolver.normalize(path, `/home/${this.username}`);
    return this.files.has(normalized);
  }

  /**
   * Return a plain, serializable snapshot representation.
   * @returns {Object}
   */
  toJSON() {
    const filesObj = {};
    for (const [k, v] of this.files.entries()) {
      filesObj[k] = JSON.parse(JSON.stringify(v));
    }

    return {
      id: this.id,
      username: this.username,
      createdAt: this.createdAt,
      fileCount: this.files.size,
      preferences: JSON.parse(JSON.stringify(this.preferences)),
      files: filesObj
    };
  }
}
