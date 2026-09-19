/**
 * Hash-based Single Page Application Router.
 * Manages view lifecycles (mount and unmount), URL synchronization, and active navigation states.
 */

const notFoundView = {
  mount(container) {
    container.innerHTML = `
      <div class="empty-state" style="max-width: 520px; margin: var(--space-10) auto;">
        <div class="empty-state-icon">🧭</div>
        <div class="empty-state-title">Page Not Found (404)</div>
        <div class="empty-state-desc">
          The requested route or simulation module does not exist or has been relocated.
        </div>
        <a href="#/" class="btn btn-primary btn-sm">Return to Dashboard</a>
      </div>
    `;
  },
  unmount() {}
};

export class Router {
  constructor(containerElement) {
    this.container = containerElement;
    this.routes = new Map();
    this.currentRoute = null;
    this.currentView = null;

    // Listen for URL hash changes
    window.addEventListener('hashchange', () => this.handleRouting());
  }

  /**
   * Register a route path with a view object
   * @param {string} path - e.g. '#/', '#/cpu', '#/memory'
   * @param {object} view - Object with mount(container) and unmount() methods
   * @param {object} metadata - Title, category, etc.
   */
  register(path, view, metadata = {}) {
    this.routes.set(path, { view, metadata });
    return this;
  }

  /**
   * Navigate programmatically to a path
   */
  navigate(path) {
    window.location.hash = path;
  }

  /**
   * Handle route resolution and component lifecycle transition
   */
  async handleRouting() {
    const hash = window.location.hash || '#/';
    let route = this.routes.get(hash);

    // Dynamic matching fallback for sub-routes like #/learn/:module
    if (!route && hash.startsWith('#/learn/')) {
      const mod = hash.split('/')[2];
      const directRoute = this.routes.get(`#/learn/${mod}`);
      if (directRoute) {
        route = directRoute;
      }
    }

    let isNotFound = false;
    if (!route) {
      route = { view: notFoundView, metadata: { title: 'Page Not Found' } };
      isNotFound = true;
    }

    // Call unmount on the previous view to clean up listeners and animations
    if (this.currentView && typeof this.currentView.unmount === 'function') {
      try {
        this.currentView.unmount();
      } catch (err) {
        console.error('[Router] Error during view unmount:', err);
      }
    }

    this.currentRoute = hash;
    this.currentView = route.view;

    // Update active nav links in the sidebar
    this.updateActiveNavLinks(hash, isNotFound);

    // Render the new view
    if (this.container && typeof route.view.mount === 'function') {
      this.container.innerHTML = '';
      try {
        await route.view.mount(this.container, route.metadata);
      } catch (err) {
        console.error('[Router] Error during view mount:', err);
        this.container.innerHTML = `
          <div class="card" style="margin: var(--space-6); border-color: var(--accent-danger);">
            <div class="card-body">
              <h3 style="color: var(--accent-danger); font-weight: 700;">Failed to load view</h3>
              <p style="color: var(--text-secondary); margin-top: var(--space-2); font-size: var(--text-sm);">${err.message}</p>
              <a href="#/" class="btn btn-secondary btn-sm" style="margin-top: var(--space-4);">➔ Return to Dashboard</a>
            </div>
          </div>
        `;
      }
    }
  }

  /**
   * Highlight the active link in the navigation menu
   */
  updateActiveNavLinks(activeHash, isNotFound = false) {
    const navLinks = document.querySelectorAll('.nav-item');
    navLinks.forEach(link => {
      const href = link.getAttribute('href');
      if (!isNotFound && (href === activeHash || (href === '#/learn' && activeHash.startsWith('#/learn')))) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });

    // Update breadcrumb current text
    const breadcrumbEl = document.getElementById('breadcrumb-current');
    if (breadcrumbEl) {
      if (isNotFound) {
        breadcrumbEl.textContent = 'Not Found';
      } else {
        const routeInfo = this.routes.get(activeHash);
        breadcrumbEl.textContent = routeInfo?.metadata?.title || (activeHash.startsWith('#/learn') ? 'Learning' : 'Dashboard');
      }
    }
  }

  /**
   * Initialize routing on app load
   */
  init() {
    this.handleRouting();
  }
}
