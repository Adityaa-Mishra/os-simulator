/**
 * public/js/os/kernel/FileSystemManager.js
 * Subsystem manager adapting the AdityyaOS Filesystem Subsystem (AdityyaFS) to the Kernel.
 * Preserves 100% of existing VFS methods and contracts while adding Phase 17 OS filesystem capabilities.
 */

import { FileSystem } from '../filesystem/FileSystem.js';
import { OSEvents } from './OSEventEmitter.js';

export class FileSystemManager {
  /**
   * @param {Object} kernel
   * @param {Object} [config=null]
   */
  constructor(kernel, config = null) {
    this.kernel = kernel;
    this.config = config || {};

    this.fs = new FileSystem({
      kernel: this.kernel,
      storageDevice: this.kernel?.hardware?.getDevice('disk0'),
      events: this.kernel?.events,
      totalBlocks: this.config.totalBlocks || 32,
      blockSize: this.config.blockSize || 64
    });

    // Subscribed to process termination for automatic descriptor cleanup
    if (this.kernel && this.kernel.events) {
      this.kernel.events.on(OSEvents.PROCESS_TERMINATED, ({ pid }) => {
        this.closeProcessDescriptors(pid);
      });
    }

    this.syncState();
  }

  /**
   * Mount filesystem and restore persistent state.
   * @returns {{ success: boolean, status: string, error?: string }}
   */
  mount() {
    const res = this.fs.mount();
    this.syncState();
    return res;
  }

  /**
   * Unmount filesystem cleanly.
   * @returns {{ success: boolean, status: string }}
   */
  unmount() {
    const res = this.fs.unmount();
    this.syncState();
    return res;
  }

  /**
   * Explicit destructive format: recreates pristine filesystem hierarchy.
   * @returns {{ success: boolean, status: string }}
   */
  format() {
    const res = this.fs.format();
    this.syncState();
    return res;
  }

  /**
   * Reset file system runtime state without destroying persistent storage.
   * @param {Array<Object>|null} [initialNodes=null]
   * @param {Object|null} [config=null]
   */
  reset(initialNodes = null, config = null) {
    this.fs.reset();
    this.syncState();
  }

  /**
   * Sync allocation and path state with central kernel state.
   */
  syncState() {
    if (this.kernel && this.kernel.state) {
      this.kernel.state.filesystem = {
        currentPath: this.fs.currentPath,
        totalBlocks: this.fs.totalBlocks,
        allocatedBlocks: this.fs.allocatedBlocks,
        freeBlocks: this.fs.freeBlocks
      };
    }
  }

  /**
   * Create a new file.
   * @param {string} path
   * @param {number|string|Array<number>} [size=0]
   * @param {string} [permissions='rw-']
   * @returns {{ success: boolean, data?: Object, error?: string }}
   */
  createFile(path, size = 0, permissions = 'rw-') {
    const res = this.fs.create(path, size, permissions);
    this.syncState();
    return res;
  }

  /**
   * Read file metadata and content.
   * @param {string} path
   * @returns {{ success: boolean, data?: Object, error?: string }}
   */
  readFile(path) {
    return this.fs.read(path);
  }

  /**
   * Modify file size or overwrite content.
   * @param {string} path
   * @param {number|string|Array<number>} newSizeOrData
   * @returns {{ success: boolean, data?: Object, error?: string }}
   */
  writeFile(path, newSizeOrData) {
    const res = this.fs.write(path, newSizeOrData, 0, false);
    this.syncState();
    return res;
  }

  /**
   * Append content to a file.
   * @param {string} path
   * @param {string|Array<number>} content
   * @returns {{ success: boolean, data?: Object, error?: string }}
   */
  appendFile(path, content) {
    const res = this.fs.append(path, content);
    this.syncState();
    return res;
  }

  /**
   * Delete a closed file.
   * @param {string} path
   * @returns {{ success: boolean, data?: Object, error?: string }}
   */
  deleteFile(path) {
    const res = this.fs.delete(path);
    this.syncState();
    return res;
  }

  /**
   * Create a directory.
   * @param {string} path
   * @param {string} [permissions='rwx']
   * @returns {{ success: boolean, data?: Object, error?: string }}
   */
  createDirectory(path, permissions = 'rwx') {
    const res = this.fs.mkdir(path, permissions);
    this.syncState();
    return res;
  }

  /**
   * Remove an empty directory.
   * @param {string} path
   * @param {Object} [options={ recursive: false }]
   * @returns {{ success: boolean, data?: Object, error?: string }}
   */
  deleteDirectory(path, options = { recursive: false }) {
    const res = this.fs.rmdir(path, options);
    this.syncState();
    return res;
  }

  /**
   * Open a file for access.
   * @param {string} path
   * @param {Array<string>|string} [flags=['READ']]
   * @param {number|string|null} [pid=null]
   * @returns {{ success: boolean, data?: Object, error?: string }}
   */
  openFile(path, flags = ['READ'], pid = null) {
    return this.fs.open(path, flags, pid);
  }

  /**
   * Close an open file by path or descriptor.
   * @param {string|number} pathOrFd
   * @param {number|string|null} [pid=null]
   * @returns {{ success: boolean, data?: Object, error?: string }}
   */
  closeFile(pathOrFd, pid = null) {
    if (typeof pathOrFd === 'number') {
      return this.fs.close(pathOrFd, pid);
    }

    // If path, find descriptor(s) for path
    const resolved = this.fs.resolvePath(pathOrFd);
    if (!resolved.found || !resolved.inode) {
      return { success: false, error: `File "${pathOrFd}" not found` };
    }

    let closedAny = false;
    for (const [fd, desc] of this.fs.descriptors.entries()) {
      if (desc.inodeId === resolved.inode.inodeId) {
        this.fs.close(fd, pid);
        closedAny = true;
      }
    }

    if (!closedAny) {
      // If openCount was > 0 without descriptor
      resolved.inode.openCount = 0;
    }

    return { success: true, data: { path: resolved.normalizedPath, closed: true } };
  }

  /**
   * Change current working directory.
   * @param {string} path
   * @returns {{ success: boolean, data?: Object, error?: string }}
   */
  changeDirectory(path) {
    const resolved = this.fs.resolvePath(path);
    if (!resolved.found || !resolved.inode) {
      return { success: false, error: `Directory "${path}" not found` };
    }
    if (resolved.inode.type !== 'directory') {
      return { success: false, error: `Path "${path}" is not a directory` };
    }

    this.fs.currentPath = resolved.normalizedPath;
    this.syncState();
    return { success: true, data: { currentPath: this.fs.currentPath } };
  }

  /**
   * List directory contents.
   * @param {string} [path='.']
   * @returns {{ success: boolean, data?: Array<Object>, error?: string }}
   */
  listDirectory(path = '.') {
    const res = this.fs.readdir(path);
    if (!res.success) {
      return res;
    }
    return { success: true, data: res.data.entries };
  }

  /**
   * Get metadata / stat for any path.
   * @param {string} path
   * @returns {{ success: boolean, data?: Object, error?: string }}
   */
  getMetadata(path) {
    const res = this.fs.stat(path);
    if (!res.success) {
      return res;
    }

    const stat = res.data;
    return {
      success: true,
      data: {
        id: `${stat.type === 'directory' ? 'dir' : 'file'}_${stat.inodeId}`,
        inodeId: stat.inodeId,
        name: stat.name,
        type: stat.type,
        size: stat.size || 0,
        permissions: stat.permissions,
        blocks: stat.storageBlocks ? stat.storageBlocks.map(b => b.block) : [],
        open: stat.openCount > 0,
        createdAt: stat.createdAt,
        modifiedAt: stat.modifiedAt
      }
    };
  }

  /**
   * Get stat metadata.
   * @param {string} path
   * @returns {{ success: boolean, data?: Object, error?: string }}
   */
  stat(path) {
    return this.fs.stat(path);
  }

  /**
   * Check if a path exists.
   * @param {string} path
   * @returns {boolean}
   */
  exists(path) {
    return this.fs.exists(path);
  }

  /**
   * Rename / Move a file or directory.
   * @param {string} sourcePath
   * @param {string} destPath
   * @returns {{ success: boolean, data?: Object, error?: string }}
   */
  rename(sourcePath, destPath) {
    return this.fs.rename(sourcePath, destPath);
  }

  /**
   * Copy a file.
   * @param {string} sourcePath
   * @param {string} destPath
   * @returns {{ success: boolean, data?: Object, error?: string }}
   */
  copy(sourcePath, destPath) {
    const res = this.fs.copy(sourcePath, destPath);
    this.syncState();
    return res;
  }

  /**
   * Open a file descriptor.
   * @param {string} path
   * @param {Array<string>|string} [flags=['READ']]
   * @param {number|string|null} [pid=null]
   * @returns {{ success: boolean, data?: Object, error?: string }}
   */
  openDescriptor(path, flags = ['READ'], pid = null) {
    return this.fs.open(path, flags, pid);
  }

  /**
   * Close a file descriptor with PID validation.
   * @param {number} fd
   * @param {number|string|null} [pid=null]
   * @returns {{ success: boolean, data?: Object, error?: string }}
   */
  closeDescriptor(fd, pid = null) {
    return this.fs.close(fd, pid);
  }

  /**
   * Read from file descriptor with PID validation.
   * @param {number} fd
   * @param {number} [length=null]
   * @param {number|string|null} [pid=null]
   * @returns {{ success: boolean, data?: Object, error?: string }}
   */
  readDescriptor(fd, length = null, pid = null) {
    return this.fs.readFd(fd, length, pid);
  }

  /**
   * Write to file descriptor with PID validation.
   * @param {number} fd
   * @param {string|Array<number>} data
   * @param {number|string|null} [pid=null]
   * @returns {{ success: boolean, data?: Object, error?: string }}
   */
  writeDescriptor(fd, data, pid = null) {
    const res = this.fs.writeFd(fd, data, pid);
    this.syncState();
    return res;
  }

  /**
   * Seek descriptor with PID validation.
   * @param {number} fd
   * @param {number} offset
   * @param {'SET'|'CUR'|'END'} [whence='SET']
   * @param {number|string|null} [pid=null]
   * @returns {{ success: boolean, data?: Object, error?: string }}
   */
  seekDescriptor(fd, offset, whence = 'SET', pid = null) {
    return this.fs.seek(fd, offset, whence, pid);
  }

  /**
   * Close all descriptors owned by a process.
   * @param {number|string} pid
   * @returns {number} count of closed descriptors
   */
  closeProcessDescriptors(pid) {
    return this.fs.closeProcessDescriptors(pid);
  }

  /**
   * Get current working directory.
   * @returns {string}
   */
  getCurrentPath() {
    return this.fs.currentPath;
  }

  /**
   * Get safe snapshot of filesystem state.
   * @returns {Object}
   */
  getState() {
    return this.fs.getState();
  }
}
