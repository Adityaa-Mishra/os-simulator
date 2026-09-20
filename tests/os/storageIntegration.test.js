/**
 * tests/os/storageIntegration.test.js
 * Automated tests for Storage / DiskManager / FileSystemManager / StorageDevice integration in AdityyaOS.
 * Validates storage request lifecycle (QUEUED -> SCHEDULED -> EXECUTING -> COMPLETED),
 * process request cancellation, head synchronization with StorageDevice, VFS block synchronization,
 * and persistence across shutdown/boot.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Kernel } from '../../public/js/os/kernel/Kernel.js';
import { StorageRequestStatus } from '../../public/js/os/kernel/DiskManager.js';
import { OSEvents } from '../../public/js/os/kernel/OSEventEmitter.js';

describe('Phase 16: Storage & Disk Integration Tests', () => {
  let k;

  beforeEach(() => {
    k = new Kernel();
    k.boot();
  });

  describe('Storage Request Lifecycle', () => {
    it('creates requests in QUEUED state and emits STORAGE_REQUEST_QUEUED', () => {
      let queuedPayload = null;
      k.events.on(OSEvents.STORAGE_REQUEST_QUEUED, (payload) => {
        queuedPayload = payload;
      });

      const p1 = k.processManager.createProcess({ name: 'Writer' }).data;
      const res = k.diskManager.addRequest(45, p1.pid, { operation: 'write', data: 'test-data', sector: 5 });

      expect(res.success).toBe(true);
      expect(res.data.requestId).toBeDefined();

      const req = k.diskManager.getRequest(res.data.requestId);
      expect(req).toBeDefined();
      expect(req.status).toBe(StorageRequestStatus.QUEUED);
      expect(req.cylinder).toBe(45);
      expect(req.pid).toBe(p1.pid);

      expect(queuedPayload).not.toBeNull();
      expect(queuedPayload.request.requestId).toBe(res.data.requestId);
      expect(queuedPayload.request.status).toBe(StorageRequestStatus.QUEUED);
    });

    it('transitions requests from QUEUED -> SCHEDULED -> EXECUTING -> COMPLETED during schedule()', () => {
      const started = [];
      const completed = [];

      k.events.on(OSEvents.STORAGE_REQUEST_STARTED, (p) => started.push(p.requestId));
      k.events.on(OSEvents.STORAGE_REQUEST_COMPLETED, (p) => completed.push(p.requestId));

      const p1 = k.processManager.createProcess({ name: 'IOProc' }).data;
      const req1 = k.diskManager.addRequest(10, p1.pid, { operation: 'read', sector: 1 }).data;
      const req2 = k.diskManager.addRequest(50, p1.pid, { operation: 'write', data: 'abc', sector: 2 }).data;

      const scheduleRes = k.diskManager.schedule();
      expect(scheduleRes.success).toBe(true);

      const r1 = k.diskManager.getRequest(req1.requestId);
      const r2 = k.diskManager.getRequest(req2.requestId);

      expect(r1.status).toBe(StorageRequestStatus.COMPLETED);
      expect(r2.status).toBe(StorageRequestStatus.COMPLETED);
      expect(r1.completedAt).toBeTypeOf('number');
      expect(r2.completedAt).toBeTypeOf('number');

      expect(started).toContain(req1.requestId);
      expect(started).toContain(req2.requestId);
      expect(completed).toContain(req1.requestId);
      expect(completed).toContain(req2.requestId);
    });

    it('synchronizes head position with StorageDevice during schedule()', () => {
      k.diskManager.setHeadPosition(0);
      const diskDevice = k.hardware.getDevice('disk0');

      k.diskManager.addRequest(30);
      k.diskManager.addRequest(75);

      k.diskManager.schedule();

      expect(k.diskManager.headPosition).toBe(75);
      expect(diskDevice.headPosition).toBe(75);
    });
  });

  describe('Process Storage Request Cancellation', () => {
    it('cancels queued requests for a specific process without affecting completed requests', () => {
      const p1 = k.processManager.createProcess({ name: 'Proc-1' }).data;
      const p2 = k.processManager.createProcess({ name: 'Proc-2' }).data;

      const req1 = k.diskManager.addRequest(20, p1.pid).data;
      const req2 = k.diskManager.addRequest(40, p2.pid).data;
      const req3 = k.diskManager.addRequest(60, p1.pid).data;

      let cancelledEvent = null;
      k.events.on(OSEvents.STORAGE_REQUEST_CANCELLED, (p) => {
        cancelledEvent = p;
      });

      const cancelRes = k.diskManager.cancelRequestsForProcess(p1.pid);
      expect(cancelRes.success).toBe(true);
      expect(cancelRes.data.cancelledCount).toBe(2);

      expect(k.diskManager.getRequest(req1.requestId).status).toBe(StorageRequestStatus.CANCELLED);
      expect(k.diskManager.getRequest(req3.requestId).status).toBe(StorageRequestStatus.CANCELLED);
      // p2 request remains QUEUED
      expect(k.diskManager.getRequest(req2.requestId).status).toBe(StorageRequestStatus.QUEUED);

      // Cancelled requests are removed from pendingRequests
      expect(k.diskManager.pendingRequests).toEqual([40]);
      expect(cancelledEvent).not.toBeNull();
    });

    it('automatically cancels pending storage requests when a process terminates', () => {
      const p1 = k.processManager.createProcess({ name: 'DoomedProc' }).data;
      const req = k.diskManager.addRequest(15, p1.pid).data;

      expect(k.diskManager.getRequest(req.requestId).status).toBe(StorageRequestStatus.QUEUED);

      k.processManager.terminateProcess(p1.pid);

      expect(k.diskManager.getRequest(req.requestId).status).toBe(StorageRequestStatus.CANCELLED);
      expect(k.diskManager.pendingRequests).not.toContain(15);
    });
  });

  describe('FileSystemManager ↔ StorageDevice Sector Synchronization', () => {
    it('writes file data to StorageDevice disk0 on file creation and modification', () => {
      const disk = k.hardware.getDevice('disk0');

      k.fileSystemManager.createDirectory('/home');
      const createRes = k.fileSystemManager.createFile('/home/doc.txt', 128);
      expect(createRes.success).toBe(true);

      const allocatedBlocks = createRes.data.blocks;
      expect(allocatedBlocks.length).toBe(2);

      // Verify sectors were written to StorageDevice
      for (const block of allocatedBlocks) {
        const sectorData = disk.read(block);
        expect(sectorData.success).toBe(true);
        const parsedData = typeof sectorData.data.data === 'string' ? JSON.parse(sectorData.data.data) : sectorData.data.data;
        expect(parsedData.path).toBe('/home/doc.txt');
      }

      // Delete file and verify sectors are cleared
      const deleteRes = k.fileSystemManager.deleteFile('/home/doc.txt');
      expect(deleteRes.success).toBe(true);

      for (const block of allocatedBlocks) {
        const sectorData = disk.read(block);
        expect(sectorData.data.data).toBeNull();
      }
    });
  });

  describe('Storage Persistence Across Shutdown and Boot', () => {
    it('persists StorageDevice contents across normal shutdown and boot sequence', () => {
      const disk = k.hardware.getDevice('disk0');
      disk.write(42, { persistedKey: 'critical_data' });

      // Verify before shutdown
      expect(JSON.parse(disk.read(42).data.data)).toEqual({ persistedKey: 'critical_data' });

      // Reboot kernel
      k.shutdown();
      k.boot();

      // Verify after boot
      const diskAfterBoot = k.hardware.getDevice('disk0');
      expect(JSON.parse(diskAfterBoot.read(42).data.data)).toEqual({ persistedKey: 'critical_data' });
    });
  });

  describe('Structured Storage System Calls', () => {
    it('supports storage system calls correctly', () => {
      const p1 = k.processManager.createProcess({ name: 'SyscallProc' }).data;

      // storage.request
      const reqSyscall = k.syscall('storage.request', {
        cylinder: 80,
        pid: p1.pid,
        operation: 'write',
        data: 'syscall-data'
      });
      expect(reqSyscall.success).toBe(true);
      const reqId = reqSyscall.data.requestId;

      // storage.get_request
      const getSyscall = k.syscall('storage.get_request', { requestId: reqId });
      expect(getSyscall.success).toBe(true);
      expect(getSyscall.data.request.status).toBe(StorageRequestStatus.QUEUED);

      // storage.cancel
      const cancelSyscall = k.syscall('storage.cancel', { pid: p1.pid });
      expect(cancelSyscall.success).toBe(true);
      expect(cancelSyscall.data.cancelledCount).toBe(1);

      // storage.write & storage.read
      const writeSyscall = k.syscall('storage.write', { sector: 10, data: 'direct-val' });
      expect(writeSyscall.success).toBe(true);

      const readSyscall = k.syscall('storage.read', { sector: 10 });
      expect(readSyscall.success).toBe(true);
      expect(readSyscall.data.data).toBe('direct-val');
    });
  });
});
