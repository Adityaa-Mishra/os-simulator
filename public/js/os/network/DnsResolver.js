/**
 * public/js/os/network/DnsResolver.js
 * Simulated Domain Name System (DNS) resolver for AdityyaOS.
 * Provides hostname resolution, reverse DNS lookup, and local static record management.
 */

export class DnsResolver {
  constructor() {
    this.records = new Map();
    this.initDefaultRecords();
  }

  /**
   * Initialize default hostname-to-IP records.
   */
  initDefaultRecords() {
    this.records.set('localhost', '127.0.0.1');
    this.records.set('adityya.os', '127.0.0.1');
    this.records.set('adityya.dev', '192.168.1.1');
    this.records.set('router.local', '192.168.1.1');
    this.records.set('gateway.local', '192.168.1.1');
    this.records.set('store.adityya.os', '127.0.0.1');
  }

  /**
   * Resolve a hostname to an IPv4 address.
   * If hostname is already an IPv4 address, returns it directly.
   * @param {string} hostname
   * @returns {string}
   */
  resolve(hostname) {
    if (!hostname || typeof hostname !== 'string') {
      const err = new Error('Invalid hostname provided');
      err.code = 'EINVAL';
      throw err;
    }

    const cleanHost = hostname.trim().toLowerCase();

    // If it's already an IP address, return directly
    if (/^(\d{1,3}\.){3}\d{1,3}$/.test(cleanHost)) {
      return cleanHost;
    }

    const ip = this.records.get(cleanHost);
    if (ip) {
      return ip;
    }

    const err = new Error(`getaddrinfo ENOTFOUND ${cleanHost}`);
    err.code = 'ENOTFOUND';
    err.hostname = cleanHost;
    throw err;
  }

  /**
   * Reverse resolve an IP to a hostname.
   * @param {string} ip
   * @returns {string|null}
   */
  reverseResolve(ip) {
    if (!ip || typeof ip !== 'string') return null;
    const cleanIp = ip.trim();
    for (const [host, recIp] of this.records.entries()) {
      if (recIp === cleanIp) {
        return host;
      }
    }
    return null;
  }

  /**
   * Add or update a DNS record.
   * @param {string} hostname
   * @param {string} ip
   */
  addRecord(hostname, ip) {
    if (!hostname || typeof hostname !== 'string') {
      throw new TypeError('DnsResolver requires a non-empty hostname');
    }
    if (!ip || typeof ip !== 'string') {
      throw new TypeError('DnsResolver requires a valid IP string');
    }
    this.records.set(hostname.trim().toLowerCase(), ip.trim());
  }

  /**
   * Remove a DNS record.
   * @param {string} hostname
   * @returns {boolean}
   */
  removeRecord(hostname) {
    return this.records.delete(hostname.trim().toLowerCase());
  }

  /**
   * Get all registered DNS records.
   * @returns {Record<string, string>}
   */
  getRecords() {
    const result = {};
    for (const [k, v] of this.records.entries()) {
      result[k] = v;
    }
    return result;
  }

  /**
   * Reset DNS records to default.
   */
  reset() {
    this.records.clear();
    this.initDefaultRecords();
  }
}
