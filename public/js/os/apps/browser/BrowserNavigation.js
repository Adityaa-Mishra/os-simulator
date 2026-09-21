/**
 * public/js/os/apps/browser/BrowserNavigation.js
 * URL parsing, normalization, and internal adityya:// and chrome:// protocol rendering.
 * Features native Additya Search engine to prevent iframe CORS/X-Frame-Options blocks.
 */

import { BrowserSettingsView } from './BrowserSettingsView.js';

export class BrowserNavigation {
  /**
   * Normalize an input URL or search query.
   * @param {string} input
   * @param {string} [searchEngine='Additya']
   * @returns {string}
   */
  static normalizeUrl(input, searchEngine = 'Additya') {
    if (!input || typeof input !== 'string') {
      return 'adityya://newtab';
    }

    const trimmed = input.trim();

    // 1. Internal protocols: adityya://, additya://, and chrome://
    if (trimmed.startsWith('adityya://') || trimmed.startsWith('additya://') || trimmed.startsWith('chrome://')) {
      return trimmed;
    }

    // 2. Absolute web URL
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      return trimmed;
    }

    // 3. Localhost pattern
    if (/^localhost(:[0-9]+)?(\/.*)?$/.test(trimmed)) {
      return `http://${trimmed}`;
    }

    // 4. Domain pattern (e.g. example.com, sub.domain.org)
    if (/^([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(\/.*)?$/.test(trimmed)) {
      return `https://${trimmed}`;
    }

    // 5. Search query: route to native Additya Search (or requested engine)
    const query = encodeURIComponent(trimmed);
    const engine = (searchEngine || 'Additya').toLowerCase();

    if (engine === 'google') {
      return `https://www.google.com/search?q=${query}`;
    } else if (engine === 'duckduckgo') {
      return `https://duckduckgo.com/?q=${query}`;
    } else if (engine === 'bing') {
      return `https://www.bing.com/search?q=${query}`;
    }

    // Default: Native Additya Search (never blocked by X-Frame-Options)
    return `adityya://search?q=${query}`;
  }

  /**
   * Check if a URL is an internal Additya or Chrome browser page.
   * @param {string} url
   * @returns {boolean}
   */
  static isInternalUrl(url) {
    return typeof url === 'string' && (
      url.startsWith('adityya://') ||
      url.startsWith('additya://') ||
      url.startsWith('chrome://')
    );
  }

  /**
   * Render internal adityya:// or chrome:// HTML content.
   * @param {string} url
   * @param {Object} [context={}]
   * @returns {string} HTML string
   */
  static renderInternalPage(url, context = {}) {
    return BrowserSettingsView.renderPage(url, context);
  }

  // Backward compatibility static methods
  static renderWelcomePage(context = {}) {
    return BrowserSettingsView.renderNewTab(context);
  }

  static renderBookmarksPage(context = {}) {
    return BrowserSettingsView.renderBookmarks(context);
  }

  static renderHistoryPage(context = {}) {
    return BrowserSettingsView.renderHistory(context);
  }

  static renderAboutPage(context = {}) {
    return BrowserSettingsView.renderVersion(context);
  }
}
