import { describe, it, expect, beforeEach } from 'vitest';
import { simulationRegistry } from '../../public/js/core/simulationRegistry.js';
import { FileSystemSimulatorEngine } from '../../public/js/engines/filesystem/fsSimulator.js';
import { BaseFileSystemEngine } from '../../public/js/engines/filesystem/baseFileSystem.js';
import { FileSystemRenderer } from '../../public/js/visualizers/fileSystemRenderer.js';
import '../../public/js/engines/filesystem/index.js'; // Ensure auto-registration

describe('Phase 7: File System Simulation Engine', () => {
  let vfs;

  beforeEach(() => {
    vfs = new FileSystemSimulatorEngine({ totalBlocks: 32, blockSize: 64 });
  });

  describe('Registry & Presets', () => {
    it('registers filesystem simulator engine in simulationRegistry', () => {
      const engine = simulationRegistry.get('filesystem', 'filesystem_simulator');
      expect(engine).toBeDefined();
      expect(engine.name).toBe('File System Simulator');
    });

    it('provides all 4 standard educational presets', () => {
      const presets = vfs.getPresets();
      expect(presets.length).toBe(4);
      expect(presets[0].name).toBe('Default File System');
      expect(presets[1].name).toBe('Empty File System');
      expect(presets[2].name).toBe('External Fragmentation Demo');
      expect(presets[3].name).toBe('Permissions & File State Demo');
    });
  });

  describe('Path Handling & Normalization', () => {
    it('normalizes root and redundant slashes', () => {
      expect(vfs.normalizePath('/')).toBe('/');
      expect(vfs.normalizePath('///')).toBe('/');
      expect(vfs.normalizePath('/home///notes.txt')).toBe('/home/notes.txt');
    });

    it('resolves relative paths against currentPath', () => {
      expect(vfs.normalizePath('notes.txt', '/home')).toBe('/home/notes.txt');
      expect(vfs.normalizePath('./notes.txt', '/home')).toBe('/home/notes.txt');
      expect(vfs.normalizePath('projects/a', '/home')).toBe('/home/projects/a');
    });

    it('handles .. parent navigation and clamps at root', () => {
      expect(vfs.normalizePath('/home/..', '/')).toBe('/');
      expect(vfs.normalizePath('/home/projects/..', '/')).toBe('/home');
      expect(vfs.normalizePath('/../../..', '/')).toBe('/');
      expect(vfs.normalizePath('../etc', '/home')).toBe('/etc');
    });

    it('correctly splits path into parentPath and name', () => {
      expect(vfs.splitPath('/home/notes.txt')).toEqual({ parentPath: '/home', name: 'notes.txt' });
      expect(vfs.splitPath('/home')).toEqual({ parentPath: '/', name: 'home' });
      expect(vfs.splitPath('/')).toEqual({ parentPath: null, name: '/' });
    });
  });

  describe('Directory Operations (mkdir, rmdir, cd, ls)', () => {
    it('creates directories with mkdir', () => {
      const res = vfs.mkdir('/home');
      expect(res.success).toBe(true);
      expect(vfs.resolvePath('/home').found).toBe(true);
      expect(vfs.resolvePath('/home').node.type).toBe('directory');
    });

    it('rejects duplicate directory creation', () => {
      vfs.mkdir('/home');
      const res = vfs.mkdir('/home');
      expect(res.success).toBe(false);
      expect(res.errorCode).toBe('ALREADY_EXISTS');
    });

    it('rejects mkdir when parent directory does not exist', () => {
      const res = vfs.mkdir('/nonexistent/sub');
      expect(res.success).toBe(false);
      expect(res.errorCode).toBe('PARENT_NOT_FOUND');
    });

    it('removes empty directories with rmdir', () => {
      vfs.mkdir('/temp');
      const res = vfs.rmdir('/temp');
      expect(res.success).toBe(true);
      expect(vfs.resolvePath('/temp').found).toBe(false);
    });

    it('rejects rmdir on non-empty directory', () => {
      vfs.mkdir('/home');
      vfs.create('/home/file.txt', 50);
      const res = vfs.rmdir('/home');
      expect(res.success).toBe(false);
      expect(res.errorCode).toBe('DIRECTORY_NOT_EMPTY');
    });

    it('rejects rmdir on root directory', () => {
      const res = vfs.rmdir('/');
      expect(res.success).toBe(false);
      expect(res.errorCode).toBe('CANNOT_REMOVE_ROOT');
    });

    it('supports cd and ls navigation', () => {
      vfs.mkdir('/docs');
      vfs.create('/docs/a.txt', 10);
      vfs.create('/docs/b.txt', 20);

      const cdRes = vfs.cd('/docs');
      expect(cdRes.success).toBe(true);
      expect(vfs.currentPath).toBe('/docs');

      const lsRes = vfs.ls('.');
      expect(lsRes.success).toBe(true);
      expect(lsRes.data.entries.length).toBe(2);
      expect(lsRes.data.entries.map(e => e.name)).toEqual(['a.txt', 'b.txt']);
    });
  });

  describe('File Operations & Contiguous Allocation', () => {
    it('creates a file with contiguous First-Fit block allocation', () => {
      // 120 bytes with 64-byte block size = ceil(120 / 64) = 2 blocks
      const res = vfs.create('/test.txt', 120, 'rw-');
      expect(res.success).toBe(true);
      expect(res.data.blocks).toEqual([0, 1]);
      expect(vfs.blockMap[0].status).toBe('allocated');
      expect(vfs.blockMap[1].status).toBe('allocated');
      expect(vfs.blockMap[2].status).toBe('free');
    });

    it('creates 0-byte file without allocating disk blocks', () => {
      const res = vfs.create('/empty.txt', 0, 'rw-');
      expect(res.success).toBe(true);
      expect(res.data.blocks).toEqual([]);
      expect(vfs.calculateAllocationStats().allocatedBlocks).toBe(0);
    });

    it('rejects duplicate file creation in same directory', () => {
      vfs.create('/file.txt', 50);
      const res = vfs.create('/file.txt', 60);
      expect(res.success).toBe(false);
      expect(res.errorCode).toBe('ALREADY_EXISTS');
    });

    it('deletes a file and frees its allocated blocks', () => {
      vfs.create('/file1.txt', 120); // blocks [0, 1]
      vfs.create('/file2.txt', 60);  // block [2]

      const delRes = vfs.delete('/file1.txt');
      expect(delRes.success).toBe(true);
      expect(delRes.data.freedBlocks).toEqual([0, 1]);
      expect(vfs.blockMap[0].status).toBe('free');
      expect(vfs.blockMap[1].status).toBe('free');
      expect(vfs.blockMap[2].status).toBe('allocated');
    });

    it('reads file metadata and checks read permissions', () => {
      vfs.create('/read.txt', 100, 'r--');
      const res = vfs.read('/read.txt');
      expect(res.success).toBe(true);
      expect(res.data.size).toBe(100);
      expect(res.data.permissions).toBe('r--');
    });

    it('rejects read when read permission is absent', () => {
      // Create with rw- then modify permission for testing
      vfs.create('/writeonly.txt', 50, 'rw-');
      vfs.resolvePath('/writeonly.txt').node.permissions = '-w-'; // simulate write-only
      const res = vfs.read('/writeonly.txt');
      expect(res.success).toBe(false);
      expect(res.errorCode).toBe('PERMISSION_DENIED');
    });
  });

  describe('Write Resizing, Contiguous Extension & Relocation', () => {
    it('shrinks file and releases trailing blocks', () => {
      vfs.create('/doc.txt', 180); // 3 blocks: [0, 1, 2]
      expect(vfs.resolvePath('/doc.txt').node.blocks).toEqual([0, 1, 2]);

      // Shrink to 50 bytes (1 block)
      const writeRes = vfs.write('/doc.txt', 50);
      expect(writeRes.success).toBe(true);
      expect(vfs.resolvePath('/doc.txt').node.blocks).toEqual([0]);
      expect(vfs.blockMap[1].status).toBe('free');
      expect(vfs.blockMap[2].status).toBe('free');
    });

    it('extends file in-place when contiguous adjacent blocks are free', () => {
      vfs.create('/doc.txt', 60); // 1 block: [0]
      // Block 1 and 2 are free
      const writeRes = vfs.write('/doc.txt', 180); // needs 3 blocks: [0, 1, 2]
      expect(writeRes.success).toBe(true);
      expect(vfs.resolvePath('/doc.txt').node.blocks).toEqual([0, 1, 2]);
    });

    it('relocates file to a new First-Fit contiguous region when adjacent block is occupied', () => {
      vfs.create('/fileA.txt', 60); // block [0]
      vfs.create('/fileB.txt', 60); // block [1] (blocks fileA from extending in-place)

      // Expand fileA to 120 bytes (2 blocks). Cannot extend at [0, 1] because block 1 is fileB!
      // Must relocate to [2, 3] and free block [0]!
      const writeRes = vfs.write('/fileA.txt', 120);
      expect(writeRes.success).toBe(true);
      expect(vfs.resolvePath('/fileA.txt').node.blocks).toEqual([2, 3]);
      expect(vfs.blockMap[0].status).toBe('free'); // old block freed!
      expect(vfs.blockMap[1].fileId).toBe(vfs.resolvePath('/fileB.txt').node.id); // fileB intact
    });

    it('rolls back atomically with zero leaked blocks if write relocation fails', () => {
      // Fill disk almost completely leaving only fragmented blocks
      vfs.create('/a.txt', 64); // [0]
      vfs.create('/b.txt', 64); // [1]
      vfs.create('/blocker.txt', 64 * 30); // [2..31] (30 blocks)
      // Total disk is 32 blocks, 32 are allocated.

      // Now delete /a.txt -> block 0 is free.
      vfs.delete('/a.txt');
      // Disk: block 0 free, block 1 allocated to b.txt, blocks 2..31 allocated to blocker.txt.
      // Total free blocks = 1 (block 0).

      // Attempt to expand b.txt to 3 blocks (192 bytes).
      // Cannot extend in-place (block 2 is occupied).
      // Cannot relocate (only 1 free block exists, need 3).
      const writeRes = vfs.write('/b.txt', 192);
      expect(writeRes.success).toBe(false);
      expect(writeRes.errorCode).toBe('INSUFFICIENT_DISK_SPACE');

      // Crucial: Atomic Rollback verification!
      const bNode = vfs.resolvePath('/b.txt').node;
      expect(bNode.size).toBe(64); // size unchanged
      expect(bNode.blocks).toEqual([1]); // blocks unchanged
      expect(vfs.blockMap[1].status).toBe('allocated');
      expect(vfs.blockMap[1].fileId).toBe(bNode.id);
      expect(vfs.blockMap[0].status).toBe('free');
    });

    it('demonstrates external fragmentation when total free >= requested but max contiguous < requested', () => {
      // Load fragmentation preset
      const fragPreset = vfs.getPresets()[2];
      vfs.reset(fragPreset.data.initialNodes, fragPreset.data.config);

      const stats = vfs.calculateAllocationStats();
      expect(stats.freeBlocks).toBe(4); // blocks [2, 3] and [6, 7] = 4 free blocks
      expect(stats.largestFreeContiguousRegion).toBe(2);
      expect(stats.externalFragmentationBlocks).toBe(2); // 4 - 2 = 2

      // Try to create a file requiring 3 blocks (180 bytes)
      const res = vfs.create('/bigfile.dat', 180);
      expect(res.success).toBe(false);
      expect(res.errorCode).toBe('INSUFFICIENT_CONTIGUOUS_SPACE');
      expect(res.message).toContain('External Fragmentation');
    });
  });

  describe('File Open / Close State', () => {
    it('opens a closed file and closes an open file', () => {
      vfs.create('/notes.txt', 50);
      expect(vfs.resolvePath('/notes.txt').node.open).toBe(false);

      const openRes = vfs.open('/notes.txt');
      expect(openRes.success).toBe(true);
      expect(vfs.resolvePath('/notes.txt').node.open).toBe(true);

      const closeRes = vfs.close('/notes.txt');
      expect(closeRes.success).toBe(true);
      expect(vfs.resolvePath('/notes.txt').node.open).toBe(false);
    });

    it('rejects opening an already open file', () => {
      vfs.create('/notes.txt', 50);
      vfs.open('/notes.txt');
      const res = vfs.open('/notes.txt');
      expect(res.success).toBe(false);
      expect(res.errorCode).toBe('ALREADY_OPEN');
    });

    it('rejects closing an un-opened file', () => {
      vfs.create('/notes.txt', 50);
      const res = vfs.close('/notes.txt');
      expect(res.success).toBe(false);
      expect(res.errorCode).toBe('NOT_OPEN');
    });

    it('rejects deleting an open file (FILE_OPEN)', () => {
      vfs.create('/active.txt', 50);
      vfs.open('/active.txt');

      const delRes = vfs.delete('/active.txt');
      expect(delRes.success).toBe(false);
      expect(delRes.errorCode).toBe('FILE_OPEN');
      expect(vfs.resolvePath('/active.txt').found).toBe(true);
    });
  });

  describe('Snapshots & Metrics', () => {
    it('records immutable snapshots that are not mutated by subsequent operations', () => {
      vfs.create('/file1.txt', 60);
      const snap1 = vfs.snapshots[vfs.snapshots.length - 1];
      const snap1TreeLength = snap1.fileSystemTree.length;

      vfs.create('/file2.txt', 60);
      const snap2 = vfs.snapshots[vfs.snapshots.length - 1];

      expect(snap1.fileSystemTree.length).toBe(snap1TreeLength);
      expect(snap2.fileSystemTree.length).toBe(snap1TreeLength + 1);
    });

    it('computes accurate metrics', () => {
      vfs.mkdir('/dirA');
      vfs.create('/dirA/file1.txt', 120); // 2 blocks
      vfs.create('/dirA/file2.txt', 60);  // 1 block

      const m = vfs.getMetrics();
      expect(m.fileCount).toBe(2);
      expect(m.directoryCount).toBe(2); // root + dirA
      expect(m.allocatedBlocks).toBe(3);
      expect(m.freeBlocks).toBe(29);
      expect(m.totalFilesSize).toBe(180);
      expect(m.largestFile.name).toBe('file1.txt');
    });
  });

  describe('Visualizers', () => {
    it('renders VFS tree without throwing', () => {
      const container = { innerHTML: '' };
      vfs.mkdir('/docs');
      vfs.create('/docs/readme.txt', 50);

      FileSystemRenderer.renderTree(container, Array.from(vfs.nodes.values()));
      expect(container.innerHTML).toContain('Virtual Directory Hierarchy');
      expect(container.innerHTML).toContain('docs');
      expect(container.innerHTML).toContain('readme.txt');
    });

    it('renders 32-block disk map with allocation status', () => {
      const container = { innerHTML: '' };
      vfs.create('/test.txt', 120); // blocks 0, 1

      FileSystemRenderer.renderBlockMap(container, vfs.blockMap, Array.from(vfs.nodes.values()));
      expect(container.innerHTML).toContain('Physical Disk Blocks');
      expect(container.innerHTML).toContain('Block 0');
      expect(container.innerHTML).toContain('OCCUPIED');
      expect(container.innerHTML).toContain('FREE');
    });

    it('renders node details card', () => {
      const container = { innerHTML: '' };
      vfs.create('/item.txt', 64, 'rw-');
      const node = vfs.resolvePath('/item.txt').node;

      FileSystemRenderer.renderNodeDetails(container, node);
      expect(container.innerHTML).toContain('item.txt');
      expect(container.innerHTML).toContain('64 Bytes');
      expect(container.innerHTML).toContain('rw-');
    });
  });
});
