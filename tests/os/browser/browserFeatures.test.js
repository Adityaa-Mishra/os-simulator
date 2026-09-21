/**
 * tests/os/browser/browserFeatures.test.js
 * Automated tests for Passwords Vault, Downloads Shelf, Extensions Registry, and Chrome Internal Pages.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BrowserPasswordManager } from '../../../public/js/os/apps/browser/BrowserPasswordManager.js';
import { BrowserDownloads } from '../../../public/js/os/apps/browser/BrowserDownloads.js';
import { BrowserExtensions } from '../../../public/js/os/apps/browser/BrowserExtensions.js';
import { BrowserNavigation } from '../../../public/js/os/apps/browser/BrowserNavigation.js';
import { Kernel } from '../../../public/js/os/kernel/Kernel.js';
import { APIContext } from '../../../public/js/os/api/APIContext.js';
import { AdityyaOSAPI } from '../../../public/js/os/api/AdityyaOSAPI.js';

describe('Browser Chrome Features & System Subsystems', () => {
  let kernel;
  let context;
  let api;

  beforeEach(() => {
    kernel = new Kernel();
    kernel.boot();
    context = new APIContext({
      appId: 'browser',
      instanceId: 'brw-feat-1',
      pid: 10,
      permissions: ['filesystem.read', 'filesystem.write']
    });
    api = new AdityyaOSAPI({ kernel, context });
  });

  afterEach(() => {
    kernel.shutdown();
  });

  describe('BrowserPasswordManager', () => {
    it('saves and retrieves passwords in AdityyaFS at /home/user/.browser/passwords.json', async () => {
      const pm = new BrowserPasswordManager({ fs: api.fs });
      const added = pm.addPassword({
        site: 'github.com',
        username: 'octocat',
        password: 'supersecretpassword'
      });

      expect(added).toBeDefined();
      expect(added.site).toBe('github.com');
      expect(added.username).toBe('octocat');

      const matches = pm.findPasswords('github');
      expect(matches.length).toBe(1);
      expect(matches[0].username).toBe('octocat');

      const fileExists = await api.fs.exists('/home/user/.browser/passwords.json');
      expect(fileExists).toBe(true);

      const raw = await api.fs.readFile('/home/user/.browser/passwords.json');
      const parsed = JSON.parse(typeof raw === 'string' ? raw : raw.content);
      expect(parsed.length).toBe(1);
      expect(parsed[0].site).toBe('github.com');
    });

    it('removes passwords cleanly', async () => {
      const pm = new BrowserPasswordManager({ fs: api.fs });
      const entry = pm.addPassword({
        site: 'twitter.com',
        username: 'user_x',
        password: 'pass'
      });

      expect(pm.getPasswords().length).toBe(1);
      const removed = pm.removePassword(entry.id);
      expect(removed).toBe(true);
      expect(pm.getPasswords().length).toBe(0);
    });
  });

  describe('BrowserDownloads', () => {
    it('downloads files strictly to /home/user/Downloads/ in AdityyaFS', async () => {
      let notified = false;
      const dm = new BrowserDownloads({
        fs: api.fs,
        onDownloadUpdate: () => { notified = true; }
      });

      const sampleContent = 'Hello, this is a downloaded file from AdityyaOS Chrome!';
      const item = await dm.startDownload({
        filename: 'report.txt',
        content: sampleContent,
        mimeType: 'text/plain'
      });

      expect(item.status).toBe('completed');
      expect(item.filename).toBe('report.txt');
      expect(notified).toBe(true);

      // Verify file exists on AdityyaFS
      const filePath = '/home/user/Downloads/report.txt';
      const exists = await api.fs.exists(filePath);
      expect(exists).toBe(true);

      const fileData = await api.fs.readFile(filePath);
      const readContent = typeof fileData === 'string' ? fileData : fileData.content;
      expect(readContent).toBe(sampleContent);
    });

    it('clears downloads metadata list', async () => {
      const dm = new BrowserDownloads({ fs: api.fs });
      await dm.startDownload({ filename: 'test1.txt', content: '1' });
      await dm.startDownload({ filename: 'test2.txt', content: '2' });

      expect(dm.getDownloads().length).toBe(2);
      dm.clearDownloads();
      expect(dm.getDownloads().length).toBe(0);
    });
  });

  describe('BrowserExtensions', () => {
    it('initializes default extensions and allows toggling', async () => {
      const exts = new BrowserExtensions({ fs: api.fs });
      const list = exts.getExtensions();

      expect(list.length).toBeGreaterThanOrEqual(4);
      expect(list.some(e => e.id === 'adblock')).toBe(true);
      expect(list.some(e => e.id === 'darkreader')).toBe(true);

      const initialAdblock = list.find(e => e.id === 'adblock').enabled;
      const toggled = exts.toggleExtension('adblock', !initialAdblock);
      expect(toggled).toBe(!initialAdblock);

      const fileExists = await api.fs.exists('/home/user/.browser/extensions.json');
      expect(fileExists).toBe(true);
    });
  });

  describe('BrowserNavigation & Internal Chrome Pages', () => {
    it('supports multiple search engines in normalizeUrl', () => {
      expect(BrowserNavigation.normalizeUrl('test query', 'Google')).toContain('google.com/search?q=test%20query');
      expect(BrowserNavigation.normalizeUrl('test query', 'DuckDuckGo')).toContain('duckduckgo.com/?q=test%20query');
      expect(BrowserNavigation.normalizeUrl('test query', 'Bing')).toContain('bing.com/search?q=test%20query');
    });

    it('normalizes and identifies chrome:// and adityya:// protocols', () => {
      expect(BrowserNavigation.isInternalUrl('chrome://settings')).toBe(true);
      expect(BrowserNavigation.isInternalUrl('chrome://history')).toBe(true);
      expect(BrowserNavigation.isInternalUrl('adityya://bookmarks')).toBe(true);
      expect(BrowserNavigation.isInternalUrl('https://example.com')).toBe(false);
    });

    it('renders all Chrome internal pages cleanly without error', () => {
      const pages = [
        'chrome://newtab',
        'chrome://incognito',
        'chrome://settings',
        'chrome://history',
        'chrome://bookmarks',
        'chrome://passwords',
        'chrome://downloads',
        'chrome://extensions',
        'chrome://version'
      ];

      for (const page of pages) {
        const html = BrowserNavigation.renderInternalPage(page, {
          bookmarks: [{ url: 'https://site.com', title: 'Site' }],
          history: [{ url: 'https://site.com', title: 'Site' }],
          passwords: [{ id: 'p1', site: 'site.com', username: 'user', password: 'pwd' }],
          downloads: [{ id: 'd1', filename: 'file.txt', size: 100 }],
          extensions: [{ id: 'adblock', name: 'AdBlock', enabled: true }]
        });

        expect(typeof html).toBe('string');
        expect(html.length).toBeGreaterThan(50);
        expect(html).not.toContain('404 - Page Not Found');
      }
    });
  });
});
