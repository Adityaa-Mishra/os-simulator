/**
 * public/js/os/ai-tools/AIDeveloperTools.js
 * Allowlisted virtual developer tools for AdityyaOS Terminal AI assistance.
 * Strictly operates on simulated AdityyaFS and OS state through the controlled AdityyaOSAPI facade.
 * Never accesses host filesystem, real terminals, or external network.
 */

import { PathResolver } from '../filesystem/PathResolver.js';

export class AIDeveloperTools {
  /**
   * @param {import('../api/AdityyaOSAPI.js').AdityyaOSAPI} api
   */
  constructor(api) {
    if (!api) {
      throw new TypeError('AIDeveloperTools requires an AdityyaOSAPI instance');
    }
    this.api = api;
  }

  /**
   * Resolve a path relative to cwd.
   * @private
   * @param {string} targetPath
   * @param {string} [cwd='/home/user']
   * @returns {string}
   */
  _resolvePath(targetPath, cwd = '/home/user') {
    if (!targetPath || typeof targetPath !== 'string') return cwd;
    const userHome = `/home/${this.api.context?.username || 'user'}`;
    let p = targetPath.trim();
    if (p === '~') p = userHome;
    else if (p.startsWith('~/')) p = userHome + p.slice(1);
    return PathResolver.normalize(p, cwd);
  }

  /**
   * Check if a virtual file or directory exists.
   * @param {Object} options
   * @param {string} options.path
   * @param {string} [options.cwd='/home/user']
   * @returns {Promise<{ exists: boolean, path: string, type: string|null }>}
   */
  async exists({ path, cwd = '/home/user' }) {
    const fullPath = this._resolvePath(path, cwd);
    try {
      const stat = await this.api.fs.stat(fullPath);
      return {
        exists: true,
        path: fullPath,
        type: stat.isDirectory ? 'directory' : 'file'
      };
    } catch {
      return {
        exists: false,
        path: fullPath,
        type: null
      };
    }
  }

  /**
   * Get metadata for a virtual path.
   * @param {Object} options
   * @param {string} options.path
   * @param {string} [options.cwd='/home/user']
   * @returns {Promise<Object>}
   */
  async stat({ path, cwd = '/home/user' }) {
    const fullPath = this._resolvePath(path, cwd);
    const stat = await this.api.fs.stat(fullPath);
    return {
      path: fullPath,
      type: stat.isDirectory ? 'directory' : 'file',
      size: stat.size,
      inode: stat.inode,
      permissions: stat.permissions,
      modified: stat.mtime || stat.modified
    };
  }

  /**
   * List entries in a virtual directory (bounded to max 50 items).
   * @param {Object} options
   * @param {string} [options.path='/home/user']
   * @param {string} [options.cwd='/home/user']
   * @returns {Promise<{ path: string, entries: Array<string>, details: Array<Object>, totalCount: number, truncated: boolean }>}
   */
  async listDirectory({ path = '/home/user', cwd = '/home/user' } = {}) {
    const fullPath = this._resolvePath(path, cwd);
    const rawEntries = await this.api.fs.listDirectory(fullPath);
    const MAX_ITEMS = 50;
    const truncated = rawEntries.length > MAX_ITEMS;
    const boundedEntries = rawEntries.slice(0, MAX_ITEMS);

    const names = [];
    const detailed = [];
    for (const entry of boundedEntries) {
      const name = typeof entry === 'string' ? entry : entry.name;
      const type = typeof entry === 'object' ? entry.type : 'file';
      const size = typeof entry === 'object' ? (entry.size || 0) : 0;
      names.push(name);
      detailed.push({ name, type, size });
    }

    return {
      path: fullPath,
      entries: names,
      details: detailed,
      totalCount: rawEntries.length,
      truncated
    };
  }

  /**
   * Read content of a virtual file (bounded to max 4096 bytes).
   * @param {Object} options
   * @param {string} options.path
   * @param {string} [options.cwd='/home/user']
   * @returns {Promise<{ path: string, content: string, truncated: boolean, size: number }>}
   */
  async readFile({ path, cwd = '/home/user' }) {
    const fullPath = this._resolvePath(path, cwd);
    const fileRes = await this.api.fs.readFile(fullPath);
    const rawContent = (typeof fileRes === 'string') ? fileRes : (fileRes?.content ?? '');

    const MAX_BYTES = 4096;
    const truncated = rawContent.length > MAX_BYTES;
    const boundedContent = truncated ? rawContent.slice(0, MAX_BYTES) : rawContent;

    return {
      path: fullPath,
      content: boundedContent,
      truncated,
      size: typeof fileRes?.size === 'number' ? fileRes.size : rawContent.length
    };
  }

  /**
   * Search for text within virtual files in AdityyaFS (bounded depth 4, max 50 matches).
   * @param {Object} options
   * @param {string} options.query
   * @param {string} [options.path='/home/user']
   * @param {string} [options.cwd='/home/user']
   * @returns {Promise<{ query: string, matches: Array<Object>, totalMatches: number, truncated: boolean }>}
   */
  async searchText({ query, path = '/home/user', cwd = '/home/user' }) {
    if (!query || typeof query !== 'string') {
      throw new TypeError('searchText requires a query string');
    }

    const startPath = this._resolvePath(path, cwd);
    const matches = [];
    const MAX_MATCHES = 50;
    const MAX_DEPTH = 4;

    const traverse = async (currentPath, depth) => {
      if (depth > MAX_DEPTH || matches.length >= MAX_MATCHES) return;

      let entries = [];
      try {
        entries = await this.api.fs.listDirectory(currentPath);
      } catch {
        return;
      }

      for (const entry of entries) {
        if (matches.length >= MAX_MATCHES) break;
        const entryName = typeof entry === 'string' ? entry : entry.name;
        const entryType = typeof entry === 'object' ? entry.type : null;
        const entryPath = PathResolver.normalize(entryName, currentPath);

        if (entryType === 'directory') {
          await traverse(entryPath, depth + 1);
        } else {
          try {
            const fileRes = await this.api.fs.readFile(entryPath);
            const content = typeof fileRes === 'string' ? fileRes : (fileRes?.content ?? '');
            if (content.includes(query)) {
              const lines = content.split('\n');
              for (let lineNum = 0; lineNum < lines.length; lineNum++) {
                if (lines[lineNum].includes(query)) {
                  matches.push({
                    path: entryPath,
                    file: entryPath,
                    line: lineNum + 1,
                    snippet: lines[lineNum].trim().slice(0, 100)
                  });
                  if (matches.length >= MAX_MATCHES) break;
                }
              }
            }
          } catch {
            // Ignore unreadable files
          }
        }
      }
    };

    await traverse(startPath, 0);

    return {
      query,
      matches,
      totalMatches: matches.length,
      truncated: matches.length >= MAX_MATCHES
    };
  }

  /**
   * Find virtual files matching name or substring pattern (bounded depth 4, max 50 matches).
   * @param {Object} options
   * @param {string} [options.pattern]
   * @param {string} [options.name]
   * @param {string} [options.path='/home/user']
   * @param {string} [options.cwd='/home/user']
   * @returns {Promise<{ pattern: string, files: Array<string>, matches: Array<string>, totalMatches: number, truncated: boolean }>}
   */
  async findFiles({ pattern, name, path = '/home/user', cwd = '/home/user' }) {
    const rawPattern = pattern || name;
    if (!rawPattern || typeof rawPattern !== 'string') {
      throw new TypeError('findFiles requires a pattern or name string');
    }

    const startPath = this._resolvePath(path, cwd);
    const matches = [];
    const MAX_MATCHES = 50;
    const MAX_DEPTH = 4;

    let regex;
    try {
      const escaped = rawPattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.');
      regex = new RegExp(escaped, 'i');
    } catch {
      regex = new RegExp(rawPattern, 'i');
    }

    const traverse = async (currentPath, depth) => {
      if (depth > MAX_DEPTH || matches.length >= MAX_MATCHES) return;

      let entries = [];
      try {
        entries = await this.api.fs.listDirectory(currentPath);
      } catch {
        return;
      }

      for (const entry of entries) {
        if (matches.length >= MAX_MATCHES) break;
        const entryName = typeof entry === 'string' ? entry : entry.name;
        const entryType = typeof entry === 'object' ? entry.type : null;
        const entryPath = PathResolver.normalize(entryName, currentPath);

        if (regex.test(entryName) || regex.test(entryPath)) {
          matches.push(entryPath);
        }

        if (entryType === 'directory') {
          await traverse(entryPath, depth + 1);
        }
      }
    };

    await traverse(startPath, 0);

    return {
      pattern: rawPattern,
      files: matches,
      matches,
      totalMatches: matches.length,
      truncated: matches.length >= MAX_MATCHES
    };
  }

  /**
   * Get virtual filesystem usage stats.
   * @returns {Promise<Object>}
   */
  async getUsage() {
    return this.api.fs.getUsage();
  }

  /**
   * Get system information.
   * @returns {Promise<Object>}
   */
  async getSystemInfo() {
    return this.api.system.getInfo();
  }

  /**
   * List running processes.
   * @returns {Promise<Array<Object>>}
   */
  async listProcesses() {
    return this.api.process.list();
  }

  /**
   * Inspect virtual network interfaces.
   * @returns {Promise<Array<Object>>}
   */
  async getNetworkInterfaces() {
    if (this.api.network && typeof this.api.network.getInterfaces === 'function') {
      return this.api.network.getInterfaces();
    }
    return [];
  }

  /**
   * Resolve DNS hostname in simulated network.
   * @param {string} hostname
   * @returns {Promise<string>}
   */
  async resolveDns(hostname) {
    if (this.api.network && typeof this.api.network.resolveDns === 'function') {
      return this.api.network.resolveDns(hostname);
    }
    throw new Error('Network subsystem not available in this context');
  }

  /**
   * Execute approved mutating filesystem write (create/overwrite file).
   * @param {Object} options
   * @param {string} options.path
   * @param {string} options.content
   * @param {string} [options.cwd='/home/user']
   * @returns {Promise<Object>}
   */
  async executeCreateFile({ path, content, cwd = '/home/user' }) {
    const fullPath = this._resolvePath(path, cwd);
    await this.api.fs.writeFile(fullPath, String(content ?? ''));
    const stat = await this.api.fs.stat(fullPath);
    return {
      operation: 'createFile',
      path: fullPath,
      size: stat.size,
      success: true
    };
  }

  /**
   * Execute approved mutating filesystem directory creation.
   * @param {Object} options
   * @param {string} options.path
   * @param {string} [options.cwd='/home/user']
   * @returns {Promise<Object>}
   */
  async executeCreateDirectory({ path, cwd = '/home/user' }) {
    const fullPath = this._resolvePath(path, cwd);
    await this.api.fs.createDirectory(fullPath);
    return {
      operation: 'createDirectory',
      path: fullPath,
      success: true
    };
  }

  /**
   * Execute approved mutating filesystem rename/move using genuine api.fs.rename().
   * NEVER emulated with read/write/delete.
   * @param {Object} options
   * @param {string} options.oldPath
   * @param {string} options.newPath
   * @param {string} [options.cwd='/home/user']
   * @returns {Promise<Object>}
   */
  async executeRename({ oldPath, newPath, cwd = '/home/user' }) {
    const fullOldPath = this._resolvePath(oldPath, cwd);
    const fullNewPath = this._resolvePath(newPath, cwd);
    await this.api.fs.rename(fullOldPath, fullNewPath);
    return {
      operation: 'rename',
      from: fullOldPath,
      to: fullNewPath,
      success: true
    };
  }

  /**
   * Execute approved mutating filesystem file deletion.
   * @param {Object} options
   * @param {string} options.path
   * @param {string} [options.cwd='/home/user']
   * @returns {Promise<Object>}
   */
  async executeDeleteFile({ path, cwd = '/home/user' }) {
    const fullPath = this._resolvePath(path, cwd);
    await this.api.fs.deleteFile(fullPath);
    return {
      operation: 'deleteFile',
      path: fullPath,
      success: true
    };
  }

  /**
   * Execute an allowlisted developer tool by name.
   * @param {string} toolName
   * @param {Object} [args={}]
   * @returns {Promise<any>}
   */
  async execute(toolName, args = {}) {
    switch (toolName) {
      case 'filesystem.exists':
        return this.exists(args);
      case 'filesystem.stat':
        return this.stat(args);
      case 'filesystem.listDirectory':
        return this.listDirectory(args);
      case 'filesystem.readFile':
        return this.readFile(args);
      case 'filesystem.searchText':
        return this.searchText(args);
      case 'filesystem.findFiles':
        return this.findFiles(args);
      case 'filesystem.getUsage':
        return this.getUsage(args);
      case 'filesystem.createFile':
        return this.executeCreateFile(args);
      case 'filesystem.createDirectory':
        return this.executeCreateDirectory(args);
      case 'filesystem.rename':
        return this.executeRename(args);
      case 'filesystem.deleteFile':
        return this.executeDeleteFile(args);
      case 'system.getInfo':
        return this.getSystemInfo(args);
      case 'process.list':
        return this.listProcesses(args);
      case 'network.getInterfaces':
        return this.getNetworkInterfaces(args);
      case 'network.resolveDns':
        return this.resolveDns(args.hostname || args.domain);
      default:
        throw new Error(`Unknown or disallowed tool: ${toolName}`);
    }
  }
}
