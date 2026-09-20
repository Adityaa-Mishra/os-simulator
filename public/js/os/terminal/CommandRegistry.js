/**
 * public/js/os/terminal/CommandRegistry.js
 * Modular registry of AdityyaOS shell commands.
 * Provides lookup, dispatch, and metadata inspection for all built-in commands.
 */

import * as helpCmd from './commands/help.js';
import * as pwdCmd from './commands/pwd.js';
import * as cdCmd from './commands/cd.js';
import * as lsCmd from './commands/ls.js';
import * as mkdirCmd from './commands/mkdir.js';
import * as rmdirCmd from './commands/rmdir.js';
import * as touchCmd from './commands/touch.js';
import * as catCmd from './commands/cat.js';
import * as echoCmd from './commands/echo.js';
import * as rmCmd from './commands/rm.js';
import * as cpCmd from './commands/cp.js';
import * as mvCmd from './commands/mv.js';
import * as clearCmd from './commands/clear.js';
import * as historyCmd from './commands/history.js';
import * as whoamiCmd from './commands/whoami.js';
import * as unameCmd from './commands/uname.js';
import * as exitCmd from './commands/exit.js';

export class CommandRegistry {
  constructor() {
    this.commands = new Map();
    this.registerDefaults();
  }

  /**
   * Register a command with its handler and metadata.
   * @param {string} name
   * @param {Function} handler
   * @param {Object} [metadata={}]
   */
  register(name, handler, metadata = {}) {
    if (!name || typeof name !== 'string') {
      throw new TypeError('Command name must be a non-empty string');
    }
    if (typeof handler !== 'function') {
      throw new TypeError(`Command handler for "${name}" must be a function`);
    }

    const normalizedName = name.toLowerCase().trim();
    this.commands.set(normalizedName, {
      name: normalizedName,
      handler,
      metadata: {
        name: normalizedName,
        description: metadata.description || '',
        usage: metadata.usage || normalizedName,
        supportedFlags: Array.isArray(metadata.supportedFlags) ? [...metadata.supportedFlags] : []
      }
    });
  }

  /**
   * Get a command definition by name.
   * @param {string} name
   * @returns {{ name: string, handler: Function, metadata: Object }|null}
   */
  get(name) {
    if (!name || typeof name !== 'string') return null;
    return this.commands.get(name.toLowerCase().trim()) || null;
  }

  /**
   * Check if a command is registered.
   * @param {string} name
   * @returns {boolean}
   */
  has(name) {
    if (!name || typeof name !== 'string') return false;
    return this.commands.has(name.toLowerCase().trim());
  }

  /**
   * Get all registered command descriptors.
   * @returns {Array<{ name: string, handler: Function, metadata: Object }>}
   */
  getAll() {
    return Array.from(this.commands.values());
  }

  /**
   * Register the 17 standard AdityyaOS shell commands.
   */
  registerDefaults() {
    const defaults = [
      helpCmd,
      pwdCmd,
      cdCmd,
      lsCmd,
      mkdirCmd,
      rmdirCmd,
      touchCmd,
      catCmd,
      echoCmd,
      rmCmd,
      cpCmd,
      mvCmd,
      clearCmd,
      historyCmd,
      whoamiCmd,
      unameCmd,
      exitCmd
    ];

    for (const cmd of defaults) {
      if (cmd.metadata?.name && typeof cmd.handler === 'function') {
        this.register(cmd.metadata.name, cmd.handler, cmd.metadata);
      }
    }
  }
}
