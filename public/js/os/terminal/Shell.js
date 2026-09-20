/**
 * public/js/os/terminal/Shell.js
 * Central shell engine for AdityyaOS.
 * Orchestrates parsing, command lookup, execution, redirection, history, and cwd state.
 */

import { ShellParser } from './ShellParser.js';
import { CommandRegistry } from './CommandRegistry.js';
import { CommandHistory } from './CommandHistory.js';
import { CommandContext } from './CommandContext.js';
import { TerminalState } from './TerminalState.js';
import { TerminalEvents } from './TerminalEvents.js';
import { PathResolver } from '../filesystem/PathResolver.js';
import { AITerminalHandler } from './AITerminalHandler.js';
import { AdityyaOSAPI } from '../api/AdityyaOSAPI.js';
import { APIContext } from '../api/APIContext.js';

export class Shell {
  /**
   * @param {Object} options
   * @param {import('../kernel/Kernel.js').Kernel} options.kernel
   * @param {TerminalState} [options.state]
   * @param {CommandHistory} [options.history]
   * @param {CommandRegistry} [options.registry]
   * @param {Object} [options.terminal] - Reference to Terminal controller
   * @param {import('../api/AdityyaOSAPI.js').AdityyaOSAPI} [options.api]
   */
  constructor({ kernel, state = null, history = null, registry = null, terminal = null, api = null }) {
    this.kernel = kernel;
    this.state = state || new TerminalState();
    this.history = history || new CommandHistory();
    this.registry = registry || new CommandRegistry();
    this.terminal = terminal;

    this.fs = kernel?.fileSystemManager || null;
    this.events = kernel?.events || null;

    this.api = api || terminal?.api || (kernel ? new AdityyaOSAPI({
      kernel,
      context: new APIContext({
        appId: 'terminal',
        instanceId: `term-${this.state.pid || 1}`,
        pid: this.state.pid || 1
      })
    }) : null);

    this.aiHandler = this.api ? new AITerminalHandler({
      api: this.api,
      shell: this,
      pid: this.state.pid || 1
    }) : null;

    // Verify initial cwd exists; fallback to '/' if /home/user is missing
    this.verifyInitialCwd();
  }

  /**
   * Verify and adjust initial cwd if default does not exist.
   */
  verifyInitialCwd() {
    if (this.fs && typeof this.fs.exists === 'function') {
      if (!this.fs.exists(this.state.cwd)) {
        this.state.cwd = '/';
      }
    }
  }

  /**
   * Helper to emit terminal events via kernel event emitter.
   * @param {string} event
   * @param {Object} payload
   */
  emitEvent(event, payload = {}) {
    if (this.events && typeof this.events.emit === 'function') {
      this.events.emit(event, {
        ...payload,
        pid: this.state.pid,
        cwd: this.state.cwd,
        timestamp: Date.now()
      });
    }
  }

  /**
   * Resolve a path respecting ~, relative to cwd, ., .., and root clamping.
   * @param {string} targetPath
   * @returns {string}
   */
  resolvePath(targetPath) {
    if (!targetPath || typeof targetPath !== 'string') {
      return this.state.cwd;
    }

    let p = targetPath.trim();
    if (p === '~') {
      p = '/home/user';
    } else if (p.startsWith('~/')) {
      p = '/home/user' + p.slice(1);
    }

    return PathResolver.normalize(p, this.state.cwd);
  }

  /**
   * Set current working directory and emit change event.
   * @param {string} newPath
   */
  setCwd(newPath) {
    const prev = this.state.cwd;
    this.state.cwd = newPath;
    this.emitEvent(TerminalEvents.TERMINAL_DIRECTORY_CHANGED, {
      from: prev,
      to: newPath
    });
  }

  /**
   * Execute a raw command line string.
   * @param {string} inputLine
   * @returns {Promise<{
   *   success: boolean,
   *   stdout: string,
   *   stderr: string,
   *   clear?: boolean,
   *   exit?: boolean,
   *   exitCode: number
   * }>}
   */
  async execute(inputLine) {
    const raw = typeof inputLine === 'string' ? inputLine : '';
    const trimmed = raw.trim();

    if (!trimmed) {
      return {
        success: true,
        stdout: '',
        stderr: '',
        exitCode: 0
      };
    }

    // Check if AI handler is awaiting user confirmation for a pending mutating action
    if (this.aiHandler && this.aiHandler.isAwaitingConfirmation()) {
      const confirmRes = await this.aiHandler.handleConfirmation(trimmed);
      if (confirmRes.handled) {
        this.history.add(raw);
        this.state.history = this.history.getAll();
        this.state.exitCode = confirmRes.exitCode || 0;
        return {
          success: confirmRes.exitCode === 0,
          stdout: confirmRes.stdout || '',
          stderr: confirmRes.stderr || '',
          exitCode: confirmRes.exitCode || 0
        };
      }
    }

    // Check if input is an AI command (AI: or AI:-)
    if (this.aiHandler && this.aiHandler.isAICommand(trimmed)) {
      this.history.add(raw);
      this.state.history = this.history.getAll();
      this.emitEvent(TerminalEvents.TERMINAL_COMMAND, {
        raw,
        command: 'ai',
        args: [trimmed]
      });

      const aiRes = await this.aiHandler.execute(trimmed);
      this.state.exitCode = aiRes.exitCode || 0;
      this.emitEvent(TerminalEvents.TERMINAL_COMMAND_COMPLETED, {
        command: 'ai',
        exitCode: aiRes.exitCode || 0
      });
      return {
        success: aiRes.exitCode === 0,
        stdout: aiRes.stdout || '',
        stderr: aiRes.stderr || '',
        exitCode: aiRes.exitCode || 0
      };
    }

    // 1. Parse command line
    const parsed = ShellParser.parse(raw);

    if (parsed.error) {
      this.state.exitCode = parsed.exitCode;
      this.emitEvent(TerminalEvents.TERMINAL_ERROR, { error: parsed.error });
      return {
        success: false,
        stdout: '',
        stderr: parsed.error,
        exitCode: parsed.exitCode
      };
    }

    if (!parsed.command) {
      return {
        success: true,
        stdout: '',
        stderr: '',
        exitCode: 0
      };
    }

    // 2. Add to history
    this.history.add(raw);
    this.state.history = this.history.getAll();

    this.emitEvent(TerminalEvents.TERMINAL_COMMAND, {
      raw,
      command: parsed.command,
      args: parsed.args
    });

    // 3. Lookup command
    const cmdDef = this.registry.get(parsed.command);
    if (!cmdDef) {
      const err = `${parsed.command}: command not found`;
      this.state.exitCode = 127;
      this.emitEvent(TerminalEvents.TERMINAL_ERROR, { error: err });
      this.emitEvent(TerminalEvents.TERMINAL_COMMAND_COMPLETED, {
        command: parsed.command,
        exitCode: 127
      });
      return {
        success: false,
        stdout: '',
        stderr: err,
        exitCode: 127
      };
    }

    // 4. Create execution context and execute command
    const context = new CommandContext({
      kernel: this.kernel,
      shell: this,
      state: this.state
    });

    let cmdResult;
    try {
      cmdResult = await cmdDef.handler(parsed.positionalArgs, parsed.flags, context);
    } catch (err) {
      cmdResult = {
        stdout: '',
        stderr: `${parsed.command}: internal execution error: ${err.message}`,
        exitCode: 1
      };
    }

    // 5. Handle Redirection (> or >>)
    if (parsed.redirection) {
      // If command itself failed, return failure without writing redirected output
      if (cmdResult.exitCode !== 0) {
        this.state.exitCode = cmdResult.exitCode;
        this.emitEvent(TerminalEvents.TERMINAL_COMMAND_COMPLETED, {
          command: parsed.command,
          exitCode: cmdResult.exitCode
        });
        return {
          success: false,
          stdout: '',
          stderr: cmdResult.stderr,
          exitCode: cmdResult.exitCode
        };
      }

      if (!this.fs) {
        this.state.exitCode = 1;
        const err = `bash: ${parsed.redirection.target}: filesystem unavailable`;
        return { success: false, stdout: '', stderr: err, exitCode: 1 };
      }

      const targetPath = this.resolvePath(parsed.redirection.target);
      const textToWrite = cmdResult.stdout !== undefined ? String(cmdResult.stdout) : '';

      if (parsed.redirection.type === '>') {
        // Overwrite or create target file
        const statRes = this.fs.stat(targetPath);
        if (statRes.success && statRes.data) {
          if (statRes.data.type === 'directory') {
            const err = `bash: ${parsed.redirection.target}: Is a directory`;
            this.state.exitCode = 1;
            return { success: false, stdout: '', stderr: err, exitCode: 1 };
          }
          const writeRes = this.fs.writeFile(targetPath, textToWrite);
          if (!writeRes.success) {
            const err = `bash: ${parsed.redirection.target}: ${writeRes.error || 'Failed to write file'}`;
            this.state.exitCode = 1;
            return { success: false, stdout: '', stderr: err, exitCode: 1 };
          }
        } else {
          const createRes = this.fs.createFile(targetPath, textToWrite);
          if (!createRes.success) {
            const err = `bash: ${parsed.redirection.target}: ${createRes.error || 'Failed to create file'}`;
            this.state.exitCode = 1;
            return { success: false, stdout: '', stderr: err, exitCode: 1 };
          }
        }
      } else if (parsed.redirection.type === '>>') {
        // Append or create target file
        const statRes = this.fs.stat(targetPath);
        if (statRes.success && statRes.data) {
          if (statRes.data.type === 'directory') {
            const err = `bash: ${parsed.redirection.target}: Is a directory`;
            this.state.exitCode = 1;
            return { success: false, stdout: '', stderr: err, exitCode: 1 };
          }
          // Append with newline separator if file already contains content
          const readRes = this.fs.readFile(targetPath);
          const existing = readRes.success && readRes.data?.content !== undefined ? String(readRes.data.content) : '';
          const appendedContent = existing.length > 0 ? `\n${textToWrite}` : textToWrite;

          const appendRes = this.fs.appendFile(targetPath, appendedContent);
          if (!appendRes.success) {
            const err = `bash: ${parsed.redirection.target}: ${appendRes.error || 'Failed to append to file'}`;
            this.state.exitCode = 1;
            return { success: false, stdout: '', stderr: err, exitCode: 1 };
          }
        } else {
          const createRes = this.fs.createFile(targetPath, textToWrite);
          if (!createRes.success) {
            const err = `bash: ${parsed.redirection.target}: ${createRes.error || 'Failed to create file'}`;
            this.state.exitCode = 1;
            return { success: false, stdout: '', stderr: err, exitCode: 1 };
          }
        }
      }

      this.state.exitCode = 0;
      this.emitEvent(TerminalEvents.TERMINAL_COMMAND_COMPLETED, {
        command: parsed.command,
        exitCode: 0
      });

      return {
        success: true,
        stdout: '',
        stderr: '',
        exitCode: 0
      };
    }

    // 6. Normal execution result (no redirection)
    this.state.exitCode = typeof cmdResult.exitCode === 'number' ? cmdResult.exitCode : 0;
    this.emitEvent(TerminalEvents.TERMINAL_COMMAND_COMPLETED, {
      command: parsed.command,
      exitCode: this.state.exitCode
    });

    return {
      success: this.state.exitCode === 0,
      stdout: cmdResult.stdout !== undefined ? String(cmdResult.stdout) : '',
      stderr: cmdResult.stderr !== undefined ? String(cmdResult.stderr) : '',
      clear: Boolean(cmdResult.clear),
      exit: Boolean(cmdResult.exit),
      exitCode: this.state.exitCode
    };
  }

  /**
   * Clean up shell resources.
   */
  destroy() {
    if (this.aiHandler) {
      this.aiHandler.destroy();
      this.aiHandler = null;
    }
    this.api = null;
    this.kernel = null;
    this.fs = null;
    this.events = null;
    this.terminal = null;
  }
}
