/**
 * tests/os/filesystemCore.test.js
 * Automated tests for AdityyaFS Core Filesystem Operations.
 * Validates root directory, default hierarchy, file CRUD, directory operations,
 * rename, copy, stat, and structured error codes.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Kernel } from '../../public/js/os/kernel/Kernel.js';
import { FileSystemErrorCode } from '../../public/js/os/filesystem/FileSystemState.js';
import { OSEvents } from '../../public/js/os/kernel/OSEventEmitter.js';

describe('Phase 17: Filesystem Core Operations Tests', () => {
  let k;

  beforeEach(() => {
    k = new Kernel();
    k.boot();
  });

  describe('Root Directory & Default Hierarchy', () => {
    it('initializes root directory and standard default directory structure', () => {
      expect(k.fileSystemManager.exists('/')).toBe(true);
      expect(k.fileSystemManager.exists('/bin')).toBe(true);
      expect(k.fileSystemManager.exists('/boot')).toBe(true);
      expect(k.fileSystemManager.exists('/dev')).toBe(true);
      expect(k.fileSystemManager.exists('/etc')).toBe(true);
      expect(k.fileSystemManager.exists('/home')).toBe(true);
      expect(k.fileSystemManager.exists('/home/user')).toBe(true);
      expect(k.fileSystemManager.exists('/tmp')).toBe(true);
      expect(k.fileSystemManager.exists('/var')).toBe(true);
      expect(k.fileSystemManager.exists('/system')).toBe(true);

      const rootList = k.fileSystemManager.listDirectory('/');
      expect(rootList.success).toBe(true);
      const names = rootList.data.map(e => e.name);
      expect(names).toContain('home');
      expect(names).toContain('bin');
      expect(names).toContain('etc');
    });
  });

  describe('File CRUD & Content Operations', () => {
    it('creates, writes, reads, appends, and deletes files with structured events', () => {
      let createdEvent = null;
      let writtenEvent = null;
      let readEvent = null;
      let deletedEvent = null;

      k.events.on(OSEvents.FILE_CREATED, p => { createdEvent = p; });
      k.events.on(OSEvents.FILE_WRITTEN, p => { writtenEvent = p; });
      k.events.on(OSEvents.FILE_READ, p => { readEvent = p; });
      k.events.on(OSEvents.FILE_DELETED, p => { deletedEvent = p; });

      // Create
      const createRes = k.fileSystemManager.createFile('/home/user/notes.txt', 'Hello AdityyaOS');
      expect(createRes.success).toBe(true);
      expect(createRes.data.name).toBe('notes.txt');
      expect(createRes.data.size).toBe(15);
      expect(createdEvent.path).toBe('/home/user/notes.txt');

      // Read
      const readRes = k.fileSystemManager.readFile('/home/user/notes.txt');
      expect(readRes.success).toBe(true);
      expect(readRes.data.content).toBe('Hello AdityyaOS');
      expect(readEvent.path).toBe('/home/user/notes.txt');

      // Append
      const appendRes = k.fileSystemManager.appendFile('/home/user/notes.txt', ' - Version 1');
      expect(appendRes.success).toBe(true);
      expect(appendRes.data.size).toBe(27);
      expect(writtenEvent.path).toBe('/home/user/notes.txt');

      const readAfterAppend = k.fileSystemManager.readFile('/home/user/notes.txt');
      expect(readAfterAppend.data.content).toBe('Hello AdityyaOS - Version 1');

      // Overwrite
      const writeRes = k.fileSystemManager.writeFile('/home/user/notes.txt', 'New Content');
      expect(writeRes.success).toBe(true);
      expect(k.fileSystemManager.readFile('/home/user/notes.txt').data.content).toBe('New Content');

      // Delete
      const delRes = k.fileSystemManager.deleteFile('/home/user/notes.txt');
      expect(delRes.success).toBe(true);
      expect(deletedEvent.path).toBe('/home/user/notes.txt');
      expect(k.fileSystemManager.exists('/home/user/notes.txt')).toBe(false);
    });

    it('rejects creating duplicate files with EEXIST', () => {
      k.fileSystemManager.createFile('/home/user/dup.txt', 'First');
      const dup = k.fileSystemManager.createFile('/home/user/dup.txt', 'Second');
      expect(dup.success).toBe(false);
      expect(dup.code).toBe(FileSystemErrorCode.EEXIST);
    });

    it('rejects reading or deleting non-existent files with ENOENT', () => {
      const readNon = k.fileSystemManager.readFile('/home/user/ghost.txt');
      expect(readNon.success).toBe(false);
      expect(readNon.code).toBe(FileSystemErrorCode.ENOENT);

      const delNon = k.fileSystemManager.deleteFile('/home/user/ghost.txt');
      expect(delNon.success).toBe(false);
      expect(delNon.code).toBe(FileSystemErrorCode.ENOENT);
    });

    it('rejects reading a directory as a file with EISDIR', () => {
      const readDir = k.fileSystemManager.readFile('/home');
      expect(readDir.success).toBe(false);
      expect(readDir.code).toBe(FileSystemErrorCode.EISDIR);
    });

    it('rejects creating a file inside a non-existent parent directory with ENOENT', () => {
      const res = k.fileSystemManager.createFile('/nonexistent/folder/file.txt', 'data');
      expect(res.success).toBe(false);
      expect(res.code).toBe(FileSystemErrorCode.ENOENT);
    });

    it('rejects creating a file inside a file path with ENOTDIR', () => {
      k.fileSystemManager.createFile('/home/user/plain.txt', 'text');
      const res = k.fileSystemManager.createFile('/home/user/plain.txt/child.txt', 'data');
      expect(res.success).toBe(false);
      expect(res.code).toBe(FileSystemErrorCode.ENOTDIR);
    });
  });

  describe('Directory Operations & Constraints', () => {
    it('creates nested directories with mkdir', () => {
      const res = k.fileSystemManager.createDirectory('/home/user/projects');
      expect(res.success).toBe(true);
      expect(k.fileSystemManager.exists('/home/user/projects')).toBe(true);
    });

    it('rejects deleting non-empty directory with ENOTEMPTY unless recursive', () => {
      k.fileSystemManager.createDirectory('/home/user/sub');
      k.fileSystemManager.createFile('/home/user/sub/file.txt', 'inside');

      // Non-recursive rmdir should fail
      const rmdirFail = k.fileSystemManager.deleteDirectory('/home/user/sub');
      expect(rmdirFail.success).toBe(false);
      expect(rmdirFail.code).toBe(FileSystemErrorCode.ENOTEMPTY);

      // Recursive rmdir should succeed
      const rmdirSuccess = k.fileSystemManager.deleteDirectory('/home/user/sub', { recursive: true });
      expect(rmdirSuccess.success).toBe(true);
      expect(k.fileSystemManager.exists('/home/user/sub')).toBe(false);
      expect(k.fileSystemManager.exists('/home/user/sub/file.txt')).toBe(false);
    });

    it('rejects deleting root directory with EBUSY', () => {
      const res = k.fileSystemManager.deleteDirectory('/');
      expect(res.success).toBe(false);
      expect(res.code).toBe(FileSystemErrorCode.EBUSY);
    });
  });

  describe('Rename & Move Operations', () => {
    it('renames a file preserving its inodeId, content, and storage allocation', () => {
      k.fileSystemManager.createFile('/home/user/original.txt', 'Persistent Content');
      const origStat = k.fileSystemManager.stat('/home/user/original.txt').data;

      const renameRes = k.fileSystemManager.rename('/home/user/original.txt', '/home/user/renamed.txt');
      expect(renameRes.success).toBe(true);

      expect(k.fileSystemManager.exists('/home/user/original.txt')).toBe(false);
      expect(k.fileSystemManager.exists('/home/user/renamed.txt')).toBe(true);

      const newStat = k.fileSystemManager.stat('/home/user/renamed.txt').data;
      expect(newStat.inodeId).toBe(origStat.inodeId); // Stable inode ID
      expect(newStat.size).toBe(origStat.size);
      expect(newStat.storageBlocks).toEqual(origStat.storageBlocks); // Blocks not copied

      const readRes = k.fileSystemManager.readFile('/home/user/renamed.txt');
      expect(readRes.data.content).toBe('Persistent Content');
    });

    it('moves a file to another directory preserving its inodeId', () => {
      k.fileSystemManager.createFile('/home/user/doc.txt', 'My Doc');
      const origStat = k.fileSystemManager.stat('/home/user/doc.txt').data;

      const moveRes = k.fileSystemManager.rename('/home/user/doc.txt', '/tmp/doc.txt');
      expect(moveRes.success).toBe(true);

      expect(k.fileSystemManager.exists('/home/user/doc.txt')).toBe(false);
      expect(k.fileSystemManager.exists('/tmp/doc.txt')).toBe(true);
      expect(k.fileSystemManager.stat('/tmp/doc.txt').data.inodeId).toBe(origStat.inodeId);
    });

    it('rejects rename if destination already exists with EEXIST', () => {
      k.fileSystemManager.createFile('/home/user/f1.txt', '1');
      k.fileSystemManager.createFile('/home/user/f2.txt', '2');

      const res = k.fileSystemManager.rename('/home/user/f1.txt', '/home/user/f2.txt');
      expect(res.success).toBe(false);
      expect(res.code).toBe(FileSystemErrorCode.EEXIST);
    });
  });

  describe('Copy Operations', () => {
    it('copies a file with a new inodeId and independent storage blocks', () => {
      k.fileSystemManager.createFile('/home/user/source.txt', 'Source Data');
      const srcStat = k.fileSystemManager.stat('/home/user/source.txt').data;

      const copyRes = k.fileSystemManager.copy('/home/user/source.txt', '/home/user/copy.txt');
      expect(copyRes.success).toBe(true);

      const copyStat = k.fileSystemManager.stat('/home/user/copy.txt').data;
      expect(copyStat.inodeId).not.toBe(srcStat.inodeId); // New independent inode
      expect(copyStat.storageBlocks).not.toEqual(srcStat.storageBlocks); // Independent blocks

      // Mutating copy does not affect source
      k.fileSystemManager.writeFile('/home/user/copy.txt', 'Modified Copy');
      expect(k.fileSystemManager.readFile('/home/user/source.txt').data.content).toBe('Source Data');
      expect(k.fileSystemManager.readFile('/home/user/copy.txt').data.content).toBe('Modified Copy');
    });
  });

  describe('Metadata Inspection (stat)', () => {
    it('returns comprehensive inode metadata via stat', () => {
      k.fileSystemManager.createFile('/home/user/meta.txt', 'metadata test', 'rw-');
      const statRes = k.fileSystemManager.stat('/home/user/meta.txt');

      expect(statRes.success).toBe(true);
      expect(statRes.data.inodeId).toBeTypeOf('number');
      expect(statRes.data.type).toBe('file');
      expect(statRes.data.name).toBe('meta.txt');
      expect(statRes.data.size).toBe(13);
      expect(statRes.data.permissions).toBe('rw-');
      expect(statRes.data.createdAt).toBeTypeOf('string');
      expect(statRes.data.modifiedAt).toBeTypeOf('string');
      expect(statRes.data.storageBlocks).toBeInstanceOf(Array);
    });
  });
});
