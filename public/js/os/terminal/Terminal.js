/**
 * public/js/os/terminal/Terminal.js
 * Terminal application controller for AdityyaOS.
 * Coordinates Shell, TerminalView, TerminalState, simulated ProcessManager identity,
 * and WindowManager window lifecycle.
 */

import { TerminalState } from './TerminalState.js';
import { Shell } from './Shell.js';
import { TerminalView } from './TerminalView.js';
import { TerminalEvents } from './TerminalEvents.js';
import { WindowEvents } from '../shell/WindowEvents.js';

export class Terminal {
  /**
   * @param {Object} [options]
   * @param {import('../kernel/Kernel.js').Kernel} [options.kernel]
   * @param {import('../shell/WindowManager.js').WindowManager} [options.windowManager]
   * @param {string} [options.windowId]
   * @param {TerminalState} [options.state]
   */
  constructor(options = {}) {
    this.kernel = options.kernel || null;
    this.windowManager = options.windowManager || null;
    this.windowId = options.windowId || null;

    // 1. Process integration: create simulated process in existing ProcessManager
    this.pid = null;
    if (this.kernel?.processManager && typeof this.kernel.processManager.createProcess === 'function') {
      try {
        const proc = this.kernel.processManager.createProcess({
          name: 'terminal',
          priority: 1,
          memoryRequired: 32
        });
        this.pid = proc?.data?.pid ?? proc?.pid ?? null;
      } catch (err) {
        console.warn('[Terminal] Could not create simulated process:', err);
      }
    }

    // 2. Initialize state with PID
    this.state = options.state || new TerminalState({ pid: this.pid });
    if (this.pid !== null) {
      this.state.pid = this.pid;
    }

    this.api = options.api || null;

    // 3. Initialize Shell
    this.shell = new Shell({
      kernel: this.kernel,
      state: this.state,
      terminal: this,
      api: this.api
    });

    // 4. Initialize TerminalView
    this.view = new TerminalView({
      shell: this.shell,
      state: this.state,
      onExit: () => this.exit()
    });

    this.isDestroyed = false;
    this.windowCleanup = null;

    // 5. Connect WindowManager close lifecycle
    this.bindWindowLifecycle();

    // 6. Emit TERMINAL_OPENED
    this.shell.emitEvent(TerminalEvents.TERMINAL_OPENED, {
      windowId: this.windowId,
      pid: this.pid
    });
  }

  /**
   * Bind WindowManager window close event to ensure clean session teardown.
   */
  bindWindowLifecycle() {
    if (this.windowManager?.events && this.windowId) {
      const onWindowClosed = ({ windowId }) => {
        if (windowId === this.windowId) {
          this.destroy();
        }
      };

      this.windowManager.events.on(WindowEvents.WINDOW_CLOSED, onWindowClosed);
      this.windowCleanup = () => {
        this.windowManager?.events?.off(WindowEvents.WINDOW_CLOSED, onWindowClosed);
        this.windowCleanup = null;
      };
    }
  }

  /**
   * Set associated window ID after creation if not provided in constructor.
   * @param {string} windowId
   */
  setWindowId(windowId) {
    this.windowId = windowId;
    if (this.windowCleanup) {
      this.windowCleanup();
    }
    this.bindWindowLifecycle();
  }

  /**
   * Execute a command line directly through the shell.
   * @param {string} commandLine
   * @returns {Promise<Object>}
   */
  async execute(commandLine) {
    const res = await this.shell.execute(commandLine);
    if (this.state?.lines) {
      this.state.lines.push(`$ ${commandLine}`);
      if (res.stdout) this.state.lines.push(res.stdout);
      if (res.stderr) this.state.lines.push(res.stderr);
    }
    return res;
  }

  /**
   * Get an immutable snapshot of terminal state.
   * @returns {Object}
   */
  getState() {
    return this.state.getState();
  }

  get lines() {
    return this.state?.lines || [];
  }

  /**
   * Create an application view adapter for WindowManager / Window mounting.
   * @returns {{ mount: Function, unmount: Function }}
   */
  createView() {
    return {
      mount: (container) => {
        const winEl = typeof container?.closest === 'function'
          ? container.closest('.os-window')
          : container?.parentElement;
        const winId = winEl?.getAttribute?.('data-window-id');
        if (winId) {
          this.setWindowId(winId);
        }
        this.view.mount(container);
      },
      unmount: () => {
        this.destroy();
      }
    };
  }

  /**
   * Exit the terminal session:
   * Closes window in WindowManager (if attached) and destroys terminal session.
   */
  exit() {
    if (this.isDestroyed) return;

    if (this.windowManager && this.windowId) {
      try {
        this.windowManager.closeWindow(this.windowId);
      } catch (err) {
        console.warn('[Terminal] Error closing window on exit:', err);
      }
    }

    this.destroy();
  }

  /**
   * Destroy terminal session, terminate simulated process, and clean up listeners.
   */
  destroy() {
    if (this.isDestroyed) return;
    this.isDestroyed = true;

    if (typeof this.windowCleanup === 'function') {
      this.windowCleanup();
    }

    // Terminate simulated process in ProcessManager
    if (this.pid !== null && this.kernel?.processManager) {
      try {
        this.kernel.processManager.terminateProcess(this.pid);
      } catch (err) {
        console.warn('[Terminal] Error terminating process:', err);
      }
      this.pid = null;
      this.state.pid = null;
    }

    // Emit TERMINAL_CLOSED before tearing down shell
    if (this.shell) {
      this.shell.emitEvent(TerminalEvents.TERMINAL_CLOSED, {
        windowId: this.windowId
      });
    }

    // Destroy view and shell
    if (this.view) {
      this.view.destroy();
      this.view = null;
    }

    if (this.shell) {
      this.shell.destroy();
      this.shell = null;
    }

    this.state.isActive = false;
    this.kernel = null;
    this.windowManager = null;
  }
}
