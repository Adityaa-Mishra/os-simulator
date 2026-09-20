/**
 * public/js/os/cloud/CloudSyncService.js
 * Subsystem manager for AdityyaOS simulated cloud state and synchronization.
 * Operates purely in-memory with deterministic snapshots and explicit conflict resolution.
 * ZERO external network, ZERO fetch, ZERO host credentials.
 */

import { MockCloudStateProvider } from './MockCloudStateProvider.js';
import { CloudSnapshot } from './CloudSnapshot.js';
import { CloudStateError } from './CloudStateError.js';
import { PathResolver } from '../filesystem/PathResolver.js';
import { CloudServicePort } from './CloudServicePort.js';

let cloudApprovalSeq = 0;

export class CloudSyncService {
  /**
   * Return a restricted facade port for application API access.
   * @returns {CloudServicePort}
   */
  getPort() {
    return new CloudServicePort(this);
  }

  /**
   * @param {import('../kernel/Kernel.js').Kernel} kernel
   * @param {Object} [config={}]
   */
  constructor(kernel, config = {}) {
    if (!kernel) {
      throw new TypeError('CloudSyncService requires a Kernel instance');
    }
    this.kernel = kernel;
    this.config = config;

    this.provider = new MockCloudStateProvider();
    this.pendingRequests = new Map(); // approvalId -> Object
  }

  /**
   * Sync cloud state to central kernel state.
   */
  syncState() {
    if (this.kernel && this.kernel.state) {
      let totalSnapshots = 0;
      for (const map of this.provider.storage.values()) {
        totalSnapshots += map.size;
      }

      this.kernel.state.cloud = {
        totalSnapshots,
        lastSyncTime: Date.now()
      };
    }
  }

  /**
   * Create a simulated cloud snapshot of the calling profile's home directory.
   * @param {Object} params
   * @param {string} [params.description]
   * @param {import('../api/APIContext.js').APIContext} context
   * @returns {Object} Plain serializable snapshot metadata
   */
  createSnapshot({ description = '' } = {}, context) {
    if (!context) {
      throw new TypeError('createSnapshot requires an APIContext');
    }

    const fs = this.kernel.fileSystemManager;
    const userHome = `/home/${context.username}`;
    const files = {};

    // 1. Scan and collect profile files
    const scanDir = (dirPath) => {
      try {
        const listRes = fs.listDirectory(dirPath);
        if (!listRes.success || !Array.isArray(listRes.data)) return;

        for (const entry of listRes.data) {
          const fullPath = PathResolver.normalize(entry.name, dirPath);
          if (entry.type === 'directory') {
            scanDir(fullPath);
          } else {
            const readRes = fs.readFile(fullPath);
            const content = readRes.success
              ? (typeof readRes.data === 'string' ? readRes.data : readRes.data?.content || '')
              : '';
            // Store relative to home
            const relPath = fullPath.slice(userHome.length);
            files[relPath] = {
              content,
              permissions: entry.permissions || 'rw-',
              mtime: entry.mtime || entry.modified || Date.now()
            };
          }
        }
      } catch {}
    };

    if (fs && fs.exists(userHome)) {
      scanDir(userHome);
    }

    // 2. Get profile preferences
    let preferences = {};
    if (this.kernel.profileManager) {
      try {
        preferences = this.kernel.profileManager.getPreferences(context.username, context.username);
      } catch {}
    }

    const profile = this.kernel.profileManager?.profiles?.get(context.username);
    const version = profile ? profile.profileStateVersion : 1;

    const snapshot = new CloudSnapshot({
      profileId: context.profileId,
      username: context.username,
      description,
      version,
      preferences,
      files
    });

    this.provider.saveSnapshot(snapshot);

    // Update profile metadata
    if (profile) {
      profile.cloudSyncMetadata = {
        lastSyncTime: Date.now(),
        lastSnapshotId: snapshot.id
      };
    }

    this.syncState();

    return snapshot.toJSON();
  }

  /**
   * List all cloud snapshots owned by this profile.
   * @param {import('../api/APIContext.js').APIContext} context
   * @returns {Array<Object>}
   */
  listSnapshots(context) {
    if (!context) return [];
    return this.provider.listSnapshots(context.profileId);
  }

  /**
   * Get a cloud snapshot by ID, scoped to calling profile.
   * @param {string} snapshotId
   * @param {import('../api/APIContext.js').APIContext} context
   * @returns {Object}
   */
  getSnapshot(snapshotId, context) {
    const snap = this.provider.getSnapshot(context.profileId, snapshotId);
    if (!snap) {
      throw new CloudStateError({
        code: 'ECLOUDSNAPSHOTNOTFOUND',
        message: `Cloud snapshot "${snapshotId}" not found or access denied`,
        operation: 'cloud.getSnapshot',
        snapshotId
      });
    }
    return snap;
  }

  /**
   * Request an immutable approval to restore a cloud snapshot.
   * Detects conflicts between local profile files and snapshot files.
   * @param {string} snapshotId
   * @param {import('../api/APIContext.js').APIContext} context
   * @returns {Object} Approval request snapshot
   */
  requestRestore(snapshotId, context) {
    const snap = this.getSnapshot(snapshotId, context);
    const fs = this.kernel.fileSystemManager;
    const userHome = `/home/${context.username}`;

    const conflicts = [];
    const preview = [];

    for (const [relPath, fileData] of Object.entries(snap.files || {})) {
      const fullPath = `${userHome}${relPath}`;
      preview.push(fullPath);

      if (fs && fs.exists(fullPath)) {
        const readRes = fs.readFile(fullPath);
        const currentContent = readRes.success
          ? (typeof readRes.data === 'string' ? readRes.data : readRes.data?.content || '')
          : null;
        if (currentContent !== fileData.content) {
          conflicts.push({
            path: fullPath,
            localSize: currentContent ? currentContent.length : 0,
            cloudSize: fileData.content ? fileData.content.length : 0
          });
        }
      }
    }

    const approvalId = `cloudappr-${++cloudApprovalSeq}`;
    const approval = {
      id: approvalId,
      approvalId,
      actionId: `act-cloud-restore-${snapshotId}`,
      action: 'restore',
      snapshotId,
      ownerPid: context.pid,
      ownerAppId: context.appId,
      ownerProfileId: context.profileId,
      ownerUsername: context.username,
      status: 'PENDING',
      requiresApproval: true,
      risk: 'high',
      target: snapshotId,
      requiredPermissions: ['cloud.restore'],
      conflicts,
      hasConflict: conflicts.length > 0,
      hasConflicts: conflicts.length > 0,
      preview,
      expectedEffect: `Restore ${Object.keys(snap.files).length} files to "/home/${context.username}" from snapshot "${snap.description || snapshotId}"`,
      args: Object.freeze({ snapshotId, conflictsCount: conflicts.length }),
      argsSnapshotStr: JSON.stringify({ snapshotId, conflictsCount: conflicts.length }),
      createdAt: Date.now(),
      executed: false
    };

    this.pendingRequests.set(approvalId, approval);

    return JSON.parse(JSON.stringify(approval));
  }

  /**
   * Request an immutable approval to delete a cloud snapshot.
   * @param {string} snapshotId
   * @param {import('../api/APIContext.js').APIContext} context
   * @returns {Object}
   */
  requestDelete(snapshotId, context) {
    const snap = this.getSnapshot(snapshotId, context);

    const approvalId = `cloudappr-${++cloudApprovalSeq}`;
    const approval = {
      id: approvalId,
      approvalId,
      actionId: `act-cloud-delete-${snapshotId}`,
      action: 'delete',
      snapshotId,
      ownerPid: context.pid,
      ownerAppId: context.appId,
      ownerProfileId: context.profileId,
      ownerUsername: context.username,
      status: 'PENDING',
      requiresApproval: true,
      risk: 'medium',
      target: snapshotId,
      requiredPermissions: ['cloud.write'],
      expectedEffect: `Delete cloud snapshot "${snapshotId}" ("${snap.description || 'untitled'}")`,
      args: Object.freeze({ snapshotId }),
      argsSnapshotStr: JSON.stringify({ snapshotId }),
      createdAt: Date.now(),
      executed: false
    };

    this.pendingRequests.set(approvalId, approval);

    return JSON.parse(JSON.stringify(approval));
  }

  /**
   * Approve and execute a pending cloud action (restore or delete).
   * @param {string} approvalId
   * @param {number} requestingPid
   * @param {string} requestingProfileId
   * @param {string} [resolution=null] - 'keep-local' | 'keep-cloud' for conflicts
   * @returns {Object}
   */
  approveAction(approvalId, requestingPid, requestingProfileId, resolution = null) {
    const approval = this.pendingRequests.get(approvalId);
    if (!approval || approval.ownerPid !== requestingPid || approval.ownerProfileId !== requestingProfileId) {
      throw new CloudStateError({
        code: 'ENOENT',
        message: `Cloud approval request "${approvalId}" not found or access denied`,
        operation: 'cloud.approveAction'
      });
    }

    if (approval.status !== 'PENDING' || approval.executed) {
      throw new CloudStateError({
        code: 'EINVALIDSTATE',
        message: `Approval request "${approvalId}" is not pending approval`,
        operation: 'cloud.approveAction'
      });
    }

    const fs = this.kernel.fileSystemManager;
    const snap = this.provider.getSnapshot(approval.ownerProfileId, approval.snapshotId);
    if (!snap && approval.action === 'restore') {
      throw new CloudStateError({
        code: 'ECLOUDSNAPSHOTNOTFOUND',
        message: `Cloud snapshot "${approval.snapshotId}" no longer exists`,
        operation: 'cloud.approveAction'
      });
    }

    if (approval.action === 'restore') {
      // Check conflict resolution
      if (approval.hasConflicts) {
        if (!resolution) {
          throw new CloudStateError({
            code: 'ECLOUDCONFLICT',
            message: 'Conflict detected between local and cloud files. Explicit resolution required (keep-local or keep-cloud).',
            operation: 'cloud.approveAction'
          });
        }
        if (resolution !== 'keep-local' && resolution !== 'keep-cloud') {
          throw new CloudStateError({
            code: 'EINVALIDRESOLUTION',
            message: `Invalid conflict resolution "${resolution}". Supported: 'keep-local', 'keep-cloud'`,
            operation: 'cloud.approveAction'
          });
        }
      }

      const userHome = `/home/${approval.ownerUsername}`;
      const conflictPaths = new Set((approval.conflicts || []).map(c => c.path));

      // Transactionally write files in AdityyaFS within /home/<username>
      let restoredCount = 0;
      for (const [relPath, fileData] of Object.entries(snap.files || {})) {
        const fullPath = `${userHome}${relPath}`;

        // If conflict and user chose keep-local, skip this file
        if (conflictPaths.has(fullPath) && resolution === 'keep-local') {
          continue;
        }

        // Ensure parent directory exists
        const parent = PathResolver.splitPath(fullPath).parentPath;
        if (parent && !fs.exists(parent)) {
          fs.createDirectory(parent);
        }

        if (!fs.exists(fullPath)) {
          fs.createFile(fullPath);
        }
        fs.writeFile(fullPath, fileData.content || '');
        restoredCount++;
      }

      // Restore preferences if present
      if (this.kernel.profileManager && snap.preferences) {
        this.kernel.profileManager.updatePreferences(snap.preferences, approval.ownerUsername);
      }

      approval.executed = true;
      approval.status = 'COMPLETED';
      this.pendingRequests.delete(approvalId);

      return {
        success: true,
        action: 'restore',
        snapshotId: snap.id,
        restoredCount
      };
    } else if (approval.action === 'delete') {
      this.provider.deleteSnapshot(approval.ownerProfileId, approval.snapshotId);
      approval.executed = true;
      approval.status = 'COMPLETED';
      this.pendingRequests.delete(approvalId);
      this.syncState();

      return {
        success: true,
        action: 'delete',
        snapshotId: approval.snapshotId,
        deleted: true
      };
    }

    throw new CloudStateError({
      code: 'EINVALIDACTION',
      message: `Unknown cloud action "${approval.action}"`,
      operation: 'cloud.approveAction'
    });
  }

  /**
   * Deny a pending cloud action request.
   * @param {string} approvalId
   * @param {number} requestingPid
   * @param {string} requestingProfileId
   * @param {string} [reason='User denied']
   * @returns {Object}
   */
  denyAction(approvalId, requestingPid, requestingProfileId, reason = 'User denied') {
    const approval = this.pendingRequests.get(approvalId);
    if (!approval || approval.ownerPid !== requestingPid || approval.ownerProfileId !== requestingProfileId) {
      throw new CloudStateError({
        code: 'ENOENT',
        message: `Cloud approval request "${approvalId}" not found or access denied`,
        operation: 'cloud.denyAction'
      });
    }

    approval.status = 'DENIED';
    approval.reason = reason;
    this.pendingRequests.delete(approvalId);

    return JSON.parse(JSON.stringify(approval));
  }

  /**
   * Explicitly resolve a conflict for a restore approval request.
   * @param {string} approvalId
   * @param {'keep-local'|'keep-cloud'|'cancel'} resolution
   * @param {number} requestingPid
   * @param {string} requestingProfileId
   * @returns {Object}
   */
  resolveConflict(approvalId, resolution, requestingPid, requestingProfileId) {
    if (resolution === 'cancel') {
      return this.denyAction(approvalId, requestingPid, requestingProfileId, 'Conflict resolution cancelled by user');
    }

    if (resolution !== 'keep-local' && resolution !== 'keep-cloud') {
      throw new CloudStateError({
        code: 'EINVALIDRESOLUTION',
        message: `Invalid conflict resolution "${resolution}". Must be 'keep-local', 'keep-cloud', or 'cancel'`,
        operation: 'cloud.resolveConflict'
      });
    }

    return this.approveAction(approvalId, requestingPid, requestingProfileId, resolution);
  }

  /**
   * Reset simulated cloud service.
   */
  reset() {
    this.provider.clear();
    this.pendingRequests.clear();
    this.syncState();
  }

  /**
   * Shutdown simulated cloud service.
   */
  shutdown() {
    this.reset();
  }
}
