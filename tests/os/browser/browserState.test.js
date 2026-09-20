/**
 * tests/os/browser/browserState.test.js
 * Automated tests for BrowserState management in Phase 24 Web Browser.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { BrowserState } from '../../../public/js/os/apps/browser/BrowserState.js';

describe('Phase 24: Browser State Management', () => {
  let state;

  beforeEach(() => {
    state = new BrowserState();
  });

  it('initializes with a single default tab pointing to adityya://newtab', () => {
    expect(state.tabs.length).toBe(1);
    expect(state.activeTabId).toBeDefined();
    const activeTab = state.getActiveTab();
    expect(activeTab).toBeDefined();
    expect(activeTab.url).toBe('adityya://newtab');
  });

  it('creates new tabs and switches active tab', () => {
    const tab2 = state.createTab('https://example.com');
    expect(state.tabs.length).toBe(2);
    expect(state.activeTabId).toBe(tab2.id);
    expect(state.getActiveTab().url).toBe('https://example.com');
  });

  it('switches active tab cleanly', () => {
    const tab1Id = state.activeTabId;
    const tab2 = state.createTab('https://example.com');

    state.setActiveTab(tab1Id);
    expect(state.activeTabId).toBe(tab1Id);
    expect(state.getActiveTab().id).toBe(tab1Id);
  });

  it('closes a tab and activates adjacent tab', () => {
    const tab1Id = state.activeTabId;
    const tab2 = state.createTab('https://example.com');
    const tab3 = state.createTab('https://adityya.dev');

    expect(state.tabs.length).toBe(3);
    state.closeTab(tab3.id);
    expect(state.tabs.length).toBe(2);
    expect(state.activeTabId).toBe(tab2.id);
  });

  it('never closes the last tab; resets it to adityya://newtab instead', () => {
    expect(state.tabs.length).toBe(1);
    const lastTabId = state.activeTabId;

    state.closeTab(lastTabId);
    expect(state.tabs.length).toBe(1);
    expect(state.getActiveTab().url).toBe('adityya://newtab');
  });
});
