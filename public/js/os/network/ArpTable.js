/**
 * public/js/os/network/ArpTable.js
 * Address Resolution Protocol (ARP) table simulation for AdityyaOS.
 * Maps IPv4 addresses to simulated MAC addresses.
 */

export class ArpTable {
  constructor() {
    this.entries = new Map();
    this.initDefaultEntries();
  }

  /**
   * Initialize standard default static entries.
   */
  initDefaultEntries() {
    this.addEntry('127.0.0.1', '00:00:00:00:00:00', true);
    this.addEntry('255.255.255.255', 'FF:FF:FF:FF:FF:FF', true);
  }

  /**
   * Add or update an ARP entry.
   * @param {string} ip
   * @param {string} mac
   * @param {boolean} [isStatic=false]
   */
  addEntry(ip, mac, isStatic = false) {
    if (!ip || typeof ip !== 'string') {
      throw new TypeError('ArpTable requires a valid IP string');
    }
    if (!mac || typeof mac !== 'string') {
      throw new TypeError('ArpTable requires a valid MAC string');
    }

    this.entries.set(ip, {
      ip,
      mac,
      isStatic: Boolean(isStatic),
      timestamp: Date.now()
    });
  }

  /**
   * Resolve an IP to a MAC address.
   * If not found, dynamically resolves via deterministic MAC generation for simulated hosts.
   * @param {string} ip
   * @returns {string}
   */
  resolve(ip) {
    const entry = this.entries.get(ip);
    if (entry) {
      return entry.mac;
    }

    // Auto-resolve simulated local subnet hosts dynamically
    const parts = ip.split('.').map(p => parseInt(p, 10));
    if (parts.length === 4 && parts.every(p => !isNaN(p) && p >= 0 && p <= 255)) {
      const hexParts = parts.map(p => p.toString(16).padStart(2, '0'));
      const generatedMac = `02:00:${hexParts[0]}:${hexParts[1]}:${hexParts[2]}:${hexParts[3]}`;
      this.addEntry(ip, generatedMac, false);
      return generatedMac;
    }

    return null;
  }

  /**
   * Remove an ARP entry.
   * @param {string} ip
   * @returns {boolean}
   */
  removeEntry(ip) {
    return this.entries.delete(ip);
  }

  /**
   * Get snapshot of all ARP entries.
   * @returns {Array<Object>}
   */
  getEntries() {
    return Array.from(this.entries.values()).map(e => ({ ...e }));
  }

  /**
   * Clear all non-static entries.
   */
  clear() {
    for (const [ip, entry] of this.entries.entries()) {
      if (!entry.isStatic) {
        this.entries.delete(ip);
      }
    }
  }

  /**
   * Reset table to default state.
   */
  reset() {
    this.entries.clear();
    this.initDefaultEntries();
  }
}
