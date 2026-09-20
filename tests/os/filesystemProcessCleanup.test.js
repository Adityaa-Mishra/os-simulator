/**
 * tests/os/filesystemProcessCleanup.test.js
 * Automated tests for Process Descriptor Ownership & Termination Cleanup.
 * Validates process-owned descriptors, automatic cleanup on PROCESS_TERMINATED,
 * and preservation of files after process exit.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Kernel } from '../../public/js/os/kernel/Kernel.js';

describe('Phase 17: Process Descriptor Cleanup Tests', () => {
  let k;

  beforeEach(() => {
    k = new Kernel();
    k.boot();
  });

  describe('Automatic Descriptor Cleanup on Process Termination', () => {
    it('automatically closes all open descriptors when process terminates without deleting files', () => {
      // Create process
      const p1 = k.processManager.createProcess({ name: 'FileWorker' }).data;

      // Create files
      k.fileSystemManager.createFile('/home/user/log1.txt', 'Log One');
      k.fileSystemManager.createFile('/home/user/log2.txt', 'Log Two');

      // Process opens both files
      const d1 = k.fileSystemManager.openDescriptor('/home/user/log1.txt', ['READ', 'WRITE'], p1.pid).data;
      const d2 = k.fileSystemManager.openDescriptor('/home/user/log2.txt', ['READ'], p1.pid).data;

      expect(k.fileSystemManager.fs.descriptors.size).toBe(2);
      expect(k.fileSystemManager.stat('/home/user/log1.txt').data.openCount).toBe(1);
      expect(k.fileSystemManager.stat('/home/user/log2.txt').data.openCount).toBe(1);

      // Terminate process
      k.processManager.terminateProcess(p1.pid);

      // Descriptors are automatically cleaned up
      expect(k.fileSystemManager.fs.descriptors.size).toBe(0);
      expect(k.fileSystemManager.stat('/home/user/log1.txt').data.openCount).toBe(0);
      expect(k.fileSystemManager.stat('/home/user/log2.txt').data.openCount).toBe(0);

      // Files persist completely intact!
      expect(k.fileSystemManager.exists('/home/user/log1.txt')).toBe(true);
      expect(k.fileSystemManager.exists('/home/user/log2.txt')).toBe(true);
      expect(k.fileSystemManager.readFile('/home/user/log1.txt').data.content).toBe('Log One');
      expect(k.fileSystemManager.readFile('/home/user/log2.txt').data.content).toBe('Log Two');
    });

    it('cleans up only the terminated process descriptors when multiple processes have open files', () => {
      const p1 = k.processManager.createProcess({ name: 'Worker1' }).data;
      const p2 = k.processManager.createProcess({ name: 'Worker2' }).data;

      k.fileSystemManager.createFile('/home/user/common.txt', 'Shared Content');

      const d1 = k.fileSystemManager.openDescriptor('/home/user/common.txt', ['READ'], p1.pid).data;
      const d2 = k.fileSystemManager.openDescriptor('/home/user/common.txt', ['READ'], p2.pid).data;

      expect(k.fileSystemManager.stat('/home/user/common.txt').data.openCount).toBe(2);

      // Terminate p1 only
      k.processManager.terminateProcess(p1.pid);

      // p1 descriptor closed, p2 descriptor remains open
      expect(k.fileSystemManager.fs.descriptors.has(d1.fd)).toBe(false);
      expect(k.fileSystemManager.fs.descriptors.has(d2.fd)).toBe(true);
      expect(k.fileSystemManager.stat('/home/user/common.txt').data.openCount).toBe(1);

      // p2 can still read
      const read2 = k.fileSystemManager.readDescriptor(d2.fd, 6, p2.pid);
      expect(read2.success).toBe(true);
      expect(read2.data.bytes).toBe('Shared');

      k.fileSystemManager.closeDescriptor(d2.fd, p2.pid);
    });
  });
});
