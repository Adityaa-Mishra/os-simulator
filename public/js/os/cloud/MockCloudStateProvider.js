/**
 * public/js/os/cloud/MockCloudStateProvider.js
 * 100% in-memory, deterministic simulated cloud state provider.
 * Strictly scoped per profileId.
 * ZERO external network, ZERO fetch, ZERO OAuth, ZERO real tokens, ZERO external cloud services.
 */

export class MockCloudStateProvider {
  constructor() {
    // profileId -> Map<snapshotId, CloudSnapshot>
    this.storage = new Map();
  }

  /**
   * Save a snapshot in simulated cloud storage.
   * @param {import('./CloudSnapshot.js').CloudSnapshot} snapshot
   */
  saveSnapshot(snapshot) {
    if (!this.storage.has(snapshot.profileId)) {
      this.storage.set(snapshot.profileId, new Map());
    }
    const profileMap = this.storage.get(snapshot.profileId);
    profileMap.set(snapshot.id, snapshot);
    return snapshot.toJSON();
  }

  /**
   * Get a snapshot for a specific profile.
   * @param {string} profileId
   * @param {string} snapshotId
   * @returns {Object|null}
   */
  getSnapshot(profileId, snapshotId) {
    const profileMap = this.storage.get(profileId);
    if (!profileMap) return null;
    const snap = profileMap.get(snapshotId);
    return snap ? snap.toJSON() : null;
  }

  /**
   * List all snapshots owned by a profile.
   * @param {string} profileId
   * @returns {Array<Object>}
   */
  listSnapshots(profileId) {
    const profileMap = this.storage.get(profileId);
    if (!profileMap) return [];
    return Array.from(profileMap.values()).map(s => s.toJSON());
  }

  /**
   * Delete a snapshot for a profile.
   * @param {string} profileId
   * @param {string} snapshotId
   * @returns {boolean}
   */
  deleteSnapshot(profileId, snapshotId) {
    const profileMap = this.storage.get(profileId);
    if (!profileMap) return false;
    return profileMap.delete(snapshotId);
  }

  /**
   * Clear all simulated cloud storage.
   */
  clear() {
    this.storage.clear();
  }
}
