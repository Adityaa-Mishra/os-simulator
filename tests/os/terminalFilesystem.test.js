/**
 * tests/os/terminalFilesystem.test.js
 * End-to-end integration tests between Phase 18 Terminal/Shell and AdityyaFS.
 * Validates complex workflows, redirection, path resolution, descriptor safety, and error handling.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Kernel } from '../../public/js/os/kernel/Kernel.js';
import { Shell } from '../../public/js/os/terminal/Shell.js';
import { TerminalState } from '../../public/js/os/terminal/TerminalState.js';

describe('Phase 18: Terminal Filesystem Integration', () => {
  let kernel;
  let shell;
  let state;

  beforeEach(() => {
    kernel = new Kernel();
    kernel.boot();
    state = new TerminalState({ cwd: '/home/user', username: 'user', hostname: 'adityyaos' });
    shell = new Shell({ kernel, state });
  });

  it('executes a complete end-to-end filesystem lifecycle workflow', async () => {
    // 1. mkdir test
    let res = await shell.execute('mkdir workspace');
    expect(res.success).toBe(true);

    // 2. cd workspace
    res = await shell.execute('cd workspace');
    expect(res.success).toBe(true);
    expect(state.cwd).toBe('/home/user/workspace');

    // 3. touch notes.txt
    res = await shell.execute('touch notes.txt');
    expect(res.success).toBe(true);
    expect(kernel.fileSystemManager.exists('/home/user/workspace/notes.txt')).toBe(true);

    // 4. echo "First line" > notes.txt
    res = await shell.execute('echo "First line" > notes.txt');
    expect(res.success).toBe(true);

    // 5. cat notes.txt
    res = await shell.execute('cat notes.txt');
    expect(res.success).toBe(true);
    expect(res.stdout).toBe('First line');

    // 6. echo "Second line" >> notes.txt
    res = await shell.execute('echo "Second line" >> notes.txt');
    expect(res.success).toBe(true);

    // 7. cat notes.txt
    res = await shell.execute('cat notes.txt');
    expect(res.success).toBe(true);
    expect(res.stdout).toBe('First line\nSecond line');

    // 8. cp notes.txt backup.txt
    res = await shell.execute('cp notes.txt backup.txt');
    expect(res.success).toBe(true);
    expect(kernel.fileSystemManager.exists('/home/user/workspace/backup.txt')).toBe(true);

    // 9. mv backup.txt /home/user/archived.txt
    res = await shell.execute('mv backup.txt /home/user/archived.txt');
    expect(res.success).toBe(true);
    expect(kernel.fileSystemManager.exists('/home/user/workspace/backup.txt')).toBe(false);
    expect(kernel.fileSystemManager.exists('/home/user/archived.txt')).toBe(true);

    // 10. rm notes.txt
    res = await shell.execute('rm notes.txt');
    expect(res.success).toBe(true);
    expect(kernel.fileSystemManager.exists('/home/user/workspace/notes.txt')).toBe(false);

    // 11. cd ..
    res = await shell.execute('cd ..');
    expect(res.success).toBe(true);
    expect(state.cwd).toBe('/home/user');

    // 12. rm -r workspace
    res = await shell.execute('rm -r workspace');
    expect(res.success).toBe(true);
    expect(kernel.fileSystemManager.exists('/home/user/workspace')).toBe(false);
  });

  describe('Redirection behavior and safety', () => {
    it('creates file on > if it does not exist', async () => {
      const res = await shell.execute('echo "brand new" > created.txt');
      expect(res.success).toBe(true);
      expect(kernel.fileSystemManager.readFile('/home/user/created.txt').data.content).toBe('brand new');
    });

    it('overwrites existing file on >', async () => {
      await shell.execute('echo "initial" > data.txt');
      await shell.execute('echo "overwritten" > data.txt');
      const cat = await shell.execute('cat data.txt');
      expect(cat.stdout).toBe('overwritten');
    });

    it('appends to existing file on >>', async () => {
      await shell.execute('echo "line 1" > append.txt');
      await shell.execute('echo "line 2" >> append.txt');
      const cat = await shell.execute('cat append.txt');
      expect(cat.stdout).toBe('line 1\nline 2');
    });

    it('returns error when redirecting to missing directory without corrupting state', async () => {
      const res = await shell.execute('echo "fail" > /missing_dir/file.txt');
      expect(res.success).toBe(false);
      expect(res.exitCode).toBe(1);
      expect(res.stderr).toContain('Parent directory');
      expect(kernel.fileSystemManager.exists('/missing_dir/file.txt')).toBe(false);
    });

    it('returns error when redirecting to an existing directory', async () => {
      await shell.execute('mkdir target_dir');
      const res = await shell.execute('echo "fail" > target_dir');
      expect(res.success).toBe(false);
      expect(res.exitCode).toBe(1);
      expect(res.stderr).toContain('Is a directory');
    });
  });

  describe('Descriptor Safety', () => {
    it('does not leak open file descriptors after shell operations', async () => {
      const initialDescriptors = kernel.fileSystemManager.fs.descriptors.size;

      await shell.execute('echo "test data" > test.txt');
      await shell.execute('cat test.txt');
      await shell.execute('echo "more data" >> test.txt');
      await shell.execute('cp test.txt copy.txt');
      await shell.execute('mv copy.txt moved.txt');

      // Failed operations
      await shell.execute('cat nonexistent.txt');
      await shell.execute('cp nonexistent.txt somewhere.txt');

      const finalDescriptors = kernel.fileSystemManager.fs.descriptors.size;
      expect(finalDescriptors).toBe(initialDescriptors);
    });
  });
});
