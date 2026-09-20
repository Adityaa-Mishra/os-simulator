/**
 * public/js/os/apps/terminal/TerminalApp.js
 * Native AdityyaOS Terminal Application.
 * Cleanly wraps Phase 18 Terminal & Shell architecture into the native application model.
 * Strictly operates with minimal permissions (NO events.emit).
 */

import { Terminal } from '../../terminal/Terminal.js';
import { PackagePermissions } from '../../packages/PackagePermissions.js';

export class TerminalApp {
  /**
   * @param {import('../../api/AdityyaOSAPI.js').AdityyaOSAPI} api
   * @param {HTMLElement} container
   * @param {Object} [options={}]
   */
  constructor(api, container, options = {}) {
    this.api = api;
    this.container = container;
    this.options = options;

    this.terminal = null;
    this.view = null;

    this.init();
  }

  init() {
    const kernel = this.api.system?._kernel || null;
    const windowManager = this.api.window?._windowManager || null;
    const windowId = this.api.window?.getId() || null;

    this.terminal = new Terminal({
      kernel,
      windowManager,
      windowId,
      api: this.api
    });

    this.view = this.terminal.createView();
    if (this.container && this.view) {
      this.container.innerHTML = '<div class="os-terminal-app"></div>';
      const wrapper = this.container.querySelector('.os-terminal-app');
      this.view.mount(wrapper || this.container);
    }
  }

  get shell() {
    return this.terminal?.shell || null;
  }

  async executeCommand(cmd) {
    if (this.terminal?.shell) {
      const res = await this.terminal.shell.execute(cmd);
      if (this.terminal.state?.lines) {
        this.terminal.state.lines.push(`$ ${cmd}`);
        if (res.stdout) this.terminal.state.lines.push(res.stdout);
        if (res.stderr) this.terminal.state.lines.push(res.stderr);
      }
      return res;
    }
  }

  destroy() {
    if (this.terminal) {
      try {
        this.terminal.destroy();
      } catch (err) {
        console.error('[TerminalApp] Error destroying terminal:', err);
      }
      this.terminal = null;
    }
    if (this.container) {
      this.container.innerHTML = '';
      this.container = null;
    }
  }
}

/**
 * Standard AdityyaOS Application Definition for Terminal.
 * Strictly grants only genuine permissions (NO events.emit).
 */
export const terminalApp = Object.freeze({
  id: 'terminal',
  name: 'Terminal',
  version: '1.0.0',
  description: 'Command-line shell & system calls',
  icon: '💻',
  category: 'System',
  permissions: Object.freeze([
    PackagePermissions.FILESYSTEM_READ,
    PackagePermissions.FILESYSTEM_WRITE,
    PackagePermissions.PROCESS_SELF,
    PackagePermissions.WINDOW_CONTROL,
    PackagePermissions.APPLICATION_LIFECYCLE
  ]),
  window: Object.freeze({
    title: 'Terminal',
    icon: '💻',
    width: 640,
    height: 440,
    singleton: true
  }),
  entry: (api, container, options) => {
    const app = new TerminalApp(api, container, options);
    return {
      destroy: () => app.destroy()
    };
  }
});
