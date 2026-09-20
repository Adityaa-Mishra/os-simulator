/**
 * tests/os/terminalIntegration.test.js
 * Host isolation verification, snapshot safety, and autocomplete integration tests for Phase 18.
 */

import { describe, it, expect } from 'vitest';
import { TerminalState } from '../../public/js/os/terminal/TerminalState.js';
import { TerminalView } from '../../public/js/os/terminal/TerminalView.js';
import { Shell } from '../../public/js/os/terminal/Shell.js';
import { Kernel } from '../../public/js/os/kernel/Kernel.js';
import fs from 'fs';
import path from 'path';

describe('Phase 18: Security, Host Isolation & Integration', () => {
  describe('Host Isolation Static & Runtime Verification', () => {
    it('verifies that no terminal source code contains host execution or host filesystem imports', () => {
      const terminalDir = path.resolve(process.cwd(), 'public/js/os/terminal');
      const getFilesRecursively = (dir) => {
        let results = [];
        const list = fs.readdirSync(dir);
        for (const file of list) {
          const filePath = path.join(dir, file);
          const stat = fs.statSync(filePath);
          if (stat && stat.isDirectory()) {
            results = results.concat(getFilesRecursively(filePath));
          } else if (file.endsWith('.js')) {
            results.push(filePath);
          }
        }
        return results;
      };

      const terminalFiles = getFilesRecursively(terminalDir);
      expect(terminalFiles.length).toBeGreaterThan(15);

      const forbiddenPatterns = [
        /child_process/,
        /\bexec\s*\(/,
        /\bspawn\s*\(/,
        /\bexecSync\s*\(/,
        /\bspawnSync\s*\(/,
        /from\s+['"]fs['"]/,
        /require\(['"]fs['"]\)/,
        /from\s+['"]node:/,
        /powershell/i,
        /\bcmd\.exe/i
      ];

      for (const filePath of terminalFiles) {
        const content = fs.readFileSync(filePath, 'utf8');
        for (const pattern of forbiddenPatterns) {
          expect(content).not.toMatch(pattern);
        }
      }
    });
  });

  describe('TerminalState Snapshot Safety', () => {
    it('returns an immutable copy from getState() and toJSON() without leaking mutable references', () => {
      const state = new TerminalState({
        cwd: '/home/user',
        username: 'user',
        hostname: 'adityyaos',
        history: ['pwd', 'ls'],
        exitCode: 0,
        isActive: true,
        pid: 42
      });

      const snapshot = state.getState();
      expect(snapshot).toEqual({
        cwd: '/home/user',
        username: 'user',
        hostname: 'adityyaos',
        history: ['pwd', 'ls'],
        exitCode: 0,
        isActive: true,
        pid: 42
      });

      // Mutating snapshot history does not affect internal state
      snapshot.history.push('evil_cmd');
      expect(state.history).toEqual(['pwd', 'ls']);

      const json = state.toJSON();
      expect(json.history).toEqual(['pwd', 'ls']);
    });
  });

  describe('Tab Autocomplete Integration', () => {
    it('autocompletes unique command names', () => {
      const kernel = new Kernel();
      kernel.boot();
      const state = new TerminalState();
      const shell = new Shell({ kernel, state });
      const view = new TerminalView({ shell, state });

      // Mock DOM input element
      view.inputEl = { value: 'who' };
      view.handleTabCompletion();
      expect(view.inputEl.value).toBe('whoami ');

      view.inputEl = { value: 'pw' };
      view.handleTabCompletion();
      expect(view.inputEl.value).toBe('pwd ');
    });

    it('autocompletes files in cwd for second argument', () => {
      const kernel = new Kernel();
      kernel.boot();
      kernel.fileSystemManager.createFile('/home/user/document.txt', 'test');

      const state = new TerminalState({ cwd: '/home/user' });
      const shell = new Shell({ kernel, state });
      const view = new TerminalView({ shell, state });

      view.inputEl = { value: 'cat doc' };
      view.handleTabCompletion();
      expect(view.inputEl.value).toBe('cat document.txt ');
    });
  });
});
