/**
 * public/js/os/api/NetworkAPI.js
 * Application-facing facade for the AdityyaOS Networking Subsystem.
 * Strictly enforces permission boundaries, isolates socket ownership by PID,
 * and prevents leaking Kernel or internal subsystem references.
 */

import { APIError } from './APIError.js';
import { PackagePermissions } from '../packages/PackagePermissions.js';

export class NetworkAPI {
  /**
   * @param {Object} options
   * @param {import('../kernel/Kernel.js').Kernel} options.kernel
   * @param {import('./APIContext.js').APIContext} options.context
   */
  constructor({ kernel, context }) {
    if (!kernel) {
      throw new TypeError('NetworkAPI requires a kernel instance');
    }
    if (!context) {
      throw new TypeError('NetworkAPI requires an APIContext instance');
    }

    this._kernel = kernel;
    this._context = context;
    this._ownedSocketIds = new Set();
  }

  /**
   * Helper to verify a required permission.
   * @private
   * @param {string} permission
   * @param {string} operation
   */
  _ensurePermission(permission, operation) {
    if (!this._context.hasPermission(permission)) {
      throw new APIError({
        code: 'EPERM',
        message: `Permission denied: '${permission}' required for ${operation}`,
        operation,
        appId: this._context.appId
      });
    }
  }

  /**
   * Get virtual network interfaces.
   * Requires 'network.read' permission.
   * @returns {Array<Object>}
   */
  getInterfaces() {
    this._ensurePermission(PackagePermissions.NETWORK_READ, 'network.getInterfaces');
    const ifaces = this._kernel.networkManager.getInterfaces();
    return JSON.parse(JSON.stringify(ifaces.map(i => i.toJSON())));
  }

  /**
   * Get active routing table entries.
   * Requires 'network.read' permission.
   * @returns {Array<Object>}
   */
  getRoutingTable() {
    this._ensurePermission(PackagePermissions.NETWORK_READ, 'network.getRoutingTable');
    return JSON.parse(JSON.stringify(this._kernel.networkManager.routingTable.getRoutes()));
  }

  /**
   * Get registered DNS records.
   * Requires 'network.read' permission.
   * @returns {Record<string, string>}
   */
  getDnsRecords() {
    this._ensurePermission(PackagePermissions.NETWORK_READ, 'network.getDnsRecords');
    return JSON.parse(JSON.stringify(this._kernel.networkManager.dnsResolver.getRecords()));
  }

  /**
   * Resolve a hostname to an IPv4 address.
   * Requires 'network.read' permission.
   * @param {string} hostname
   * @returns {string}
   */
  resolveDns(hostname) {
    this._ensurePermission(PackagePermissions.NETWORK_READ, 'network.resolveDns');
    try {
      return this._kernel.networkManager.dnsResolver.resolve(hostname);
    } catch (err) {
      throw new APIError({
        code: err.code || 'ENOTFOUND',
        message: err.message,
        operation: 'network.resolveDns',
        appId: this._context.appId,
        cause: err
      });
    }
  }

  /**
   * Ping a target hostname or IP address.
   * Requires 'network.read' permission.
   * @param {string} target
   * @param {number} [count=4]
   * @returns {Promise<Object>}
   */
  async ping(target, count = 4) {
    this._ensurePermission(PackagePermissions.NETWORK_READ, 'network.ping');
    return this._kernel.networkManager.ping(target, count);
  }

  /**
   * Get network traffic statistics.
   * Requires 'network.read' permission.
   * @returns {Object}
   */
  getStats() {
    this._ensurePermission(PackagePermissions.NETWORK_READ, 'network.getStats');
    return JSON.parse(JSON.stringify(this._kernel.networkManager.getStats()));
  }

  /**
   * Create a simulated socket bound strictly to this application's process PID.
   * Requires either 'network.connect' or 'network.listen'.
   * @param {Object} [options={}]
   * @param {'TCP'|'UDP'} [options.protocol='TCP']
   * @returns {Object} Controlled socket handle
   */
  createSocket(options = {}) {
    const hasConnect = this._context.hasPermission(PackagePermissions.NETWORK_CONNECT);
    const hasListen = this._context.hasPermission(PackagePermissions.NETWORK_LISTEN);

    if (!hasConnect && !hasListen) {
      throw new APIError({
        code: 'EPERM',
        message: "Permission denied: 'network.connect' or 'network.listen' required to create a socket",
        operation: 'network.createSocket',
        appId: this._context.appId
      });
    }

    // PID is strictly enforced from context and cannot be spoofed
    const realSocket = this._kernel.networkManager.createSocket({
      pid: this._context.pid,
      protocol: options.protocol || 'TCP'
    });

    this._ownedSocketIds.add(realSocket.id);

    // Create a controlled wrapper that enforces per-operation permissions
    // and hides kernel/networkManager references from the application.
    const context = this._context;

    const socketHandle = {
      id: realSocket.id,
      pid: realSocket.pid,
      protocol: realSocket.protocol,

      get state() {
        return realSocket.state;
      },
      get localAddress() {
        return realSocket.localAddress;
      },
      get localPort() {
        return realSocket.localPort;
      },
      get remoteAddress() {
        return realSocket.remoteAddress;
      },
      get remotePort() {
        return realSocket.remotePort;
      },

      bind(address, port) {
        if (!context.hasPermission(PackagePermissions.NETWORK_LISTEN) && !context.hasPermission(PackagePermissions.NETWORK_CONNECT)) {
          throw new APIError({
            code: 'EPERM',
            message: "Permission denied: 'network.listen' or 'network.connect' required to bind socket",
            operation: 'socket.bind',
            appId: context.appId
          });
        }
        return realSocket.bind(address, port);
      },

      listen(backlog) {
        if (!context.hasPermission(PackagePermissions.NETWORK_LISTEN)) {
          throw new APIError({
            code: 'EPERM',
            message: "Permission denied: 'network.listen' required to listen on socket",
            operation: 'socket.listen',
            appId: context.appId
          });
        }
        return realSocket.listen(backlog);
      },

      async connect(remoteAddress, remotePort) {
        if (!context.hasPermission(PackagePermissions.NETWORK_CONNECT)) {
          throw new APIError({
            code: 'EPERM',
            message: "Permission denied: 'network.connect' required to connect socket",
            operation: 'socket.connect',
            appId: context.appId
          });
        }
        return realSocket.connect(remoteAddress, remotePort);
      },

      send(data) {
        if (!context.hasPermission(PackagePermissions.NETWORK_CONNECT)) {
          throw new APIError({
            code: 'EPERM',
            message: "Permission denied: 'network.connect' required to send data",
            operation: 'socket.send',
            appId: context.appId
          });
        }
        return realSocket.send(data);
      },

      close() {
        return realSocket.close();
      },

      on(event, handler) {
        return realSocket.on(event, handler);
      },

      off(event, handler) {
        return realSocket.off(event, handler);
      },

      toJSON() {
        return realSocket.toJSON();
      }
    };

    return socketHandle;
  }

  /**
   * Destroy this NetworkAPI instance and clean up all sockets owned by it.
   */
  destroy() {
    for (const socketId of this._ownedSocketIds) {
      try {
        this._kernel.networkManager.closeSocket(socketId);
      } catch {
        // Ignore errors during API destruction
      }
    }
    this._ownedSocketIds.clear();
  }
}
