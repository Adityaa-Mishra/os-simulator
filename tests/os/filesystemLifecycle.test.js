/**
 * tests/os/filesystemLifecycle.test.js
 * Automated tests for AdityyaFS Mount Lifecycle, Reboot Persistence,
 * Transactional Boot Failure, and Snapshot Safety.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Kernel } from '../../public/js/os/kernel/Kernel.js';
import { SystemStatus } from '../../public/js/os/kernel/OSState.js';
import { FileSystemStatus } from '../../public/js/os/filesystem/FileSystemState.js';

describe('Phase 17: Filesystem Lifecycle & Persistence Tests', () => {
  let k;

  beforeEach(() => {
    k = new Kernel();
    k.boot();
  });

  describe('Reboot Persistence (Correction 13)', () => {
    it('persists file contents, directory hierarchy, and inode identity across reboot', () => {
      // 1. Create hierarchy and files
      k.fileSystemManager.createDirectory('/home/user/docs');
      k.fileSystemManager.createFile('/home/user/docs/report.txt', 'Quarterly Financial Report');

      const preRebootStat = k.fileSystemManager.stat('/home/user/docs/report.txt').data;
      const preRebootDirStat = k.fileSystemManager.stat('/home/user/docs').data;

      // Open a descriptor before reboot
      const openRes = k.fileSystemManager.openDescriptor('/home/user/docs/report.txt', ['READ'], 1);
      expect(openRes.success).toBe(true);

      // 2. Normal reboot (shutdown -> boot)
      k.shutdown();
      k.boot();

      // 3. Verify persistence
      expect(k.fileSystemManager.exists('/home/user/docs')).toBe(true);
      expect(k.fileSystemManager.exists('/home/user/docs/report.txt')).toBe(true);

      const postRebootStat = k.fileSystemManager.stat('/home/user/docs/report.txt').data;
      const postRebootDirStat = k.fileSystemManager.stat('/home/user/docs').data;

      // Inode identity and metadata preserved
      expect(postRebootStat.inodeId).toBe(preRebootStat.inodeId);
      expect(postRebootStat.size).toBe(preRebootStat.size);
      expect(postRebootStat.storageBlocks).toEqual(preRebootStat.storageBlocks);
      expect(postRebootDirStat.inodeId).toBe(preRebootDirStat.inodeId);

      // File contents survive
      const readRes = k.fileSystemManager.readFile('/home/user/docs/report.txt');
      expect(readRes.success).toBe(true);
      expect(readRes.data.content).toBe('Quarterly Financial Report');

      // Descriptors do NOT survive reboot (descriptor table starts clean)
      expect(k.fileSystemManager.fs.descriptors.size).toBe(0);
      expect(postRebootStat.openCount).toBe(0);
    });
  });

  describe('Reset Semantics (Correction 6)', () => {
    it('kernel.reset() preserves persistent filesystem data, while format() is destructive', () => {
      k.fileSystemManager.createFile('/home/user/persist.txt', 'I survive reset');

      // Normal reset
      k.reset();
      k.boot();
      expect(k.fileSystemManager.exists('/home/user/persist.txt')).toBe(true);
      expect(k.fileSystemManager.readFile('/home/user/persist.txt').data.content).toBe('I survive reset');

      // Explicit destructive format
      k.fileSystemManager.format();
      expect(k.fileSystemManager.exists('/home/user/persist.txt')).toBe(false);
      expect(k.fileSystemManager.exists('/home/user')).toBe(true); // Default hierarchy recreated
    });
  });

  describe('Transactional Boot Failure (Correction 7)', () => {
    it('halts kernel in STOPPED state without reaching READY/RUNNING if mount fails', () => {
      const freshKernel = new Kernel();

      // Mock mount to fail
      freshKernel.fileSystemManager.mount = () => ({
        success: false,
        status: FileSystemStatus.UNMOUNTED,
        error: 'Simulated disk corruption on mount'
      });

      const bootRes = freshKernel.boot();

      expect(bootRes.success).toBe(false);
      expect(bootRes.status).toBe(SystemStatus.STOPPED);
      expect(freshKernel.getStatus()).toBe(SystemStatus.STOPPED);
      expect(freshKernel.fileSystemManager.fs.status).toBe(FileSystemStatus.UNMOUNTED);
    });
  });

  describe('Snapshot Safety (Correction 15)', () => {
    it('returns an immutable, fully isolated snapshot of filesystem state', () => {
      k.fileSystemManager.createFile('/home/user/snap.txt', 'Snapshot Data');
      const openRes = k.fileSystemManager.openDescriptor('/home/user/snap.txt', ['READ'], 1);
      expect(openRes.success).toBe(true);

      const state1 = k.fileSystemManager.getState();

      expect(state1.mounted).toBe(true);
      expect(state1.statistics).toBeDefined();
      expect(state1.inodes).toBeDefined();
      expect(state1.descriptors).toBeDefined();

      const initialAllocated = state1.allocatedBlocks;
      const initialFree = state1.freeBlocks;
      const initialFileCount = state1.statistics.fileCount;
      const initialOpenDesc = state1.statistics.openDescriptors;

      // 1. Mutate filesystem counters and path
      state1.statistics.fileCount = 999;
      state1.statistics.openDescriptors = 888;
      state1.currentPath = '/hacked';

      // 2. Mutate allocation state
      state1.allocatedBlocks = 0;
      state1.freeBlocks = 9999;

      // 3. Mutate inode state & directory children
      delete state1.inodes['1'];
      if (state1.inodes['2']) {
        state1.inodes['2'].name = 'corrupted_dir';
      }

      // 4. Mutate descriptors
      delete state1.descriptors[String(openRes.data.fd)];

      // Retrieve a fresh state snapshot and verify complete immutability
      const state2 = k.fileSystemManager.getState();
      expect(state2.statistics.fileCount).toBe(initialFileCount);
      expect(state2.statistics.openDescriptors).toBe(initialOpenDesc);
      expect(state2.currentPath).toBe('/');
      expect(state2.allocatedBlocks).toBe(initialAllocated);
      expect(state2.freeBlocks).toBe(initialFree);
      expect(state2.inodes['1']).toBeDefined();
      expect(state2.descriptors[String(openRes.data.fd)]).toBeDefined();

      // Verify internal subsystem objects were not mutated
      expect(k.fileSystemManager.fs.inodes.has(1)).toBe(true);
      expect(k.fileSystemManager.fs.descriptors.has(openRes.data.fd)).toBe(true);
      expect(k.fileSystemManager.fs.allocatedBlocks).toBe(initialAllocated);
    });
  });
});
