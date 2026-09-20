/**
 * desktopView
 * SPA View Controller for the AdityyaOS Desktop Environment (#/os).
 * Adapts the DesktopEnvironment coordinator to the Router lifecycle contract.
 */

import { DesktopEnvironment } from '../os/desktop/DesktopEnvironment.js';

export const desktopView = {
  desktop: null,

  /**
   * Mount the desktop view into the router container.
   * @param {HTMLElement} container
   * @param {Object} [metadata]
   */
  async mount(container, metadata = {}) {
    // Hide standard sidebar and topbar when in full OS desktop mode for immersion
    document.body.classList.add('os-desktop-active');

    this.desktop = new DesktopEnvironment();
    await this.desktop.mount(container);
  },

  /**
   * Unmount the desktop view and clean up all resources.
   */
  unmount() {
    document.body.classList.remove('os-desktop-active');

    if (this.desktop) {
      this.desktop.unmount();
      this.desktop = null;
    }
  }
};
