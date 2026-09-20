import { describe, it, expect, beforeEach } from 'vitest';
import { Kernel } from '../../../public/js/os/kernel/Kernel.js';
import { APIContext } from '../../../public/js/os/api/APIContext.js';
import { AdityyaOSAPI } from '../../../public/js/os/api/AdityyaOSAPI.js';
import { PackagePermissions } from '../../../public/js/os/packages/PackagePermissions.js';
import { AIDeveloperTools } from '../../../public/js/os/ai-tools/AIDeveloperTools.js';

describe('Phase 28 — AIDeveloperTools Virtual Operations', () => {
  let kernel;
  let api;
  let devTools;

  beforeEach(() => {
    kernel = new Kernel();
    kernel.boot();

    const context = new APIContext({
      appId: 'terminal-app',
      instanceId: 'term-inst-1',
      pid: 10,
      permissions: [
        PackagePermissions.FILESYSTEM_READ,
        PackagePermissions.FILESYSTEM_WRITE,
        PackagePermissions.SYSTEM_READ,
        PackagePermissions.PROCESS_READ,
        PackagePermissions.NETWORK_READ
      ]
    });

    api = new AdityyaOSAPI({ kernel, context });
    devTools = new AIDeveloperTools(api);
  });

  it('provides read-only inspection tools for virtual AdityyaFS', async () => {
    // Create a virtual file via AdityyaOSAPI
    api.fs.writeFile('/home/hello.txt', 'Hello AdityyaOS Developer Tools!');

    // exists
    const existsRes = await devTools.execute('filesystem.exists', { path: '/home/hello.txt' });
    expect(existsRes.exists).toBe(true);

    // stat
    const statRes = await devTools.execute('filesystem.stat', { path: '/home/hello.txt' });
    expect(statRes.type).toBe('file');
    expect(statRes.size).toBeGreaterThan(0);

    // readFile
    const readRes = await devTools.execute('filesystem.readFile', { path: '/home/hello.txt' });
    expect(readRes.content).toBe('Hello AdityyaOS Developer Tools!');

    // listDirectory
    const listRes = await devTools.execute('filesystem.listDirectory', { path: '/home' });
    expect(listRes.entries).toContain('hello.txt');

    // searchText
    const searchRes = await devTools.execute('filesystem.searchText', {
      path: '/home',
      query: 'Developer Tools'
    });
    expect(searchRes.matches.length).toBeGreaterThan(0);
    expect(searchRes.matches[0].path).toBe('/home/hello.txt');

    // findFiles
    const findRes = await devTools.execute('filesystem.findFiles', {
      path: '/home',
      pattern: '*.txt'
    });
    expect(findRes.files).toContain('/home/hello.txt');

    // getUsage
    const usageRes = await devTools.execute('filesystem.getUsage', {});
    expect(usageRes.totalBlocks).toBeDefined();
    expect(usageRes.usedBlocks).toBeDefined();
  });

  it('provides mutating tools: createFile, createDirectory, rename, deleteFile', async () => {
    // createFile
    const createRes = await devTools.execute('filesystem.createFile', {
      path: '/home/new_code.js',
      content: 'console.log("code");'
    });
    expect(createRes.success).toBe(true);
    expect(api.fs.readFile('/home/new_code.js').content).toBe('console.log("code");');

    // createDirectory
    const dirRes = await devTools.execute('filesystem.createDirectory', {
      path: '/home/src'
    });
    expect(dirRes.success).toBe(true);
    expect(api.fs.stat('/home/src').type).toBe('directory');

    // rename - must use genuine api.fs.rename
    const renameRes = await devTools.execute('filesystem.rename', {
      oldPath: '/home/new_code.js',
      newPath: '/home/src/main.js'
    });
    expect(renameRes.success).toBe(true);
    expect(api.fs.exists('/home/new_code.js')).toBe(false);
    expect(api.fs.exists('/home/src/main.js')).toBe(true);
    expect(api.fs.readFile('/home/src/main.js').content).toBe('console.log("code");');

    // deleteFile
    const delRes = await devTools.execute('filesystem.deleteFile', {
      path: '/home/src/main.js'
    });
    expect(delRes.success).toBe(true);
    expect(api.fs.exists('/home/src/main.js')).toBe(false);
  });

  it('rejects unknown tools and prevents path traversal out of AdityyaFS', async () => {
    await expect(devTools.execute('system.runHostBash', {}))
      .rejects.toThrowError(/Unknown or disallowed/);

    await expect(devTools.execute('filesystem.readFile', { path: '../../../../Windows/System32' }))
      .rejects.toThrowError();
  });
});
