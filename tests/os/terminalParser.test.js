/**
 * tests/os/terminalParser.test.js
 * Comprehensive tests for Phase 18 ShellParser.
 * Validates whitespace, single/double quotes, escaping, flags, redirection, and syntax errors.
 */

import { describe, it, expect } from 'vitest';
import { ShellParser } from '../../public/js/os/terminal/ShellParser.js';

describe('Phase 18: ShellParser', () => {
  describe('Basic tokenization and whitespace', () => {
    it('returns empty command for empty or whitespace-only input', () => {
      const r1 = ShellParser.parse('');
      expect(r1.command).toBe('');
      expect(r1.args).toEqual([]);
      expect(r1.error).toBeNull();
      expect(r1.exitCode).toBe(0);

      const r2 = ShellParser.parse('     \t   ');
      expect(r2.command).toBe('');
      expect(r2.args).toEqual([]);
      expect(r2.error).toBeNull();
    });

    it('parses single command with arbitrary spaces and tabs', () => {
      const res = ShellParser.parse('   ls     -l      /home/user   ');
      expect(res.command).toBe('ls');
      expect(res.args).toEqual(['-l', '/home/user']);
      expect(res.positionalArgs).toEqual(['/home/user']);
      expect(res.flags.has('l')).toBe(true);
      expect(res.error).toBeNull();
    });
  });

  describe('Quote handling and escaping', () => {
    it('preserves literal content inside single quotes', () => {
      const res = ShellParser.parse("echo 'hello world    spaced'");
      expect(res.command).toBe('echo');
      expect(res.args).toEqual(['hello world    spaced']);
      expect(res.positionalArgs).toEqual(['hello world    spaced']);
      expect(res.error).toBeNull();
    });

    it('does not interpret escapes inside single quotes', () => {
      const res = ShellParser.parse("echo 'hello \\\" world'");
      expect(res.args).toEqual(['hello \\" world']);
    });

    it('supports escaped quotes and backslashes in double quotes', () => {
      const res = ShellParser.parse('echo "hello \\"world\\" with \\\\ backslash"');
      expect(res.command).toBe('echo');
      expect(res.args).toEqual(['hello "world" with \\ backslash']);
      expect(res.error).toBeNull();
    });

    it('reports syntax error on unterminated single quote', () => {
      const res = ShellParser.parse("echo 'unterminated quote");
      expect(res.error).toBe('Syntax error: unterminated single quote');
      expect(res.exitCode).toBe(2);
    });

    it('reports syntax error on unterminated double quote', () => {
      const res = ShellParser.parse('echo "unterminated quote');
      expect(res.error).toBe('Syntax error: unterminated double quote');
      expect(res.exitCode).toBe(2);
    });
  });

  describe('Flags parsing', () => {
    it('parses short flags', () => {
      const res = ShellParser.parse('ls -l -a /dir');
      expect(res.command).toBe('ls');
      expect(res.flags.has('l')).toBe(true);
      expect(res.flags.has('a')).toBe(true);
      expect(res.flags.has('-l')).toBe(true);
      expect(res.flags.has('-a')).toBe(true);
      expect(res.positionalArgs).toEqual(['/dir']);
    });

    it('parses combined short flags like -la and -rf', () => {
      const res1 = ShellParser.parse('ls -la /var');
      expect(res1.flags.has('l')).toBe(true);
      expect(res1.flags.has('a')).toBe(true);
      expect(res1.flags.has('-la')).toBe(true);
      expect(res1.positionalArgs).toEqual(['/var']);

      const res2 = ShellParser.parse('rm -rf /tmp/data');
      expect(res2.flags.has('r')).toBe(true);
      expect(res2.flags.has('f')).toBe(true);
      expect(res2.flags.has('-rf')).toBe(true);
      expect(res2.positionalArgs).toEqual(['/tmp/data']);
    });

    it('parses long flags like --all and --parents', () => {
      const res = ShellParser.parse('mkdir --parents a/b/c');
      expect(res.command).toBe('mkdir');
      expect(res.flags.has('--parents')).toBe(true);
      expect(res.flags.has('parents')).toBe(true);
      expect(res.positionalArgs).toEqual(['a/b/c']);
    });
  });

  describe('Redirection parsing', () => {
    it('parses overwrite redirection > with target file', () => {
      const res = ShellParser.parse('echo "hello" > out.txt');
      expect(res.command).toBe('echo');
      expect(res.positionalArgs).toEqual(['hello']);
      expect(res.redirection).toEqual({
        type: '>',
        target: 'out.txt'
      });
      expect(res.error).toBeNull();
    });

    it('parses append redirection >> with target file', () => {
      const res = ShellParser.parse('echo "line two" >> log.txt');
      expect(res.command).toBe('echo');
      expect(res.positionalArgs).toEqual(['line two']);
      expect(res.redirection).toEqual({
        type: '>>',
        target: 'log.txt'
      });
      expect(res.error).toBeNull();
    });

    it('handles attached redirection without spaces', () => {
      const res1 = ShellParser.parse('echo hello>file.txt');
      expect(res1.command).toBe('echo');
      expect(res1.positionalArgs).toEqual(['hello']);
      expect(res1.redirection).toEqual({ type: '>', target: 'file.txt' });

      const res2 = ShellParser.parse('echo world>>file.txt');
      expect(res2.command).toBe('echo');
      expect(res2.positionalArgs).toEqual(['world']);
      expect(res2.redirection).toEqual({ type: '>>', target: 'file.txt' });
    });

    it('reports error on missing redirection target', () => {
      const r1 = ShellParser.parse('echo hello >');
      expect(r1.error).toBe('Syntax error: missing redirection target');
      expect(r1.exitCode).toBe(2);

      const r2 = ShellParser.parse('echo hello >>');
      expect(r2.error).toBe('Syntax error: missing redirection target');
      expect(r2.exitCode).toBe(2);
    });

    it('reports error on multiple redirection operators or malformed >>>', () => {
      const r1 = ShellParser.parse('echo hello >>> file.txt');
      expect(r1.error).toBe('Syntax error: malformed redirection');
      expect(r1.exitCode).toBe(2);

      const r2 = ShellParser.parse('echo hello > f1 > f2');
      expect(r2.error).toBe('Syntax error: multiple redirection operators');
      expect(r2.exitCode).toBe(2);
    });
  });
});
