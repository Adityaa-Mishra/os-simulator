import { describe, it, expect, beforeEach } from 'vitest';
import { Kernel } from '../../../public/js/os/kernel/Kernel.js';
import { APIContext } from '../../../public/js/os/api/APIContext.js';
import { NetworkAPI } from '../../../public/js/os/api/NetworkAPI.js';
import { PackagePermissions } from '../../../public/js/os/packages/PackagePermissions.js';

describe('Phase 25 — NetworkAPI & Permission Enforcement', () => {
  let kernel;

  beforeEach(() => {
    kernel = new Kernel();
    kernel.boot();
  });

  it('denies read methods when network.read is not granted', async () => {
    const context = new APIContext({
      appId: 'test-app',
      instanceId: 'inst-1',
      pid: 10,
      permissions: [] // Zero permissions
    });

    const api = new NetworkAPI({ kernel, context });

    expect(() => api.getInterfaces()).toThrowError(/Permission denied.*network\.read/);
    expect(() => api.getRoutingTable()).toThrowError(/Permission denied.*network\.read/);
    expect(() => api.getDnsRecords()).toThrowError(/Permission denied.*network\.read/);
    expect(() => api.resolveDns('localhost')).toThrowError(/Permission denied.*network\.read/);
    expect(() => api.getStats()).toThrowError(/Permission denied.*network\.read/);
    await expect(api.ping('localhost')).rejects.toThrowError(/Permission denied.*network\.read/);
  });

  it('allows read methods when network.read is granted', async () => {
    const context = new APIContext({
      appId: 'test-app',
      instanceId: 'inst-1',
      pid: 10,
      permissions: [PackagePermissions.NETWORK_READ]
    });

    const api = new NetworkAPI({ kernel, context });

    const ifaces = api.getInterfaces();
    expect(Array.isArray(ifaces)).toBe(true);
    expect(ifaces.some(i => i.name === 'lo0')).toBe(true);

    const routes = api.getRoutingTable();
    expect(Array.isArray(routes)).toBe(true);

    const dns = api.getDnsRecords();
    expect(dns['localhost']).toBe('127.0.0.1');

    const ip = api.resolveDns('localhost');
    expect(ip).toBe('127.0.0.1');

    const stats = api.getStats();
    expect(stats.rxPackets).toBeDefined();

    const pingRes = await api.ping('localhost', 2);
    expect(pingRes.packetLoss).toBe(0);
    expect(pingRes.packetsReceived).toBe(2);
  });

  it('denies createSocket when only network.read is granted', () => {
    const context = new APIContext({
      appId: 'read-only-app',
      instanceId: 'inst-1',
      pid: 10,
      permissions: [PackagePermissions.NETWORK_READ]
    });

    const api = new NetworkAPI({ kernel, context });
    expect(() => api.createSocket()).toThrowError(/Permission denied.*network\.connect.*network\.listen/);
  });

  it('enforces network.connect vs network.listen on socket handle', async () => {
    // 1. App with only network.listen
    const serverCtx = new APIContext({
      appId: 'server-app',
      instanceId: 'inst-server',
      pid: 15,
      permissions: [PackagePermissions.NETWORK_LISTEN]
    });
    const serverApi = new NetworkAPI({ kernel, context: serverCtx });

    const serverSock = serverApi.createSocket({ protocol: 'TCP' });
    expect(serverSock.pid).toBe(15);
    serverSock.bind('127.0.0.1', 8888);
    serverSock.listen();

    // Server should not be allowed to initiate client connections without network.connect
    await expect(serverSock.connect('127.0.0.1', 9999)).rejects.toThrowError(/network\.connect/);

    // 2. App with only network.connect
    const clientCtx = new APIContext({
      appId: 'client-app',
      instanceId: 'inst-client',
      pid: 25,
      permissions: [PackagePermissions.NETWORK_CONNECT]
    });
    const clientApi = new NetworkAPI({ kernel, context: clientCtx });

    const clientSock = clientApi.createSocket({ protocol: 'TCP' });
    expect(clientSock.pid).toBe(25);

    // Client should not be allowed to listen without network.listen
    expect(() => clientSock.listen()).toThrowError(/network\.listen/);

    // Client connects to server
    await clientSock.connect('127.0.0.1', 8888);
    expect(clientSock.state).toBe('ESTABLISHED');

    // Client can send data
    const sent = clientSock.send('test-payload');
    expect(sent).toBe(true);

    serverSock.close();
    clientSock.close();
  });

  it('cleans up owned sockets on api.destroy()', () => {
    const context = new APIContext({
      appId: 'test-app',
      instanceId: 'inst-1',
      pid: 10,
      permissions: [PackagePermissions.NETWORK_CONNECT]
    });

    const api = new NetworkAPI({ kernel, context });
    const sock1 = api.createSocket();
    const sock2 = api.createSocket();

    expect(kernel.networkManager.sockets.has(sock1.id)).toBe(true);
    expect(kernel.networkManager.sockets.has(sock2.id)).toBe(true);

    api.destroy();

    expect(kernel.networkManager.sockets.has(sock1.id)).toBe(false);
    expect(kernel.networkManager.sockets.has(sock2.id)).toBe(false);
  });

  it('does not expose internal kernel or subsystem references through API return values', () => {
    const context = new APIContext({
      appId: 'test-app',
      instanceId: 'inst-1',
      pid: 10,
      permissions: [PackagePermissions.NETWORK_READ, PackagePermissions.NETWORK_CONNECT]
    });

    const api = new NetworkAPI({ kernel, context });
    const ifaces = api.getInterfaces();
    expect(ifaces[0].kernel).toBeUndefined();
    expect(ifaces[0].networkManager).toBeUndefined();

    const sock = api.createSocket();
    expect(sock._kernel).toBeUndefined();
    expect(sock._networkManager).toBeUndefined();
    expect(sock.kernel).toBeUndefined();
  });
});
