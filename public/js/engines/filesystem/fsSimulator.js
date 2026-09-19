/**
 * FileSystemSimulatorEngine
 * Pure in-memory Virtual File System (VFS) simulation engine.
 * Deterministic contiguous First-Fit disk block allocation, file/directory lifecycle,
 * permissions, open/close file state, path traversal, and immutable snapshots.
 */

import { BaseFileSystemEngine, DEFAULT_DISK_CONFIG } from './baseFileSystem.js';

export class FileSystemSimulatorEngine extends BaseFileSystemEngine {
  constructor(config = DEFAULT_DISK_CONFIG) {
    super('filesystem_simulator', 'File System Simulator');
    this.config = { ...DEFAULT_DISK_CONFIG, ...config };
    this.reset();
  }

  /**
   * Reset the virtual filesystem to an initial state.
   */
  reset(initialNodes = null, config = null) {
    if (config) {
      this.config = { ...this.config, ...config };
    }

    this.nodes = new Map();
    this.currentPath = '/';
    this.currentTime = 0;
    this.idCounters = { dir: 0, file: 0 };
    this.operationCount = 0;
    this.successfulOperations = 0;
    this.failedOperations = 0;
    this.operationLog = [];
    this.snapshots = [];

    // Initialize disk blocks
    this.blockMap = Array.from({ length: this.config.totalBlocks }, (_, i) => ({
      block: i,
      status: 'free',
      fileId: null
    }));

    if (initialNodes && Array.isArray(initialNodes)) {
      this.loadNodes(initialNodes);
    } else {
      // Default: root directory only
      this.nodes.set('root', {
        id: 'root',
        name: '/',
        type: 'directory',
        parentId: null,
        permissions: 'rwx',
        createdAt: 0
      });
    }

    // Initial snapshot
    this.createAndPushSnapshot('init', 'root', 'Initialized virtual file system.', 'File system initialized with virtual root directory.');
  }

  /**
   * Load nodes and allocate blocks into blockMap.
   */
  loadNodes(nodesList) {
    this.nodes.clear();
    // Reset blocks
    for (let i = 0; i < this.config.totalBlocks; i++) {
      this.blockMap[i] = { block: i, status: 'free', fileId: null };
    }

    for (const rawNode of nodesList) {
      const node = {
        ...rawNode,
        blocks: rawNode.blocks ? [...rawNode.blocks] : (rawNode.type === 'file' ? [] : undefined)
      };
      this.nodes.set(node.id, node);

      // Track ID counter to avoid collisions
      if (node.id.startsWith('dir_')) {
        const num = parseInt(node.id.replace('dir_', ''), 10);
        if (!isNaN(num) && num > this.idCounters.dir) this.idCounters.dir = num;
      } else if (node.id.startsWith('file_')) {
        const num = parseInt(node.id.replace('file_', ''), 10);
        if (!isNaN(num) && num > this.idCounters.file) this.idCounters.file = num;
      }

      // Mark allocated blocks
      if (node.type === 'file' && Array.isArray(node.blocks)) {
        for (const b of node.blocks) {
          if (b >= 0 && b < this.config.totalBlocks) {
            this.blockMap[b] = { block: b, status: 'allocated', fileId: node.id };
          }
        }
      }
    }
  }

  generateId(type) {
    this.idCounters[type] = (this.idCounters[type] || 0) + 1;
    return `${type}_${this.idCounters[type]}`;
  }

  /**
   * Resolve a path string to a node.
   * @param {string} inputPath
   * @returns {{ found: boolean, node: Object|null, parentNode: Object|null, normalizedPath: string, parentPath: string|null, name: string }}
   */
  resolvePath(inputPath) {
    const normalizedPath = this.normalizePath(inputPath, this.currentPath);
    const { parentPath, name } = this.splitPath(normalizedPath);

    if (normalizedPath === '/') {
      return {
        found: this.nodes.has('root'),
        node: this.nodes.get('root') || null,
        parentNode: null,
        normalizedPath,
        parentPath: null,
        name: '/'
      };
    }

    // Traverse component by component from root
    const parts = normalizedPath.split('/').filter(Boolean);
    let curr = this.nodes.get('root');
    let parent = null;

    for (let i = 0; i < parts.length; i++) {
      if (!curr || curr.type !== 'directory') {
        return { found: false, node: null, parentNode: parent, normalizedPath, parentPath, name };
      }

      const part = parts[i];
      parent = curr;

      // Find child node with name === part and parentId === curr.id
      let child = null;
      for (const n of this.nodes.values()) {
        if (n.parentId === curr.id && n.name === part) {
          child = n;
          break;
        }
      }

      curr = child;
      if (!curr) {
        return { found: false, node: null, parentNode: parent, normalizedPath, parentPath, name };
      }
    }

    return {
      found: true,
      node: curr,
      parentNode: parent,
      normalizedPath,
      parentPath,
      name
    };
  }

  /**
   * Find first contiguous sequence of free blocks (First Fit).
   * @param {number} count
   * @returns {Array<number>|null}
   */
  findContiguousFreeBlocks(count) {
    if (count <= 0) return [];
    let consecutive = 0;
    let startIndex = -1;

    for (let i = 0; i < this.config.totalBlocks; i++) {
      if (this.blockMap[i].status === 'free') {
        if (consecutive === 0) startIndex = i;
        consecutive++;
        if (consecutive === count) {
          return Array.from({ length: count }, (_, idx) => startIndex + idx);
        }
      } else {
        consecutive = 0;
        startIndex = -1;
      }
    }

    return null;
  }

  /**
   * Calculate allocation metrics.
   */
  calculateAllocationStats() {
    let allocated = 0;
    let free = 0;
    let largestContiguous = 0;
    let currentContiguous = 0;

    for (let i = 0; i < this.config.totalBlocks; i++) {
      if (this.blockMap[i].status === 'allocated') {
        allocated++;
        currentContiguous = 0;
      } else {
        free++;
        currentContiguous++;
        if (currentContiguous > largestContiguous) {
          largestContiguous = currentContiguous;
        }
      }
    }

    // External fragmentation: free blocks that cannot be used in the largest contiguous allocation
    const externalFrag = free - largestContiguous;

    return {
      totalBlocks: this.config.totalBlocks,
      allocatedBlocks: allocated,
      freeBlocks: free,
      largestFreeContiguousRegion: largestContiguous,
      externalFragmentationBlocks: externalFrag
    };
  }

  /**
   * Create an immutable snapshot.
   */
  createAndPushSnapshot(operation, activeNodeId, actionLog, educationalNote, result = null) {
    const stats = this.calculateAllocationStats();
    const treeSnapshot = Array.from(this.nodes.values()).map(n => ({
      ...n,
      blocks: n.blocks ? [...n.blocks] : undefined
    }));
    const blockMapSnapshot = this.blockMap.map(b => ({ ...b }));

    const snapshot = {
      stepIndex: this.snapshots.length,
      operation,
      currentPath: this.currentPath,
      activeNodeId,
      fileSystemTree: treeSnapshot,
      blockMap: blockMapSnapshot,
      freeBlocks: stats.freeBlocks,
      allocatedBlocks: stats.allocatedBlocks,
      largestFreeContiguousRegion: stats.largestFreeContiguousRegion,
      externalFragmentationBlocks: stats.externalFragmentationBlocks,
      actionLog,
      educationalNote,
      result: result ? { ...result } : null
    };

    this.snapshots.push(snapshot);
    return snapshot;
  }

  /* =========================================================================
   * File System Operations
   * ========================================================================= */

  mkdir(path, permissions = 'rwx') {
    this.currentTime++;
    this.operationCount++;

    const normPath = this.normalizePath(path, this.currentPath);
    const { parentPath, name } = this.splitPath(normPath);

    if (!name || name === '/') {
      return this.recordFailure('mkdir', normPath, 'INVALID_PATH', 'Directory name cannot be empty.');
    }

    if (!this.isValidPermission(permissions)) {
      return this.recordFailure('mkdir', normPath, 'INVALID_PERMISSIONS', `Invalid permissions "${permissions}".`);
    }

    const parentRes = this.resolvePath(parentPath);
    if (!parentRes.found) {
      return this.recordFailure('mkdir', normPath, 'PARENT_NOT_FOUND', `Parent directory "${parentPath}" does not exist.`);
    }

    if (parentRes.node.type !== 'directory') {
      return this.recordFailure('mkdir', normPath, 'NOT_A_DIRECTORY', `Parent "${parentPath}" is not a directory.`);
    }

    // Check duplicate
    for (const n of this.nodes.values()) {
      if (n.parentId === parentRes.node.id && n.name === name) {
        return this.recordFailure('mkdir', normPath, 'ALREADY_EXISTS', `An entry named "${name}" already exists in "${parentPath}".`);
      }
    }

    const newDir = {
      id: this.generateId('dir'),
      name,
      type: 'directory',
      parentId: parentRes.node.id,
      permissions,
      createdAt: this.currentTime
    };

    this.nodes.set(newDir.id, newDir);

    return this.recordSuccess(
      'mkdir',
      normPath,
      newDir.id,
      `Directory "${normPath}" created successfully.`,
      `Created directory node "${name}" under parent "${parentRes.node.name}". Directories consume metadata without consuming data blocks.`,
      { id: newDir.id, name, permissions }
    );
  }

  rmdir(path) {
    this.currentTime++;
    this.operationCount++;

    const normPath = this.normalizePath(path, this.currentPath);
    if (normPath === '/') {
      return this.recordFailure('rmdir', normPath, 'CANNOT_REMOVE_ROOT', 'Cannot delete root directory "/".');
    }

    const res = this.resolvePath(normPath);
    if (!res.found) {
      return this.recordFailure('rmdir', normPath, 'NOT_FOUND', `Directory "${normPath}" not found.`);
    }

    if (res.node.type !== 'directory') {
      return this.recordFailure('rmdir', normPath, 'NOT_A_DIRECTORY', `"${normPath}" is not a directory.`);
    }

    // Check if directory is empty
    for (const n of this.nodes.values()) {
      if (n.parentId === res.node.id) {
        return this.recordFailure('rmdir', normPath, 'DIRECTORY_NOT_EMPTY', `Directory "${normPath}" is not empty.`);
      }
    }

    this.nodes.delete(res.node.id);

    // If currentPath was inside or was this directory, reset to parent
    if (this.currentPath === normPath || this.currentPath.startsWith(normPath + '/')) {
      this.currentPath = res.parentPath || '/';
    }

    return this.recordSuccess(
      'rmdir',
      normPath,
      null,
      `Directory "${normPath}" removed successfully.`,
      `Removed empty directory "${res.node.name}". Directory metadata removed from tree.`,
      { name: res.node.name }
    );
  }

  create(path, size = 0, permissions = 'rw-') {
    this.currentTime++;
    this.operationCount++;

    const normPath = this.normalizePath(path, this.currentPath);
    const { parentPath, name } = this.splitPath(normPath);

    if (!name || name === '/') {
      return this.recordFailure('create', normPath, 'INVALID_PATH', 'File name cannot be empty.');
    }

    if (typeof size !== 'number' || isNaN(size) || size < 0 || !Number.isInteger(size)) {
      return this.recordFailure('create', normPath, 'INVALID_SIZE', 'File size must be a non-negative integer.');
    }

    if (!this.isValidPermission(permissions)) {
      return this.recordFailure('create', normPath, 'INVALID_PERMISSIONS', `Invalid permissions "${permissions}".`);
    }

    const parentRes = this.resolvePath(parentPath);
    if (!parentRes.found) {
      return this.recordFailure('create', normPath, 'PARENT_NOT_FOUND', `Parent directory "${parentPath}" does not exist.`);
    }

    if (parentRes.node.type !== 'directory') {
      return this.recordFailure('create', normPath, 'NOT_A_DIRECTORY', `Parent "${parentPath}" is not a directory.`);
    }

    // Check duplicate
    for (const n of this.nodes.values()) {
      if (n.parentId === parentRes.node.id && n.name === name) {
        return this.recordFailure('create', normPath, 'ALREADY_EXISTS', `An entry named "${name}" already exists in "${parentPath}".`);
      }
    }

    const requiredBlocks = size === 0 ? 0 : Math.ceil(size / this.config.blockSize);
    const freeBlocksIndices = this.findContiguousFreeBlocks(requiredBlocks);

    if (requiredBlocks > 0 && !freeBlocksIndices) {
      const stats = this.calculateAllocationStats();
      const errCode = stats.freeBlocks < requiredBlocks ? 'INSUFFICIENT_DISK_SPACE' : 'INSUFFICIENT_CONTIGUOUS_SPACE';
      const errMsg = errCode === 'INSUFFICIENT_DISK_SPACE'
        ? `Insufficient disk space: required ${requiredBlocks} blocks, but only ${stats.freeBlocks} free.`
        : `External Fragmentation: required ${requiredBlocks} contiguous blocks, but largest free region is ${stats.largestFreeContiguousRegion} blocks (total free: ${stats.freeBlocks}).`;

      return this.recordFailure('create', normPath, errCode, errMsg);
    }

    const fileId = this.generateId('file');

    // Allocate blocks in blockMap
    if (freeBlocksIndices && freeBlocksIndices.length > 0) {
      for (const b of freeBlocksIndices) {
        this.blockMap[b] = { block: b, status: 'allocated', fileId };
      }
    }

    const newFile = {
      id: fileId,
      name,
      type: 'file',
      parentId: parentRes.node.id,
      size,
      permissions,
      createdAt: this.currentTime,
      modifiedAt: this.currentTime,
      blocks: freeBlocksIndices || [],
      open: false
    };

    this.nodes.set(newFile.id, newFile);

    const blockStr = newFile.blocks.length > 0
      ? `allocated blocks [${newFile.blocks.join(', ')}]`
      : '0 bytes (no blocks allocated)';

    return this.recordSuccess(
      'create',
      normPath,
      newFile.id,
      `File "${normPath}" created (${size} bytes, ${newFile.blocks.length} blocks).`,
      `Contiguous First-Fit allocation assigned ${blockStr} to "${name}".`,
      { id: newFile.id, name, size, blocks: [...newFile.blocks], permissions }
    );
  }

  delete(path) {
    this.currentTime++;
    this.operationCount++;

    const normPath = this.normalizePath(path, this.currentPath);
    const res = this.resolvePath(normPath);

    if (!res.found) {
      return this.recordFailure('delete', normPath, 'NOT_FOUND', `File "${normPath}" not found.`);
    }

    if (res.node.type !== 'file') {
      return this.recordFailure('delete', normPath, 'NOT_A_FILE', `"${normPath}" is a directory, not a file. Use rmdir.`);
    }

    if (res.node.open) {
      return this.recordFailure('delete', normPath, 'FILE_OPEN', `Cannot delete open file "${normPath}". Close file first.`);
    }

    // Free allocated blocks
    const freedBlocks = [...(res.node.blocks || [])];
    for (const b of freedBlocks) {
      if (b >= 0 && b < this.config.totalBlocks) {
        this.blockMap[b] = { block: b, status: 'free', fileId: null };
      }
    }

    this.nodes.delete(res.node.id);

    return this.recordSuccess(
      'delete',
      normPath,
      null,
      `File "${normPath}" deleted. Freed blocks [${freedBlocks.join(', ')}].`,
      `Deleted file "${res.node.name}" and released ${freedBlocks.length} disk blocks back to the free pool.`,
      { name: res.node.name, freedBlocks }
    );
  }

  read(path) {
    this.currentTime++;
    this.operationCount++;

    const normPath = this.normalizePath(path, this.currentPath);
    const res = this.resolvePath(normPath);

    if (!res.found) {
      return this.recordFailure('read', normPath, 'NOT_FOUND', `File "${normPath}" not found.`);
    }

    if (res.node.type !== 'file') {
      return this.recordFailure('read', normPath, 'NOT_A_FILE', `"${normPath}" is a directory.`);
    }

    if (!res.node.permissions.includes('r')) {
      return this.recordFailure('read', normPath, 'PERMISSION_DENIED', `Read permission denied on "${normPath}" (${res.node.permissions}).`);
    }

    const fileData = {
      id: res.node.id,
      name: res.node.name,
      size: res.node.size,
      permissions: res.node.permissions,
      blocks: [...res.node.blocks],
      open: res.node.open
    };

    return this.recordSuccess(
      'read',
      normPath,
      res.node.id,
      `Read "${normPath}" (${res.node.size} bytes, ${res.node.blocks.length} blocks).`,
      `Read operation succeeded. File occupies blocks [${res.node.blocks.join(', ')}].`,
      fileData
    );
  }

  write(path, newSize) {
    this.currentTime++;
    this.operationCount++;

    const normPath = this.normalizePath(path, this.currentPath);
    const res = this.resolvePath(normPath);

    if (!res.found) {
      return this.recordFailure('write', normPath, 'NOT_FOUND', `File "${normPath}" not found.`);
    }

    if (res.node.type !== 'file') {
      return this.recordFailure('write', normPath, 'NOT_A_FILE', `"${normPath}" is a directory.`);
    }

    if (!res.node.permissions.includes('w')) {
      return this.recordFailure('write', normPath, 'PERMISSION_DENIED', `Write permission denied on "${normPath}" (${res.node.permissions}).`);
    }

    if (typeof newSize !== 'number' || isNaN(newSize) || newSize < 0 || !Number.isInteger(newSize)) {
      return this.recordFailure('write', normPath, 'INVALID_SIZE', 'File size must be a non-negative integer.');
    }

    const currentBlocks = [...res.node.blocks];
    const newBlocksNeeded = newSize === 0 ? 0 : Math.ceil(newSize / this.config.blockSize);

    // Case A: Size unchanged
    if (newBlocksNeeded === currentBlocks.length) {
      res.node.size = newSize;
      res.node.modifiedAt = this.currentTime;
      return this.recordSuccess(
        'write',
        normPath,
        res.node.id,
        `Wrote to "${normPath}". Size updated to ${newSize} bytes (blocks unchanged).`,
        `File size changed to ${newSize} bytes within existing ${currentBlocks.length} blocks.`,
        { size: newSize, blocks: [...res.node.blocks] }
      );
    }

    // Case B: Shrink file
    if (newBlocksNeeded < currentBlocks.length) {
      const retainedBlocks = currentBlocks.slice(0, newBlocksNeeded);
      const releasedBlocks = currentBlocks.slice(newBlocksNeeded);

      for (const b of releasedBlocks) {
        this.blockMap[b] = { block: b, status: 'free', fileId: null };
      }

      res.node.size = newSize;
      res.node.blocks = retainedBlocks;
      res.node.modifiedAt = this.currentTime;

      return this.recordSuccess(
        'write',
        normPath,
        res.node.id,
        `Wrote to "${normPath}". Shrink: size ${newSize} bytes, released blocks [${releasedBlocks.join(', ')}].`,
        `File shrunk from ${currentBlocks.length} blocks to ${newBlocksNeeded} blocks. Trailing blocks released.`,
        { size: newSize, blocks: [...res.node.blocks], releasedBlocks }
      );
    }

    // Case C: Expand file (newBlocksNeeded > currentBlocks.length)
    const diff = newBlocksNeeded - currentBlocks.length;
    let canExtend = false;

    if (currentBlocks.length > 0) {
      const lastBlock = currentBlocks[currentBlocks.length - 1];
      const nextBlocks = Array.from({ length: diff }, (_, i) => lastBlock + 1 + i);
      const allWithinBounds = nextBlocks[nextBlocks.length - 1] < this.config.totalBlocks;
      const allFree = allWithinBounds && nextBlocks.every(b => this.blockMap[b].status === 'free');

      if (allFree) {
        canExtend = true;
        // Extend in-place
        for (const b of nextBlocks) {
          this.blockMap[b] = { block: b, status: 'allocated', fileId: res.node.id };
        }
        res.node.blocks.push(...nextBlocks);
        res.node.size = newSize;
        res.node.modifiedAt = this.currentTime;

        return this.recordSuccess(
          'write',
          normPath,
          res.node.id,
          `Wrote to "${normPath}". Contiguously extended by ${diff} blocks [${nextBlocks.join(', ')}].`,
          `Contiguous extension succeeded. File now occupies blocks [${res.node.blocks.join(', ')}].`,
          { size: newSize, blocks: [...res.node.blocks], extendedBlocks: nextBlocks }
        );
      }
    }

    // Case D: Cannot extend in-place -> Attempt First-Fit Relocation
    // Temporarily mark current blocks as free to evaluate candidate region without bias
    for (const b of currentBlocks) {
      this.blockMap[b].status = 'free';
      this.blockMap[b].fileId = null;
    }

    const candidateBlocks = this.findContiguousFreeBlocks(newBlocksNeeded);

    if (!candidateBlocks) {
      // Rollback! Restore original blocks intact
      for (const b of currentBlocks) {
        this.blockMap[b].status = 'allocated';
        this.blockMap[b].fileId = res.node.id;
      }

      const stats = this.calculateAllocationStats();
      const errCode = stats.freeBlocks < newBlocksNeeded ? 'INSUFFICIENT_DISK_SPACE' : 'INSUFFICIENT_CONTIGUOUS_SPACE';
      const errMsg = `Cannot expand "${normPath}" to ${newSize} bytes (${newBlocksNeeded} blocks). Relocation failed: ${errCode === 'INSUFFICIENT_DISK_SPACE' ? 'not enough total space' : 'no contiguous region large enough'}. Original allocation preserved intact.`;

      return this.recordFailure('write', normPath, errCode, errMsg);
    }

    // Relocation succeeded! Allocate new blocks
    for (const b of candidateBlocks) {
      this.blockMap[b] = { block: b, status: 'allocated', fileId: res.node.id };
    }

    res.node.blocks = candidateBlocks;
    res.node.size = newSize;
    res.node.modifiedAt = this.currentTime;

    return this.recordSuccess(
      'write',
      normPath,
      res.node.id,
      `Wrote to "${normPath}". Relocated to ${newBlocksNeeded} contiguous blocks [${candidateBlocks.join(', ')}].`,
      `In-place extension was blocked. File was relocated to a new First-Fit contiguous region [${candidateBlocks.join(', ')}]. Old blocks were released.`,
      { size: newSize, blocks: [...res.node.blocks], relocatedFrom: currentBlocks }
    );
  }

  open(path) {
    this.currentTime++;
    this.operationCount++;

    const normPath = this.normalizePath(path, this.currentPath);
    const res = this.resolvePath(normPath);

    if (!res.found) {
      return this.recordFailure('open', normPath, 'NOT_FOUND', `File "${normPath}" not found.`);
    }

    if (res.node.type !== 'file') {
      return this.recordFailure('open', normPath, 'NOT_A_FILE', `"${normPath}" is a directory.`);
    }

    if (res.node.open) {
      return this.recordFailure('open', normPath, 'ALREADY_OPEN', `File "${normPath}" is already open.`);
    }

    if (!res.node.permissions.includes('r') && !res.node.permissions.includes('w')) {
      return this.recordFailure('open', normPath, 'PERMISSION_DENIED', `Permission denied to open "${normPath}" (${res.node.permissions}).`);
    }

    res.node.open = true;

    return this.recordSuccess(
      'open',
      normPath,
      res.node.id,
      `Opened file "${normPath}".`,
      `File descriptor created. Open files are protected from deletion until closed.`,
      { open: true }
    );
  }

  close(path) {
    this.currentTime++;
    this.operationCount++;

    const normPath = this.normalizePath(path, this.currentPath);
    const res = this.resolvePath(normPath);

    if (!res.found) {
      return this.recordFailure('close', normPath, 'NOT_FOUND', `File "${normPath}" not found.`);
    }

    if (res.node.type !== 'file') {
      return this.recordFailure('close', normPath, 'NOT_A_FILE', `"${normPath}" is a directory.`);
    }

    if (!res.node.open) {
      return this.recordFailure('close', normPath, 'NOT_OPEN', `File "${normPath}" is not open.`);
    }

    res.node.open = false;

    return this.recordSuccess(
      'close',
      normPath,
      res.node.id,
      `Closed file "${normPath}".`,
      `File descriptor released. File can now be safely deleted or modified by other processes.`,
      { open: false }
    );
  }

  cd(path) {
    this.currentTime++;
    this.operationCount++;

    const normPath = this.normalizePath(path, this.currentPath);
    const res = this.resolvePath(normPath);

    if (!res.found) {
      return this.recordFailure('cd', normPath, 'NOT_FOUND', `Directory "${normPath}" not found.`);
    }

    if (res.node.type !== 'directory') {
      return this.recordFailure('cd', normPath, 'NOT_A_DIRECTORY', `"${normPath}" is a file, not a directory.`);
    }

    this.currentPath = normPath;

    return this.recordSuccess(
      'cd',
      normPath,
      res.node.id,
      `Changed working directory to "${normPath}".`,
      `Current working directory set to "${normPath}". Relative paths will now resolve against this path.`,
      { currentPath: normPath }
    );
  }

  ls(path = '.') {
    this.currentTime++;
    this.operationCount++;

    const normPath = this.normalizePath(path, this.currentPath);
    const res = this.resolvePath(normPath);

    if (!res.found) {
      return this.recordFailure('ls', normPath, 'NOT_FOUND', `Directory "${normPath}" not found.`);
    }

    if (res.node.type !== 'directory') {
      return this.recordFailure('ls', normPath, 'NOT_A_DIRECTORY', `"${normPath}" is a file, not a directory.`);
    }

    const children = [];
    for (const n of this.nodes.values()) {
      if (n.parentId === res.node.id) {
        children.push({
          id: n.id,
          name: n.name,
          type: n.type,
          size: n.size || 0,
          permissions: n.permissions,
          open: n.open || false,
          blocks: n.blocks ? [...n.blocks] : []
        });
      }
    }

    // Sort: directories first, then alphabetical
    children.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return this.recordSuccess(
      'ls',
      normPath,
      res.node.id,
      `Listed directory "${normPath}" (${children.length} entries).`,
      `Enumerated contents of "${normPath}".`,
      { entries: children }
    );
  }

  /* =========================================================================
   * Helpers & BaseSimulationEngine Overrides
   * ========================================================================= */

  recordSuccess(operation, path, activeNodeId, message, educationalNote, data = {}) {
    this.successfulOperations++;
    const result = {
      success: true,
      operation,
      path,
      message,
      data
    };

    this.operationLog.push(result);
    this.createAndPushSnapshot(operation, activeNodeId, message, educationalNote, result);
    return result;
  }

  recordFailure(operation, path, errorCode, message) {
    this.failedOperations++;
    const result = {
      success: false,
      operation,
      path,
      errorCode,
      message
    };

    this.operationLog.push(result);
    this.createAndPushSnapshot(operation, null, `FAILED: ${message}`, `Operation "${operation}" failed with error code "${errorCode}".`, result);
    return result;
  }

  getMetrics() {
    let files = 0;
    let directories = 0;
    let totalFilesSize = 0;
    let largestFile = { name: 'None', size: 0 };

    for (const n of this.nodes.values()) {
      if (n.type === 'directory') {
        directories++;
      } else if (n.type === 'file') {
        files++;
        totalFilesSize += (n.size || 0);
        if ((n.size || 0) > largestFile.size) {
          largestFile = { name: n.name, size: n.size };
        }
      }
    }

    const alloc = this.calculateAllocationStats();
    const diskUtilizationPercent = alloc.totalBlocks > 0
      ? Number(((alloc.allocatedBlocks / alloc.totalBlocks) * 100).toFixed(1))
      : 0;

    return {
      totalNodes: this.nodes.size,
      fileCount: files,
      directoryCount: directories,
      totalDiskBlocks: alloc.totalBlocks,
      allocatedBlocks: alloc.allocatedBlocks,
      freeBlocks: alloc.freeBlocks,
      diskUtilizationPercent,
      totalFilesSize,
      largestFile,
      largestFreeContiguousRegion: alloc.largestFreeContiguousRegion,
      totalFreeBlocks: alloc.freeBlocks,
      externalFragmentationBlocks: alloc.externalFragmentationBlocks,
      operationCount: this.operationCount,
      successfulOperations: this.successfulOperations,
      failedOperations: this.failedOperations
    };
  }

  validate(inputs) {
    if (!inputs || typeof inputs !== 'object') {
      return { isValid: false, error: 'Inputs must be an object' };
    }
    return { isValid: true };
  }

  run(inputs = {}) {
    const validation = this.validate(inputs);
    if (!validation.isValid) {
      throw new Error(validation.error);
    }

    // If preset index specified, load it
    if (typeof inputs.presetIndex === 'number') {
      const presets = this.getPresets();
      const preset = presets[inputs.presetIndex];
      if (preset && preset.data) {
        this.reset(preset.data.initialNodes, preset.data.config);
      }
    } else if (inputs.initialNodes) {
      this.reset(inputs.initialNodes, inputs.config);
    } else {
      // Default: load default preset
      const defaultPreset = this.getPresets()[0];
      this.reset(defaultPreset.data.initialNodes, defaultPreset.data.config);
    }

    // If operations array specified, execute each
    if (Array.isArray(inputs.operations)) {
      for (const op of inputs.operations) {
        const { type, path, size, permissions } = op;
        switch (type) {
          case 'mkdir': this.mkdir(path, permissions); break;
          case 'rmdir': this.rmdir(path); break;
          case 'create': this.create(path, size, permissions); break;
          case 'delete': this.delete(path); break;
          case 'read': this.read(path); break;
          case 'write': this.write(path, size); break;
          case 'open': this.open(path); break;
          case 'close': this.close(path); break;
          case 'cd': this.cd(path); break;
          case 'ls': this.ls(path); break;
          default: break;
        }
      }
    }

    return this.formatResult({
      parameters: { config: this.config },
      snapshots: this.snapshots,
      metrics: this.getMetrics()
    });
  }
}
