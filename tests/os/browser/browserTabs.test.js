/**
 * tests/os/browser/browserTabs.test.js
 * Automated tests for BrowserTab back/forward navigation stacks and tab isolation.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { BrowserTab } from '../../../public/js/os/apps/browser/BrowserTabs.js';

describe('Phase 24: Browser Tab Navigation & Stacks', () => {
  let tab;

  beforeEach(() => {
    tab = new BrowserTab({ id: 'tab-1', url: 'adityya://newtab' });
  });

  it('initializes with empty back and forward stacks', () => {
    expect(tab.canGoBack()).toBe(false);
    expect(tab.canGoForward()).toBe(false);
    expect(tab.backStack.length).toBe(0);
    expect(tab.forwardStack.length).toBe(0);
  });

  it('updates back stack on navigation and clears forward stack', () => {
    tab.navigate('https://site-a.com');
    expect(tab.url).toBe('https://site-a.com');
    expect(tab.canGoBack()).toBe(true);
    expect(tab.backStack).toEqual(['adityya://newtab']);
    expect(tab.canGoForward()).toBe(false);

    tab.navigate('https://site-b.com');
    expect(tab.url).toBe('https://site-b.com');
    expect(tab.backStack).toEqual(['adityya://newtab', 'https://site-a.com']);
  });

  it('navigates back and forward accurately', () => {
    tab.navigate('https://site-a.com');
    tab.navigate('https://site-b.com');

    // Go back
    const backUrl = tab.goBack();
    expect(backUrl).toBe('https://site-a.com');
    expect(tab.url).toBe('https://site-a.com');
    expect(tab.canGoBack()).toBe(true);
    expect(tab.canGoForward()).toBe(true);
    expect(tab.forwardStack).toEqual(['https://site-b.com']);

    // Go forward
    const fwdUrl = tab.goForward();
    expect(fwdUrl).toBe('https://site-b.com');
    expect(tab.url).toBe('https://site-b.com');
    expect(tab.canGoForward()).toBe(false);
  });

  it('keeps navigation history strictly isolated between different tabs', () => {
    const tabA = new BrowserTab({ id: 'tab-a', url: 'https://site-a.com' });
    const tabB = new BrowserTab({ id: 'tab-b', url: 'https://site-b.com' });

    tabA.navigate('https://site-a-sub.com');
    expect(tabA.canGoBack()).toBe(true);
    expect(tabB.canGoBack()).toBe(false);

    tabB.navigate('https://site-b-sub.com');
    expect(tabA.backStack).toEqual(['https://site-a.com']);
    expect(tabB.backStack).toEqual(['https://site-b.com']);
  });
});
