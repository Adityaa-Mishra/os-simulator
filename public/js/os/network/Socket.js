/**
 * public/js/os/network/Socket.js
 * Simulated TCP and UDP socket implementation for AdityyaOS.
 * Purely in-memory state machine. No real OS/host sockets used.
 */

export const SocketState = Object.freeze({
  CLOSED: 'CLOSED',
  LISTEN: 'LISTEN',
  SYN_SENT: 'SYN_SENT',
  SYN_RECEIVED: 'SYN_RECEIVED',
  ESTABLISHED: 'ESTABLISHED',
  FIN_WAIT: 'FIN_WAIT',
  CLOSE_WAIT: 'CLOSE_WAIT'
});

let socketSeq = 0;

export class Socket {
  /**
   * @param {Object} options
   * @param {string} [options.id]
   * @param {number} options.pid - Owning process ID (enforced by OS/NetworkAPI)
   * @param {'TCP'|'UDP'} [options.protocol='TCP']
   * @param {import('./NetworkManager.js').NetworkManager} [options.networkManager]
   */
  constructor({
    id = null,
    pid,
    protocol = 'TCP',
    networkManager = null
  }) {
    if (typeof pid !== 'number' || isNaN(pid) || pid <= 0) {
      throw new TypeError('Socket requires a valid positive number pid');
    }

    this.id = id || `sock-${++socketSeq}`;
    this.pid = pid;
    this.protocol = protocol.toUpperCase() === 'UDP' ? 'UDP' : 'TCP';
    this._networkManager = networkManager;

    this.localAddress = null;
    this.localPort = null;
    this.remoteAddress = null;
    this.remotePort = null;
    this.state = SocketState.CLOSED;

    this.receiveBuffer = [];
    this.peerSocket = null;
    this._listeners = new Map();
  }

  /**
   * Register event listener ('data', 'connect', 'close', 'error').
   * @param {string} event
   * @param {Function} handler
   */
  on(event, handler) {
    if (typeof handler !== 'function') {
      throw new TypeError('Socket event handler must be a function');
    }
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set());
    }
    this._listeners.get(event).add(handler);
    return () => this.off(event, handler);
  }

  /**
   * Remove event listener.
   * @param {string} event
   * @param {Function} handler
   */
  off(event, handler) {
    if (this._listeners.has(event)) {
      this._listeners.get(event).delete(handler);
    }
  }

  /**
   * Internal event emitter.
   * @private
   * @param {string} event
   * @param {*} data
   */
  _emit(event, data) {
    if (this._listeners.has(event)) {
      for (const handler of this._listeners.get(event)) {
        try {
          handler(data);
        } catch {
          // Swallow listener errors to protect socket loop
        }
      }
    }
  }

  /**
   * Bind socket to local address and port.
   * @param {string} address
   * @param {number} port
   */
  bind(address, port) {
    if (this.state !== SocketState.CLOSED || this.localAddress !== null || this.localPort !== null) {
      const err = new Error('[EINVAL] Socket already bound or connected');
      err.code = 'EINVAL';
      throw err;
    }
    if (!address || typeof address !== 'string') {
      throw new TypeError('Socket.bind requires a valid address');
    }
    if (typeof port !== 'number' || port < 1 || port > 65535) {
      throw new TypeError('Socket.bind requires a valid port (1-65535)');
    }

    if (this._networkManager && this._networkManager.isPortInUse(address, port, this.protocol, this.id)) {
      const err = new Error(`[EADDRINUSE] Address already in use: ${address}:${port}`);
      err.code = 'EADDRINUSE';
      throw err;
    }

    this.localAddress = address;
    this.localPort = port;
  }

  /**
   * Listen for incoming connections (TCP server socket).
   * @param {number} [backlog=5]
   */
  listen(backlog = 5) {
    if (this.protocol !== 'TCP') {
      const err = new Error('Socket.listen is only supported on TCP sockets');
      err.code = 'EOPNOTSUPP';
      throw err;
    }
    if (!this.localAddress || !this.localPort) {
      const err = new Error('Socket must be bound before listening');
      err.code = 'EDESTADDRREQ';
      throw err;
    }

    this.state = SocketState.LISTEN;
    this.backlog = backlog;
  }

  /**
   * Connect to remote endpoint.
   * @param {string} remoteAddress
   * @param {number} remotePort
   * @returns {Promise<void>}
   */
  async connect(remoteAddress, remotePort) {
    if (this.state !== SocketState.CLOSED && this.state !== SocketState.SYN_SENT) {
      const err = new Error('Socket is already connected or listening');
      err.code = 'EISCONN';
      throw err;
    }
    if (!remoteAddress || typeof remoteAddress !== 'string') {
      throw new TypeError('Socket.connect requires a valid remote address');
    }
    if (typeof remotePort !== 'number' || remotePort < 1 || remotePort > 65535) {
      throw new TypeError('Socket.connect requires a valid remote port (1-65535)');
    }

    // Auto-bind local address/ephemeral port if not bound
    if (!this.localAddress) {
      this.localAddress = '127.0.0.1';
    }
    if (!this.localPort) {
      this.localPort = this._networkManager ? this._networkManager.allocateEphemeralPort() : Math.floor(49152 + Math.random() * 10000);
    }

    this.remoteAddress = remoteAddress;
    this.remotePort = remotePort;

    if (this.protocol === 'UDP') {
      this.state = SocketState.ESTABLISHED;
      this._emit('connect', { address: this.remoteAddress, port: this.remotePort });
      return;
    }

    // TCP Handshake Simulation
    this.state = SocketState.SYN_SENT;

    if (this._networkManager) {
      const targetSocket = this._networkManager.findListeningSocket(remoteAddress, remotePort, 'TCP');
      if (!targetSocket) {
        this.state = SocketState.CLOSED;
        const err = new Error(`[ECONNREFUSED] Connection refused to ${remoteAddress}:${remotePort}`);
        err.code = 'ECONNREFUSED';
        this._emit('error', err);
        throw err;
      }

      // Establish simulated peer connection
      this.peerSocket = targetSocket;
      this.state = SocketState.ESTABLISHED;

      // Notify listening server socket of new connection
      targetSocket._handleIncomingConnection(this);
      this._emit('connect', { address: this.remoteAddress, port: this.remotePort });
    } else {
      // Fallback standalone simulation
      this.state = SocketState.ESTABLISHED;
      this._emit('connect', { address: this.remoteAddress, port: this.remotePort });
    }
  }

  /**
   * Internal hook when a listening socket receives an incoming connection.
   * @private
   * @param {Socket} clientSocket
   */
  _handleIncomingConnection(clientSocket) {
    // Create server-side connected socket instance
    const serverConnection = new Socket({
      pid: this.pid,
      protocol: 'TCP',
      networkManager: this._networkManager
    });
    serverConnection.localAddress = this.localAddress;
    serverConnection.localPort = this.localPort;
    serverConnection.remoteAddress = clientSocket.localAddress;
    serverConnection.remotePort = clientSocket.localPort;
    serverConnection.state = SocketState.ESTABLISHED;

    serverConnection.peerSocket = clientSocket;
    clientSocket.peerSocket = serverConnection;

    if (this._networkManager) {
      this._networkManager._registerActiveSocket(serverConnection);
    }

    this._emit('connection', serverConnection);
  }

  /**
   * Send data through socket.
   * @param {*} data
   * @returns {boolean}
   */
  send(data) {
    if (this.state !== SocketState.ESTABLISHED) {
      const err = new Error('Socket is not connected');
      err.code = 'ENOTCONN';
      throw err;
    }

    if (this._networkManager) {
      this._networkManager._recordTransmission(this, data);
    }

    if (this.peerSocket && this.peerSocket.state === SocketState.ESTABLISHED) {
      this.peerSocket._receiveData(data);
      return true;
    }

    // In isolated or simulated UDP without peer
    if (this.protocol === 'UDP') {
      return true;
    }

    const err = new Error('Connection broken');
    err.code = 'EPIPE';
    throw err;
  }

  /**
   * Internal receiver method called when peer sends data.
   * @private
   * @param {*} data
   */
  _receiveData(data) {
    this.receiveBuffer.push(data);
    this._emit('data', data);
  }

  /**
   * Cleanly close the socket.
   */
  close() {
    const wasClosed = this.state === SocketState.CLOSED;
    this.state = SocketState.CLOSED;

    if (this.peerSocket) {
      const peer = this.peerSocket;
      this.peerSocket = null;
      if (peer.state !== SocketState.CLOSED) {
        peer.state = SocketState.CLOSED;
        peer._emit('close', { hadError: false });
      }
    }

    if (this._networkManager) {
      this._networkManager._unregisterSocket(this.id);
    }

    if (!wasClosed) {
      this._emit('close', { hadError: false });
    }
  }

  /**
   * Return a snapshot-safe serializable representation.
   * Strictly data only: no functions, no peerSocket circular references.
   * @returns {Object}
   */
  toJSON() {
    return {
      id: this.id,
      pid: this.pid,
      protocol: this.protocol,
      localAddress: this.localAddress,
      localPort: this.localPort,
      remoteAddress: this.remoteAddress,
      remotePort: this.remotePort,
      state: this.state,
      bufferedCount: this.receiveBuffer.length
    };
  }
}
