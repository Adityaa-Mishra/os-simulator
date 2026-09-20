/**
 * tests/os/filesystemPaths.test.js
 * Automated tests for AdityyaFS Path Resolution & Normalization.
 * Validates absolute/relative paths, dot/dot-dot handling, root traversal clamping,
 * repeated slashes, path splitting, and invalid path rejection.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PathResolver } from '../../public/js/os/filesystem/PathResolver.js';
import { Kernel } from '../../public/js/os/kernel/Kernel.js';
import { FileSystemErrorCode } from '../../public/js/os/filesystem/FileSystemState.js';

describe('Phase 17: Filesystem Path Resolution & Normalization Tests', () => {
  let k;

  beforeEach(() => {
    k = new Kernel();
    k.boot();
  });

  describe('PathResolver Unit Tests', () => {
    it('normalizes redundant and repeated slashes', () => {
      expect(PathResolver.normalize('///')).toBe('/');
      expect(PathResolver.normalize('/home///user//test.txt')).toBe('/home/user/test.txt');
      expect(PathResolver.normalize('//var///log//')).toBe('/var/log');
    });

    it('handles relative paths with cwd', () => {
      expect(PathResolver.normalize('notes.txt', '/home/user')).toBe('/home/user/notes.txt');
      expect(PathResolver.normalize('./doc.txt', '/home')).toBe('/home/doc.txt');
      expect(PathResolver.normalize('../system', '/home/user')).toBe('/home/system');
    });

    it('normalizes . and .. segments deterministically', () => {
      expect(PathResolver.normalize('/home/user/../user/test.txt')).toBe('/home/user/test.txt');
      expect(PathResolver.normalize('/a/b/c/../../d')).toBe('/a/d');
      expect(PathResolver.normalize('/a/./b/./c')).toBe('/a/b/c');
    });

    it('clamps root traversal so paths cannot escape above /', () => {
      expect(PathResolver.normalize('/..')).toBe('/');
      expect(PathResolver.normalize('/../../..')).toBe('/');
      expect(PathResolver.normalize('/home/../../..')).toBe('/');
      expect(PathResolver.normalize('/home/../../etc/passwd')).toBe('/etc/passwd');
    });

    it('correctly splits paths into parentPath and name', () => {
      expect(PathResolver.splitPath('/')).toEqual({ parentPath: null, name: '/' });
      expect(PathResolver.splitPath('/home')).toEqual({ parentPath: '/', name: 'home' });
      expect(PathResolver.splitPath('/home/user/notes.txt')).toEqual({
        parentPath: '/home/user',
        name: 'notes.txt'
      });
    });
  });

  describe('Filesystem Operations with Complex Paths', () => {
    it('creates and resolves files using paths with .. and . segments', () => {
      const createRes = k.fileSystemManager.createFile('/home/user/../user/test.txt', 'Path Data');
      expect(createRes.success).toBe(true);

      // Read back with different normalized path representation
      const readRes = k.fileSystemManager.readFile('/home/./user/test.txt');
      expect(readRes.success).toBe(true);
      expect(readRes.data.content).toBe('Path Data');

      // Stat with ../ traversal
      const statRes = k.fileSystemManager.stat('/home/user/../../home/user/test.txt');
      expect(statRes.success).toBe(true);
      expect(statRes.data.name).toBe('test.txt');
    });

    it('works with relative paths when changing directory', () => {
      k.fileSystemManager.changeDirectory('/home/user');
      expect(k.fileSystemManager.getCurrentPath()).toBe('/home/user');

      // Create with relative path
      const createRes = k.fileSystemManager.createFile('local.txt', 'Local Content');
      expect(createRes.success).toBe(true);
      expect(k.fileSystemManager.exists('/home/user/local.txt')).toBe(true);

      // Read with relative path
      const readRes = k.fileSystemManager.readFile('./local.txt');
      expect(readRes.success).toBe(true);
      expect(readRes.data.content).toBe('Local Content');

      // Navigate back up
      k.fileSystemManager.changeDirectory('..');
      expect(k.fileSystemManager.getCurrentPath()).toBe('/home');
    });

    it('rejects invalid path inputs with EINVAL', () => {
      const res1 = k.fileSystemManager.createFile('', 'data');
      expect(res1.success).toBe(false);
      expect(res1.code).toBe(FileSystemErrorCode.EINVAL);

      const res2 = k.fileSystemManager.readFile('   ');
      expect(res2.success).toBe(false);
      expect(res2.code).toBe(FileSystemErrorCode.EINVAL);
    });
  });
});
