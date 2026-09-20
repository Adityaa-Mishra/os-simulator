/**
 * public/js/os/api/FileSystemAPI.js
 * Controlled application interface for safe, isolated AdityyaFS access.
 * Strictly resolves paths relative to application cwd, prevents host filesystem access,
 * and enforces granular filesystem.read and filesystem.write permissions.
 */

import { APIError } from './APIError.js';
import { PathResolver } from '../filesystem/PathResolver.js';
import { ProfilePolicy } from '../profiles/ProfilePolicy.js';

export class FileSystemAPI {
  /**
   * @param {Object} options
   * @param {import('../kernel/Kernel.js').Kernel} options.kernel
   * @param {import('./APIContext.js').APIContext} options.context
   */
  constructor({ kernel, context }) {
    this._kernel = kernel;
    this._context = context;
  }

  /**
   * Resolve and validate a simulated path against context cwd.
   * Rejects host Windows paths (e.g. C:\, \\server\share) with EINVAL.
   * Enforces profile filesystem isolation against foreign home directories.
   * @private
   * @param {string} inputPath
   * @param {string} operation
   * @returns {string} normalized absolute simulated path
   */
  _resolvePath(inputPath, operation) {
    if (typeof inputPath !== 'string' || inputPath.trim() === '') {
      throw new APIError({
        code: 'EINVAL',
        message: 'Path must be a non-empty string',
        operation,
        appId: this._context?.appId
      });
    }

    const trimmed = inputPath.trim();

    // Reject host filesystem path patterns (Windows drive letters, UNC paths, backslashes)
    if (/^[a-zA-Z]:/.test(trimmed) || trimmed.startsWith('\\\\') || trimmed.includes('\\')) {
      throw new APIError({
        code: 'EINVAL',
        message: 'Host filesystem access is strictly prohibited',
        operation,
        appId: this._context?.appId
      });
    }

    const resolved = PathResolver.normalize(trimmed, this._context?.cwd || '/home/user');

    // Enforce profile filesystem isolation
    const username = this._context?.username || 'user';
    if (!ProfilePolicy.isPathAllowed(resolved, username, this._context?.cwd)) {
      throw new APIError({
        code: 'EACCES',
        message: `Permission denied: Cannot access profile directory "${resolved}"`,
        operation,
        appId: this._context?.appId
      });
    }

    return resolved;
  }

  /**
   * Resolve an input path string relative to application cwd.
   * @param {string} path
   * @returns {string}
   */
  resolvePath(path) {
    return this._resolvePath(path, 'fs.resolvePath');
  }

  /**
   * Read contents of a simulated file.
   * Requires 'filesystem.read' permission.
   * @param {string} path
   * @returns {Object} file content and metadata
   */
  readFile(path) {
    this._context?.assertPermission('filesystem.read', 'fs.readFile');
    const resolved = this._resolvePath(path, 'fs.readFile');
    const res = this._kernel.fileSystemManager.readFile(resolved);
    if (!res.success) {
      throw new APIError({
        code: res.code || 'ENOENT',
        message: res.error || `Failed to read "${path}"`,
        operation: 'fs.readFile',
        appId: this._context?.appId
      });
    }
    return res.data;
  }

  /**
   * Write data to a simulated file.
   * Requires 'filesystem.write' permission.
   * @param {string} path
   * @param {string|Array<number>|number} data
   * @returns {Object}
   */
  writeFile(path, data) {
    this._context?.assertPermission('filesystem.write', 'fs.writeFile');
    const resolved = this._resolvePath(path, 'fs.writeFile');
    if (!this._kernel.fileSystemManager.exists(resolved)) {
      const createRes = this._kernel.fileSystemManager.createFile(resolved);
      if (!createRes.success) {
        throw new APIError({
          code: createRes.code || 'EIO',
          message: createRes.error || `Failed to create file "${path}"`,
          operation: 'fs.writeFile',
          appId: this._context?.appId
        });
      }
    }
    const res = this._kernel.fileSystemManager.writeFile(resolved, data);
    if (!res.success) {
      throw new APIError({
        code: res.code || 'EIO',
        message: res.error || `Failed to write "${path}"`,
        operation: 'fs.writeFile',
        appId: this._context?.appId
      });
    }
    return res.data;
  }

  /**
   * Create a new simulated file.
   * Requires 'filesystem.write' permission.
   * @param {string} path
   * @param {number|string} [size=0]
   * @param {string} [permissions='rw-']
   * @returns {Object}
   */
  createFile(path, size = 0, permissions = 'rw-') {
    this._context?.assertPermission('filesystem.write', 'fs.createFile');
    const resolved = this._resolvePath(path, 'fs.createFile');
    const res = this._kernel.fileSystemManager.createFile(resolved, size, permissions);
    if (!res.success) {
      throw new APIError({
        code: res.code || 'EEXIST',
        message: res.error || `Failed to create file "${path}"`,
        operation: 'fs.createFile',
        appId: this._context?.appId
      });
    }
    return res.data;
  }

  /**
   * Delete a simulated file.
   * Requires 'filesystem.write' permission.
   * @param {string} path
   * @returns {Object}
   */
  deleteFile(path) {
    this._context?.assertPermission('filesystem.write', 'fs.deleteFile');
    const resolved = this._resolvePath(path, 'fs.deleteFile');
    const res = this._kernel.fileSystemManager.deleteFile(resolved);
    if (!res.success) {
      throw new APIError({
        code: res.code || 'ENOENT',
        message: res.error || `Failed to delete file "${path}"`,
        operation: 'fs.deleteFile',
        appId: this._context?.appId
      });
    }
    return res.data;
  }

  /**
   * Create a directory.
   * Requires 'filesystem.write' permission.
   * @param {string} path
   * @param {string} [permissions='rwx']
   * @returns {Object}
   */
  createDirectory(path, permissions = 'rwx') {
    this._context?.assertPermission('filesystem.write', 'fs.createDirectory');
    const resolved = this._resolvePath(path, 'fs.createDirectory');
    const res = this._kernel.fileSystemManager.createDirectory(resolved, permissions);
    if (!res.success) {
      throw new APIError({
        code: res.code || 'EEXIST',
        message: res.error || `Failed to create directory "${path}"`,
        operation: 'fs.createDirectory',
        appId: this._context?.appId
      });
    }
    return res.data;
  }

  /**
   * Delete a directory.
   * Requires 'filesystem.write' permission.
   * @param {string} path
   * @param {Object} [options={ recursive: false }]
   * @returns {Object}
   */
  deleteDirectory(path, options = { recursive: false }) {
    this._context?.assertPermission('filesystem.write', 'fs.deleteDirectory');
    const resolved = this._resolvePath(path, 'fs.deleteDirectory');
    const res = this._kernel.fileSystemManager.deleteDirectory(resolved, options);
    if (!res.success) {
      throw new APIError({
        code: res.code || 'ENOENT',
        message: res.error || `Failed to delete directory "${path}"`,
        operation: 'fs.deleteDirectory',
        appId: this._context?.appId
      });
    }
    return res.data;
  }

  /**
   * Check if a simulated path exists.
   * Requires 'filesystem.read' permission.
   * @param {string} path
   * @returns {boolean}
   */
  exists(path) {
    this._context?.assertPermission('filesystem.read', 'fs.exists');
    try {
      const resolved = this._resolvePath(path, 'fs.exists');
      return Boolean(this._kernel.fileSystemManager.exists(resolved));
    } catch (err) {
      if (err instanceof APIError && (err.code === 'EPERM' || err.code === 'EACCES')) {
        return false;
      }
      return false;
    }
  }

  /**
   * Get metadata / stat for a simulated path.
   * Requires 'filesystem.read' permission.
   * @param {string} path
   * @returns {Object}
   */
  stat(path) {
    this._context?.assertPermission('filesystem.read', 'fs.stat');
    const resolved = this._resolvePath(path, 'fs.stat');
    const res = this._kernel.fileSystemManager.stat(resolved);
    if (!res.success) {
      throw new APIError({
        code: res.code || 'ENOENT',
        message: res.error || `Path "${path}" not found`,
        operation: 'fs.stat',
        appId: this._context?.appId
      });
    }
    return res.data;
  }

  /**
   * List directory contents.
   * Requires 'filesystem.read' permission.
   * Enforces profile isolation: masks foreign profile home directories when listing /home.
   * @param {string} [path='.']
   * @returns {Array<Object>}
   */
  listDirectory(path = '.') {
    this._context?.assertPermission('filesystem.read', 'fs.listDirectory');
    const resolved = this._resolvePath(path, 'fs.listDirectory');
    const res = this._kernel.fileSystemManager.listDirectory(resolved);
    if (!res.success) {
      throw new APIError({
        code: res.code || 'ENOENT',
        message: res.error || `Failed to list directory "${path}"`,
        operation: 'fs.listDirectory',
        appId: this._context?.appId
      });
    }
    const username = this._context?.username || 'user';
    return ProfilePolicy.filterDirectoryEntries(resolved, res.data, username);
  }

  /**
   * Open a file descriptor scoped to the application's process.
   * Requires 'filesystem.read' or 'filesystem.write' based on flags.
   * @param {string} path
   * @param {Array<string>|string} [flags=['READ']]
   * @returns {Object}
   */
  open(path, flags = ['READ']) {
    const isWrite = Array.isArray(flags)
      ? (flags.includes('WRITE') || flags.includes('APPEND'))
      : (flags === 'WRITE' || flags === 'APPEND');

    this._context?.assertPermission(isWrite ? 'filesystem.write' : 'filesystem.read', 'fs.open');

    const resolved = this._resolvePath(path, 'fs.open');
    const res = this._kernel.fileSystemManager.openDescriptor(resolved, flags, this._context?.pid);
    if (!res.success) {
      throw new APIError({
        code: res.code || 'EIO',
        message: res.error || `Failed to open "${path}"`,
        operation: 'fs.open',
        appId: this._context?.appId
      });
    }
    return res.data;
  }

  /**
   * Close an open file descriptor owned by this process.
   * @param {number} fd
   * @returns {Object}
   */
  close(fd) {
    if (typeof fd !== 'number' || isNaN(fd)) {
      throw new APIError({
        code: 'EBADF',
        message: 'Invalid file descriptor',
        operation: 'fs.close',
        appId: this._context?.appId
      });
    }
    const res = this._kernel.fileSystemManager.closeDescriptor(fd, this._context?.pid);
    if (!res.success) {
      throw new APIError({
        code: res.code || 'EBADF',
        message: res.error || `Failed to close descriptor ${fd}`,
        operation: 'fs.close',
        appId: this._context?.appId
      });
    }
    return res.data;
  }

  /**
   * Rename or move a file or directory within AdityyaFS.
   * Requires 'filesystem.write' permission.
   * Preserves Inodes, metadata, open descriptor safety, and transactional semantics.
   * @param {string} sourcePath
   * @param {string} destPath
   * @returns {Object}
   */
  rename(sourcePath, destPath) {
    this._context?.assertPermission('filesystem.write', 'fs.rename');
    const resolvedSrc = this._resolvePath(sourcePath, 'fs.rename');
    const resolvedDest = this._resolvePath(destPath, 'fs.rename');

    const res = this._kernel.fileSystemManager.rename(resolvedSrc, resolvedDest);
    if (!res.success) {
      throw new APIError({
        code: res.code || 'EIO',
        message: res.error || `Failed to rename "${sourcePath}" to "${destPath}"`,
        operation: 'fs.rename',
        appId: this._context?.appId
      });
    }
    return res.data;
  }

  /**
   * Get safe filesystem storage metrics.
   * Requires 'filesystem.read' permission.
   * @returns {{ totalBlocks: number, usedBlocks: number, freeBlocks: number, blockSize: number, usedBytes: number, freeBytes: number, totalBytes: number }}
   */
  getUsage() {
    this._context?.assertPermission('filesystem.read', 'fs.getUsage');
    const fs = this._kernel?.fileSystemManager?.fs;
    const totalBlocks = typeof fs?.totalBlocks === 'number' ? fs.totalBlocks : 32;
    const usedBlocks = typeof fs?.allocatedBlocks === 'number' ? fs.allocatedBlocks : 0;
    const freeBlocks = typeof fs?.freeBlocks === 'number' ? fs.freeBlocks : totalBlocks;
    const blockSize = typeof fs?.blockSize === 'number' ? fs.blockSize : 64;

    return {
      totalBlocks,
      usedBlocks,
      freeBlocks,
      blockSize,
      usedBytes: usedBlocks * blockSize,
      freeBytes: freeBlocks * blockSize,
      totalBytes: totalBlocks * blockSize
    };
  }
}
