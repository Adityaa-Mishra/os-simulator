import { describe, it, expect, beforeEach } from 'vitest';
import { NetworkManager } from '../../../public/js/os/network/NetworkManager.js';
import { Socket, SocketState } from '../../../public/js/os/network/Socket.js';
import { Kernel } from '../../../public/js/os/kernel/Kernel.js';

describe('Phase 25 — Sockets & NetworkManager Integration', () => {
  let kernel;
  let netMgr;

  beforeEach(() => {
    kernel = new Kernel();
    kernel.boot();
    netMgr = kernel.networkManager;
  });

  it('enforces valid positive PID on socket creation', () => {
    expect(() => netMgr.createSocket({ pid: null })).toThrow(TypeError);
    expect(() => netMgr.createSocket({ pid: -1 })).toThrow(TypeError);
    expect(() => netMgr.createSocket({ pid: 0 })).toThrow(TypeError);

    const socket = netMgr.createSocket({ pid: 10, protocol: 'TCP' });
    expect(socket.pid).toBe(10);
    expect(socket.protocol).toBe('TCP');
    expect(socket.state).toBe(SocketState.CLOSED);
  });

  it('binds socket to valid address and port', () => {
    const socket = netMgr.createSocket({ pid: 10, protocol: 'TCP' });
    socket.bind('127.0.0.1', 8080);
    expect(socket.localAddress).toBe('127.0.0.1');
    expect(socket.localPort).toBe(8080);

    // Prevents double binding
    expect(() => socket.bind('127.0.0.1', 8081)).toThrow();
  });

  it('prevents address and port collision (EADDRINUSE)', () => {
    const sock1 = netMgr.createSocket({ pid: 10, protocol: 'TCP' });
    sock1.bind('127.0.0.1', 9000);
    sock1.listen();

    const sock2 = netMgr.createSocket({ pid: 11, protocol: 'TCP' });
    expect(() => sock2.bind('127.0.0.1', 9000)).toThrowError(/EADDRINUSE/);
  });

  it('fails with ECONNREFUSED when connecting to non-listening port', async () => {
    const client = netMgr.createSocket({ pid: 20, protocol: 'TCP' });
    await expect(client.connect('127.0.0.1', 9999)).rejects.toThrowError(/ECONNREFUSED/);
    expect(client.state).toBe(SocketState.CLOSED);
  });

  it('establishes connection and exchanges data over localhost loopback', async () => {
    // 1. Server socket
    const server = netMgr.createSocket({ pid: 10, protocol: 'TCP' });
    server.bind('127.0.0.1', 8080);

    let acceptedConnection = null;
    const serverReceivedData = [];

    server.on('connection', conn => {
      acceptedConnection = conn;
      conn.on('data', data => {
        serverReceivedData.push(data);
        // Echo back with prefix
        conn.send(`ECHO: ${data}`);
      });
    });

    server.listen();
    expect(server.state).toBe(SocketState.LISTEN);

    // 2. Client socket
    const client = netMgr.createSocket({ pid: 20, protocol: 'TCP' });
    const clientReceivedData = [];

    client.on('data', data => {
      clientReceivedData.push(data);
    });

    await client.connect('127.0.0.1', 8080);
    expect(client.state).toBe(SocketState.ESTABLISHED);
    expect(acceptedConnection).not.toBeNull();
    expect(acceptedConnection.state).toBe(SocketState.ESTABLISHED);

    // 3. Send from client to server
    client.send('ping message');
    expect(serverReceivedData).toEqual(['ping message']);
    expect(clientReceivedData).toEqual(['ECHO: ping message']);

    // 4. Send another payload
    client.send('second message');
    expect(serverReceivedData).toEqual(['ping message', 'second message']);
    expect(clientReceivedData).toEqual(['ECHO: ping message', 'ECHO: second message']);

    // 5. Clean close from client
    let serverClosed = false;
    acceptedConnection.on('close', () => {
      serverClosed = true;
    });

    client.close();
    expect(client.state).toBe(SocketState.CLOSED);
    expect(serverClosed).toBe(true);
    expect(acceptedConnection.state).toBe(SocketState.CLOSED);
  });

  it('automatically cleans up process sockets on process termination', () => {
    const sock1 = netMgr.createSocket({ pid: 42, protocol: 'TCP' });
    const sock2 = netMgr.createSocket({ pid: 42, protocol: 'UDP' });
    const sock3 = netMgr.createSocket({ pid: 99, protocol: 'TCP' });

    expect(netMgr.sockets.has(sock1.id)).toBe(true);
    expect(netMgr.sockets.has(sock2.id)).toBe(true);
    expect(netMgr.sockets.has(sock3.id)).toBe(true);

    // Terminate PID 42
    netMgr.closeProcessSockets(42);

    expect(sock1.state).toBe(SocketState.CLOSED);
    expect(sock2.state).toBe(SocketState.CLOSED);
    expect(netMgr.sockets.has(sock1.id)).toBe(false);
    expect(netMgr.sockets.has(sock2.id)).toBe(false);
    // PID 99 should remain untouched
    expect(netMgr.sockets.has(sock3.id)).toBe(true);
  });

  it('produces snapshot-safe JSON without circular references', () => {
    const socket = netMgr.createSocket({ pid: 10, protocol: 'TCP' });
    socket.bind('127.0.0.1', 8080);

    const json = socket.toJSON();
    expect(json.id).toBe(socket.id);
    expect(json.pid).toBe(10);
    expect(json.protocol).toBe('TCP');
    expect(json.localAddress).toBe('127.0.0.1');
    expect(json.localPort).toBe(8080);
    expect(json.state).toBe(SocketState.CLOSED);

    // Confirm it survives JSON.stringify / JSON.parse
    const serialized = JSON.stringify(json);
    expect(JSON.parse(serialized)).toEqual(json);
  });
});
