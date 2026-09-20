/**
 * public/js/os/profiles/ProfileManager.js
 * Subsystem manager for AdityyaOS user profiles.
 * Manages profile lifecycle, default user compatibility, and selective safe profile switching.
 */

import { UserProfile } from './UserProfile.js';
import { validateUsername } from './ProfileState.js';
import { ProfileError } from './ProfileError.js';
import { ProfilePolicy } from './ProfilePolicy.js';
import { ProfileServicePort } from './ProfileServicePort.js';

let switchApprovalSeq = 0;

export class ProfileManager {
  /**
   * Return a restricted facade port for application API access.
   * @returns {ProfileServicePort}
   */
  getPort() {
    return new ProfileServicePort(this);
  }

  /**
   * @param {import('../kernel/Kernel.js').Kernel} kernel
   * @param {Object} [config={}]
   */
  constructor(kernel, config = {}) {
    if (!kernel) {
      throw new TypeError('ProfileManager requires a Kernel instance');
    }
    this.kernel = kernel;
    this.config = config;

    this.profiles = new Map(); // username -> UserProfile
    this.pendingSwitches = new Map(); // approvalId -> Object

    this.initDefaultProfile();
  }

  /**
   * Initialize default profile ('user' with /home/user).
   * Ensures 100% backward compatibility with Phase 12-28 tests and architecture.
   */
  initDefaultProfile() {
    const defaultProfile = new UserProfile({
      id: 'default',
      username: 'user',
      displayName: 'Default User',
      homeDirectory: '/home/user',
      preferences: {
        theme: 'dark',
        wallpaper: 'default.png'
      }
    });

    this.profiles.set('user', defaultProfile);
    this.activeProfile = defaultProfile;
    this.activeProfileId = defaultProfile.id;
    this.activeUsername = defaultProfile.username;

    // Ensure /home/user directory exists
    if (this.kernel.fileSystemManager) {
      try {
        if (!this.kernel.fileSystemManager.exists('/home')) {
          this.kernel.fileSystemManager.createDirectory('/home');
        }
        if (!this.kernel.fileSystemManager.exists('/home/user')) {
          this.kernel.fileSystemManager.createDirectory('/home/user');
        }
      } catch {}
    }

    this.syncState();
    ProfilePolicy.registerProfile('user');
  }

  /**
   * Sync profile state to central kernel state.
   */
  syncState() {
    if (this.kernel && this.kernel.state) {
      this.kernel.state.profiles = {
        activeProfile: this.activeUsername,
        activeProfileId: this.activeProfileId,
        totalProfiles: this.profiles.size,
        profiles: Array.from(this.profiles.values()).map(p => ({
          id: p.id,
          username: p.username,
          displayName: p.displayName,
          homeDirectory: p.homeDirectory
        }))
      };
    }
  }

  /**
   * Controlled profile creation.
   * Creates /home/<username> in AdityyaFS and stores profile.
   * @param {Object} params
   * @param {string} params.username
   * @param {string} [params.displayName]
   * @param {Object} [params.preferences]
   * @returns {Object} Plain serializable profile metadata
   */
  createProfile({ username, displayName = null, preferences = {} } = {}) {
    const validation = validateUsername(username);
    if (!validation.valid) {
      throw new ProfileError({
        code: 'EINVALIDUSERNAME',
        message: validation.error || 'Invalid username',
        operation: 'profile.create',
        username
      });
    }

    const cleanUsername = username.trim();

    if (this.profiles.has(cleanUsername)) {
      throw new ProfileError({
        code: 'EPROFILEEXISTS',
        message: `Profile "${cleanUsername}" already exists`,
        operation: 'profile.create',
        username: cleanUsername
      });
    }

    // Create the virtual home directory in AdityyaFS
    const homeDir = `/home/${cleanUsername}`;
    if (this.kernel.fileSystemManager) {
      if (!this.kernel.fileSystemManager.exists('/home')) {
        this.kernel.fileSystemManager.createDirectory('/home');
      }
      if (!this.kernel.fileSystemManager.exists(homeDir)) {
        const createDirRes = this.kernel.fileSystemManager.createDirectory(homeDir);
        if (!createDirRes.success && createDirRes.code !== 'EEXIST') {
          throw new ProfileError({
            code: createDirRes.code || 'EIO',
            message: `Failed to create home directory "${homeDir}": ${createDirRes.error}`,
            operation: 'profile.create',
            username: cleanUsername
          });
        }
      }
    }

    const profile = new UserProfile({
      username: cleanUsername,
      displayName,
      homeDirectory: homeDir,
      preferences
    });

    this.profiles.set(cleanUsername, profile);
    ProfilePolicy.registerProfile(cleanUsername);
    this.syncState();

    return profile.toJSON();
  }

  /**
   * Get active profile snapshot.
   * @returns {Object}
   */
  getCurrentProfile() {
    return this.activeProfile.toJSON();
  }

  /**
   * Get profile by username.
   * Shields foreign profile data: if requestingUsername is provided and doesn't match, returns null.
   * @param {string} username
   * @param {string} [requestingUsername]
   * @returns {Object|null}
   */
  getProfile(username, requestingUsername = null) {
    if (!username || typeof username !== 'string') return null;
    const cleanUsername = username.trim();
    if (requestingUsername && cleanUsername !== requestingUsername.trim()) {
      return null;
    }
    const profile = this.profiles.get(cleanUsername);
    if (!profile) return null;

    return profile.toJSON();
  }

  /**
   * List available profiles (public metadata only).
   * If requestingUsername is provided, filters to return only the caller's profile to prevent foreign profile discovery.
   * @param {string} [requestingUsername=null]
   * @returns {Array<Object>}
   */
  listProfiles(requestingUsername = null) {
    const all = Array.from(this.profiles.values());
    if (requestingUsername) {
      return all
        .filter(p => p.username === requestingUsername)
        .map(p => ({
          id: p.id,
          username: p.username,
          displayName: p.displayName,
          homeDirectory: p.homeDirectory,
          status: p.status,
          createdAt: p.createdAt
        }));
    }
    return all.map(p => ({
      id: p.id,
      username: p.username,
      displayName: p.displayName,
      homeDirectory: p.homeDirectory,
      status: p.status,
      createdAt: p.createdAt
    }));
  }

  /**
   * Get preferences for a profile.
   * Strictly enforces profile ownership.
   * @param {string} username
   * @param {string} requestingUsername
   * @returns {Object}
   */
  getPreferences(username, requestingUsername) {
    if (username !== requestingUsername) {
      throw new ProfileError({
        code: 'ENOENT',
        message: `Profile "${username}" not found or access denied`,
        operation: 'profile.getPreferences',
        username
      });
    }

    const profile = this.profiles.get(username);
    if (!profile) {
      throw new ProfileError({
        code: 'ENOENT',
        message: `Profile "${username}" not found or access denied`,
        operation: 'profile.getPreferences',
        username
      });
    }

    return JSON.parse(JSON.stringify(profile.preferences));
  }

  /**
   * Update preferences for a profile.
   * Strictly enforces profile ownership.
   * @param {Object} patch
   * @param {string} requestingUsername
   * @returns {Object}
   */
  updatePreferences(patch, requestingUsername) {
    const profile = this.profiles.get(requestingUsername);
    if (!profile) {
      throw new ProfileError({
        code: 'EPROFILENOTFOUND',
        message: `Profile "${requestingUsername}" not found`,
        operation: 'profile.updatePreferences',
        username: requestingUsername
      });
    }

    profile.updatePreferences(patch);
    this.syncState();
    return JSON.parse(JSON.stringify(profile.preferences));
  }

  /**
   * Request an immutable profile switch proposal.
   * @param {Object} params
   * @param {string} params.targetUsername
   * @param {import('../api/APIContext.js').APIContext} params.context
   * @returns {Object} Immutable approval request snapshot
   */
  requestSwitch({ targetUsername, context }) {
    if (!targetUsername || typeof targetUsername !== 'string') {
      throw new ProfileError({
        code: 'EINVALIDUSERNAME',
        message: 'Target username must be a non-empty string',
        operation: 'profile.switch'
      });
    }

    const cleanTarget = targetUsername.trim();
    if (!this.profiles.has(cleanTarget)) {
      throw new ProfileError({
        code: 'EPROFILENOTFOUND',
        message: `Target profile "${cleanTarget}" does not exist`,
        operation: 'profile.switch',
        username: cleanTarget
      });
    }

    if (cleanTarget === this.activeUsername) {
      throw new ProfileError({
        code: 'EALREADYACTIVE',
        message: `Profile "${cleanTarget}" is already the active profile`,
        operation: 'profile.switch',
        username: cleanTarget
      });
    }

    const approvalId = `swappr-${++switchApprovalSeq}`;
    const approval = {
      id: approvalId,
      approvalId,
      actionId: `act-switch-${approvalId}`,
      ownerPid: context.pid,
      ownerAppId: context.appId,
      ownerProfileId: this.activeProfileId,
      fromUsername: this.activeUsername,
      toUsername: cleanTarget,
      targetUsername: cleanTarget,
      status: 'PENDING',
      requiresApproval: true,
      risk: 'high',
      target: cleanTarget,
      requiredPermissions: ['profile.switch'],
      expectedEffect: `Switch active user session from "${this.activeUsername}" to "${cleanTarget}"`,
      args: Object.freeze({ targetUsername: cleanTarget }),
      argsSnapshotStr: JSON.stringify({ targetUsername: cleanTarget }),
      createdAt: Date.now(),
      executed: false
    };

    this.pendingSwitches.set(approvalId, approval);

    return JSON.parse(JSON.stringify(approval));
  }

  /**
   * Approve and execute profile switch.
   * @param {string} approvalId
   * @param {number} requestingPid
   * @returns {Object}
   */
  approveSwitch(approvalId, requestingPid) {
    const approval = this.pendingSwitches.get(approvalId);
    if (!approval || approval.ownerPid !== requestingPid) {
      throw new ProfileError({
        code: 'ENOENT',
        message: `Profile switch request "${approvalId}" not found or access denied`,
        operation: 'profile.approveSwitch'
      });
    }

    if (approval.status !== 'PENDING' || approval.executed) {
      throw new ProfileError({
        code: 'EINVALIDSTATE',
        message: `Switch request "${approvalId}" is not pending approval`,
        operation: 'profile.approveSwitch'
      });
    }

    approval.status = 'APPROVED';
    return this.executeSwitch(approvalId, requestingPid);
  }

  /**
   * Deny and discard profile switch request.
   * @param {string} approvalId
   * @param {number} requestingPid
   * @param {string} [reason='User denied']
   * @returns {Object}
   */
  denySwitch(approvalId, requestingPid, reason = 'User denied') {
    const approval = this.pendingSwitches.get(approvalId);
    if (!approval || approval.ownerPid !== requestingPid) {
      throw new ProfileError({
        code: 'ENOENT',
        message: `Profile switch request "${approvalId}" not found or access denied`,
        operation: 'profile.denySwitch'
      });
    }

    approval.status = 'DENIED';
    approval.reason = reason;
    this.pendingSwitches.delete(approvalId);

    return JSON.parse(JSON.stringify(approval));
  }

  /**
   * Cancel pending switch approvals owned by a specific process PID.
   * Invoked upon process termination.
   * @param {number} pid
   */
  cancelProcessSwitches(pid) {
    if (typeof pid !== 'number') return;
    for (const [approvalId, approval] of this.pendingSwitches.entries()) {
      if (approval.ownerPid === pid) {
        approval.status = 'CANCELLED';
        this.pendingSwitches.delete(approvalId);
      }
    }
  }

  /**
   * Execute the profile switch with selective cleanup of outgoing profile resources.
   * Cleans up windows, descriptors, sockets, AI sessions, actions, approvals, and runtimes for outgoing profile.
   * Strictly preserves PID 0, PID 1, kernel processes, and target profile resources.
   * @param {string} approvalId
   * @param {number} requestingPid
   * @returns {Object}
   */
  executeSwitch(approvalId, requestingPid) {
    const approval = this.pendingSwitches.get(approvalId);
    if (!approval || approval.ownerPid !== requestingPid) {
      throw new ProfileError({
        code: 'ENOENT',
        message: `Switch request "${approvalId}" not found or access denied`,
        operation: 'profile.executeSwitch'
      });
    }

    if (approval.status !== 'APPROVED') {
      throw new ProfileError({
        code: 'EAPPROVALREQUIRED',
        message: `Switch request requires approval before execution`,
        operation: 'profile.executeSwitch'
      });
    }

    if (approval.executed) {
      throw new ProfileError({
        code: 'EALREADYEXECUTED',
        message: `Switch request has already been executed`,
        operation: 'profile.executeSwitch'
      });
    }

    const targetProfile = this.profiles.get(approval.toUsername);
    if (!targetProfile) {
      throw new ProfileError({
        code: 'EPROFILENOTFOUND',
        message: `Target profile "${approval.toUsername}" not found`,
        operation: 'profile.executeSwitch'
      });
    }

    const outgoingUsername = this.activeUsername;
    const outgoingProfileId = this.activeProfileId;

    // 1. Identify outgoing processes to terminate (strictly non-critical processes owned by outgoing profile)
    // NEVER terminate PID 0 or PID 1 or init/kernel
    const outgoingPids = new Set();
    if (this.kernel.processManager) {
      const activeProcs = this.kernel.processManager.getProcesses(
        p => p.state !== 'TERMINATED' &&
             p.pid > 1 &&
             p.name !== 'init' &&
             p.name !== 'kernel' &&
             (p.username === outgoingUsername || p.profileId === outgoingProfileId)
      );

      for (const p of activeProcs) {
        outgoingPids.add(p.pid);
      }
    }

    // 2. Terminate and cleanup ApplicationRuntime instances owned by outgoing profile
    if (this.kernel.runtime?.instances) {
      for (const instance of this.kernel.runtime.instances.values()) {
        const matchesProfile =
          instance.context?.username === outgoingUsername ||
          instance.context?.profileId === outgoingProfileId ||
          outgoingPids.has(instance.pid);

        if (matchesProfile) {
          if (instance.pid && instance.pid > 1) {
            outgoingPids.add(instance.pid);
          }
          try {
            this.kernel.runtime.terminate(instance.instanceId, 0);
          } catch {}
        }
      }
    }

    // 3. Terminate outgoing processes and explicitly ensure all process resources are cleaned up
    for (const pid of outgoingPids) {
      try {
        this.kernel.processManager?.terminateProcess(pid);
      } catch {}
      try {
        this.kernel.fileSystemManager?.closeProcessDescriptors(pid);
      } catch {}
      try {
        this.kernel.networkManager?.closeProcessSockets(pid);
      } catch {}
      try {
        this.kernel.aiCore?.abortProcessRequests(pid);
      } catch {}
      try {
        this.kernel.aiControlService?.cancelProcessActions(pid);
      } catch {}
    }

    // 4. Discard/cancel active experiments owned by outgoing profile
    if (this.kernel.experimentManager) {
      this.kernel.experimentManager.cancelProfileExperiments(outgoingProfileId);
    }

    // 5. Cancel and clear all pending profile switch requests (including this one and any other pending switch)
    approval.executed = true;
    approval.status = 'COMPLETED';
    for (const [id, req] of this.pendingSwitches.entries()) {
      if (id !== approvalId) {
        req.status = 'CANCELLED';
      }
    }
    this.pendingSwitches.clear();

    // 6. Activate target profile
    this.activeProfile = targetProfile;
    this.activeProfileId = targetProfile.id;
    this.activeUsername = targetProfile.username;

    this.syncState();

    if (this.kernel.events) {
      this.kernel.events.emit('profile.switched', {
        from: outgoingUsername,
        to: targetProfile.username,
        timestamp: Date.now()
      });
    }

    return {
      success: true,
      activeProfile: targetProfile.toJSON()
    };
  }

  /**
   * Reset profile manager to default state.
   */
  reset() {
    this.profiles.clear();
    this.pendingSwitches.clear();
    ProfilePolicy.reset();
    this.initDefaultProfile();
  }

  /**
   * Cleanly shutdown profile manager.
   */
  shutdown() {
    this.pendingSwitches.clear();
  }
}
