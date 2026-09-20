/**
 * public/js/os/terminal/CommandHistory.js
 * Bounded session-local command history buffer with up/down navigation and draft restoration.
 */

export class CommandHistory {
  /**
   * @param {Object} [options]
   * @param {number} [options.maxEntries=500]
   * @param {Array<string>} [options.initialEntries=[]]
   */
  constructor(options = {}) {
    this.maxEntries = typeof options.maxEntries === 'number' && options.maxEntries > 0
      ? options.maxEntries
      : 500;
    this.entries = Array.isArray(options.initialEntries) ? [...options.initialEntries] : [];
    this.cursor = -1;
    this.draft = '';
  }

  /**
   * Add a command to history.
   * - Trims whitespace.
   * - Ignores empty commands.
   * - Ignores consecutive duplicate commands.
   * - Evicts oldest entry if maxEntries exceeded.
   * - Resets navigation cursor and draft.
   * @param {string} command
   */
  add(command) {
    if (typeof command !== 'string') return;
    const trimmed = command.trim();
    if (!trimmed) return;

    // Do not store consecutive duplicates
    if (this.entries.length > 0 && this.entries[this.entries.length - 1] === trimmed) {
      this.resetNavigation();
      return;
    }

    this.entries.push(trimmed);

    // Evict oldest if exceeding bound
    if (this.entries.length > this.maxEntries) {
      this.entries.shift();
    }

    this.resetNavigation();
  }

  /**
   * Navigate backwards (ArrowUp).
   * @param {string} [currentDraft=''] - The current unsubmitted draft in the input field
   * @returns {string} The historical command, or current draft if history is empty
   */
  navigateUp(currentDraft = '') {
    if (this.entries.length === 0) {
      return currentDraft;
    }

    // If starting navigation, save the current draft
    if (this.cursor === -1) {
      this.draft = typeof currentDraft === 'string' ? currentDraft : '';
      this.cursor = this.entries.length - 1;
    } else if (this.cursor > 0) {
      this.cursor--;
    }

    return this.entries[this.cursor];
  }

  /**
   * Navigate forwards (ArrowDown).
   * @returns {string} The historical command, or restored draft if past newest entry
   */
  navigateDown() {
    if (this.cursor === -1 || this.cursor >= this.entries.length) {
      return this.draft;
    }

    this.cursor++;
    if (this.cursor >= this.entries.length) {
      return this.draft;
    }

    return this.entries[this.cursor];
  }

  /**
   * Reset navigation cursor and saved draft.
   */
  resetNavigation() {
    this.cursor = -1;
    this.draft = '';
  }

  /**
   * Get an immutable copy of all stored history entries.
   * @returns {Array<string>}
   */
  getAll() {
    return [...this.entries];
  }

  /**
   * Clear all history entries and reset navigation.
   */
  clear() {
    this.entries = [];
    this.resetNavigation();
  }

  /**
   * Get the number of stored commands.
   * @returns {number}
   */
  get size() {
    return this.entries.length;
  }
}
