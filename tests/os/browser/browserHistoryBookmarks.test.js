/**
 * tests/os/browser/browserHistoryBookmarks.test.js
 * Automated tests for BrowserHistory and BrowserBookmarks persistence in AdityyaFS.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BrowserHistory } from '../../../public/js/os/apps/browser/BrowserHistory.js';
import { BrowserBookmarks } from '../../../public/js/os/apps/browser/BrowserBookmarks.js';
import { Kernel } from '../../../public/js/os/kernel/Kernel.js';
import { APIContext } from '../../../public/js/os/api/APIContext.js';
import { AdityyaOSAPI } from '../../../public/js/os/api/AdityyaOSAPI.js';

describe('Phase 24: Browser History & Bookmarks Persistence', () => {
  let kernel;
  let context;
  let api;

  beforeEach(() => {
    kernel = new Kernel();
    kernel.boot();
    context = new APIContext({
      appId: 'browser',
      instanceId: 'brw-1',
      pid: 10,
      permissions: ['filesystem.read', 'filesystem.write']
    });
    api = new AdityyaOSAPI({ kernel, context });
  });

  afterEach(() => {
    kernel.shutdown();
  });

  describe('BrowserHistory', () => {
    it('initializes and saves history entries to /home/user/.browser/history.json', async () => {
      const history = new BrowserHistory(api);
      await history.init();

      await history.addEntry('https://example.com', 'Example Domain');
      expect(history.entries.length).toBe(1);
      expect(history.entries[0].url).toBe('https://example.com');
      expect(history.entries[0].title).toBe('Example Domain');

      const fileExists = await api.fs.exists('/home/user/.browser/history.json');
      expect(fileExists).toBe(true);

      const raw = await api.fs.readFile('/home/user/.browser/history.json');
      const parsed = JSON.parse(typeof raw === 'string' ? raw : raw.content);
      expect(parsed.length).toBe(1);
      expect(parsed[0].url).toBe('https://example.com');
    });

    it('clears history completely from state and disk', async () => {
      const history = new BrowserHistory(api);
      await history.init();

      await history.addEntry('https://example.com', 'Example Domain');
      expect(history.entries.length).toBe(1);

      await history.clear();
      expect(history.entries.length).toBe(0);

      const raw = await api.fs.readFile('/home/user/.browser/history.json');
      const content = typeof raw === 'string' ? raw : raw.content;
      expect(JSON.parse(content)).toEqual([]);
    });
  });

  describe('BrowserBookmarks', () => {
    it('initializes and saves bookmarks to /home/user/.browser/bookmarks.json', async () => {
      const bookmarks = new BrowserBookmarks(api);
      await bookmarks.init();

      await bookmarks.addBookmark('https://adityya.dev', 'Adityya Dev');
      expect(bookmarks.isBookmarked('https://adityya.dev')).toBe(true);
      expect(bookmarks.isBookmarked('https://other.com')).toBe(false);

      const fileExists = await api.fs.exists('/home/user/.browser/bookmarks.json');
      expect(fileExists).toBe(true);

      const raw = await api.fs.readFile('/home/user/.browser/bookmarks.json');
      const parsed = JSON.parse(typeof raw === 'string' ? raw : raw.content);
      expect(parsed.length).toBe(1);
      expect(parsed[0].url).toBe('https://adityya.dev');
    });

    it('removes bookmarks cleanly', async () => {
      const bookmarks = new BrowserBookmarks(api);
      await bookmarks.init();

      await bookmarks.addBookmark('https://adityya.dev', 'Adityya Dev');
      expect(bookmarks.isBookmarked('https://adityya.dev')).toBe(true);

      await bookmarks.removeBookmark('https://adityya.dev');
      expect(bookmarks.isBookmarked('https://adityya.dev')).toBe(false);

      const raw = await api.fs.readFile('/home/user/.browser/bookmarks.json');
      const content = typeof raw === 'string' ? raw : raw.content;
      expect(JSON.parse(content)).toEqual([]);
    });
  });
});
