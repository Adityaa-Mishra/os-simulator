/**
 * public/js/os/filesystem/PathResolver.js
 * Deterministic path resolution and normalization for AdityyaOS filesystem.
 * Handles absolute, relative, '.', '..', repeated slashes, root traversal clamping,
 * and recursive parent-first component resolution.
 */

import { FileSystemErrorCode, createFsError } from './FileSystemState.js';

export class PathResolver {
  /**
   * Normalize an input path against an optional working directory.
   * Handles '.', '..', repeated slashes, and clamps traversal at root '/'.
   * @param {string} inputPath
   * @param {string} [cwd='/']
   * @returns {string}
   */
  static normalize(inputPath, cwd = '/') {
    if (typeof inputPath !== 'string' || inputPath.trim() === '') {
      return '/';
    }

    const trimmed = inputPath.trim();
    let fullPath = trimmed;

    // If relative, prepend cwd
    if (!trimmed.startsWith('/')) {
      const baseCwd = typeof cwd === 'string' && cwd.startsWith('/') ? cwd : '/';
      fullPath = baseCwd === '/' ? `/${trimmed}` : `${baseCwd}/${trimmed}`;
    }

    // Split components, ignoring empty segments (handles repeated slashes)
    const rawParts = fullPath.split('/');
    const resolvedParts = [];

    for (const part of rawParts) {
      if (!part || part === '.') {
        continue;
      }
      if (part === '..') {
        // Pop if possible; if already at root, clamp at root (cannot traverse above '/')
        if (resolvedParts.length > 0) {
          resolvedParts.pop();
        }
      } else {
        resolvedParts.push(part);
      }
    }

    return `/${resolvedParts.join('/')}`;
  }

  /**
   * Split a normalized path into parentPath and name.
   * @param {string} path
   * @returns {{ parentPath: string|null, name: string }}
   */
  static splitPath(path) {
    const normalized = this.normalize(path);
    if (normalized === '/') {
      return { parentPath: null, name: '/' };
    }

    const lastSlash = normalized.lastIndexOf('/');
    if (lastSlash === 0) {
      return {
        parentPath: '/',
        name: normalized.slice(1)
      };
    }

    return {
      parentPath: normalized.slice(0, lastSlash),
      name: normalized.slice(lastSlash + 1)
    };
  }

  /**
   * Resolve a path string to an inode by traversing directory hierarchy.
   * Recursively resolves parent path first to ensure proper ENOENT/ENOTDIR semantics.
   * @param {string} path
   * @param {string} [cwd='/']
   * @param {Inode} rootInode
   * @param {Function} getInodeFn (inodeId) => Inode|null
   * @returns {{
   *   found: boolean,
   *   inode: Inode|null,
   *   parentInode: Inode|null,
   *   normalizedPath: string,
   *   parentPath: string|null,
   *   name: string,
   *   error?: string,
   *   code?: string
   * }}
   */
  static resolve(path, cwd = '/', rootInode, getInodeFn) {
    if (typeof path !== 'string' || path.trim() === '') {
      return {
        found: false,
        inode: null,
        parentInode: null,
        normalizedPath: '/',
        parentPath: null,
        name: '/',
        ...createFsError(FileSystemErrorCode.EINVAL, 'Path must be a non-empty string')
      };
    }

    const normalizedPath = this.normalize(path, cwd);
    const { parentPath, name } = this.splitPath(normalizedPath);

    if (normalizedPath === '/') {
      return {
        found: true,
        inode: rootInode,
        parentInode: null,
        normalizedPath,
        parentPath: null,
        name: '/'
      };
    }

    // Resolve parent directory first
    let parentInode = null;
    if (parentPath === '/') {
      parentInode = rootInode;
    } else {
      const parentRes = this.resolve(parentPath, cwd, rootInode, getInodeFn);
      if (!parentRes.found || !parentRes.inode) {
        return {
          found: false,
          inode: null,
          parentInode: null,
          normalizedPath,
          parentPath,
          name,
          ...createFsError(FileSystemErrorCode.ENOENT, `Parent directory "${parentPath}" does not exist`)
        };
      }
      if (parentRes.inode.type !== 'directory') {
        return {
          found: false,
          inode: null,
          parentInode: parentRes.inode,
          normalizedPath,
          parentPath,
          name,
          ...createFsError(FileSystemErrorCode.ENOTDIR, `Path component "${parentPath}" is not a directory`)
        };
      }
      parentInode = parentRes.inode;
    }

    // Parent is valid directory; check if child exists in parent
    const childInodeId = parentInode.getChild(name);
    if (childInodeId === null || childInodeId === undefined) {
      return {
        found: false,
        inode: null,
        parentInode,
        normalizedPath,
        parentPath,
        name,
        ...createFsError(FileSystemErrorCode.ENOENT, `Entry "${name}" not found in "${parentPath}"`)
      };
    }

    const childNode = getInodeFn(childInodeId);
    if (!childNode) {
      return {
        found: false,
        inode: null,
        parentInode,
        normalizedPath,
        parentPath,
        name,
        ...createFsError(FileSystemErrorCode.ENOENT, `Stale inode ${childInodeId} for "${name}"`)
      };
    }

    return {
      found: true,
      inode: childNode,
      parentInode,
      normalizedPath,
      parentPath,
      name
    };
  }
}
