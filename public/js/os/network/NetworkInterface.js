/**
 * public/js/os/network/NetworkInterface.js
 * Virtual network interface representation for AdityyaOS.
 * Models interface state, IP/MAC addressing, MTU, status (UP/DOWN), and traffic statistics.
 */

export const InterfaceStatus = Object.freeze({
  UP: 'UP',
  DOWN: 'DOWN'
});

export class NetworkInterface {
  /**
   * @param {Object} options
   * @param {string} options.name - e.g. 'lo0', 'eth0'
   * @param {string} options.ip - e.g. '127.0.0.1', '192.168.1.100'
   * @param {string} [options.netmask='255.255.255.0'] - Subnet mask
   * @param {string} [options.mac='02:00:00:00:00:01'] - Simulated MAC address
   * @param {number} [options.mtu=1500] - Maximum Transmission Unit
   * @param {'UP'|'DOWN'} [options.status='UP'] - Initial status
   */
  constructor({
    name,
    ip,
    netmask = '255.255.255.0',
    mac = '02:00:00:00:00:01',
    mtu = 1500,
    status = InterfaceStatus.UP
  }) {
    if (!name || typeof name !== 'string') {
      throw new TypeError('NetworkInterface requires a non-empty string name');
    }
    if (!ip || typeof ip !== 'string') {
      throw new TypeError('NetworkInterface requires a non-empty string ip');
    }

    this.name = name;
    this.ip = ip;
    this.netmask = netmask;
    this.mac = mac;
    this.mtu = typeof mtu === 'number' ? mtu : 1500;
    this.status = status === InterfaceStatus.DOWN ? InterfaceStatus.DOWN : InterfaceStatus.UP;

    this.stats = {
      rxPackets: 0,
      txPackets: 0,
      rxBytes: 0,
      txBytes: 0,
      droppedPackets: 0
    };
  }

  /**
   * Bring interface UP.
   */
  up() {
    this.status = InterfaceStatus.UP;
  }

  /**
   * Bring interface DOWN.
   */
  down() {
    this.status = InterfaceStatus.DOWN;
  }

  /**
   * Check if interface is currently UP.
   * @returns {boolean}
   */
  isUp() {
    return this.status === InterfaceStatus.UP;
  }

  /**
   * Record transmitted packet statistics.
   * @param {import('./Packet.js').Packet} packet
   * @returns {boolean} Whether packet was accepted for transmission
   */
  send(packet) {
    if (!this.isUp()) {
      this.stats.droppedPackets++;
      return false;
    }
    if (packet.length > this.mtu) {
      this.stats.droppedPackets++;
      return false;
    }
    this.stats.txPackets++;
    this.stats.txBytes += packet.length;
    return true;
  }

  /**
   * Record received packet statistics.
   * @param {import('./Packet.js').Packet} packet
   * @returns {boolean} Whether packet was accepted on receipt
   */
  receive(packet) {
    if (!this.isUp()) {
      this.stats.droppedPackets++;
      return false;
    }
    this.stats.rxPackets++;
    this.stats.rxBytes += packet.length;
    return true;
  }

  /**
   * Get safe copy of interface statistics.
   * @returns {Object}
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * Return a snapshot-safe serializable representation.
   * @returns {Object}
   */
  toJSON() {
    return {
      name: this.name,
      ip: this.ip,
      netmask: this.netmask,
      mac: this.mac,
      mtu: this.mtu,
      status: this.status,
      stats: this.getStats()
    };
  }
}
