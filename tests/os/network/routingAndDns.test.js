import { describe, it, expect, beforeEach } from 'vitest';
import { RoutingTable, ipToInt, netmaskToPrefixLen } from '../../../public/js/os/network/RoutingTable.js';
import { ArpTable } from '../../../public/js/os/network/ArpTable.js';
import { DnsResolver } from '../../../public/js/os/network/DnsResolver.js';

describe('Phase 25 — RoutingTable, ArpTable & DnsResolver', () => {
  describe('RoutingTable', () => {
    let rt;

    beforeEach(() => {
      rt = new RoutingTable();
      // Setup typical routing table
      rt.addRoute({
        destination: '127.0.0.0',
        netmask: '255.0.0.0',
        gateway: '0.0.0.0',
        interface: 'lo0',
        metric: 0
      });
      rt.addRoute({
        destination: '192.168.1.0',
        netmask: '255.255.255.0',
        gateway: '0.0.0.0',
        interface: 'eth0',
        metric: 10
      });
      rt.addRoute({
        destination: '192.168.1.50',
        netmask: '255.255.255.255',
        gateway: '0.0.0.0',
        interface: 'eth0:specific',
        metric: 5
      });
      rt.addRoute({
        destination: '0.0.0.0',
        netmask: '0.0.0.0',
        gateway: '192.168.1.1',
        interface: 'eth0',
        metric: 100
      });
    });

    it('calculates ipToInt and netmaskToPrefixLen correctly', () => {
      expect(ipToInt('127.0.0.1')).toBe(2130706433);
      expect(ipToInt('255.255.255.0')).toBe(4294967040);
      expect(netmaskToPrefixLen('255.255.255.0')).toBe(24);
      expect(netmaskToPrefixLen('255.0.0.0')).toBe(8);
      expect(netmaskToPrefixLen('0.0.0.0')).toBe(0);
      expect(netmaskToPrefixLen('255.255.255.255')).toBe(32);
    });

    it('routes loopback destination to lo0', () => {
      const route = rt.findRoute('127.0.0.1');
      expect(route).not.toBeNull();
      expect(route.interface).toBe('lo0');
      expect(route.destination).toBe('127.0.0.0');
    });

    it('prefers more specific route (/32 over /24) via Longest Prefix Match', () => {
      const specific = rt.findRoute('192.168.1.50');
      expect(specific).not.toBeNull();
      expect(specific.interface).toBe('eth0:specific');
      expect(specific.prefixLen).toBe(32);

      const general = rt.findRoute('192.168.1.100');
      expect(general).not.toBeNull();
      expect(general.interface).toBe('eth0');
      expect(general.prefixLen).toBe(24);
    });

    it('falls back to default route (0.0.0.0/0) for external addresses', () => {
      const external = rt.findRoute('8.8.8.8');
      expect(external).not.toBeNull();
      expect(external.destination).toBe('0.0.0.0');
      expect(external.gateway).toBe('192.168.1.1');
    });

    it('removes route properly', () => {
      expect(rt.removeRoute('192.168.1.50', '255.255.255.255')).toBe(true);
      const after = rt.findRoute('192.168.1.50');
      expect(after.interface).toBe('eth0'); // fell back to /24
    });
  });

  describe('ArpTable', () => {
    let arp;

    beforeEach(() => {
      arp = new ArpTable();
    });

    it('has default static entries for loopback and broadcast', () => {
      expect(arp.resolve('127.0.0.1')).toBe('00:00:00:00:00:00');
      expect(arp.resolve('255.255.255.255')).toBe('FF:FF:FF:FF:FF:FF');
    });

    it('dynamically resolves local subnet IPs to deterministic simulated MACs', () => {
      const mac = arp.resolve('192.168.1.100');
      expect(mac).toBe('02:00:c0:a8:01:64');
      // Subsequent lookup uses cached entry
      expect(arp.resolve('192.168.1.100')).toBe('02:00:c0:a8:01:64');
    });

    it('allows manually adding static entries', () => {
      arp.addEntry('192.168.1.1', '52:54:00:12:34:56', true);
      expect(arp.resolve('192.168.1.1')).toBe('52:54:00:12:34:56');
    });

    it('clears dynamic entries while retaining static ones', () => {
      arp.resolve('192.168.1.200'); // dynamic
      arp.addEntry('192.168.1.1', '52:54:00:12:34:56', true); // static

      arp.clear();
      const entries = arp.getEntries();
      expect(entries.some(e => e.ip === '192.168.1.200')).toBe(false);
      expect(entries.some(e => e.ip === '192.168.1.1')).toBe(true);
      expect(entries.some(e => e.ip === '127.0.0.1')).toBe(true);
    });
  });

  describe('DnsResolver', () => {
    let dns;

    beforeEach(() => {
      dns = new DnsResolver();
    });

    it('resolves built-in hostnames to IPs', () => {
      expect(dns.resolve('localhost')).toBe('127.0.0.1');
      expect(dns.resolve('adityya.os')).toBe('127.0.0.1');
      expect(dns.resolve('adityya.dev')).toBe('192.168.1.1');
      expect(dns.resolve('router.local')).toBe('192.168.1.1');
    });

    it('returns IP string directly if already an IPv4 address', () => {
      expect(dns.resolve('10.0.0.1')).toBe('10.0.0.1');
    });

    it('throws ENOTFOUND on unknown host', () => {
      expect(() => dns.resolve('unknown.nonexistent.domain')).toThrowError(/ENOTFOUND/);
      try {
        dns.resolve('unknown.domain');
      } catch (err) {
        expect(err.code).toBe('ENOTFOUND');
      }
    });

    it('supports adding and removing custom DNS records', () => {
      dns.addRecord('api.internal', '192.168.1.50');
      expect(dns.resolve('api.internal')).toBe('192.168.1.50');

      expect(dns.removeRecord('api.internal')).toBe(true);
      expect(() => dns.resolve('api.internal')).toThrow();
    });

    it('supports reverse DNS resolution', () => {
      expect(dns.reverseResolve('192.168.1.1')).toBe('adityya.dev');
      expect(dns.reverseResolve('8.8.8.8')).toBeNull();
    });
  });
});
