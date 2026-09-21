/**
 * public/js/os/filesystem/FileSystem.js
 * Authoritative AdityyaOS Filesystem Subsystem (AdityyaFS).
 * Inode-based hierarchical filesystem with persistent multi-sector storage layout,
 * lightweight file descriptors, transactional block allocation, and process cleanup.
 */

import { File } from './File.js';
import { Directory } from './Directory.js';
import { PathResolver } from './PathResolver.js';
import { FileDescriptor } from './FileDescriptor.js';
import { FileSystemStatus, FileSystemErrorCode, createFsError } from './FileSystemState.js';
import { FileSystemEvents } from './FileSystemEvents.js';

export const SUPERBLOCK_MAGIC = 'ADITYYA_FS';
export const SUPERBLOCK_VERSION = 1;
export const SUPERBLOCK_SECTOR = 180;
export const INODE_TABLE_START_SECTOR = 181;
export const INODE_TABLE_SECTORS = 64;
export const ALLOCATION_BITMAP_SECTOR = 246;
export const BACKUP_SUPERBLOCK_SECTOR = 250;
export const DATA_START_SECTOR = 0;
export const DEFAULT_BLOCK_SIZE = 64;
export const DEFAULT_TOTAL_BLOCKS = 32;

export class FileSystem {
  /**
   * @param {Object} [options={}]
   * @param {Object} [options.kernel=null]
   * @param {Object} [options.storageDevice=null]
   * @param {Object} [options.events=null]
   * @param {number} [options.totalBlocks=200]
   * @param {number} [options.blockSize=512]
   */
  constructor(options = {}) {
    this.kernel = options.kernel || null;
    this.storageDevice = options.storageDevice || null;
    this.events = options.events || this.kernel?.events || null;

    this.totalBlocks = typeof options.totalBlocks === 'number' && options.totalBlocks > 0
      ? Math.floor(options.totalBlocks)
      : DEFAULT_TOTAL_BLOCKS;
    this.blockSize = typeof options.blockSize === 'number' && options.blockSize > 0
      ? Math.floor(options.blockSize)
      : DEFAULT_BLOCK_SIZE;

    this.dataStartSector = DATA_START_SECTOR;
    this.dataBlocksCount = this.totalBlocks;

    this.status = FileSystemStatus.UNMOUNTED;
    this.rootInodeId = 1;
    this.nextInodeId = 1;
    this.nextFd = 3; // Descriptors 0, 1, 2 reserved

    this.inodes = new Map(); // inodeId -> Inode (File or Directory)
    this.descriptors = new Map(); // fd -> FileDescriptor
    this.currentPath = '/';

    // Block allocation map: sectorNumber -> { block, status: 'free'|'allocated', inodeId: number|null }
    this.blockMap = new Map();
    this.initBlockMap();
  }

  /**
   * Initialize physical data block tracking map.
   */
  initBlockMap() {
    this.blockMap.clear();
    for (let s = this.dataStartSector; s < this.dataStartSector + this.dataBlocksCount; s++) {
      this.blockMap.set(s, {
        block: s,
        status: 'free',
        inodeId: null
      });
    }
  }

  get storage() {
    return this.storageDevice || this.kernel?.hardware?.getDevice('disk0') || null;
  }

  get allocatedBlocks() {
    let count = 0;
    for (const b of this.blockMap.values()) {
      if (b.status === 'allocated') count++;
    }
    return count;
  }

  get freeBlocks() {
    return this.dataBlocksCount - this.allocatedBlocks;
  }

  /* =========================================================================
   * Mount / Unmount / Format / Lifecycle
   * ========================================================================= */

  /**
   * Mount the filesystem and restore or initialize persistent state.
   * @returns {{ success: boolean, status: string, error?: string, code?: string }}
   */
  mount() {
    this.status = FileSystemStatus.MOUNTING;
    this.emitEvent(FileSystemEvents.FILESYSTEM_MOUNTING, { timestamp: Date.now() });

    try {
      // Attempt restore from persistent storage device
      const restored = this.restoreFromStorage();
      if (!restored) {
        // First boot or fresh disk: initialize default directory hierarchy
        this.initializeDefaultHierarchy();
        this.commitPersistentMetadata();
      }

      this.status = FileSystemStatus.MOUNTED;
      this.emitEvent(FileSystemEvents.FILESYSTEM_MOUNTED, { timestamp: Date.now() });

      this.status = FileSystemStatus.READY;
      return { success: true, status: this.status };
    } catch (err) {
      this.status = FileSystemStatus.UNMOUNTED;
      this.emitEvent(FileSystemEvents.FILESYSTEM_UNMOUNTED, { timestamp: Date.now(), error: err.message });
      return {
        success: false,
        status: this.status,
        error: `Filesystem mount failed: ${err.message}`,
        code: FileSystemErrorCode.EINVAL
      };
    }
  }

  /**
   * Unmount the filesystem cleanly.
   * @returns {{ success: boolean, status: string }}
   */
  unmount() {
    this.status = FileSystemStatus.UNMOUNTING;
    this.emitEvent(FileSystemEvents.FILESYSTEM_UNMOUNTING, { timestamp: Date.now() });

    try {
      this.commitPersistentMetadata();
      // Close all runtime descriptors on unmount
      this.descriptors.clear();
      for (const inode of this.inodes.values()) {
        inode.openCount = 0;
      }

      this.status = FileSystemStatus.UNMOUNTED;
      this.emitEvent(FileSystemEvents.FILESYSTEM_UNMOUNTED, { timestamp: Date.now() });
      return { success: true, status: this.status };
    } catch (err) {
      this.status = FileSystemStatus.UNMOUNTED;
      return { success: false, status: this.status, error: err.message };
    }
  }

  /**
   * Explicit destructive format: wipes filesystem and creates fresh default hierarchy.
   * @returns {{ success: boolean, status: string }}
   */
  format() {
    // Clear storage data sectors
    const disk = this.storage;
    if (disk) {
      for (let s = this.dataStartSector; s < this.dataStartSector + this.dataBlocksCount; s++) {
        disk.write(s, null);
      }
      for (let s = SUPERBLOCK_SECTOR; s <= INODE_TABLE_START_SECTOR + INODE_TABLE_SECTORS; s++) {
        disk.write(s, null);
      }
      disk.write(ALLOCATION_BITMAP_SECTOR, null);
      disk.write(BACKUP_SUPERBLOCK_SECTOR, null);
    }

    this.inodes.clear();
    this.descriptors.clear();
    this.initBlockMap();
    this.nextInodeId = 1;
    this.nextFd = 3;
    this.currentPath = '/';

    this.initializeDefaultHierarchy();
    this.commitPersistentMetadata();

    this.status = FileSystemStatus.READY;
    return { success: true, status: this.status };
  }

  /**
   * Reset runtime state without destroying persistent storage.
   */
  reset() {
    this.descriptors.clear();
    for (const inode of this.inodes.values()) {
      inode.openCount = 0;
    }
    this.nextFd = 3;
    this.currentPath = '/';
  }

  /**
   * Initialize default AdityyaOS directory hierarchy.
   */
  initializeDefaultHierarchy() {
    this.inodes.clear();
    this.initBlockMap();
    this.nextInodeId = 1;

    // Root directory
    const root = new Directory({
      inodeId: this.nextInodeId++,
      name: '/',
      parentId: null,
      permissions: 'rwx'
    });
    this.rootInodeId = root.inodeId;
    this.inodes.set(root.inodeId, root);

    // Default directories: /bin, /boot, /dev, /etc, /home, /home/user, /tmp, /var, /system
    const defaultDirs = ['bin', 'boot', 'dev', 'etc', 'home', 'tmp', 'var', 'system'];
    for (const d of defaultDirs) {
      const dir = new Directory({
        inodeId: this.nextInodeId++,
        name: d,
        parentId: root.inodeId,
        permissions: 'rwx'
      });
      this.inodes.set(dir.inodeId, dir);
      root.addChild(d, dir.inodeId);
    }

    // /home/user
    const home = this.inodes.get(root.getChild('home'));
    if (home) {
      const userDir = new Directory({
        inodeId: this.nextInodeId++,
        name: 'user',
        parentId: home.inodeId,
        permissions: 'rwx'
      });
      this.inodes.set(userDir.inodeId, userDir);
      home.addChild('user', userDir.inodeId);
    }
  }

  /* =========================================================================
   * Persistence: Multi-Sector Superblock, Inode Table & Allocation Bitmap
   * ========================================================================= */

  /**
   * Commit filesystem metadata to persistent StorageDevice.
   * Deterministic layout:
   *   Sector 180: Superblock
   *   Sectors 181..190: Serialized Inode Table chunks
   *   Sector 191: Block allocation bitmap
   *   Sector 199: Backup Superblock
   */
  commitPersistentMetadata() {
    const disk = this.storage;
    if (!disk) return;

    // 1. Prepare serialized inodes
    const allInodes = Array.from(this.inodes.values()).map(inode => inode.toJSON());
    const inodesJson = JSON.stringify(allInodes);

    // Split across INODE_TABLE_SECTORS (512 bytes per physical sector)
    const sectorSize = 512;
    const chunks = [];
    for (let i = 0; i < inodesJson.length; i += sectorSize) {
      chunks.push(inodesJson.slice(i, i + sectorSize));
    }

    if (chunks.length > INODE_TABLE_SECTORS) {
      throw new Error(`Inode table exceeds allocated metadata sectors (${chunks.length} > ${INODE_TABLE_SECTORS})`);
    }

    for (let i = 0; i < INODE_TABLE_SECTORS; i++) {
      const sector = INODE_TABLE_START_SECTOR + i;
      disk.write(sector, chunks[i] || null);
    }

    // 2. Prepare block allocation bitmap/record
    const allocatedList = [];
    for (const [sec, b] of this.blockMap.entries()) {
      if (b.status === 'allocated') {
        allocatedList.push({ sector: sec, inodeId: b.inodeId });
      }
    }
    disk.write(ALLOCATION_BITMAP_SECTOR, JSON.stringify(allocatedList));

    // 3. Prepare Superblock
    const superblock = {
      magic: SUPERBLOCK_MAGIC,
      version: SUPERBLOCK_VERSION,
      blockSize: this.blockSize,
      totalBlocks: this.totalBlocks,
      rootInodeId: this.rootInodeId,
      nextInodeId: this.nextInodeId,
      inodeCount: this.inodes.size,
      inodeChunksCount: chunks.length,
      timestamp: Date.now()
    };
    const sbJson = JSON.stringify(superblock);

    // Write to Primary Superblock (sector 180) and Backup Superblock (sector 199)
    disk.write(SUPERBLOCK_SECTOR, sbJson);
    disk.write(BACKUP_SUPERBLOCK_SECTOR, sbJson);
  }

  /**
   * Restore filesystem metadata from persistent StorageDevice.
   * @returns {boolean} true if successfully restored
   */
  restoreFromStorage() {
    const disk = this.storage;
    if (!disk) return false;

    // Try reading primary superblock, fallback to backup
    let sbData = disk.read(SUPERBLOCK_SECTOR)?.data?.data;
    let superblock = null;

    try {
      if (typeof sbData === 'string') superblock = JSON.parse(sbData);
      else if (sbData && typeof sbData === 'object') superblock = sbData;
    } catch {
      superblock = null;
    }

    if (!superblock || superblock.magic !== SUPERBLOCK_MAGIC) {
      // Check backup superblock at sector 199
      const backupData = disk.read(BACKUP_SUPERBLOCK_SECTOR)?.data?.data;
      try {
        if (typeof backupData === 'string') superblock = JSON.parse(backupData);
        else if (backupData && typeof backupData === 'object') superblock = backupData;
      } catch {
        superblock = null;
      }
    }

    if (!superblock || superblock.magic !== SUPERBLOCK_MAGIC) {
      return false;
    }

    // Restore Inodes from sectors 1..8
    let reconstructedJson = '';
    const chunksCount = superblock.inodeChunksCount || INODE_TABLE_SECTORS;
    for (let i = 0; i < chunksCount; i++) {
      const sector = INODE_TABLE_START_SECTOR + i;
      const chunk = disk.read(sector)?.data?.data;
      if (typeof chunk === 'string') {
        reconstructedJson += chunk;
      }
    }

    if (!reconstructedJson) return false;

    let rawInodes = [];
    try {
      rawInodes = JSON.parse(reconstructedJson);
    } catch {
      return false;
    }

    // Reconstruct Inodes map
    this.inodes.clear();
    for (const raw of rawInodes) {
      if (raw.type === 'directory') {
        this.inodes.set(raw.inodeId, Directory.fromJSON(raw));
      } else {
        this.inodes.set(raw.inodeId, File.fromJSON(raw));
      }
    }

    this.rootInodeId = superblock.rootInodeId || 1;
    this.nextInodeId = Math.max(superblock.nextInodeId || 1, this.inodes.size + 1);

    // Restore block allocation map
    this.initBlockMap();
    const allocRaw = disk.read(ALLOCATION_BITMAP_SECTOR)?.data?.data;
    if (allocRaw) {
      try {
        const allocList = typeof allocRaw === 'string' ? JSON.parse(allocRaw) : allocRaw;
        if (Array.isArray(allocList)) {
          for (const item of allocList) {
            if (this.blockMap.has(item.sector)) {
              this.blockMap.set(item.sector, {
                block: item.sector,
                status: 'allocated',
                inodeId: item.inodeId
              });
            }
          }
        }
      } catch {
        // Reconstruct from inodes
        for (const inode of this.inodes.values()) {
          if (Array.isArray(inode.storageBlocks)) {
            for (const b of inode.storageBlocks) {
              if (this.blockMap.has(b.block)) {
                this.blockMap.set(b.block, { block: b.block, status: 'allocated', inodeId: inode.inodeId });
              }
            }
          }
        }
      }
    }

    return true;
  }

  /* =========================================================================
   * Path Resolution Helper
   * ========================================================================= */

  /**
   * Resolve a path string to an inode.
   * @param {string} path
   * @returns {{ found: boolean, inode: Inode|null, parentInode: Inode|null, normalizedPath: string, parentPath: string|null, name: string, error?: string, code?: string }}
   */
  resolvePath(path) {
    const root = this.inodes.get(this.rootInodeId);
    if (!root) {
      return {
        found: false,
        inode: null,
        parentInode: null,
        normalizedPath: '/',
        parentPath: null,
        name: '/',
        ...createFsError(FileSystemErrorCode.ENOENT, 'Root directory not mounted')
      };
    }

    return PathResolver.resolve(path, this.currentPath, root, id => this.inodes.get(id));
  }

  /* =========================================================================
   * Core Directory Operations (mkdir, rmdir, readdir, exists)
   * ========================================================================= */

  /**
   * Create a directory at path.
   * @param {string} path
   * @param {string} [permissions='rwx']
   * @returns {{ success: boolean, data?: Object, error?: string, code?: string }}
   */
  mkdir(path, permissions = 'rwx') {
    if (typeof path !== 'string' || path.trim() === '') {
      return createFsError(FileSystemErrorCode.EINVAL, 'Path must be a non-empty string');
    }

    const resolved = this.resolvePath(path);
    if (resolved.found) {
      return createFsError(FileSystemErrorCode.EEXIST, `Directory "${path}" already exists`);
    }

    if (!resolved.parentInode) {
      return createFsError(FileSystemErrorCode.ENOENT, `Parent directory "${resolved.parentPath}" does not exist`);
    }

    if (resolved.parentInode.type !== 'directory') {
      return createFsError(FileSystemErrorCode.ENOTDIR, `Parent path "${resolved.parentPath}" is not a directory`);
    }

    const dir = new Directory({
      inodeId: this.nextInodeId++,
      name: resolved.name,
      parentId: resolved.parentInode.inodeId,
      permissions
    });

    resolved.parentInode.addChild(resolved.name, dir.inodeId);
    this.inodes.set(dir.inodeId, dir);

    this.commitPersistentMetadata();

    this.emitEvent(FileSystemEvents.DIRECTORY_CREATED, {
      path: resolved.normalizedPath,
      inodeId: dir.inodeId,
      id: `dir_${dir.inodeId}` // Compatibility alias
    });

    return {
      success: true,
      data: {
        id: `dir_${dir.inodeId}`,
        inodeId: dir.inodeId,
        path: resolved.normalizedPath,
        name: dir.name,
        permissions: dir.permissions
      }
    };
  }

  /**
   * Remove a directory. Fails with ENOTEMPTY if directory is not empty (unless recursive=true).
   * Fails with EBUSY if any file inside is open.
   * @param {string} path
   * @param {Object} [options={ recursive: false }]
   * @returns {{ success: boolean, data?: Object, error?: string, code?: string }}
   */
  rmdir(path, options = { recursive: false }) {
    if (typeof path !== 'string' || path.trim() === '') {
      return createFsError(FileSystemErrorCode.EINVAL, 'Path must be a non-empty string');
    }

    const resolved = this.resolvePath(path);
    if (!resolved.found || !resolved.inode) {
      return createFsError(FileSystemErrorCode.ENOENT, `Directory "${path}" not found`);
    }

    if (resolved.inode.type !== 'directory') {
      return createFsError(FileSystemErrorCode.ENOTDIR, `Path "${path}" is a file, not a directory`);
    }

    if (resolved.inode.inodeId === this.rootInodeId) {
      return createFsError(FileSystemErrorCode.EBUSY, 'Cannot delete root directory "/"');
    }

    // Check if any open file descriptor exists in this directory or subtree
    if (this.hasOpenDescriptorsInSubtree(resolved.inode.inodeId)) {
      return createFsError(FileSystemErrorCode.EBUSY, `Directory "${path}" contains open files`);
    }

    const isNonEmpty = !resolved.inode.isEmpty();
    if (isNonEmpty && !options.recursive) {
      return createFsError(FileSystemErrorCode.ENOTEMPTY, `Directory "${path}" is not empty`);
    }

    // If recursive, recursively delete all children
    if (isNonEmpty && options.recursive) {
      this.recursivelyDeleteDirectory(resolved.inode);
    }

    // Remove from parent
    if (resolved.parentInode) {
      resolved.parentInode.removeChild(resolved.name);
    }
    this.inodes.delete(resolved.inode.inodeId);

    this.commitPersistentMetadata();

    this.emitEvent(FileSystemEvents.DIRECTORY_DELETED, {
      path: resolved.normalizedPath,
      inodeId: resolved.inode.inodeId
    });

    return {
      success: true,
      data: {
        path: resolved.normalizedPath,
        inodeId: resolved.inode.inodeId
      }
    };
  }

  /**
   * Internal recursive helper to delete subtree.
   * @param {Directory} dir
   */
  recursivelyDeleteDirectory(dir) {
    for (const { inodeId } of dir.list()) {
      const child = this.inodes.get(inodeId);
      if (!child) continue;

      if (child.type === 'directory') {
        this.recursivelyDeleteDirectory(child);
      } else {
        this.freeInodeStorageBlocks(child);
      }
      this.inodes.delete(inodeId);
    }
  }

  /**
   * Check if any active descriptors exist for this inode or any descendant.
   * @param {number} inodeId
   * @returns {boolean}
   */
  hasOpenDescriptorsInSubtree(inodeId) {
    const inode = this.inodes.get(inodeId);
    if (!inode) return false;

    if (inode.type === 'file') {
      return inode.openCount > 0;
    }

    if (inode.type === 'directory') {
      for (const { inodeId: childId } of inode.list()) {
        if (this.hasOpenDescriptorsInSubtree(childId)) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * List directory contents.
   * @param {string} [path='.']
   * @returns {{ success: boolean, data?: { entries: Array<Object> }, error?: string, code?: string }}
   */
  readdir(path = '.') {
    const resolved = this.resolvePath(path);
    if (!resolved.found || !resolved.inode) {
      return createFsError(FileSystemErrorCode.ENOENT, `Directory "${path}" not found`);
    }

    if (resolved.inode.type !== 'directory') {
      return createFsError(FileSystemErrorCode.ENOTDIR, `Path "${path}" is not a directory`);
    }

    const entries = resolved.inode.list().map(({ name, inodeId }) => {
      const child = this.inodes.get(inodeId);
      return {
        name,
        inodeId,
        id: child ? `${child.type === 'directory' ? 'dir' : 'file'}_${child.inodeId}` : null,
        type: child ? child.type : 'unknown',
        size: child ? child.size : 0,
        permissions: child ? child.permissions : null,
        modifiedAt: child ? child.modifiedAt : null
      };
    });

    return { success: true, data: { entries } };
  }

  /**
   * Check if a path exists.
   * @param {string} path
   * @returns {boolean}
   */
  exists(path) {
    return this.resolvePath(path).found;
  }

  /**
   * Get metadata / stat for a path.
   * @param {string} path
   * @returns {{ success: boolean, data?: Object, error?: string, code?: string }}
   */
  stat(path) {
    if (typeof path !== 'string' || path.trim() === '') {
      return createFsError(FileSystemErrorCode.EINVAL, 'Path must be a non-empty string');
    }

    const resolved = this.resolvePath(path);
    if (!resolved.found || !resolved.inode) {
      return createFsError(FileSystemErrorCode.ENOENT, `Path "${path}" not found`);
    }

    return {
      success: true,
      data: resolved.inode.stat()
    };
  }

  /* =========================================================================
   * Core File Operations (create, read, write, append, delete, rename, copy)
   * ========================================================================= */

  /**
   * Create a new file transactionally.
   * @param {string} path
   * @param {number|string|Array<number>} [sizeOrContent=0]
   * @param {string} [permissions='rw-']
   * @returns {{ success: boolean, data?: Object, error?: string, code?: string }}
   */
  create(path, sizeOrContent = 0, permissions = 'rw-') {
    if (typeof path !== 'string' || path.trim() === '') {
      return createFsError(FileSystemErrorCode.EINVAL, 'Path must be a non-empty string');
    }

    const resolved = this.resolvePath(path);
    if (resolved.found) {
      return createFsError(FileSystemErrorCode.EEXIST, `File "${path}" already exists`);
    }

    if (!resolved.parentInode) {
      return createFsError(FileSystemErrorCode.ENOENT, `Parent directory "${resolved.parentPath}" does not exist`);
    }

    if (resolved.parentInode.type !== 'directory') {
      return createFsError(FileSystemErrorCode.ENOTDIR, `Parent "${resolved.parentPath}" is not a directory`);
    }

    const content = typeof sizeOrContent === 'string' || Array.isArray(sizeOrContent)
      ? sizeOrContent
      : '';
    const size = typeof sizeOrContent === 'number'
      ? sizeOrContent
      : content.length;

    // 1. Transactional Storage Allocation: calculate required blocks
    const blocksNeeded = Math.ceil(size / this.blockSize) || 1;
    const allocatedBlocks = this.allocateStorageBlocks(blocksNeeded);

    if (!allocatedBlocks) {
      return createFsError(FileSystemErrorCode.ENOSPC, `Insufficient storage: requested ${blocksNeeded} blocks, available ${this.freeBlocks}`);
    }

    const inodeId = this.nextInodeId++;
    const file = new File({
      inodeId,
      name: resolved.name,
      parentId: resolved.parentInode.inodeId,
      size,
      content,
      permissions,
      storageBlocks: allocatedBlocks
    });

    // 2. Transactional physical write to StorageDevice disk0
    const disk = this.storage;
    if (disk) {
      try {
        for (const b of allocatedBlocks) {
          const res = disk.write(b.block, {
            path: resolved.normalizedPath,
            fileId: `file_${file.inodeId}`,
            size: file.size,
            block: b.block
          });
          if (!res || !res.success) {
            throw new Error(res?.error || 'Physical disk write failed');
          }
        }
      } catch (err) {
        // Rollback: release newly allocated blocks
        this.releaseStorageBlocks(allocatedBlocks);
        return createFsError(FileSystemErrorCode.ENOSPC, `Disk write failure: ${err.message}`);
      }
    }

    // 3. Commit metadata
    for (const b of allocatedBlocks) {
      const mapEntry = this.blockMap.get(b.block);
      if (mapEntry) {
        mapEntry.status = 'allocated';
        mapEntry.inodeId = file.inodeId;
      }
    }

    resolved.parentInode.addChild(resolved.name, file.inodeId);
    this.inodes.set(file.inodeId, file);

    try {
      this.commitPersistentMetadata();
    } catch (err) {
      // Rollback on metadata persistence failure
      resolved.parentInode.removeChild(resolved.name);
      this.inodes.delete(file.inodeId);
      this.releaseStorageBlocks(allocatedBlocks);
      return createFsError(FileSystemErrorCode.ENOSPC, `Metadata commit failed: ${err.message}`);
    }

    this.emitEvent(FileSystemEvents.FILE_CREATED, {
      path: resolved.normalizedPath,
      inodeId: file.inodeId,
      fileId: `file_${file.inodeId}`, // Compatibility alias
      size: file.size,
      blocks: file.storageBlocks.map(b => b.block)
    });

    this.emitEvent(FileSystemEvents.STORAGE_ALLOCATED, {
      inodeId: file.inodeId,
      blocks: file.storageBlocks.map(b => b.block),
      bytes: file.size
    });

    return {
      success: true,
      data: {
        id: `file_${file.inodeId}`,
        inodeId: file.inodeId,
        path: resolved.normalizedPath,
        name: file.name,
        size: file.size,
        blocks: file.storageBlocks.map(b => b.block),
        permissions: file.permissions
      }
    };
  }

  /**
   * Read file content and metadata.
   * @param {string} path
   * @returns {{ success: boolean, data?: Object, error?: string, code?: string }}
   */
  read(path) {
    if (typeof path !== 'string' || path.trim() === '') {
      return createFsError(FileSystemErrorCode.EINVAL, 'Path must be a non-empty string');
    }

    const resolved = this.resolvePath(path);
    if (!resolved.found || !resolved.inode) {
      return createFsError(FileSystemErrorCode.ENOENT, `File "${path}" not found`);
    }

    if (resolved.inode.type !== 'file') {
      return createFsError(FileSystemErrorCode.EISDIR, `Cannot read directory "${path}" as a file`);
    }

    const file = resolved.inode;
    const content = file.read(0);

    this.emitEvent(FileSystemEvents.FILE_READ, {
      path: resolved.normalizedPath,
      inodeId: file.inodeId,
      size: file.size
    });

    return {
      success: true,
      data: {
        id: `file_${file.inodeId}`,
        inodeId: file.inodeId,
        path: resolved.normalizedPath,
        size: file.size,
        content,
        blocks: file.storageBlocks.map(b => b.block),
        permissions: file.permissions
      }
    };
  }

  /**
   * Write data or modify size of an existing file transactionally.
   * Handles growth (allocating blocks) and truncation (releasing blocks).
   * @param {string} path
   * @param {string|Array<number>|number} dataOrNewSize
   * @param {number} [offset=0]
   * @param {boolean} [isPartial=false]
   * @returns {{ success: boolean, data?: Object, error?: string, code?: string }}
   */
  write(path, dataOrNewSize, offset = 0, isPartial = false) {
    if (typeof path !== 'string' || path.trim() === '') {
      return createFsError(FileSystemErrorCode.EINVAL, 'Path must be a non-empty string');
    }

    const resolved = this.resolvePath(path);
    if (!resolved.found || !resolved.inode) {
      return createFsError(FileSystemErrorCode.ENOENT, `File "${path}" not found`);
    }

    if (resolved.inode.type !== 'file') {
      return createFsError(FileSystemErrorCode.EISDIR, `Cannot write to directory "${path}"`);
    }

    const file = resolved.inode;

    // Save previous state for rollback
    const prevContent = file.content;
    const prevSize = file.size;
    const prevBlocks = file.storageBlocks.map(b => ({ ...b }));

    let newSize = prevSize;
    let isResizeOnly = false;

    if (typeof dataOrNewSize === 'number') {
      newSize = dataOrNewSize;
      isResizeOnly = true;
    } else {
      const dataLen = typeof dataOrNewSize === 'string' ? dataOrNewSize.length : dataOrNewSize.length;
      if (!isPartial && offset === 0) {
        newSize = dataLen;
      } else {
        newSize = Math.max(prevSize, offset + dataLen);
      }
    }

    const newBlocksNeeded = Math.ceil(newSize / this.blockSize) || 1;
    const currentBlocksCount = file.storageBlocks.length;
    let newlyAllocated = [];
    let blocksToRelease = [];

    if (newBlocksNeeded > currentBlocksCount) {
      // Growth: allocate additional blocks
      const additionalCount = newBlocksNeeded - currentBlocksCount;
      newlyAllocated = this.allocateStorageBlocks(additionalCount);

      if (!newlyAllocated) {
        return createFsError(FileSystemErrorCode.ENOSPC, `Insufficient storage to expand file "${path}" to ${newSize} bytes`);
      }
    } else if (newBlocksNeeded < currentBlocksCount) {
      // Truncation: identify blocks to release
      blocksToRelease = file.storageBlocks.slice(newBlocksNeeded);
    }

    // Attempt physical write
    const updatedBlocks = [
      ...file.storageBlocks.slice(0, newBlocksNeeded),
      ...newlyAllocated
    ];

    const disk = this.storage;
    if (disk) {
      try {
        for (const b of updatedBlocks) {
          const res = disk.write(b.block, {
            path: resolved.normalizedPath,
            fileId: `file_${file.inodeId}`,
            size: newSize,
            block: b.block
          });
          if (!res || !res.success) {
            throw new Error(res?.error || 'Physical disk write failed');
          }
        }
      } catch (err) {
        // Rollback
        if (newlyAllocated.length > 0) {
          this.releaseStorageBlocks(newlyAllocated);
        }
        return createFsError(FileSystemErrorCode.ENOSPC, `Disk write failure: ${err.message}`);
      }
    }

    // Apply content change
    try {
      if (isResizeOnly) {
        file.truncate(newSize);
      } else if (!isPartial && offset === 0) {
        file.content = typeof dataOrNewSize === 'string' ? dataOrNewSize : [...dataOrNewSize];
        file.size = dataOrNewSize.length;
        file.markModified();
      } else {
        file.write(dataOrNewSize, offset);
      }
    } catch (err) {
      // Rollback on inode content update failure
      file.content = prevContent;
      file.size = prevSize;
      file.storageBlocks = prevBlocks;
      if (newlyAllocated.length > 0) {
        this.releaseStorageBlocks(newlyAllocated);
      }
      return createFsError(FileSystemErrorCode.EINVAL, `Inode update failed: ${err.message}`);
    }

    // Commit block changes
    if (newlyAllocated.length > 0) {
      for (const b of newlyAllocated) {
        const m = this.blockMap.get(b.block);
        if (m) {
          m.status = 'allocated';
          m.inodeId = file.inodeId;
        }
      }
    }

    if (blocksToRelease.length > 0) {
      this.releaseStorageBlocks(blocksToRelease);
    }

    file.storageBlocks = updatedBlocks;

    try {
      this.commitPersistentMetadata();
    } catch (err) {
      // Rollback
      file.content = prevContent;
      file.size = prevSize;
      file.storageBlocks = prevBlocks;
      if (newlyAllocated.length > 0) {
        this.releaseStorageBlocks(newlyAllocated);
      }
      return createFsError(FileSystemErrorCode.ENOSPC, `Metadata commit failed: ${err.message}`);
    }

    this.emitEvent(FileSystemEvents.FILE_WRITTEN, {
      path: resolved.normalizedPath,
      inodeId: file.inodeId,
      size: file.size,
      blocks: file.storageBlocks.map(b => b.block)
    });

    return {
      success: true,
      data: {
        id: `file_${file.inodeId}`,
        inodeId: file.inodeId,
        path: resolved.normalizedPath,
        size: file.size,
        blocks: file.storageBlocks.map(b => b.block)
      }
    };
  }

  /**
   * Append data to an existing file.
   * @param {string} path
   * @param {string|Array<number>} content
   * @returns {{ success: boolean, data?: Object, error?: string, code?: string }}
   */
  append(path, content) {
    if (typeof path !== 'string' || path.trim() === '') {
      return createFsError(FileSystemErrorCode.EINVAL, 'Path must be a non-empty string');
    }

    const resolved = this.resolvePath(path);
    if (!resolved.found || !resolved.inode) {
      return createFsError(FileSystemErrorCode.ENOENT, `File "${path}" not found`);
    }
    return this.write(path, content, resolved.inode.size, true);
  }

  /**
   * Delete a closed file and release its storage blocks.
   * @param {string} path
   * @returns {{ success: boolean, data?: Object, error?: string, code?: string }}
   */
  delete(path) {
    if (typeof path !== 'string' || path.trim() === '') {
      return createFsError(FileSystemErrorCode.EINVAL, 'Path must be a non-empty string');
    }

    const resolved = this.resolvePath(path);
    if (!resolved.found || !resolved.inode) {
      return createFsError(FileSystemErrorCode.ENOENT, `File "${path}" not found`);
    }

    if (resolved.inode.type !== 'file') {
      return createFsError(FileSystemErrorCode.EISDIR, `Cannot delete directory "${path}" with deleteFile; use rmdir`);
    }

    const file = resolved.inode;

    // Check if open (EBUSY)
    if (file.openCount > 0) {
      return createFsError(FileSystemErrorCode.EBUSY, `Cannot delete open file "${path}" (openCount: ${file.openCount})`);
    }

    const freedBlocks = file.storageBlocks.map(b => b.block);
    this.freeInodeStorageBlocks(file);

    if (resolved.parentInode) {
      resolved.parentInode.removeChild(resolved.name);
    }
    this.inodes.delete(file.inodeId);

    this.commitPersistentMetadata();

    this.emitEvent(FileSystemEvents.FILE_DELETED, {
      path: resolved.normalizedPath,
      inodeId: file.inodeId,
      freedBlocks
    });

    this.emitEvent(FileSystemEvents.STORAGE_RELEASED, {
      inodeId: file.inodeId,
      blocks: freedBlocks
    });

    return {
      success: true,
      data: {
        path: resolved.normalizedPath,
        inodeId: file.inodeId,
        freedBlocks
      }
    };
  }

  /**
   * Rename / Move a file or directory.
   * Inode identity and storage blocks remain stable.
   * @param {string} sourcePath
   * @param {string} destPath
   * @returns {{ success: boolean, data?: Object, error?: string, code?: string }}
   */
  rename(sourcePath, destPath) {
    if (typeof sourcePath !== 'string' || sourcePath.trim() === '' || typeof destPath !== 'string' || destPath.trim() === '') {
      return createFsError(FileSystemErrorCode.EINVAL, 'Paths must be non-empty strings');
    }

    const srcResolved = this.resolvePath(sourcePath);
    if (!srcResolved.found || !srcResolved.inode) {
      return createFsError(FileSystemErrorCode.ENOENT, `Source path "${sourcePath}" not found`);
    }

    const destResolved = this.resolvePath(destPath);
    if (destResolved.found) {
      return createFsError(FileSystemErrorCode.EEXIST, `Destination path "${destPath}" already exists`);
    }

    if (!destResolved.parentInode) {
      return createFsError(FileSystemErrorCode.ENOENT, `Destination parent directory "${destResolved.parentPath}" does not exist`);
    }

    if (destResolved.parentInode.type !== 'directory') {
      return createFsError(FileSystemErrorCode.ENOTDIR, `Destination parent "${destResolved.parentPath}" is not a directory`);
    }

    const targetNode = srcResolved.inode;

    // Remove from old parent
    if (srcResolved.parentInode) {
      srcResolved.parentInode.removeChild(srcResolved.name);
    }

    // Add to new parent with new name
    targetNode.name = destResolved.name;
    targetNode.parentId = destResolved.parentInode.inodeId;
    targetNode.markModified();
    destResolved.parentInode.addChild(destResolved.name, targetNode.inodeId);

    // Update path on storage blocks if file
    if (targetNode.type === 'file' && this.storage) {
      for (const b of targetNode.storageBlocks) {
        this.storage.write(b.block, {
          path: destResolved.normalizedPath,
          fileId: `file_${targetNode.inodeId}`,
          size: targetNode.size,
          block: b.block
        });
      }
    }

    this.commitPersistentMetadata();

    this.emitEvent(FileSystemEvents.FILE_RENAMED, {
      sourcePath: srcResolved.normalizedPath,
      destPath: destResolved.normalizedPath,
      inodeId: targetNode.inodeId
    });

    return {
      success: true,
      data: {
        inodeId: targetNode.inodeId,
        sourcePath: srcResolved.normalizedPath,
        destPath: destResolved.normalizedPath
      }
    };
  }

  /**
   * Copy a file to a new destination.
   * Creates a new Inode with independent storage blocks and content.
   * @param {string} sourcePath
   * @param {string} destPath
   * @returns {{ success: boolean, data?: Object, error?: string, code?: string }}
   */
  copy(sourcePath, destPath) {
    if (typeof sourcePath !== 'string' || sourcePath.trim() === '' || typeof destPath !== 'string' || destPath.trim() === '') {
      return createFsError(FileSystemErrorCode.EINVAL, 'Paths must be non-empty strings');
    }

    const srcResolved = this.resolvePath(sourcePath);
    if (!srcResolved.found || !srcResolved.inode) {
      return createFsError(FileSystemErrorCode.ENOENT, `Source file "${sourcePath}" not found`);
    }

    if (srcResolved.inode.type !== 'file') {
      return createFsError(FileSystemErrorCode.EISDIR, `Cannot copy directory "${sourcePath}" in this phase`);
    }

    const srcFile = srcResolved.inode;
    return this.create(destPath, srcFile.content, srcFile.permissions);
  }

  /* =========================================================================
   * File Descriptor Layer
   * ========================================================================= */

  /**
   * Open a file and return a FileDescriptor.
   * @param {string} path
   * @param {Array<string>|string} [flags=['READ']]
   * @param {number|string|null} [pid=null]
   * @returns {{ success: boolean, data?: Object, error?: string, code?: string }}
   */
  open(path, flags = ['READ'], pid = null) {
    if (typeof path !== 'string' || path.trim() === '') {
      return createFsError(FileSystemErrorCode.EINVAL, 'Path must be a non-empty string');
    }

    const resolved = this.resolvePath(path);
    if (!resolved.found || !resolved.inode) {
      return createFsError(FileSystemErrorCode.ENOENT, `File "${path}" not found`);
    }

    const normalizedFlags = Array.isArray(flags)
      ? flags.map(f => String(f).toUpperCase())
      : [String(flags).toUpperCase()];

    if (resolved.inode.type === 'directory') {
      if (normalizedFlags.includes('WRITE') || normalizedFlags.includes('W') || normalizedFlags.includes('APPEND')) {
        return createFsError(FileSystemErrorCode.EISDIR, `Cannot open directory "${path}" for writing`);
      }
    }

    const fd = this.nextFd++;
    const desc = new FileDescriptor({
      fd,
      inodeId: resolved.inode.inodeId,
      pid,
      flags: normalizedFlags,
      position: 0
    });

    this.descriptors.set(fd, desc);
    resolved.inode.openCount++;

    this.emitEvent(FileSystemEvents.FILE_OPENED, {
      fd,
      inodeId: resolved.inode.inodeId,
      path: resolved.normalizedPath,
      pid
    });

    return {
      success: true,
      data: {
        fd,
        inodeId: resolved.inode.inodeId,
        path: resolved.normalizedPath,
        position: 0,
        flags: desc.flags,
        open: true // Compatibility alias
      }
    };
  }

  /**
   * Close an open file descriptor. Validates PID ownership.
   * @param {number} fd
   * @param {number|string|null} [pid=null]
   * @returns {{ success: boolean, data?: Object, error?: string, code?: string }}
   */
  close(fd, pid = null) {
    const desc = this.descriptors.get(fd);
    if (!desc) {
      return createFsError(FileSystemErrorCode.EBADF, `Invalid file descriptor ${fd}`);
    }

    if (pid !== null && desc.pid !== null && desc.pid !== pid) {
      return createFsError(FileSystemErrorCode.EBADF, `File descriptor ${fd} does not belong to process ${pid}`);
    }

    const inode = this.inodes.get(desc.inodeId);
    if (inode) {
      inode.openCount = Math.max(0, inode.openCount - 1);
    }

    this.descriptors.delete(fd);

    this.emitEvent(FileSystemEvents.FILE_CLOSED, {
      fd,
      inodeId: desc.inodeId,
      pid: desc.pid
    });

    return {
      success: true,
      data: { fd, closed: true }
    };
  }

  /**
   * Seek descriptor position. Validates PID ownership.
   * @param {number} fd
   * @param {number} offset
   * @param {'SET'|'CUR'|'END'} [whence='SET']
   * @param {number|string|null} [pid=null]
   * @returns {{ success: boolean, data?: Object, error?: string, code?: string }}
   */
  seek(fd, offset, whence = 'SET', pid = null) {
    const desc = this.descriptors.get(fd);
    if (!desc) {
      return createFsError(FileSystemErrorCode.EBADF, `Invalid file descriptor ${fd}`);
    }

    if (pid !== null && desc.pid !== null && desc.pid !== pid) {
      return createFsError(FileSystemErrorCode.EBADF, `File descriptor ${fd} does not belong to process ${pid}`);
    }

    const inode = this.inodes.get(desc.inodeId);
    const fileSize = inode ? inode.size : 0;

    try {
      const newPos = desc.seek(offset, whence, fileSize);
      return { success: true, data: { fd, position: newPos } };
    } catch (err) {
      return createFsError(FileSystemErrorCode.EINVAL, err.message);
    }
  }

  /**
   * Read from file descriptor. Validates PID ownership and permissions.
   * @param {number} fd
   * @param {number} [length=null]
   * @param {number|string|null} [pid=null]
   * @returns {{ success: boolean, data?: Object, error?: string, code?: string }}
   */
  readFd(fd, length = null, pid = null) {
    const desc = this.descriptors.get(fd);
    if (!desc) {
      return createFsError(FileSystemErrorCode.EBADF, `Invalid file descriptor ${fd}`);
    }

    if (pid !== null && desc.pid !== null && desc.pid !== pid) {
      return createFsError(FileSystemErrorCode.EBADF, `File descriptor ${fd} does not belong to process ${pid}`);
    }

    if (!desc.canRead()) {
      return createFsError(FileSystemErrorCode.EACCES, `File descriptor ${fd} is not open for reading`);
    }

    const inode = this.inodes.get(desc.inodeId);
    if (!inode || inode.type !== 'file') {
      return createFsError(FileSystemErrorCode.EBADF, `Inode ${desc.inodeId} is not a valid readable file`);
    }

    const bytes = inode.read(desc.position, length);
    const readLength = bytes.length;
    desc.advance(readLength);

    return {
      success: true,
      data: {
        fd,
        bytes,
        bytesRead: readLength,
        position: desc.position
      }
    };
  }

  /**
   * Write to file descriptor. Validates PID ownership and permissions.
   * @param {number} fd
   * @param {string|Array<number>} data
   * @param {number|string|null} [pid=null]
   * @returns {{ success: boolean, data?: Object, error?: string, code?: string }}
   */
  writeFd(fd, data, pid = null) {
    const desc = this.descriptors.get(fd);
    if (!desc) {
      return createFsError(FileSystemErrorCode.EBADF, `Invalid file descriptor ${fd}`);
    }

    if (pid !== null && desc.pid !== null && desc.pid !== pid) {
      return createFsError(FileSystemErrorCode.EBADF, `File descriptor ${fd} does not belong to process ${pid}`);
    }

    if (!desc.canWrite()) {
      return createFsError(FileSystemErrorCode.EACCES, `File descriptor ${fd} is not open for writing`);
    }

    const inode = this.inodes.get(desc.inodeId);
    if (!inode || inode.type !== 'file') {
      return createFsError(FileSystemErrorCode.EBADF, `Inode ${desc.inodeId} is not a valid writable file`);
    }

    const writeOffset = desc.isAppend() ? inode.size : desc.position;
    const writeLen = data.length;

    // Call internal write on inode with isPartial = true
    const res = this.write(this.getPathByInodeId(inode.inodeId), data, writeOffset, true);
    if (!res.success) {
      return res;
    }

    desc.position = writeOffset + writeLen;

    return {
      success: true,
      data: {
        fd,
        bytesWritten: writeLen,
        position: desc.position
      }
    };
  }

  /**
   * Close all file descriptors owned by a specific process.
   * Invoked on PROCESS_TERMINATED. Files remain intact.
   * @param {number|string} pid
   * @returns {number} count of closed descriptors
   */
  closeProcessDescriptors(pid) {
    if (pid === undefined || pid === null) return 0;

    let closedCount = 0;
    for (const [fd, desc] of this.descriptors.entries()) {
      if (desc.pid === pid) {
        const inode = this.inodes.get(desc.inodeId);
        if (inode) {
          inode.openCount = Math.max(0, inode.openCount - 1);
        }
        this.descriptors.delete(fd);
        closedCount++;
      }
    }
    return closedCount;
  }

  /* =========================================================================
   * Storage Block Management
   * ========================================================================= */

  /**
   * Allocate contiguous or indexed blocks from available pool.
   * @param {number} count
   * @returns {Array<Object>|null}
   */
  allocateStorageBlocks(count) {
    if (count <= 0) return [];
    if (count > this.freeBlocks) return null;

    const allocated = [];
    for (const [sector, b] of this.blockMap.entries()) {
      if (b.status === 'free') {
        allocated.push({
          block: sector,
          cylinder: sector % 200,
          sector
        });
        if (allocated.length === count) break;
      }
    }

    if (allocated.length < count) {
      return null;
    }

    return allocated;
  }

  /**
   * Release storage blocks back to available pool.
   * @param {Array<Object>} blocks
   */
  releaseStorageBlocks(blocks) {
    if (!Array.isArray(blocks)) return;
    const disk = this.storage;

    for (const b of blocks) {
      const mapEntry = this.blockMap.get(b.block);
      if (mapEntry) {
        mapEntry.status = 'free';
        mapEntry.inodeId = null;
      }
      if (disk) {
        disk.write(b.block, null);
      }
    }
  }

  /**
   * Free all storage blocks for an Inode.
   * @param {File} file
   */
  freeInodeStorageBlocks(file) {
    if (Array.isArray(file.storageBlocks) && file.storageBlocks.length > 0) {
      this.releaseStorageBlocks(file.storageBlocks);
      file.storageBlocks = [];
    }
  }

  /**
   * Find absolute path for an Inode by traversing parents up to root.
   * @param {number} inodeId
   * @returns {string}
   */
  getPathByInodeId(inodeId) {
    if (inodeId === this.rootInodeId) return '/';

    const parts = [];
    let curr = this.inodes.get(inodeId);

    while (curr && curr.inodeId !== this.rootInodeId) {
      parts.unshift(curr.name);
      curr = curr.parentId ? this.inodes.get(curr.parentId) : null;
    }

    return `/${parts.join('/')}`;
  }

  /**
   * Safe, immutable snapshot of the filesystem state.
   * @returns {Object}
   */
  getState() {
    const inodesObj = {};
    for (const [id, inode] of this.inodes.entries()) {
      inodesObj[id] = inode.stat();
    }

    const descriptorsObj = {};
    for (const [fd, desc] of this.descriptors.entries()) {
      descriptorsObj[fd] = desc.toJSON();
    }

    return JSON.parse(JSON.stringify({
      mounted: this.status === FileSystemStatus.READY || this.status === FileSystemStatus.MOUNTED,
      name: 'AdityyaFS',
      version: SUPERBLOCK_VERSION,
      status: this.status,
      currentPath: this.currentPath,
      rootInodeId: this.rootInodeId,
      nextInodeId: this.nextInodeId,
      nextFd: this.nextFd,
      totalBlocks: this.dataBlocksCount,
      allocatedBlocks: this.allocatedBlocks,
      freeBlocks: this.freeBlocks,
      blockSize: this.blockSize,
      statistics: {
        totalInodes: this.inodes.size,
        fileCount: Array.from(this.inodes.values()).filter(i => i.type === 'file').length,
        dirCount: Array.from(this.inodes.values()).filter(i => i.type === 'directory').length,
        openDescriptors: this.descriptors.size,
        usedBytes: this.allocatedBlocks * this.blockSize,
        freeBytes: this.freeBlocks * this.blockSize
      },
      inodes: inodesObj,
      descriptors: descriptorsObj
    }));
  }

  emitEvent(eventName, payload) {
    if (this.events && typeof this.events.emit === 'function') {
      this.events.emit(eventName, payload);
    }
  }
}
