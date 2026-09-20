/**
 * public/js/os/network/RoutingTable.js
 * Routing table and Longest Prefix Match (LPM) IPv4 lookup for AdityyaOS.
 */

/**
 * Convert IPv4 string to 32-bit unsigned integer.
 * @param {string} ip
 * @returns {number}
 */
export function ipToInt(ip) {
  if (!ip || typeof ip !== 'string') return 0;
  const parts = ip.split('.').map(p => parseInt(p, 10));
  if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) {
    return 0;
  }
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

/**
 * Calculate CIDR prefix length from netmask string.
 * @param {string} netmask
 * @returns {number}
 */
export function netmaskToPrefixLen(netmask) {
  const intVal = ipToInt(netmask);
  let count = 0;
  for (let i = 31; i >= 0; i--) {
    if ((intVal >>> i) & 1) {
      count++;
    } else {
      break;
    }
  }
  return count;
}

export class RoutingTable {
  constructor() {
    this.routes = [];
  }

  /**
   * Add a route entry.
   * @param {Object} route
   * @param {string} route.destination - Network destination (e.g. '127.0.0.0', '192.168.1.0', '0.0.0.0')
   * @param {string} [route.netmask='255.255.255.0'] - Subnet mask
   * @param {string} [route.gateway='0.0.0.0'] - Gateway IP
   * @param {string} route.interface - Interface name (e.g. 'lo0', 'eth0')
   * @param {number} [route.metric=0] - Route metric
   */
  addRoute({
    destination,
    netmask = '255.255.255.0',
    gateway = '0.0.0.0',
    interface: iface,
    metric = 0
  }) {
    if (!destination || typeof destination !== 'string') {
      throw new TypeError('Route requires a valid destination IP string');
    }
    if (!iface || typeof iface !== 'string') {
      throw new TypeError('Route requires a valid interface name');
    }

    const entry = {
      destination,
      netmask,
      gateway,
      interface: iface,
      metric: typeof metric === 'number' ? metric : 0,
      prefixLen: netmaskToPrefixLen(netmask),
      destInt: ipToInt(destination),
      maskInt: ipToInt(netmask)
    };

    // Replace if duplicate destination & netmask
    const existingIndex = this.routes.findIndex(
      r => r.destination === destination && r.netmask === netmask
    );
    if (existingIndex >= 0) {
      this.routes[existingIndex] = entry;
    } else {
      this.routes.push(entry);
    }
  }

  /**
   * Remove a route.
   * @param {string} destination
   * @param {string} [netmask='255.255.255.0']
   * @returns {boolean}
   */
  removeRoute(destination, netmask = '255.255.255.0') {
    const initialLen = this.routes.length;
    this.routes = this.routes.filter(
      r => !(r.destination === destination && r.netmask === netmask)
    );
    return this.routes.length < initialLen;
  }

  /**
   * Find matching route using Longest Prefix Match (LPM).
   * @param {string} destinationIp
   * @returns {Object|null}
   */
  findRoute(destinationIp) {
    const targetInt = ipToInt(destinationIp);
    let bestMatch = null;

    for (const route of this.routes) {
      if (((targetInt & route.maskInt) >>> 0) === ((route.destInt & route.maskInt) >>> 0)) {
        if (!bestMatch) {
          bestMatch = route;
        } else if (route.prefixLen > bestMatch.prefixLen) {
          bestMatch = route;
        } else if (route.prefixLen === bestMatch.prefixLen && route.metric < bestMatch.metric) {
          bestMatch = route;
        }
      }
    }

    if (!bestMatch) return null;

    return {
      destination: bestMatch.destination,
      netmask: bestMatch.netmask,
      gateway: bestMatch.gateway,
      interface: bestMatch.interface,
      metric: bestMatch.metric,
      prefixLen: bestMatch.prefixLen
    };
  }

  /**
   * Get all active routes.
   * @returns {Array<Object>}
   */
  getRoutes() {
    return this.routes.map(r => ({
      destination: r.destination,
      netmask: r.netmask,
      gateway: r.gateway,
      interface: r.interface,
      metric: r.metric,
      prefixLen: r.prefixLen
    }));
  }

  /**
   * Clear all routes.
   */
  clear() {
    this.routes = [];
  }
}
