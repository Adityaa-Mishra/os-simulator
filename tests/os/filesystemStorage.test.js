/**
 * tests/os/filesystemStorage.test.js
 * Automated tests for AdityyaFS Storage Allocation, Sector Mapping, Growth,
 * Truncation, Storage Reuse, and Multi-Stage Transactional Rollback.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Kernel } from '../../public/js/os/kernel/Kernel.js';
import { FileSystemErrorCode } from '../../public/js/os/filesystem/FileSystemState.js';

describe('Phase 17: Filesystem Storage & Transactional Rollback Tests', () => {
  let k;

  beforeEach(() => {
    k = new Kernel();
    k.boot();
  });

  describe('Storage Allocation & Sector Mapping', () => {
    it('allocates physical StorageDevice sectors and tracks block mapping', () => {
      const disk = k.hardware.getDevice('disk0');
      const createRes = k.fileSystemManager.createFile('/home/user/doc.txt', 128); // 2 blocks (64B each)

      expect(createRes.success).toBe(true);
      expect(createRes.data.blocks).toHaveLength(2);

      const block1 = createRes.data.blocks[0];
      const block2 = createRes.data.blocks[1];

      // Verify sectors were written to StorageDevice
      const sec1 = disk.read(block1);
      const sec2 = disk.read(block2);
      expect(sec1.success).toBe(true);
      expect(sec2.success).toBe(true);

      const parsed1 = typeof sec1.data.data === 'string' ? JSON.parse(sec1.data.data) : sec1.data.data;
      expect(parsed1.path).toBe('/home/user/doc.txt');
    });

    it('supports file growth by allocating additional sectors', () => {
      k.fileSystemManager.createFile('/home/user/grow.txt', 64); // 1 block
      const stat1 = k.fileSystemManager.stat('/home/user/grow.txt').data;
      expect(stat1.storageBlocks).toHaveLength(1);

      // Expand to 192 bytes (3 blocks)
      const writeRes = k.fileSystemManager.writeFile('/home/user/grow.txt', 192);
      expect(writeRes.success).toBe(true);

      const stat2 = k.fileSystemManager.stat('/home/user/grow.txt').data;
      expect(stat2.storageBlocks).toHaveLength(3);
      expect(stat2.size).toBe(192);
    });

    it('supports file truncation by releasing no-longer-needed sectors', () => {
      k.fileSystemManager.createFile('/home/user/shrink.txt', 192); // 3 blocks
      const initialFree = k.getState().filesystem.freeBlocks;

      // Truncate to 64 bytes (1 block)
      const writeRes = k.fileSystemManager.writeFile('/home/user/shrink.txt', 64);
      expect(writeRes.success).toBe(true);

      const stat = k.fileSystemManager.stat('/home/user/shrink.txt').data;
      expect(stat.storageBlocks).toHaveLength(1);
      expect(k.getState().filesystem.freeBlocks).toBe(initialFree + 2); // 2 blocks freed
    });
  });

  describe('Storage Reuse (Correction 12)', () => {
    it('allows released blocks from deleted files to be reused by new files', () => {
      const disk = k.hardware.getDevice('disk0');

      // 1. Create file A
      const resA = k.fileSystemManager.createFile('/home/user/fileA.txt', 1024);
      const blocksA = [...resA.data.blocks];

      // 2. Delete file A
      const delA = k.fileSystemManager.deleteFile('/home/user/fileA.txt');
      expect(delA.success).toBe(true);

      // Verify sectors were cleared on StorageDevice
      for (const b of blocksA) {
        expect(disk.read(b).data.data).toBeNull();
      }

      // 3. Create file B
      const resB = k.fileSystemManager.createFile('/home/user/fileB.txt', 1024);
      const blocksB = [...resB.data.blocks];

      // Verify released blocks were reused
      expect(blocksB).toEqual(blocksA);
    });
  });

  describe('Storage Exhaustion & Rejection (ENOSPC)', () => {
    it('rejects allocation when requested size exceeds available storage capacity (Stage 1: block allocation failure)', () => {
      // 1. Create an existing file
      k.fileSystemManager.createFile('/home/user/existing.txt', 'Preserved Content');
      const prevStat = k.fileSystemManager.stat('/home/user/existing.txt').data;
      const freeBlocksBefore = k.getState().filesystem.freeBlocks;
      const allocatedBefore = k.getState().filesystem.allocatedBlocks;

      const excessiveBytes = (freeBlocksBefore + 10) * 64;
      const res = k.fileSystemManager.createFile('/home/user/huge.bin', excessiveBytes);

      // Operation fails with structured ENOSPC error
      expect(res.success).toBe(false);
      expect(res.code).toBe(FileSystemErrorCode.ENOSPC);

      // Previous filesystem contents remain intact
      expect(k.fileSystemManager.exists('/home/user/huge.bin')).toBe(false);
      expect(k.fileSystemManager.readFile('/home/user/existing.txt').data.content).toBe('Preserved Content');

      // Previous inode metadata remains intact
      const currStat = k.fileSystemManager.stat('/home/user/existing.txt').data;
      expect(currStat.size).toBe(prevStat.size);
      expect(currStat.inodeId).toBe(prevStat.inodeId);

      // Previously allocated blocks remain allocated correctly
      expect(currStat.storageBlocks).toEqual(prevStat.storageBlocks);

      // Block accounting remains consistent
      expect(k.getState().filesystem.freeBlocks).toBe(freeBlocksBefore);
      expect(k.getState().filesystem.allocatedBlocks).toBe(allocatedBefore);
    });
  });

  describe('Multi-Stage Transactional Rollback (Correction 14)', () => {
    it('rolls back newly allocated blocks if physical storage write fails during create (Stage 2: StorageDevice write failure on create)', () => {
      const disk = k.hardware.getDevice('disk0');
      const initialFree = k.getState().filesystem.freeBlocks;
      const initialAlloc = k.getState().filesystem.allocatedBlocks;

      // Mock disk.write to simulate physical write failure on data sectors
      const origWrite = disk.write.bind(disk);
      disk.write = (sector, data) => {
        if (sector >= 0 && sector < 180) {
          return { success: false, error: 'Simulated physical drive I/O failure' };
        }
        return origWrite(sector, data);
      };

      const createRes = k.fileSystemManager.createFile('/home/user/fail.txt', 128);
      expect(createRes.success).toBe(false);
      expect(createRes.code).toBe(FileSystemErrorCode.ENOSPC);

      // Verify filesystem state is clean: no orphan file, free blocks preserved
      expect(k.fileSystemManager.exists('/home/user/fail.txt')).toBe(false);
      expect(k.getState().filesystem.freeBlocks).toBe(initialFree);
      expect(k.getState().filesystem.allocatedBlocks).toBe(initialAlloc);

      // Restore disk.write
      disk.write = origWrite;
    });

    it('preserves previous file state and releases newly allocated blocks if write expansion fails (Stage 2: StorageDevice write failure on write)', () => {
      const disk = k.hardware.getDevice('disk0');
      k.fileSystemManager.createFile('/home/user/safe.txt', 'Original Content');
      const initialStat = k.fileSystemManager.stat('/home/user/safe.txt').data;
      const initialFree = k.getState().filesystem.freeBlocks;
      const initialAlloc = k.getState().filesystem.allocatedBlocks;

      // Mock disk.write to fail on new blocks
      const origWrite = disk.write.bind(disk);
      disk.write = (sector, data) => {
        if (sector > initialStat.storageBlocks[0].block) {
          return { success: false, error: 'Simulated drive failure on growth' };
        }
        return origWrite(sector, data);
      };

      const writeRes = k.fileSystemManager.writeFile('/home/user/safe.txt', 192);
      expect(writeRes.success).toBe(false);
      expect(writeRes.code).toBe(FileSystemErrorCode.ENOSPC);

      // Verify original file state is completely preserved
      expect(k.fileSystemManager.readFile('/home/user/safe.txt').data.content).toBe('Original Content');
      expect(k.fileSystemManager.stat('/home/user/safe.txt').data.size).toBe(initialStat.size);
      expect(k.fileSystemManager.stat('/home/user/safe.txt').data.storageBlocks).toEqual(initialStat.storageBlocks);
      expect(k.getState().filesystem.freeBlocks).toBe(initialFree);
      expect(k.getState().filesystem.allocatedBlocks).toBe(initialAlloc);

      disk.write = origWrite;
    });

    it('rolls back and preserves previous file state if inode/metadata update throws during write (Stage 3: metadata/inode update failure)', () => {
      k.fileSystemManager.createFile('/home/user/meta_fail.txt', 'Initial Content');
      const prevStat = k.fileSystemManager.stat('/home/user/meta_fail.txt').data;
      const initialFree = k.getState().filesystem.freeBlocks;
      const initialAlloc = k.getState().filesystem.allocatedBlocks;

      const file = k.fileSystemManager.fs.inodes.get(prevStat.inodeId);
      const origMark = file.markModified.bind(file);
      file.markModified = () => {
        throw new Error('Simulated inode metadata update failure');
      };

      const writeRes = k.fileSystemManager.writeFile('/home/user/meta_fail.txt', 'Expanded Text That Will Fail');
      expect(writeRes.success).toBe(false);
      expect(writeRes.code).toBe(FileSystemErrorCode.EINVAL);

      // Previous file contents and metadata remain intact
      expect(k.fileSystemManager.readFile('/home/user/meta_fail.txt').data.content).toBe('Initial Content');
      expect(k.fileSystemManager.stat('/home/user/meta_fail.txt').data.size).toBe(prevStat.size);

      // Previously allocated blocks remain allocated correctly
      expect(k.fileSystemManager.stat('/home/user/meta_fail.txt').data.storageBlocks).toEqual(prevStat.storageBlocks);

      // Newly allocated blocks are released and accounting remains consistent
      expect(k.getState().filesystem.freeBlocks).toBe(initialFree);
      expect(k.getState().filesystem.allocatedBlocks).toBe(initialAlloc);

      file.markModified = origMark;
    });

    it('rolls back changes if metadata persistence fails during create (Stage 4: persistent metadata commit failure on create)', () => {
      const initialFree = k.getState().filesystem.freeBlocks;
      const initialAlloc = k.getState().filesystem.allocatedBlocks;
      const fs = k.fileSystemManager.fs;

      // Mock commitPersistentMetadata to throw
      const origCommit = fs.commitPersistentMetadata.bind(fs);
      fs.commitPersistentMetadata = () => {
        throw new Error('Simulated persistent metadata commit error');
      };

      const createRes = k.fileSystemManager.createFile('/home/user/commit_fail.txt', 'test');
      expect(createRes.success).toBe(false);
      expect(createRes.code).toBe(FileSystemErrorCode.ENOSPC);

      // File was not added, storage blocks not leaked
      expect(k.fileSystemManager.exists('/home/user/commit_fail.txt')).toBe(false);
      expect(k.getState().filesystem.freeBlocks).toBe(initialFree);
      expect(k.getState().filesystem.allocatedBlocks).toBe(initialAlloc);

      fs.commitPersistentMetadata = origCommit;
    });

    it('rolls back and preserves previous file state if metadata persistence fails during write expansion (Stage 4: persistent metadata commit failure on write)', () => {
      k.fileSystemManager.createFile('/home/user/persist_fail.txt', 'Stable Content');
      const prevStat = k.fileSystemManager.stat('/home/user/persist_fail.txt').data;
      const initialFree = k.getState().filesystem.freeBlocks;
      const initialAlloc = k.getState().filesystem.allocatedBlocks;
      const fs = k.fileSystemManager.fs;

      const origCommit = fs.commitPersistentMetadata.bind(fs);
      fs.commitPersistentMetadata = () => {
        throw new Error('Simulated disk metadata persistence failure');
      };

      const writeRes = k.fileSystemManager.writeFile('/home/user/persist_fail.txt', 192); // Expands to 3 blocks
      expect(writeRes.success).toBe(false);
      expect(writeRes.code).toBe(FileSystemErrorCode.ENOSPC);

      // Previous file contents and metadata remain intact
      expect(k.fileSystemManager.readFile('/home/user/persist_fail.txt').data.content).toBe('Stable Content');
      expect(k.fileSystemManager.stat('/home/user/persist_fail.txt').data.size).toBe(prevStat.size);

      // Previously allocated blocks remain allocated correctly
      expect(k.fileSystemManager.stat('/home/user/persist_fail.txt').data.storageBlocks).toEqual(prevStat.storageBlocks);

      // Newly allocated blocks are released and accounting remains consistent
      expect(k.getState().filesystem.freeBlocks).toBe(initialFree);
      expect(k.getState().filesystem.allocatedBlocks).toBe(initialAlloc);

      fs.commitPersistentMetadata = origCommit;
    });
  });
});
