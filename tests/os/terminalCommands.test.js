/**
 * tests/os/terminalCommands.test.js
 * Comprehensive tests for all 17 built-in shell commands in Phase 18.
 * Validates help, pwd, cd, ls, mkdir, rmdir, touch, cat, echo, rm, cp, mv, clear, history, whoami, uname, exit.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Kernel } from '../../public/js/os/kernel/Kernel.js';
import { Shell } from '../../public/js/os/terminal/Shell.js';
import { TerminalState } from '../../public/js/os/terminal/TerminalState.js';
import { CommandRegistry } from '../../public/js/os/terminal/CommandRegistry.js';

describe('Phase 18: Built-in Commands', () => {
  let kernel;
  let shell;
  let state;

  beforeEach(() => {
    kernel = new Kernel();
    kernel.boot();
    state = new TerminalState({ cwd: '/home/user', username: 'user', hostname: 'adityyaos' });
    shell = new Shell({ kernel, state });
  });

  describe('help command', () => {
    it('lists all 17 built-in commands with descriptions', async () => {
      const res = await shell.execute('help');
      expect(res.success).toBe(true);
      expect(res.exitCode).toBe(0);
      expect(res.stdout).toContain('help');
      expect(res.stdout).toContain('pwd');
      expect(res.stdout).toContain('cd');
      expect(res.stdout).toContain('ls');
      expect(res.stdout).toContain('mkdir');
      expect(res.stdout).toContain('rmdir');
      expect(res.stdout).toContain('touch');
      expect(res.stdout).toContain('cat');
      expect(res.stdout).toContain('echo');
      expect(res.stdout).toContain('rm');
      expect(res.stdout).toContain('cp');
      expect(res.stdout).toContain('mv');
      expect(res.stdout).toContain('clear');
      expect(res.stdout).toContain('history');
      expect(res.stdout).toContain('whoami');
      expect(res.stdout).toContain('uname');
      expect(res.stdout).toContain('exit');
    });

    it('shows detailed command usage for specific command', async () => {
      const res = await shell.execute('help ls');
      expect(res.success).toBe(true);
      expect(res.stdout).toContain('ls: List information about files and directories');
      expect(res.stdout).toContain('Usage: ls [-l] [-a] [path]');
      expect(res.stdout).toContain('-l');
    });

    it('returns error for unknown command topic', async () => {
      const res = await shell.execute('help nonexistent');
      expect(res.success).toBe(false);
      expect(res.exitCode).toBe(1);
      expect(res.stderr).toContain("no help topics match 'nonexistent'");
    });
  });

  describe('pwd command', () => {
    it('prints current working directory', async () => {
      const res = await shell.execute('pwd');
      expect(res.success).toBe(true);
      expect(res.stdout).toBe('/home/user');
      expect(res.exitCode).toBe(0);
    });
  });

  describe('cd command', () => {
    it('changes to root and subdirectories', async () => {
      let res = await shell.execute('cd /');
      expect(res.success).toBe(true);
      expect(state.cwd).toBe('/');

      res = await shell.execute('cd /bin');
      expect(res.success).toBe(true);
      expect(state.cwd).toBe('/bin');

      res = await shell.execute('cd ..');
      expect(res.success).toBe(true);
      expect(state.cwd).toBe('/');
    });

    it('navigates to home with cd ~ or plain cd', async () => {
      await shell.execute('cd /');
      expect(state.cwd).toBe('/');

      let res = await shell.execute('cd ~');
      expect(res.success).toBe(true);
      expect(state.cwd).toBe('/home/user');

      await shell.execute('cd /var');
      res = await shell.execute('cd');
      expect(res.success).toBe(true);
      expect(state.cwd).toBe('/home/user');
    });

    it('rejects nonexistent directories', async () => {
      const res = await shell.execute('cd /nonexistent');
      expect(res.success).toBe(false);
      expect(res.exitCode).toBe(1);
      expect(res.stderr).toContain('No such file or directory');
    });

    it('rejects navigating into a regular file', async () => {
      kernel.fileSystemManager.createFile('/home/user/file.txt', 'hello');
      const res = await shell.execute('cd /home/user/file.txt');
      expect(res.success).toBe(false);
      expect(res.exitCode).toBe(1);
      expect(res.stderr).toContain('Not a directory');
    });
  });

  describe('ls command', () => {
    it('lists directory contents', async () => {
      const res = await shell.execute('ls /');
      expect(res.success).toBe(true);
      expect(res.stdout).toContain('bin');
      expect(res.stdout).toContain('home');
      expect(res.stdout).toContain('tmp');
    });

    it('supports -l long listing format', async () => {
      const res = await shell.execute('ls -l /');
      expect(res.success).toBe(true);
      expect(res.stdout).toMatch(/^d[rwx-]{3,4}/m);
      expect(res.stdout).toContain('user');
    });

    it('supports -a flag to show hidden files', async () => {
      kernel.fileSystemManager.createFile('/home/user/.hidden', 'secret');
      kernel.fileSystemManager.createFile('/home/user/visible.txt', 'public');

      const noHidden = await shell.execute('ls');
      expect(noHidden.stdout).not.toContain('.hidden');
      expect(noHidden.stdout).toContain('visible.txt');

      const withHidden = await shell.execute('ls -a');
      expect(withHidden.stdout).toContain('.hidden');
      expect(withHidden.stdout).toContain('visible.txt');
    });
  });

  describe('mkdir command', () => {
    it('creates single directory', async () => {
      const res = await shell.execute('mkdir mydir');
      expect(res.success).toBe(true);
      expect(kernel.fileSystemManager.exists('/home/user/mydir')).toBe(true);
    });

    it('fails when directory already exists without -p', async () => {
      await shell.execute('mkdir testdir');
      const res = await shell.execute('mkdir testdir');
      expect(res.success).toBe(false);
      expect(res.exitCode).toBe(1);
      expect(res.stderr).toContain('cannot create directory');
    });

    it('creates nested directories with -p', async () => {
      const res = await shell.execute('mkdir -p nested/sub/folder');
      expect(res.success).toBe(true);
      expect(kernel.fileSystemManager.exists('/home/user/nested/sub/folder')).toBe(true);

      // Re-running with -p should succeed without error
      const res2 = await shell.execute('mkdir -p nested/sub/folder');
      expect(res2.success).toBe(true);
    });
  });

  describe('rmdir command', () => {
    it('removes empty directory', async () => {
      await shell.execute('mkdir emptydir');
      const res = await shell.execute('rmdir emptydir');
      expect(res.success).toBe(true);
      expect(kernel.fileSystemManager.exists('/home/user/emptydir')).toBe(false);
    });

    it('fails to remove non-empty directory', async () => {
      await shell.execute('mkdir notempty');
      kernel.fileSystemManager.createFile('/home/user/notempty/file.txt', 'data');
      const res = await shell.execute('rmdir notempty');
      expect(res.success).toBe(false);
      expect(res.exitCode).toBe(1);
      expect(res.stderr).toContain('failed to remove');
    });
  });

  describe('touch and cat commands', () => {
    it('touch creates empty file and cat displays it', async () => {
      const touchRes = await shell.execute('touch newfile.txt');
      expect(touchRes.success).toBe(true);
      expect(kernel.fileSystemManager.exists('/home/user/newfile.txt')).toBe(true);

      const catRes = await shell.execute('cat newfile.txt');
      expect(catRes.success).toBe(true);
      expect(catRes.stdout).toBe('');
    });

    it('cat rejects nonexistent file and directory target', async () => {
      const missing = await shell.execute('cat missing.txt');
      expect(missing.success).toBe(false);
      expect(missing.exitCode).toBe(1);
      expect(missing.stderr).toContain('No such file or directory');

      const isDir = await shell.execute('cat /bin');
      expect(isDir.success).toBe(false);
      expect(isDir.exitCode).toBe(1);
      expect(isDir.stderr).toContain('Is a directory');
    });
  });

  describe('echo command', () => {
    it('prints arguments separated by space', async () => {
      const res = await shell.execute('echo Hello AdityyaOS World');
      expect(res.success).toBe(true);
      expect(res.stdout).toBe('Hello AdityyaOS World');
      expect(res.exitCode).toBe(0);
    });
  });

  describe('rm command', () => {
    it('deletes regular files', async () => {
      kernel.fileSystemManager.createFile('/home/user/temp.txt', '123');
      const res = await shell.execute('rm temp.txt');
      expect(res.success).toBe(true);
      expect(kernel.fileSystemManager.exists('/home/user/temp.txt')).toBe(false);
    });

    it('rejects deleting directory without -r', async () => {
      await shell.execute('mkdir somedir');
      const res = await shell.execute('rm somedir');
      expect(res.success).toBe(false);
      expect(res.exitCode).toBe(1);
      expect(res.stderr).toContain('Is a directory');
    });

    it('deletes directory recursively with -r or -rf', async () => {
      await shell.execute('mkdir -p tree/sub');
      kernel.fileSystemManager.createFile('/home/user/tree/sub/data.txt', 'content');

      const res = await shell.execute('rm -r tree');
      expect(res.success).toBe(true);
      expect(kernel.fileSystemManager.exists('/home/user/tree')).toBe(false);
    });

    it('suppresses error with -f on nonexistent file', async () => {
      const res = await shell.execute('rm -f non_existent_file.txt');
      expect(res.success).toBe(true);
      expect(res.exitCode).toBe(0);
    });
  });

  describe('cp command', () => {
    it('copies file to new file name', async () => {
      kernel.fileSystemManager.createFile('/home/user/src.txt', 'source data');
      const res = await shell.execute('cp src.txt dest.txt');
      expect(res.success).toBe(true);
      expect(kernel.fileSystemManager.readFile('/home/user/dest.txt').data.content).toBe('source data');
    });

    it('copies file into existing directory', async () => {
      kernel.fileSystemManager.createFile('/home/user/file.txt', 'hello');
      await shell.execute('mkdir backup');
      const res = await shell.execute('cp file.txt backup');
      expect(res.success).toBe(true);
      expect(kernel.fileSystemManager.readFile('/home/user/backup/file.txt').data.content).toBe('hello');
    });

    it('strictly rejects directory source copying in Phase 18', async () => {
      await shell.execute('mkdir dir1');
      const res = await shell.execute('cp dir1 dir2');
      expect(res.success).toBe(false);
      expect(res.exitCode).toBe(1);
      expect(res.stderr).toContain('-r not specified; omitting directory');
    });
  });

  describe('mv command', () => {
    it('renames file', async () => {
      kernel.fileSystemManager.createFile('/home/user/old.txt', 'data');
      const res = await shell.execute('mv old.txt new.txt');
      expect(res.success).toBe(true);
      expect(kernel.fileSystemManager.exists('/home/user/old.txt')).toBe(false);
      expect(kernel.fileSystemManager.exists('/home/user/new.txt')).toBe(true);
    });

    it('moves file into directory', async () => {
      kernel.fileSystemManager.createFile('/home/user/doc.txt', 'doc data');
      await shell.execute('mkdir docs');
      const res = await shell.execute('mv doc.txt docs');
      expect(res.success).toBe(true);
      expect(kernel.fileSystemManager.exists('/home/user/docs/doc.txt')).toBe(true);
    });

    it('renames directory', async () => {
      await shell.execute('mkdir folderA');
      const res = await shell.execute('mv folderA folderB');
      expect(res.success).toBe(true);
      expect(kernel.fileSystemManager.exists('/home/user/folderA')).toBe(false);
      expect(kernel.fileSystemManager.exists('/home/user/folderB')).toBe(true);
    });

    it('rejects moving directory into itself or descendant', async () => {
      await shell.execute('mkdir -p base/sub');
      const res = await shell.execute('mv base base/sub');
      expect(res.success).toBe(false);
      expect(res.exitCode).toBe(1);
      expect(res.stderr).toContain('cannot move');
    });
  });

  describe('clear, history, whoami, uname, and exit commands', () => {
    it('clear returns clear signal', async () => {
      const res = await shell.execute('clear');
      expect(res.success).toBe(true);
      expect(res.clear).toBe(true);
      expect(res.exitCode).toBe(0);
    });

    it('history displays indexed list of commands', async () => {
      await shell.execute('pwd');
      await shell.execute('ls');
      const res = await shell.execute('history');
      expect(res.success).toBe(true);
      expect(res.stdout).toMatch(/1\s+pwd/);
      expect(res.stdout).toMatch(/2\s+ls/);
    });

    it('whoami returns active username', async () => {
      const res = await shell.execute('whoami');
      expect(res.success).toBe(true);
      expect(res.stdout).toBe('user');
    });

    it('uname returns OS name or full info with -a', async () => {
      const r1 = await shell.execute('uname');
      expect(r1.success).toBe(true);
      expect(r1.stdout).toBe('AdityyaOS');

      const r2 = await shell.execute('uname -a');
      expect(r2.success).toBe(true);
      expect(r2.stdout).toContain('AdityyaOS 1.0.0');
      expect(r2.stdout).toContain('x86_64');
    });

    it('exit returns exit signal', async () => {
      const res = await shell.execute('exit');
      expect(res.success).toBe(true);
      expect(res.exit).toBe(true);
      expect(res.exitCode).toBe(0);
    });
  });
});
