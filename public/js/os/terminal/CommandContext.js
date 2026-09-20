/**
 * public/js/os/terminal/CommandContext.js
 * Controlled execution context passed to command handlers.
 * Exposes only safe OS abstractions (FileSystemManager, SystemCalls, Shell state)
 * without exposing raw StorageDevice, inode maps, or DOM elements.
 */

import { PathResolver } from '../filesystem/PathResolver.js';

export class CommandContext {
  /**
   * @param {Object} options
   * @param {import('../kernel/Kernel.js').Kernel} options.kernel
   * @param {import('./Shell.js').Shell} options.shell
   * @param {import('./TerminalState.js').TerminalState} options.state
   */
  constructor({ kernel, shell, state }) {
    this.kernel = kernel;
    this.shell = shell;
    this.state = state;
    this.fs = kernel?.fileSystemManager || null;
  }

  get cwd() {
    return this.state.cwd;
  }

  set cwd(val) {
    this.state.cwd = val;
  }

  get username() {
    return this.state.username;
  }

  get hostname() {
    return this.state.hostname;
  }

  get pid() {
    return this.state.pid;
  }

  /**
   * Safe syscall dispatcher interface.
   * @param {string} callName
   * @param {Object} [payload]
   * @returns {Object}
   */
  syscall(callName, payload) {
    if (!this.kernel?.syscall) {
      throw new Error('Kernel syscall dispatcher not available');
    }
    return this.kernel.syscall(callName, payload);
  }

  /**
   * Resolve a path respecting ~, relative to cwd, ., and ..
   * Uses PathResolver.normalize to prevent duplicate path engines.
   * @param {string} targetPath
   * @returns {string}
   */
  resolvePath(targetPath) {
    if (!targetPath || typeof targetPath !== 'string') {
      return this.cwd;
    }

    let p = targetPath.trim();
    if (p === '~') {
      p = '/home/user';
    } else if (p.startsWith('~/')) {
      p = '/home/user' + p.slice(1);
    }

    return PathResolver.normalize(p, this.cwd);
  }
}
