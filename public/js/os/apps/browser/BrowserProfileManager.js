/**
 * public/js/os/apps/browser/BrowserProfileManager.js
 * Browser accounts, profiles, and synchronization manager for AdityyaOS Browser.
 * Manages user identities, avatars, sync status, and guest/incognito profiles.
 * Persisted strictly in AdityyaFS at /home/user/.browser/profiles.json (never in incognito).
 */

export class BrowserProfileManager {
  /**
   * @param {Object} options
   * @param {import('../../api/FileSystemAPI.js').FileSystemAPI|Object} options.fs
   * @param {boolean} [options.isIncognito=false]
   */
  constructor({ fs, isIncognito = false }) {
    this.fs = fs?.fs ? fs.fs : fs;
    this.isIncognito = Boolean(isIncognito);
    this.profilesFile = '/home/user/.browser/profiles.json';
    this.browserDir = '/home/user/.browser';

    this.profiles = [];
    this.activeProfileId = 'default';
    this.init();
  }

  init() {
    if (this.isIncognito) {
      this.profiles = [
        {
          id: 'incognito',
          name: 'Incognito',
          email: '',
          avatar: '🕶️',
          avatarColor: '#202124',
          syncEnabled: false,
          isIncognito: true
        }
      ];
      this.activeProfileId = 'incognito';
      return;
    }

    this.ensureDirectory();
    this.load();
  }

  ensureDirectory() {
    try {
      if (!this.fs.exists('/home')) this.fs.createDirectory('/home');
      if (!this.fs.exists('/home/user')) this.fs.createDirectory('/home/user');
      if (!this.fs.exists(this.browserDir)) this.fs.createDirectory(this.browserDir);
    } catch {
      // Directory may already exist
    }
  }

  load() {
    if (this.isIncognito) return;

    try {
      if (this.fs.exists(this.profilesFile)) {
        const raw = this.fs.readFile(this.profilesFile);
        const content = typeof raw === 'string' ? raw : (raw?.content || '[]');
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed.profiles) && parsed.profiles.length > 0) {
          this.profiles = parsed.profiles;
          this.activeProfileId = parsed.activeProfileId || this.profiles[0].id;
          return;
        }
      }
    } catch (err) {
      console.warn('[BrowserProfileManager] Could not load profiles, initializing defaults:', err);
    }

    // Default profile
    this.profiles = [
      {
        id: 'default',
        name: 'Adityya User',
        email: 'user@adityya.os',
        avatar: '👤',
        avatarColor: '#4285f4',
        syncEnabled: true,
        isGuest: false
      },
      {
        id: 'work',
        name: 'Work Profile',
        email: 'work@adityya.os',
        avatar: '💼',
        avatarColor: '#ea4335',
        syncEnabled: true,
        isGuest: false
      }
    ];
    this.activeProfileId = 'default';
    this.save();
  }

  save() {
    if (this.isIncognito) return;

    try {
      this.ensureDirectory();
      const payload = {
        activeProfileId: this.activeProfileId,
        profiles: this.profiles.filter(p => !p.isIncognito)
      };
      this.fs.writeFile(this.profilesFile, JSON.stringify(payload, null, 2));
    } catch (err) {
      console.warn('[BrowserProfileManager] Failed to save profiles to AdityyaFS:', err);
    }
  }

  getProfiles() {
    return [...this.profiles];
  }

  getActiveProfile() {
    return this.profiles.find(p => p.id === this.activeProfileId) || this.profiles[0] || null;
  }

  switchProfile(profileId) {
    const target = this.profiles.find(p => p.id === profileId);
    if (target) {
      this.activeProfileId = target.id;
      this.save();
      return target;
    }
    return null;
  }

  createProfile({ name, email = '', avatar = '👤', avatarColor = '#34a853' }) {
    if (this.isIncognito) return null;

    const id = `profile-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const newProfile = {
      id,
      name: name || `Profile ${this.profiles.length + 1}`,
      email,
      avatar,
      avatarColor,
      syncEnabled: true,
      isGuest: false
    };

    this.profiles.push(newProfile);
    this.activeProfileId = id;
    this.save();
    return newProfile;
  }

  deleteProfile(profileId) {
    if (this.isIncognito || profileId === 'default') return false;

    const idx = this.profiles.findIndex(p => p.id === profileId);
    if (idx !== -1) {
      this.profiles.splice(idx, 1);
      if (this.activeProfileId === profileId) {
        this.activeProfileId = this.profiles[0]?.id || 'default';
      }
      this.save();
      return true;
    }
    return false;
  }

  toggleSync(enabled) {
    const profile = this.getActiveProfile();
    if (profile && !profile.isIncognito) {
      profile.syncEnabled = typeof enabled === 'boolean' ? enabled : !profile.syncEnabled;
      this.save();
      return profile.syncEnabled;
    }
    return false;
  }
}
