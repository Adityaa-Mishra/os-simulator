/**
 * public/js/os/network/NetworkState.js
 * Central, deterministic, serializable network state model for AdityyaOS.
 */

export class NetworkState {
  constructor(initialData = {}) {
    this.interfaces = initialData.interfaces || [];
    this.routingTable = initialData.routingTable || [];
    this.arpTable = initialData.arpTable || [];
    this.dnsRecords = initialData.dnsRecords || {};
    this.sockets = initialData.sockets || [];
    this.stats = initialData.stats || {
      rxPackets: 0,
      txPackets: 0,
      rxBytes: 0,
      txBytes: 0,
      droppedPackets: 0
    };
  }

  /**
   * Return a snapshot-safe serializable deep copy.
   * @returns {Object}
   */
  toJSON() {
    return JSON.parse(JSON.stringify({
      interfaces: this.interfaces,
      routingTable: this.routingTable,
      arpTable: this.arpTable,
      dnsRecords: this.dnsRecords,
      sockets: this.sockets,
      stats: this.stats
    }));
  }

  /**
   * Clone network state.
   * @returns {Object}
   */
  clone() {
    return this.toJSON();
  }
}
