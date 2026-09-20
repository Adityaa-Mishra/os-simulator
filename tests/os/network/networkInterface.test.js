import { describe, it, expect, beforeEach } from 'vitest';
import { NetworkInterface, InterfaceStatus } from '../../../public/js/os/network/NetworkInterface.js';
import { Packet } from '../../../public/js/os/network/Packet.js';
import { VirtualNetworkAdapter } from '../../../public/js/os/network/VirtualNetworkAdapter.js';
import { DeviceStatus } from '../../../public/js/os/hardware/HardwareState.js';

describe('Phase 25 — NetworkInterface & VirtualNetworkAdapter', () => {
  let iface;

  beforeEach(() => {
    iface = new NetworkInterface({
      name: 'eth0',
      ip: '192.168.1.100',
      netmask: '255.255.255.0',
      mac: '02:00:00:00:00:01',
      mtu: 1500,
      status: InterfaceStatus.UP
    });
  });

  it('initializes with correct properties and default stats', () => {
    expect(iface.name).toBe('eth0');
    expect(iface.ip).toBe('192.168.1.100');
    expect(iface.netmask).toBe('255.255.255.0');
    expect(iface.mac).toBe('02:00:00:00:00:01');
    expect(iface.mtu).toBe(1500);
    expect(iface.isUp()).toBe(true);
    expect(iface.getStats()).toEqual({
      rxPackets: 0,
      txPackets: 0,
      rxBytes: 0,
      txBytes: 0,
      droppedPackets: 0
    });
  });

  it('rejects invalid construction parameters', () => {
    expect(() => new NetworkInterface({ name: '', ip: '127.0.0.1' })).toThrow(TypeError);
    expect(() => new NetworkInterface({ name: 'lo0', ip: '' })).toThrow(TypeError);
  });

  it('toggles UP and DOWN status cleanly', () => {
    iface.down();
    expect(iface.isUp()).toBe(false);
    expect(iface.status).toBe(InterfaceStatus.DOWN);

    iface.up();
    expect(iface.isUp()).toBe(true);
    expect(iface.status).toBe(InterfaceStatus.UP);
  });

  it('records transmitted packets and updates tx stats', () => {
    const pkt = new Packet({
      srcIp: '192.168.1.100',
      dstIp: '192.168.1.1',
      payload: 'hello network'
    });

    const success = iface.send(pkt);
    expect(success).toBe(true);
    expect(iface.stats.txPackets).toBe(1);
    expect(iface.stats.txBytes).toBe(pkt.length);
    expect(iface.stats.droppedPackets).toBe(0);
  });

  it('drops packets when interface is DOWN', () => {
    iface.down();
    const pkt = new Packet({
      srcIp: '192.168.1.100',
      dstIp: '192.168.1.1',
      payload: 'dropped packet'
    });

    const sendRes = iface.send(pkt);
    expect(sendRes).toBe(false);
    expect(iface.stats.droppedPackets).toBe(1);

    const recvRes = iface.receive(pkt);
    expect(recvRes).toBe(false);
    expect(iface.stats.droppedPackets).toBe(2);
  });

  it('drops packets exceeding MTU', () => {
    const hugePayload = 'X'.repeat(2000);
    const pkt = new Packet({
      srcIp: '192.168.1.100',
      dstIp: '192.168.1.1',
      payload: hugePayload
    });

    const success = iface.send(pkt);
    expect(success).toBe(false);
    expect(iface.stats.droppedPackets).toBe(1);
    expect(iface.stats.txPackets).toBe(0);
  });

  it('serializes snapshot safely via toJSON()', () => {
    const json = iface.toJSON();
    expect(json.name).toBe('eth0');
    expect(json.ip).toBe('192.168.1.100');
    expect(json.status).toBe(InterfaceStatus.UP);
    expect(json.stats.txPackets).toBe(0);
    expect(typeof json).toBe('object');
  });

  describe('VirtualNetworkAdapter', () => {
    it('initializes as a virtual hardware device of type network', () => {
      const adapter = new VirtualNetworkAdapter({
        id: 'net0',
        macAddress: '02:00:00:00:00:01',
        speedMbps: 1000
      });

      expect(adapter.id).toBe('net0');
      expect(adapter.type).toBe('network');
      expect(adapter.macAddress).toBe('02:00:00:00:00:01');
      expect(adapter.speedMbps).toBe(1000);
      expect(adapter.status).toBe(DeviceStatus.OFFLINE);

      const initRes = adapter.initialize();
      expect(initRes.success).toBe(true);
      expect(adapter.status).toBe(DeviceStatus.READY);
    });

    it('simulates link detection and packet transmission', () => {
      const adapter = new VirtualNetworkAdapter();
      adapter.initialize();

      const pkt = new Packet({
        srcIp: '192.168.1.100',
        dstIp: '192.168.1.1',
        payload: 'test'
      });

      expect(adapter.transmit(pkt)).toBe(true);

      adapter.setLink(false);
      expect(adapter.transmit(pkt)).toBe(false);

      adapter.setLink(true);
      expect(adapter.transmit(pkt)).toBe(true);
    });
  });
});
