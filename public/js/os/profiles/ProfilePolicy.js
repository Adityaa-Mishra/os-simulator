/**
 * public/js/os/profiles/ProfilePolicy.js
 * Policy enforcement for user profile isolation and identity masking.
 * Prevents unauthorized cross-profile filesystem access, traversal, and directory discovery.
 */

import { PathResolver } from '../filesystem/PathResolver.js';

export class ProfilePolicy {
  static registeredProfiles = new Set(['user']);

  /**
   * Register a user profile for isolation tracking.
   * @param {string} username
   */
  static registerProfile(username) {
    if (typeof username === 'string' && username) {
      this.registeredProfiles.add(username.trim());
    }
  }

  /**
   * Unregister a user profile.
   * @param {string} username
   */
  static unregisterProfile(username) {
    if (typeof username === 'string') {
      this.registeredProfiles.delete(username.trim());
    }
  }

  /**
   * Check if a name belongs to a registered profile.
   * @param {string} username
   * @returns {boolean}
   */
  static isProfile(username) {
    return this.registeredProfiles.has(username);
  }

  /**
   * Reset registered profiles to pristine state.
   */
  static reset() {
    this.registeredProfiles.clear();
    this.registeredProfiles.add('user');
  }

  /**
   * Check if a path is accessible by the specified username.
   * Disallows accessing another user's home directory (/home/<other>) via absolute,
   * relative, or traversed paths.
   * @param {string} inputPath
   * @param {string} username
   * @param {string} [cwd='/home/user']
   * @returns {boolean}
   */
  static isPathAllowed(inputPath, username, cwd = '/home/user') {
    if (typeof inputPath !== 'string' || !username) {
      return false;
    }

    const normalized = PathResolver.normalize(inputPath, cwd);

    // If path is exactly root or /home, it is accessible for listing (listing will be filtered)
    if (normalized === '/' || normalized === '/home') {
      return true;
    }

    // Check if targeting inside /home/
    if (normalized.startsWith('/home/')) {
      const parts = normalized.slice('/home/'.length).split('/');
      const targetUser = parts[0];

      // If targeting a registered profile, only the owning user can access it
      if (this.isProfile(targetUser)) {
        if (targetUser !== username) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Filter directory entries to prevent discovery of other profiles.
   * When listing /home, foreign profile home directories are hidden.
   * @param {string} dirPath
   * @param {Array<string|Object>} entries - File/directory names or stat objects
   * @param {string} username
   * @returns {Array<string|Object>}
   */
  static filterDirectoryEntries(dirPath, entries, username) {
    if (!Array.isArray(entries) || !username) {
      return [];
    }

    const normalized = PathResolver.normalize(dirPath);

    if (normalized === '/home') {
      return entries.filter(entry => {
        const name = typeof entry === 'string' ? entry : (entry?.name || '');
        // If the entry is a registered user profile, only show it to its owner
        if (this.isProfile(name)) {
          return name === username;
        }
        // Non-profile files/directories are visible
        return true;
      });
    }

    return entries;
  }


  /**
   * Filter file search or find results to remove foreign home directories.
   * @param {Array<string|Object>} results
   * @param {string} username
   * @returns {Array<string|Object>}
   */
  static filterSearchResults(results, username) {
    if (!Array.isArray(results) || !username) {
      return [];
    }

    return results.filter(item => {
      const p = typeof item === 'string' ? item : (item?.path || item?.file || '');
      return this.isPathAllowed(p, username);
    });
  }
}
