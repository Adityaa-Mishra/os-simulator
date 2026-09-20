/**
 * tests/os/filesystemDescriptors.test.js
 * Automated tests for AdityyaFS File Descriptors.
 * Validates descriptor allocation (fd >= 3), independent cursor state, PID ownership validation,
 * seek modes, read/write via descriptors, invalid fd rejection (EBADF), and open-file deletion protection (EBUSY).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Kernel } from '../../public/js/os/kernel/Kernel.js';
import { FileSystemErrorCode } from '../../public/js/os/filesystem/FileSystemState.js';

describe('Phase 17: Filesystem Descriptors & Ownership Tests', () => {
  let k;

  beforeEach(() => {
    k = new Kernel();
    k.boot();
  });

  describe('Descriptor Allocation & Lightweight State', () => {
    it('allocates descriptors starting from fd 3 and tracks state', () => {
      k.fileSystemManager.createFile('/home/user/doc.txt', 'Sample Data');

      const openRes = k.fileSystemManager.openDescriptor('/home/user/doc.txt', ['READ', 'WRITE'], 1);
      expect(openRes.success).toBe(true);
      expect(openRes.data.fd).toBeGreaterThanOrEqual(3);
      expect(openRes.data.position).toBe(0);

      const closeRes = k.fileSystemManager.closeDescriptor(openRes.data.fd, 1);
      expect(closeRes.success).toBe(true);
    });

    it('rejects invalid or non-existent file descriptors with EBADF', () => {
      const readRes = k.fileSystemManager.readDescriptor(999, 10, 1);
      expect(readRes.success).toBe(false);
      expect(readRes.code).toBe(FileSystemErrorCode.EBADF);

      const closeRes = k.fileSystemManager.closeDescriptor(999, 1);
      expect(closeRes.success).toBe(false);
      expect(closeRes.code).toBe(FileSystemErrorCode.EBADF);
    });
  });

  describe('Independent Cursor State per Open Descriptor (Correction 11)', () => {
    it('maintains completely independent seek positions across multiple open descriptors', () => {
      k.fileSystemManager.createFile('/home/user/shared.txt', '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ');

      // PID 1 opens file
      const d1 = k.fileSystemManager.openDescriptor('/home/user/shared.txt', ['READ'], 1).data;
      // PID 2 opens same file
      const d2 = k.fileSystemManager.openDescriptor('/home/user/shared.txt', ['READ'], 2).data;

      expect(d1.fd).not.toBe(d2.fd);

      // Seek d1 to position 10
      k.fileSystemManager.seekDescriptor(d1.fd, 10, 'SET', 1);

      // Verify d2 position remains 0
      const read2 = k.fileSystemManager.readDescriptor(d2.fd, 5, 2);
      expect(read2.data.bytes).toBe('01234');
      expect(read2.data.position).toBe(5);

      // Verify d1 reads from position 10
      const read1 = k.fileSystemManager.readDescriptor(d1.fd, 5, 1);
      expect(read1.data.bytes).toBe('ABCDE');
      expect(read1.data.position).toBe(15);
    });
  });

  describe('PID Ownership Validation (Correction 9)', () => {
    it('prevents a process from accessing or modifying another process descriptor', () => {
      k.fileSystemManager.createFile('/home/user/private.txt', 'Secret');
      const d1 = k.fileSystemManager.openDescriptor('/home/user/private.txt', ['READ', 'WRITE'], 10).data;

      // Process 20 attempts to read descriptor owned by Process 10
      const badRead = k.fileSystemManager.readDescriptor(d1.fd, 5, 20);
      expect(badRead.success).toBe(false);
      expect(badRead.code).toBe(FileSystemErrorCode.EBADF);

      // Process 20 attempts to write descriptor owned by Process 10
      const badWrite = k.fileSystemManager.writeDescriptor(d1.fd, 'Hack', 20);
      expect(badWrite.success).toBe(false);
      expect(badWrite.code).toBe(FileSystemErrorCode.EBADF);

      // Process 20 attempts to seek descriptor owned by Process 10
      const badSeek = k.fileSystemManager.seekDescriptor(d1.fd, 2, 'SET', 20);
      expect(badSeek.success).toBe(false);
      expect(badSeek.code).toBe(FileSystemErrorCode.EBADF);

      // Process 20 attempts to close descriptor owned by Process 10
      const badClose = k.fileSystemManager.closeDescriptor(d1.fd, 20);
      expect(badClose.success).toBe(false);
      expect(badClose.code).toBe(FileSystemErrorCode.EBADF);

      // Process 10 can successfully close its own descriptor
      const goodClose = k.fileSystemManager.closeDescriptor(d1.fd, 10);
      expect(goodClose.success).toBe(true);
    });

    it('enforces PID ownership via structured system calls', () => {
      k.fileSystemManager.createFile('/home/user/syscall_fd.txt', 'Data');

      const openCall = k.syscall('fs.open', { path: '/home/user/syscall_fd.txt', flags: ['READ', 'WRITE'], pid: 5 });
      expect(openCall.success).toBe(true);
      const fd = openCall.data.fd;

      // Syscall with wrong PID on read
      const badRead = k.syscall('fs.read', { fd, length: 4, pid: 99 });
      expect(badRead.success).toBe(false);

      // Syscall with correct PID on read
      const goodRead = k.syscall('fs.read', { fd, length: 4, pid: 5 });
      expect(goodRead.success).toBe(true);
      expect(goodRead.data.bytes).toBe('Data');

      // Syscall with wrong PID on write
      const badWrite = k.syscall('fs.write', { fd, data: 'Hacked', pid: 99 });
      expect(badWrite.success).toBe(false);

      // Syscall with wrong PID on seek
      const badSeek = k.syscall('fs.seek', { fd, offset: 0, whence: 'SET', pid: 99 });
      expect(badSeek.success).toBe(false);

      // Syscall with wrong PID on close
      const badClose = k.syscall('fs.close', { fd, pid: 99 });
      expect(badClose.success).toBe(false);

      // Syscall with correct PID on close
      const goodClose = k.syscall('fs.close', { fd, pid: 5 });
      expect(goodClose.success).toBe(true);
    });
  });

  describe('Open File Deletion Protection (EBUSY) (Correction 5)', () => {
    it('rejects deleting an open file with EBUSY until all descriptors are closed', () => {
      k.fileSystemManager.createFile('/home/user/locked.txt', 'Locked');
      const d = k.fileSystemManager.openDescriptor('/home/user/locked.txt', ['READ'], 1).data;

      // Attempt deletion while open
      const delFail = k.fileSystemManager.deleteFile('/home/user/locked.txt');
      expect(delFail.success).toBe(false);
      expect(delFail.code).toBe(FileSystemErrorCode.EBUSY);

      // Close descriptor and retry deletion
      k.fileSystemManager.closeDescriptor(d.fd, 1);
      const delSuccess = k.fileSystemManager.deleteFile('/home/user/locked.txt');
      expect(delSuccess.success).toBe(true);
      expect(k.fileSystemManager.exists('/home/user/locked.txt')).toBe(false);
    });

    it('rejects deleting a directory containing open files with EBUSY', () => {
      k.fileSystemManager.createDirectory('/home/user/open_folder');
      k.fileSystemManager.createFile('/home/user/open_folder/file.txt', 'Content');
      const d = k.fileSystemManager.openDescriptor('/home/user/open_folder/file.txt', ['READ'], 1).data;

      const rmdirFail = k.fileSystemManager.deleteDirectory('/home/user/open_folder', { recursive: true });
      expect(rmdirFail.success).toBe(false);
      expect(rmdirFail.code).toBe(FileSystemErrorCode.EBUSY);

      k.fileSystemManager.closeDescriptor(d.fd, 1);
      const rmdirSuccess = k.fileSystemManager.deleteDirectory('/home/user/open_folder', { recursive: true });
      expect(rmdirSuccess.success).toBe(true);
    });
  });

  describe('Seek Modes', () => {
    it('supports SET, CUR, and END seek modes with bounds checking', () => {
      k.fileSystemManager.createFile('/home/user/seek.txt', '0123456789');
      const d = k.fileSystemManager.openDescriptor('/home/user/seek.txt', ['READ'], 1).data;

      // SET
      k.fileSystemManager.seekDescriptor(d.fd, 4, 'SET', 1);
      expect(k.fileSystemManager.readDescriptor(d.fd, 2, 1).data.bytes).toBe('45');

      // CUR
      k.fileSystemManager.seekDescriptor(d.fd, 1, 'CUR', 1);
      expect(k.fileSystemManager.readDescriptor(d.fd, 2, 1).data.bytes).toBe('78');

      // END
      k.fileSystemManager.seekDescriptor(d.fd, -2, 'END', 1);
      expect(k.fileSystemManager.readDescriptor(d.fd, 2, 1).data.bytes).toBe('89');

      // Negative seek position rejection
      const badSeek = k.fileSystemManager.seekDescriptor(d.fd, -100, 'SET', 1);
      expect(badSeek.success).toBe(false);

      k.fileSystemManager.closeDescriptor(d.fd, 1);
    });
  });
});
