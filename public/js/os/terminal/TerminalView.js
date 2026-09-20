/**
 * public/js/os/terminal/TerminalView.js
 * DOM rendering and user interaction layer for the AdityyaOS Terminal.
 * Connects prompt, input, history navigation, keyboard shortcuts, and auto-scrolling output.
 */

import { escapeHtml } from '../../utils/sanitize.js';
import { TerminalEvents } from './TerminalEvents.js';

export class TerminalView {
  /**
   * @param {Object} options
   * @param {import('./Shell.js').Shell} options.shell
   * @param {import('./TerminalState.js').TerminalState} options.state
   * @param {Function} [options.onExit] - Callback when exit command is executed
   */
  constructor({ shell, state, onExit = null }) {
    this.shell = shell;
    this.state = state;
    this.onExit = onExit;

    this.container = null;
    this.element = null;
    this.outputEl = null;
    this.promptEl = null;
    this.inputEl = null;

    this.listeners = [];
  }

  /**
   * Format display path for the prompt (e.g. /home/user -> ~).
   * @param {string} cwd
   * @returns {string}
   */
  formatDisplayPath(cwd) {
    if (!cwd) return '/';
    if (cwd === '/home/user') return '~';
    if (cwd.startsWith('/home/user/')) {
      return '~' + cwd.slice('/home/user'.length);
    }
    return cwd;
  }

  /**
   * Render HTML for the prompt string.
   * @returns {string}
   */
  getPromptHtml() {
    const user = escapeHtml(this.state.username || 'user');
    const host = escapeHtml(this.state.hostname || 'adityyaos');
    const path = escapeHtml(this.formatDisplayPath(this.state.cwd));
    return `<span class="term-prompt-user">${user}@${host}</span>:<span class="term-prompt-path">${path}</span><span class="term-prompt-char">$ </span>`;
  }

  /**
   * Get plain text for prompt string.
   * @returns {string}
   */
  getPromptText() {
    const user = this.state.username || 'user';
    const host = this.state.hostname || 'adityyaos';
    const path = this.formatDisplayPath(this.state.cwd);
    return `${user}@${host}:${path}$ `;
  }

  /**
   * Mount the terminal UI into a container element.
   * @param {HTMLElement} container
   */
  mount(container) {
    this.container = container;

    this.element = document.createElement('div');
    this.element.className = 'os-terminal';
    this.element.setAttribute('role', 'application');
    this.element.setAttribute('aria-label', 'AdityyaOS Terminal');

    this.element.innerHTML = `
      <div class="os-terminal-body">
        <div class="os-terminal-output" role="log" aria-live="polite"></div>
        <div class="os-terminal-input-row">
          <span class="os-terminal-prompt">${this.getPromptHtml()}</span>
          <div class="os-terminal-input-wrapper">
            <input type="text" class="os-terminal-input" spellcheck="false" autocomplete="off" autocapitalize="off" aria-label="Terminal input" />
          </div>
        </div>
      </div>
    `;

    this.outputEl = this.element.querySelector('.os-terminal-output');
    this.promptEl = this.element.querySelector('.os-terminal-prompt');
    this.inputEl = this.element.querySelector('.os-terminal-input');

    this.bindEvents();
    this.container.appendChild(this.element);

    // Initial greeting line
    this.appendOutput('AdityyaOS Terminal (v1.0.0)\nType "help" for available commands.\n', 'system');

    // Auto focus
    setTimeout(() => this.focus(), 10);
  }

  /**
   * Bind keyboard and pointer interaction listeners.
   */
  bindEvents() {
    // Click on terminal focuses input
    const onClick = () => this.focus();
    this.element.addEventListener('click', onClick);
    this.listeners.push(() => this.element?.removeEventListener('click', onClick));

    // Keyboard navigation and execution
    const onKeyDown = async (e) => {
      // Ctrl + C: cancel current input
      if (e.ctrlKey && (e.key === 'c' || e.key === 'C')) {
        e.preventDefault();
        const currentVal = this.inputEl.value;
        this.appendCommandLine(this.getPromptText(), currentVal + '^C');
        this.inputEl.value = '';
        this.shell.history.resetNavigation();
        this.scrollToBottom();
        return;
      }

      // Ctrl + L: clear screen
      if (e.ctrlKey && (e.key === 'l' || e.key === 'L')) {
        e.preventDefault();
        this.clearOutput();
        return;
      }

      // Enter: execute command
      if (e.key === 'Enter') {
        e.preventDefault();
        const commandLine = this.inputEl.value;
        const promptText = this.getPromptText();

        this.appendCommandLine(promptText, commandLine);
        this.inputEl.value = '';

        if (commandLine.trim()) {
          const result = await this.shell.execute(commandLine);

          if (result.clear) {
            this.clearOutput();
          } else {
            if (result.stdout) {
              this.appendOutput(result.stdout, 'stdout');
            }
            if (result.stderr) {
              this.appendOutput(result.stderr, 'stderr');
            }
          }

          if (result.exit) {
            if (typeof this.onExit === 'function') {
              this.onExit();
            }
            return;
          }
        }

        this.updatePrompt();
        this.scrollToBottom();
        return;
      }

      // ArrowUp: history backwards
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prevCmd = this.shell.history.navigateUp(this.inputEl.value);
        if (prevCmd !== undefined) {
          this.inputEl.value = prevCmd;
          // Move cursor to end
          setTimeout(() => {
            if (this.inputEl) {
              this.inputEl.selectionStart = this.inputEl.selectionEnd = this.inputEl.value.length;
            }
          }, 0);
        }
        return;
      }

      // ArrowDown: history forwards
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const nextCmd = this.shell.history.navigateDown();
        if (nextCmd !== undefined) {
          this.inputEl.value = nextCmd;
        }
        return;
      }

      // Tab: autocomplete
      if (e.key === 'Tab') {
        e.preventDefault();
        this.handleTabCompletion();
      }
    };

    this.inputEl.addEventListener('keydown', onKeyDown);
    this.listeners.push(() => this.inputEl?.removeEventListener('keydown', onKeyDown));
  }

  /**
   * Basic tab auto-completion for command names and files in cwd.
   */
  handleTabCompletion() {
    const val = this.inputEl.value;
    const parts = val.split(/\s+/);

    // If single token, complete command name
    if (parts.length <= 1) {
      const prefix = (parts[0] || '').toLowerCase();
      const allCmds = this.shell.registry.getAll().map(c => c.name);
      const matches = allCmds.filter(cmd => cmd.startsWith(prefix));

      if (matches.length === 1) {
        this.inputEl.value = matches[0] + ' ';
      } else if (matches.length > 1) {
        this.appendCommandLine(this.getPromptText(), val);
        this.appendOutput(matches.join('  '), 'system');
        this.scrollToBottom();
      }
      return;
    }

    // Path completion for second or later token
    const lastToken = parts[parts.length - 1];
    if (this.shell.fs && typeof this.shell.fs.listDirectory === 'function') {
      const listRes = this.shell.fs.listDirectory(this.state.cwd);
      const entries = Array.isArray(listRes?.data)
        ? listRes.data
        : (Array.isArray(listRes?.data?.entries) ? listRes.data.entries : []);

      if (entries.length > 0) {
        const matches = entries
          .map(e => e.name)
          .filter(name => name.startsWith(lastToken));

        if (matches.length === 1) {
          parts[parts.length - 1] = matches[0];
          this.inputEl.value = parts.join(' ') + ' ';
        } else if (matches.length > 1) {
          this.appendCommandLine(this.getPromptText(), val);
          this.appendOutput(matches.join('  '), 'system');
          this.scrollToBottom();
        }
      }
    }
  }

  /**
   * Focus the terminal input field.
   */
  focus() {
    if (this.inputEl && typeof this.inputEl.focus === 'function') {
      this.inputEl.focus();
    }
  }

  /**
   * Update the prompt element to reflect current working directory.
   */
  updatePrompt() {
    if (this.promptEl) {
      this.promptEl.innerHTML = this.getPromptHtml();
    }
  }

  /**
   * Append a submitted command line to the output log.
   * @param {string} promptText
   * @param {string} commandText
   */
  appendCommandLine(promptText, commandText) {
    if (!this.outputEl) return;
    const lineEl = document.createElement('div');
    lineEl.className = 'os-terminal-history-line';
    lineEl.innerHTML = `<span class="term-prompt">${escapeHtml(promptText)}</span><span class="term-cmd">${escapeHtml(commandText)}</span>`;
    this.outputEl.appendChild(lineEl);
  }

  /**
   * Append standard output or error text to the output log.
   * @param {string} text
   * @param {'stdout'|'stderr'|'system'} [type='stdout']
   */
  appendOutput(text, type = 'stdout') {
    if (!this.outputEl || !text) return;
    const outEl = document.createElement('div');
    outEl.className = `os-terminal-line os-terminal-${type}`;
    outEl.textContent = text;
    this.outputEl.appendChild(outEl);
  }

  /**
   * Clear the terminal output log.
   */
  clearOutput() {
    if (this.outputEl) {
      this.outputEl.innerHTML = '';
    }
    this.shell.emitEvent(TerminalEvents.TERMINAL_CLEARED);
  }

  /**
   * Automatically scroll the output container to the bottom.
   */
  scrollToBottom() {
    if (this.outputEl) {
      this.outputEl.scrollTop = this.outputEl.scrollHeight;
    }
  }

  /**
   * Unmount the view and clean up all listeners.
   */
  unmount() {
    this.destroy();
  }

  /**
   * Destroy DOM and listeners.
   */
  destroy() {
    for (const cleanup of this.listeners) {
      try {
        cleanup();
      } catch (err) {
        console.error('[TerminalView] Cleanup error:', err);
      }
    }
    this.listeners = [];

    if (this.element && this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }

    this.element = null;
    this.outputEl = null;
    this.promptEl = null;
    this.inputEl = null;
    this.container = null;
  }
}
