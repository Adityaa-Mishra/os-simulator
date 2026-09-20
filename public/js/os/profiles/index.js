/**
 * public/js/os/profiles/index.js
 * Public exports for AdityyaOS User Profiles subsystem.
 */

export { UserProfile } from './UserProfile.js';
export { ProfileStatus, RESERVED_USERNAMES, validateUsername } from './ProfileState.js';
export { ProfileError } from './ProfileError.js';
export { ProfilePolicy } from './ProfilePolicy.js';
export { ProfileManager } from './ProfileManager.js';
export { ProfileServicePort } from './ProfileServicePort.js';
