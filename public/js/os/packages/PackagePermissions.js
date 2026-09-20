/**
 * public/js/os/packages/PackagePermissions.js
 * Centralized, finite permission constants and validation for AdityyaOS application packages.
 */

export const PackagePermissions = Object.freeze({
  FILESYSTEM_READ: 'filesystem.read',
  FILESYSTEM_WRITE: 'filesystem.write',
  SYSTEM_READ: 'system.read',
  PROCESS_SELF: 'process.self',
  PROCESS_READ: 'process.read',
  PROCESS_TERMINATE: 'process.terminate',
  MEMORY_READ: 'memory.read',
  EVENTS_SUBSCRIBE: 'events.subscribe',
  EVENTS_EMIT: 'events.emit',
  WINDOW_CONTROL: 'window.control',
  APPLICATION_LIFECYCLE: 'application.lifecycle',
  // Phase 25: Network Permissions
  NETWORK_READ: 'network.read',
  NETWORK_CONNECT: 'network.connect',
  NETWORK_LISTEN: 'network.listen',
  // Phase 26: AI Permissions
  AI_QUERY: 'ai.query',
  // Phase 27: AI OS Control Permissions
  AI_CONTROL: 'ai.control',
  // Phase 29: Experiment Sandbox Permissions
  EXPERIMENT_READ: 'experiment.read',
  EXPERIMENT_WRITE: 'experiment.write',
  EXPERIMENT_APPLY: 'experiment.apply',
  // Phase 30: User Profile & Cloud State Permissions
  PROFILE_READ: 'profile.read',
  PROFILE_WRITE: 'profile.write',
  PROFILE_SWITCH: 'profile.switch',
  CLOUD_READ: 'cloud.read',
  CLOUD_WRITE: 'cloud.write',
  CLOUD_RESTORE: 'cloud.restore'
});

export const VALID_PACKAGE_PERMISSIONS = Object.freeze([
  PackagePermissions.FILESYSTEM_READ,
  PackagePermissions.FILESYSTEM_WRITE,
  PackagePermissions.SYSTEM_READ,
  PackagePermissions.PROCESS_SELF,
  PackagePermissions.PROCESS_READ,
  PackagePermissions.PROCESS_TERMINATE,
  PackagePermissions.MEMORY_READ,
  PackagePermissions.EVENTS_SUBSCRIBE,
  PackagePermissions.EVENTS_EMIT,
  PackagePermissions.WINDOW_CONTROL,
  PackagePermissions.APPLICATION_LIFECYCLE,
  // Phase 29 & 30
  PackagePermissions.EXPERIMENT_READ,
  PackagePermissions.EXPERIMENT_WRITE,
  PackagePermissions.EXPERIMENT_APPLY,
  PackagePermissions.PROFILE_READ,
  PackagePermissions.PROFILE_WRITE,
  PackagePermissions.PROFILE_SWITCH,
  PackagePermissions.CLOUD_READ,
  PackagePermissions.CLOUD_WRITE,
  PackagePermissions.CLOUD_RESTORE
]);

export const ALL_PERMISSIONS = Object.freeze(Object.values(PackagePermissions));

/**
 * Validate whether a permission string is known and allowed for package manifests.
 * @param {string} permission
 * @returns {boolean}
 */
export function isValidPermission(permission) {
  return typeof permission === 'string' && VALID_PACKAGE_PERMISSIONS.includes(permission);
}
