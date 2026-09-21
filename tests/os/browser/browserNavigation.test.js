/**
 * tests/os/browser/browserNavigation.test.js
 * Automated tests for BrowserNavigation URL normalization and internal adityya:// page rendering.
 */

import { describe, it, expect } from 'vitest';
import { BrowserNavigation } from '../../../public/js/os/apps/browser/BrowserNavigation.js';

describe('Phase 24: Browser Navigation & URL Handling', () => {
  describe('URL Normalization', () => {
    it('preserves valid http and https URLs', () => {
      expect(BrowserNavigation.normalizeUrl('http://example.com')).toBe('http://example.com');
      expect(BrowserNavigation.normalizeUrl('https://example.com/path?query=1')).toBe('https://example.com/path?query=1');
    });

    it('preserves valid adityya:// protocol URLs', () => {
      expect(BrowserNavigation.normalizeUrl('adityya://newtab')).toBe('adityya://newtab');
      expect(BrowserNavigation.normalizeUrl('adityya://version')).toBe('adityya://version');
      expect(BrowserNavigation.normalizeUrl('adityya://bookmarks')).toBe('adityya://bookmarks');
      expect(BrowserNavigation.normalizeUrl('adityya://history')).toBe('adityya://history');
      expect(BrowserNavigation.normalizeUrl('adityya://help')).toBe('adityya://help');
    });

    it('prepends https:// to domain-like inputs', () => {
      expect(BrowserNavigation.normalizeUrl('example.com')).toBe('https://example.com');
      expect(BrowserNavigation.normalizeUrl('sub.domain.org/test')).toBe('https://sub.domain.org/test');
    });

    it('handles localhost with http://', () => {
      expect(BrowserNavigation.normalizeUrl('localhost:3000')).toBe('http://localhost:3000');
    });

    it('treats space-separated or non-domain inputs as search queries', () => {
      const normalized = BrowserNavigation.normalizeUrl('adityya os simulator');
      expect(normalized).toContain('adityya://search?q=adityya');
    });
  });

  describe('Internal adityya:// Pages Rendering', () => {
    it('renders adityya://newtab with search box and quick links', () => {
      const html = BrowserNavigation.renderInternalPage('adityya://newtab');
      expect(html).toContain('AdityyaOS Browser');
      expect(html).toContain('Search or enter address');
    });

    it('renders adityya://version with system and browser information', () => {
      const html = BrowserNavigation.renderInternalPage('adityya://version');
      expect(html).toContain('AdityyaOS Browser Version');
      expect(html).toContain('User Agent: AdityyaOS');
    });

    it('renders adityya://bookmarks with provided bookmarks list', () => {
      const bookmarks = [{ url: 'https://example.com', title: 'Example' }];
      const html = BrowserNavigation.renderInternalPage('adityya://bookmarks', { bookmarks });
      expect(html).toContain('Bookmarks');
      expect(html).toContain('https://example.com');
      expect(html).toContain('Example');
    });

    it('renders adityya://history with provided history entries', () => {
      const history = [{ url: 'https://site.org', title: 'Site', visitedAt: Date.now() }];
      const html = BrowserNavigation.renderInternalPage('adityya://history', { history });
      expect(html).toContain('History');
      expect(html).toContain('https://site.org');
    });

    it('renders 404 error page for unknown adityya:// pages', () => {
      const html = BrowserNavigation.renderInternalPage('adityya://nonexistent');
      expect(html).toContain('Page Not Found');
    });
  });
});
