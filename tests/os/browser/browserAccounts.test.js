/**
 * tests/os/browser/browserAccounts.test.js
 * Automated tests for BrowserProfileManager (multi-profile, accounts, and sync).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BrowserProfileManager } from '../../../public/js/os/apps/browser/BrowserProfileManager.js';
import { Kernel } from '../../../public/js/os/kernel/Kernel.js';
import { APIContext } from '../../../public/js/os/api/APIContext.js';
import { AdityyaOSAPI } from '../../../public/js/os/api/AdityyaOSAPI.js';

describe('Browser Accounts & Profile Management', () => {
  let kernel;
  let context;
  let api;

  beforeEach(() => {
    kernel = new Kernel();
    kernel.boot();
    context = new APIContext({
      appId: 'browser',
      instanceId: 'brw-acc-1',
      pid: 10,
      permissions: ['filesystem.read', 'filesystem.write']
    });
    api = new AdityyaOSAPI({ kernel, context });
  });

  afterEach(() => {
    kernel.shutdown();
  });

  it('initializes default profiles and persists to /home/user/.browser/profiles.json', async () => {
    const manager = new BrowserProfileManager({ fs: api.fs });
    const profiles = manager.getProfiles();

    expect(profiles.length).toBeGreaterThanOrEqual(2);
    expect(profiles[0].id).toBe('default');
    expect(profiles[0].name).toBe('Adityya User');
    expect(profiles[0].email).toBe('user@adityya.os');
    expect(manager.getActiveProfile().id).toBe('default');

    const fileExists = await api.fs.exists('/home/user/.browser/profiles.json');
    expect(fileExists).toBe(true);

    const raw = await api.fs.readFile('/home/user/.browser/profiles.json');
    const parsed = JSON.parse(typeof raw === 'string' ? raw : raw.content);
    expect(parsed.activeProfileId).toBe('default');
    expect(parsed.profiles.length).toBeGreaterThanOrEqual(2);
  });

  it('creates and switches between profiles cleanly', async () => {
    const manager = new BrowserProfileManager({ fs: api.fs });
    const newProf = manager.createProfile({
      name: 'Personal Project',
      email: 'personal@adityya.os',
      avatar: '🚀',
      avatarColor: '#10b981'
    });

    expect(newProf).toBeDefined();
    expect(newProf.name).toBe('Personal Project');
    expect(manager.getActiveProfile().id).toBe(newProf.id);

    // Switch back to default
    manager.switchProfile('default');
    expect(manager.getActiveProfile().id).toBe('default');

    // Switch to work profile
    manager.switchProfile('work');
    expect(manager.getActiveProfile().id).toBe('work');
  });

  it('toggles sync status on active profile', async () => {
    const manager = new BrowserProfileManager({ fs: api.fs });
    const initialSync = manager.getActiveProfile().syncEnabled;

    const toggled = manager.toggleSync();
    expect(toggled).toBe(!initialSync);
    expect(manager.getActiveProfile().syncEnabled).toBe(!initialSync);
  });

  it('deletes a profile without deleting the default profile', async () => {
    const manager = new BrowserProfileManager({ fs: api.fs });
    const temp = manager.createProfile({ name: 'Temporary' });
    expect(manager.getProfiles().some(p => p.id === temp.id)).toBe(true);

    const deleted = manager.deleteProfile(temp.id);
    expect(deleted).toBe(true);
    expect(manager.getProfiles().some(p => p.id === temp.id)).toBe(false);

    // Attempting to delete default profile should return false
    const deleteDefault = manager.deleteProfile('default');
    expect(deleteDefault).toBe(false);
  });

  it('strict incognito isolation: incognito profile is transient and never saved to disk', async () => {
    // Clear any previous profiles file
    try { await api.fs.deleteFile('/home/user/.browser/profiles.json'); } catch {}

    const incognitoManager = new BrowserProfileManager({ fs: api.fs, isIncognito: true });
    expect(incognitoManager.getActiveProfile().id).toBe('incognito');
    expect(incognitoManager.getActiveProfile().isIncognito).toBe(true);

    // Verify nothing was saved to AdityyaFS
    const fileExists = await api.fs.exists('/home/user/.browser/profiles.json');
    expect(fileExists).toBe(false);

    // Creating a profile in incognito returns null and doesn't write
    const attempt = incognitoManager.createProfile({ name: 'Hacker' });
    expect(attempt).toBeNull();
  });
});
