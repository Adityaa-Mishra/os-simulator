/**
 * tests/os/terminalHistory.test.js
 * Comprehensive tests for Phase 18 CommandHistory.
 * Validates bounded buffer, navigation up/down, consecutive deduplication, and draft restoration.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CommandHistory } from '../../public/js/os/terminal/CommandHistory.js';

describe('Phase 18: CommandHistory', () => {
  let history;

  beforeEach(() => {
    history = new CommandHistory({ maxEntries: 5 });
  });

  it('adds commands and ignores empty or whitespace-only inputs', () => {
    history.add('ls -l');
    history.add('');
    history.add('   ');
    history.add('pwd');

    expect(history.getAll()).toEqual(['ls -l', 'pwd']);
    expect(history.size).toBe(2);
  });

  it('does not store consecutive duplicate commands', () => {
    history.add('ls');
    history.add('ls');
    history.add('pwd');
    history.add('pwd');
    history.add('ls');

    expect(history.getAll()).toEqual(['ls', 'pwd', 'ls']);
  });

  it('enforces maximum entry bound and evicts oldest', () => {
    for (let i = 1; i <= 7; i++) {
      history.add(`cmd${i}`);
    }

    expect(history.size).toBe(5);
    expect(history.getAll()).toEqual(['cmd3', 'cmd4', 'cmd5', 'cmd6', 'cmd7']);
  });

  it('navigates up and clamps at the oldest entry', () => {
    history.add('cmd1');
    history.add('cmd2');
    history.add('cmd3');

    // First up arrow from draft input
    expect(history.navigateUp('my draft')).toBe('cmd3');
    expect(history.navigateUp()).toBe('cmd2');
    expect(history.navigateUp()).toBe('cmd1');
    // Clamps at oldest
    expect(history.navigateUp()).toBe('cmd1');
  });

  it('navigates down and restores the original draft input', () => {
    history.add('cmd1');
    history.add('cmd2');
    history.add('cmd3');

    // Move up twice
    expect(history.navigateUp('draft text')).toBe('cmd3');
    expect(history.navigateUp()).toBe('cmd2');

    // Move down
    expect(history.navigateDown()).toBe('cmd3');
    // Move past newest -> restores draft
    expect(history.navigateDown()).toBe('draft text');
    // Further down stays at draft
    expect(history.navigateDown()).toBe('draft text');
  });

  it('resets navigation when a new command is added', () => {
    history.add('cmd1');
    history.add('cmd2');

    expect(history.navigateUp('typing')).toBe('cmd2');
    history.add('cmd3');

    // Next up arrow starts from the newly added command
    expect(history.navigateUp('new draft')).toBe('cmd3');
  });

  it('clears all history entries', () => {
    history.add('cmd1');
    history.add('cmd2');
    expect(history.size).toBe(2);

    history.clear();
    expect(history.size).toBe(0);
    expect(history.getAll()).toEqual([]);
    expect(history.navigateUp('test')).toBe('test');
  });
});
