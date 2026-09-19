/**
 * BaseFileSystemEngine
 * Abstract base class and common utilities for the File System Simulation.
 * Provides virtual path normalization, node structures, permission definitions,
 * disk block configuration, and educational presets.
 */

import { BaseSimulationEngine } from '../../core/simulationEngine.js';

export const VALID_PERMISSIONS = ['r--', 'rw-', 'r-x', 'rwx'];

export const DEFAULT_DISK_CONFIG = {
  totalBlocks: 32,
  blockSize: 64
};

export class BaseFileSystemEngine extends BaseSimulationEngine {
  constructor(algorithmId = 'filesystem_simulator', name = 'File System Simulator') {
    super('filesystem', algorithmId, name);
  }

  /**
   * Normalize an input path deterministically.
   * Handles:
   *   - Leading/trailing slashes and duplicate slashes (`//` -> `/`)
   *   - `.` (current directory)
   *   - `..` (parent directory, clamped at root `/`)
   *   - Relative paths resolved against `currentPath`
   *   - Absolute paths starting with `/`
   * @param {string} inputPath
   * @param {string} currentPath
   * @returns {string}
   */
  normalizePath(inputPath, currentPath = '/') {
    if (typeof inputPath !== 'string' || inputPath.trim() === '') {
      return currentPath || '/';
    }

    const trimmed = inputPath.trim();
    let fullPath = trimmed.startsWith('/')
      ? trimmed
      : `${currentPath === '/' ? '' : currentPath}/${trimmed}`;

    // Split components and resolve . and ..
    const parts = fullPath.split('/').filter(p => p !== '' && p !== '.');
    const stack = [];

    for (const part of parts) {
      if (part === '..') {
        if (stack.length > 0) {
          stack.pop();
        }
      } else {
        stack.push(part);
      }
    }

    return '/' + stack.join('/');
  }

  /**
   * Split a normalized path into parent directory path and target name.
   * e.g. "/home/notes.txt" -> { parentPath: "/home", name: "notes.txt" }
   *      "/home" -> { parentPath: "/", name: "home" }
   *      "/" -> { parentPath: null, name: "/" }
   */
  splitPath(normalizedPath) {
    if (normalizedPath === '/') {
      return { parentPath: null, name: '/' };
    }

    const lastSlash = normalizedPath.lastIndexOf('/');
    const parentPath = lastSlash === 0 ? '/' : normalizedPath.slice(0, lastSlash);
    const name = normalizedPath.slice(lastSlash + 1);

    return { parentPath, name };
  }

  /**
   * Validate permission string.
   */
  isValidPermission(perm) {
    return typeof perm === 'string' && VALID_PERMISSIONS.includes(perm);
  }

  getComplexity() {
    return {
      time: 'O(B) First-Fit Allocation | O(D) Path Traversal',
      space: 'O(N + B) In-Memory Nodes & Block Map',
      description: 'Contiguous First-Fit disk block allocation scans consecutive blocks. Tree operations traverse node hierarchy.'
    };
  }

  getPresets() {
    return [
      {
        name: 'Default File System',
        description: 'Standard virtual hierarchy with /bin, /etc/config.txt (128B), /home/notes.txt (200B), /home/projects, and /tmp.',
        data: {
          config: { totalBlocks: 32, blockSize: 64 },
          initialNodes: [
            { id: 'root', name: '/', type: 'directory', parentId: null, permissions: 'rwx', createdAt: 0 },
            { id: 'dir_bin', name: 'bin', type: 'directory', parentId: 'root', permissions: 'r-x', createdAt: 1 },
            { id: 'dir_etc', name: 'etc', type: 'directory', parentId: 'root', permissions: 'rwx', createdAt: 1 },
            { id: 'dir_home', name: 'home', type: 'directory', parentId: 'root', permissions: 'rwx', createdAt: 1 },
            { id: 'dir_tmp', name: 'tmp', type: 'directory', parentId: 'root', permissions: 'rwx', createdAt: 1 },
            { id: 'dir_projects', name: 'projects', type: 'directory', parentId: 'dir_home', permissions: 'rwx', createdAt: 2 },
            { id: 'file_config', name: 'config.txt', type: 'file', parentId: 'dir_etc', size: 128, permissions: 'rw-', createdAt: 2, modifiedAt: 2, blocks: [0, 1], open: false },
            { id: 'file_notes', name: 'notes.txt', type: 'file', parentId: 'dir_home', size: 200, permissions: 'rw-', createdAt: 3, modifiedAt: 3, blocks: [2, 3, 4, 5], open: false }
          ]
        }
      },
      {
        name: 'Empty File System',
        description: 'Clean virtual root / with all 32 disk blocks completely free.',
        data: {
          config: { totalBlocks: 32, blockSize: 64 },
          initialNodes: [
            { id: 'root', name: '/', type: 'directory', parentId: null, permissions: 'rwx', createdAt: 0 }
          ]
        }
      },
      {
        name: 'External Fragmentation Demo',
        description: 'Interleaved file allocations and deletions resulting in fragmented free blocks (total free: 4, largest contiguous: 2). Demonstrates allocation failure for a 3-block file.',
        data: {
          config: { totalBlocks: 32, blockSize: 64 },
          initialNodes: [
            { id: 'root', name: '/', type: 'directory', parentId: null, permissions: 'rwx', createdAt: 0 },
            { id: 'dir_data', name: 'data', type: 'directory', parentId: 'root', permissions: 'rwx', createdAt: 1 },
            // Occupying blocks [0..1]
            { id: 'file_a', name: 'fileA.dat', type: 'file', parentId: 'dir_data', size: 120, permissions: 'rw-', createdAt: 1, modifiedAt: 1, blocks: [0, 1], open: false },
            // Blocks [2..3] are FREE (simulated deleted file)
            // Occupying blocks [4..5]
            { id: 'file_c', name: 'fileC.dat', type: 'file', parentId: 'dir_data', size: 120, permissions: 'rw-', createdAt: 2, modifiedAt: 2, blocks: [4, 5], open: false },
            // Blocks [6..7] are FREE (simulated deleted file)
            // Occupying blocks [8..31]
            { id: 'file_tail', name: 'system.bin', type: 'file', parentId: 'dir_data', size: 1536, permissions: 'r--', createdAt: 3, modifiedAt: 3, blocks: Array.from({ length: 24 }, (_, i) => i + 8), open: false }
          ]
        }
      },
      {
        name: 'Permissions & File State Demo',
        description: 'Demonstrates read-only (r--), read-write (rw-), full (rwx), and open/close state protection.',
        data: {
          config: { totalBlocks: 32, blockSize: 64 },
          initialNodes: [
            { id: 'root', name: '/', type: 'directory', parentId: null, permissions: 'rwx', createdAt: 0 },
            { id: 'dir_docs', name: 'docs', type: 'directory', parentId: 'root', permissions: 'rwx', createdAt: 1 },
            { id: 'file_ro', name: 'readonly.log', type: 'file', parentId: 'dir_docs', size: 64, permissions: 'r--', createdAt: 1, modifiedAt: 1, blocks: [0], open: false },
            { id: 'file_rw', name: 'document.txt', type: 'file', parentId: 'dir_docs', size: 128, permissions: 'rw-', createdAt: 2, modifiedAt: 2, blocks: [1, 2], open: false },
            { id: 'file_open', name: 'active.dat', type: 'file', parentId: 'dir_docs', size: 64, permissions: 'rw-', createdAt: 3, modifiedAt: 3, blocks: [3], open: true }
          ]
        }
      }
    ];
  }
}
