/**
 * tests/os/apiFileSystem.test.js
 * Unit and integration tests for FileSystemAPI.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Kernel } from '../../public/js/os/kernel/Kernel.js';
import { APIContext } from '../../public/js/os/api/APIContext.js';
import { FileSystemAPI } from '../../public/js/os/api/FileSystemAPI.js';
import { APIError } from '../../public/js/os/api/APIError.js';

describe('Phase 19: FileSystemAPI', () => {
  let kernel;
  let context;
  let fsApi;

  beforeEach(() => {
    kernel = new Kernel();
    kernel.boot();

    // Ensure /home/user directory exists in simulated filesystem
    kernel.fileSystemManager.createDirectory('/home');
    kernel.fileSystemManager.createDirectory('/home/user');

    context = new APIContext({
      appId: 'editor-app',
      instanceId: 'editor-app-1',
      pid: 10,
      cwd: '/home/user'
    });

    fsApi = new FileSystemAPI({ kernel, context });
  });

  afterEach(() => {
    kernel.shutdown();
  });

  describe('Path Resolution & Host Safety', () => {
    it('resolves relative paths against context cwd', () => {
      expect(fsApi.resolvePath('file.txt')).toBe('/home/user/file.txt');
      expect(fsApi.resolvePath('../file.txt')).toBe('/home/file.txt');
      expect(fsApi.resolvePath('/var/log')).toBe('/var/log');
    });

    it('strictly prohibits host filesystem paths', () => {
      expect(() => fsApi.readFile('C:\\Windows\\System32')).toThrow(APIError);
      expect(() => fsApi.writeFile('D:\\data.txt', '123')).toThrow(APIError);
      expect(fsApi.exists('\\\\server\\share\\file')).toBe(false);

      try {
        fsApi.readFile('C:\\test.txt');
      } catch (err) {
        expect(err).toBeInstanceOf(APIError);
        expect(err.code).toBe('EINVAL');
        expect(err.message).toMatch(/host filesystem/i);
      }
    });

    it('rejects empty or invalid paths', () => {
      expect(() => fsApi.readFile('')).toThrow(APIError);
      expect(() => fsApi.readFile(null)).toThrow(APIError);
    });
  });

  describe('Simulated File Operations', () => {
    it('creates, writes, reads, and deletes a file', () => {
      // Create and write
      fsApi.createFile('document.txt');
      expect(fsApi.exists('document.txt')).toBe(true);

      fsApi.writeFile('document.txt', 'Hello AdityyaOS!');
      const content = fsApi.readFile('document.txt');
      expect(content.content).toBe('Hello AdityyaOS!');

      // Stat
      const stat = fsApi.stat('document.txt');
      expect(stat.type).toBe('file');

      // Delete
      fsApi.deleteFile('document.txt');
      expect(fsApi.exists('document.txt')).toBe(false);
    });

    it('throws structured APIError when reading non-existent file', () => {
      try {
        fsApi.readFile('nonexistent.txt');
        expect.fail('Should have thrown APIError');
      } catch (err) {
        expect(err).toBeInstanceOf(APIError);
        expect(err.code).toBe('ENOENT');
        expect(err.operation).toBe('fs.readFile');
        expect(err.appId).toBe('editor-app');
      }
    });

    it('creates, lists, and deletes directories', () => {
      fsApi.createDirectory('projects');
      expect(fsApi.exists('projects')).toBe(true);

      const entries = fsApi.listDirectory('.');
      const projectEntry = entries.find(e => e.name === 'projects');
      expect(projectEntry).toBeDefined();
      expect(projectEntry.type).toBe('directory');

      fsApi.deleteDirectory('projects');
      expect(fsApi.exists('projects')).toBe(false);
    });
  });

  describe('File Descriptors', () => {
    it('opens and closes file descriptors scoped to the process', () => {
      fsApi.createFile('stream.dat');
      const openRes = fsApi.open('stream.dat', ['READ', 'WRITE']);
      expect(openRes.fd).toBeDefined();
      expect(typeof openRes.fd).toBe('number');

      const closeRes = fsApi.close(openRes.fd);
      expect(closeRes.closed).toBe(true);
    });

    it('rejects closing invalid descriptor', () => {
      expect(() => fsApi.close(9999)).toThrow(APIError);
    });
  });
});
