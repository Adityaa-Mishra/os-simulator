/**
 * public/js/os/network/NetworkManager.js
 * Central coordinator and manager for the simulated networking subsystem in AdityyaOS.
 * Owns virtual interfaces, routing table, ARP cache, DNS resolver, sockets, and statistics.
 */

import { NetworkInterface, InterfaceStatus } from './NetworkInterface.js';
import { RoutingTable } from './RoutingTable.js';
import { ArpTable } from './ArpTable.js';
import { DnsResolver } from './DnsResolver.js';
import { Socket, SocketState } from './Socket.js';
import { VirtualNetworkAdapter } from './VirtualNetworkAdapter.js';
import { NetworkState } from './NetworkState.js';
import { OSEvents } from '../kernel/OSEventEmitter.js';

export class NetworkManager {
  /**
   * @param {import('../kernel/Kernel.js').Kernel} kernel
   * @param {Object} [config={}]
   */
  constructor(kernel, config = {}) {
    this.kernel = kernel;
    this.config = config;

    this.interfaces = new Map();
    this.routingTable = new RoutingTable();
    this.arpTable = new ArpTable();
    this.dnsResolver = new DnsResolver();
    this.sockets = new Map();
    this.adapter = new VirtualNetworkAdapter(config.adapter);

    this.stats = {
      rxPackets: 0,
      txPackets: 0,
      rxBytes: 0,
      txBytes: 0,
      droppedPackets: 0
    };

    this._ephemeralPortSeq = 49152;

    this.initialize();
  }

  /**
   * Initialize default interfaces and routes.
   */
  initialize() {
    this.interfaces.clear();
    this.sockets.clear();
    this.routingTable.clear();
    this.arpTable.reset();
    this.dnsResolver.reset();

    // 1. Loopback interface (lo0)
    const lo0 = new NetworkInterface({
      name: 'lo0',
      ip: '127.0.0.1',
      netmask: '255.0.0.0',
      mac: '00:00:00:00:00:00',
      mtu: 65535,
      status: InterfaceStatus.UP
    });
    this.interfaces.set('lo0', lo0);

    // 2. Primary Virtual Ethernet interface (eth0)
    const eth0 = new NetworkInterface({
      name: 'eth0',
      ip: this.config.ip || '192.168.1.100',
      netmask: this.config.netmask || '255.255.255.0',
      mac: this.config.mac || '02:00:00:00:00:01',
      mtu: 1500,
      status: InterfaceStatus.UP
    });
    this.interfaces.set('eth0', eth0);

    // 3. Populate default routing table
    this.routingTable.addRoute({
      destination: '127.0.0.0',
      netmask: '255.0.0.0',
      gateway: '0.0.0.0',
      interface: 'lo0',
      metric: 0
    });
    this.routingTable.addRoute({
      destination: '192.168.1.0',
      netmask: '255.255.255.0',
      gateway: '0.0.0.0',
      interface: 'eth0',
      metric: 10
    });
    this.routingTable.addRoute({
      destination: '0.0.0.0',
      netmask: '0.0.0.0',
      gateway: this.config.gateway || '192.168.1.1',
      interface: 'eth0',
      metric: 100
    });

    this.syncState();
  }

  /**
   * Reset network subsystem to pristine state.
   */
  reset() {
    // Close all open sockets
    for (const socket of this.sockets.values()) {
      try {
        socket.close();
      } catch {
        // Ignore closing errors on reset
      }
    }
    this.sockets.clear();

    this.stats = {
      rxPackets: 0,
      txPackets: 0,
      rxBytes: 0,
      txBytes: 0,
      droppedPackets: 0
    };

    this.initialize();
  }

  /**
   * Shutdown network subsystem.
   */
  shutdown() {
    for (const socket of this.sockets.values()) {
      try {
        socket.close();
      } catch {
        // Ignore closing errors
      }
    }
    this.sockets.clear();

    for (const iface of this.interfaces.values()) {
      iface.down();
    }

    this.syncState();
  }

  /**
   * Get an interface by name.
   * @param {string} name
   * @returns {NetworkInterface|null}
   */
  getInterface(name) {
    return this.interfaces.get(name) || null;
  }

  /**
   * Get all virtual interfaces.
   * @returns {Array<NetworkInterface>}
   */
  getInterfaces() {
    return Array.from(this.interfaces.values());
  }

  /**
   * Create a simulated socket bound to a specific process PID.
   * @param {Object} options
   * @param {number} options.pid - Process ID owning this socket
   * @param {'TCP'|'UDP'} [options.protocol='TCP']
   * @returns {Socket}
   */
  createSocket({ pid, protocol = 'TCP' }) {
    if (typeof pid !== 'number' || isNaN(pid) || pid <= 0) {
      throw new TypeError('NetworkManager.createSocket requires a valid positive number pid');
    }

    const socket = new Socket({
      pid,
      protocol,
      networkManager: this
    });

    this.sockets.set(socket.id, socket);

    if (this.kernel && this.kernel.events) {
      this.kernel.events.emit(OSEvents.NETWORK_SOCKET_CREATED, {
        socketId: socket.id,
        pid: socket.pid,
        protocol: socket.protocol
      });
    }

    this.syncState();
    return socket;
  }

  /**
   * Get a socket by ID.
   * @param {string} id
   * @returns {Socket|null}
   */
  getSocket(id) {
    return this.sockets.get(id) || null;
  }

  /**
   * Close a specific socket by ID.
   * @param {string} id
   * @returns {boolean}
   */
  closeSocket(id) {
    const socket = this.sockets.get(id);
    if (!socket) return false;
    socket.close();
    return true;
  }

  /**
   * Automatically close all sockets belonging to a specific process PID.
   * Invoked upon process termination.
   * @param {number} pid
   */
  closeProcessSockets(pid) {
    if (typeof pid !== 'number') return;
    const processSockets = Array.from(this.sockets.values()).filter(s => s.pid === pid);
    for (const s of processSockets) {
      try {
        s.close();
      } catch {
        // Ignore errors during process cleanup
      }
    }
    this.syncState();
  }

  /**
   * Find an active listening socket matching address and port.
   * @param {string} address
   * @param {number} port
   * @param {'TCP'|'UDP'} protocol
   * @returns {Socket|null}
   */
  findListeningSocket(address, port, protocol) {
    for (const socket of this.sockets.values()) {
      if (
        socket.state === SocketState.LISTEN &&
        socket.protocol === protocol &&
        socket.localPort === port
      ) {
        if (
          socket.localAddress === '0.0.0.0' ||
          socket.localAddress === address ||
          (address === '127.0.0.1' && socket.localAddress === '127.0.0.1')
        ) {
          return socket;
        }
      }
    }
    return null;
  }

  /**
   * Check if a port is in use on a given address.
   * @param {string} address
   * @param {number} port
   * @param {'TCP'|'UDP'} protocol
   * @param {string} [excludeSocketId=null]
   * @returns {boolean}
   */
  isPortInUse(address, port, protocol, excludeSocketId = null) {
    for (const socket of this.sockets.values()) {
      if (excludeSocketId && socket.id === excludeSocketId) continue;
      if (socket.state === SocketState.CLOSED) continue;
      if (
        socket.protocol === protocol &&
        socket.localPort === port &&
        (socket.localAddress === '0.0.0.0' || address === '0.0.0.0' || socket.localAddress === address)
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * Allocate an ephemeral port for client sockets.
   * @returns {number}
   */
  allocateEphemeralPort() {
    const port = this._ephemeralPortSeq++;
    if (this._ephemeralPortSeq > 65000) {
      this._ephemeralPortSeq = 49152;
    }
    return port;
  }

  /**
   * Register an active socket (e.g. accepted server connection).
   * @internal
   * @param {Socket} socket
   */
  _registerActiveSocket(socket) {
    this.sockets.set(socket.id, socket);
    this.syncState();
  }

  /**
   * Unregister socket from active map.
   * @internal
   * @param {string} socketId
   */
  _unregisterSocket(socketId) {
    const socket = this.sockets.get(socketId);
    if (socket) {
      this.sockets.delete(socketId);
      if (this.kernel && this.kernel.events) {
        this.kernel.events.emit(OSEvents.NETWORK_SOCKET_CLOSED, {
          socketId,
          pid: socket.pid
        });
      }
    }
    this.syncState();
  }

  /**
   * Record socket data transmission stats.
   * @internal
   * @param {Socket} socket
   * @param {*} data
   */
  _recordTransmission(socket, data) {
    const len = typeof data === 'string' ? data.length : JSON.stringify(data || '').length;
    this.stats.txPackets++;
    this.stats.txBytes += len;

    // Attribute to interface if applicable
    const ifaceName = socket.localAddress === '127.0.0.1' ? 'lo0' : 'eth0';
    const iface = this.interfaces.get(ifaceName);
    if (iface) {
      iface.stats.txPackets++;
      iface.stats.txBytes += len;
    }

    if (this.kernel && this.kernel.events) {
      this.kernel.events.emit(OSEvents.NETWORK_PACKET_SENT, {
        socketId: socket.id,
        bytes: len
      });
    }
  }

  /**
   * Perform a simulated ICMP ping against an IP or hostname.
   * @param {string} target - Hostname or IP address
   * @param {number} [count=4] - Number of ping attempts
   * @returns {Promise<Object>}
   */
  async ping(target, count = 4) {
    if (!target || typeof target !== 'string') {
      throw new TypeError('ping requires a valid target string');
    }

    let ip = target;
    try {
      ip = this.dnsResolver.resolve(target);
    } catch {
      // If DNS resolution fails, report 100% loss
      return {
        target,
        ip: null,
        packetsTransmitted: count,
        packetsReceived: 0,
        packetLoss: 100,
        rttMs: [],
        avgRttMs: null,
        error: `Could not resolve hostname: ${target}`
      };
    }

    const route = this.routingTable.findRoute(ip);
    if (!route) {
      return {
        target,
        ip,
        packetsTransmitted: count,
        packetsReceived: 0,
        packetLoss: 100,
        rttMs: [],
        avgRttMs: null,
        error: `No route to host: ${ip}`
      };
    }

    const iface = this.interfaces.get(route.interface);
    if (!iface || !iface.isUp()) {
      return {
        target,
        ip,
        packetsTransmitted: count,
        packetsReceived: 0,
        packetLoss: 100,
        rttMs: [],
        avgRttMs: null,
        error: `Interface ${route.interface} is DOWN`
      };
    }

    // Generate deterministic simulated RTTs
    const rtts = [];
    for (let i = 0; i < count; i++) {
      const baseRtt = iface.name === 'lo0' ? 0.2 : 12.5;
      const jitter = (i % 3) * 0.4;
      rtts.push(Number((baseRtt + jitter).toFixed(2)));
    }

    const avgRtt = Number((rtts.reduce((a, b) => a + b, 0) / rtts.length).toFixed(2));

    this.stats.txPackets += count;
    this.stats.rxPackets += count;
    this.stats.txBytes += count * 64;
    this.stats.rxBytes += count * 64;
    iface.stats.txPackets += count;
    iface.stats.rxPackets += count;
    iface.stats.txBytes += count * 64;
    iface.stats.rxBytes += count * 64;

    return {
      target,
      ip,
      packetsTransmitted: count,
      packetsReceived: count,
      packetLoss: 0,
      rttMs: rtts,
      avgRttMs: avgRtt
    };
  }

  /**
   * Get subsystem statistics.
   * @returns {Object}
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * Return a snapshot-safe serializable NetworkState representation.
   * Strictly data only: no functions, DOM nodes, or circular socket references.
   * @returns {NetworkState}
   */
  getNetworkState() {
    return new NetworkState({
      interfaces: Array.from(this.interfaces.values()).map(i => i.toJSON()),
      routingTable: this.routingTable.getRoutes(),
      arpTable: this.arpTable.getEntries(),
      dnsRecords: this.dnsResolver.getRecords(),
      sockets: Array.from(this.sockets.values()).map(s => s.toJSON()),
      stats: this.getStats()
    });
  }

  /**
   * Synchronize network state to central OSState.
   */
  syncState() {
    if (this.kernel && this.kernel.state) {
      this.kernel.state.network = this.getNetworkState().toJSON();
    }
  }
}
