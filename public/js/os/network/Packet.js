/**
 * public/js/os/network/Packet.js
 * Simulated network frame/packet model for AdityyaOS.
 * Purely in-memory representation. No real wire/socket serialization.
 */

let packetSeq = 0;

export class Packet {
  /**
   * @param {Object} options
   * @param {string} [options.id]
   * @param {string} [options.srcMac='00:00:00:00:00:00']
   * @param {string} [options.dstMac='00:00:00:00:00:00']
   * @param {string} options.srcIp
   * @param {string} options.dstIp
   * @param {number|null} [options.srcPort=null]
   * @param {number|null} [options.dstPort=null]
   * @param {'TCP'|'UDP'|'ICMP'} [options.protocol='TCP']
   * @param {*} [options.payload='']
   * @param {number} [options.ttl=64]
   * @param {number} [options.checksum=0]
   */
  constructor({
    id = null,
    srcMac = '00:00:00:00:00:00',
    dstMac = '00:00:00:00:00:00',
    srcIp,
    dstIp,
    srcPort = null,
    dstPort = null,
    protocol = 'TCP',
    payload = '',
    ttl = 64,
    checksum = 0
  }) {
    if (!srcIp || typeof srcIp !== 'string') {
      throw new TypeError('Packet requires a valid string srcIp');
    }
    if (!dstIp || typeof dstIp !== 'string') {
      throw new TypeError('Packet requires a valid string dstIp');
    }

    this.id = id || `pkt-${Date.now()}-${++packetSeq}`;
    this.srcMac = srcMac;
    this.dstMac = dstMac;
    this.srcIp = srcIp;
    this.dstIp = dstIp;
    this.srcPort = typeof srcPort === 'number' ? srcPort : null;
    this.dstPort = typeof dstPort === 'number' ? dstPort : null;
    this.protocol = protocol.toUpperCase();
    this.payload = payload;
    this.length = typeof payload === 'string' ? payload.length : JSON.stringify(payload || '').length;
    this.ttl = typeof ttl === 'number' ? ttl : 64;
    this.checksum = typeof checksum === 'number' ? checksum : this._computeChecksum();
    this.timestamp = Date.now();
  }

  /**
   * Simple deterministic checksum simulation based on payload and addresses.
   * @private
   * @returns {number}
   */
  _computeChecksum() {
    const raw = `${this.srcIp}:${this.srcPort}->${this.dstIp}:${this.dstPort}|${this.protocol}|${this.payload}`;
    let hash = 0;
    for (let i = 0; i < raw.length; i++) {
      hash = ((hash << 5) - hash) + raw.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  }

  /**
   * Return a snapshot-safe serializable representation.
   * @returns {Object}
   */
  toJSON() {
    return {
      id: this.id,
      srcMac: this.srcMac,
      dstMac: this.dstMac,
      srcIp: this.srcIp,
      dstIp: this.dstIp,
      srcPort: this.srcPort,
      dstPort: this.dstPort,
      protocol: this.protocol,
      payload: this.payload,
      length: this.length,
      ttl: this.ttl,
      checksum: this.checksum,
      timestamp: this.timestamp
    };
  }

  /**
   * Clone this packet.
   * @returns {Packet}
   */
  clone() {
    return new Packet({
      id: this.id,
      srcMac: this.srcMac,
      dstMac: this.dstMac,
      srcIp: this.srcIp,
      dstIp: this.dstIp,
      srcPort: this.srcPort,
      dstPort: this.dstPort,
      protocol: this.protocol,
      payload: typeof this.payload === 'object' && this.payload !== null ? JSON.parse(JSON.stringify(this.payload)) : this.payload,
      ttl: this.ttl,
      checksum: this.checksum
    });
  }
}
