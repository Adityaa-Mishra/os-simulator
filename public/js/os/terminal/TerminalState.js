/**
 * public/js/os/terminal/TerminalState.js
 * Authoritative, serializable state representation for the AdityyaOS Terminal/Shell.
 */

export class TerminalState {
  /**
   * @param {Object} [initial]
   * @param {string} [initial.cwd='/home/user']
   * @param {string} [initial.username='user']
   * @param {string} [initial.hostname='adityyaos']
   * @param {Array<string>} [initial.history=[]]
   * @param {number} [initial.exitCode=0]
   * @param {boolean} [initial.isActive=true]
   * @param {number|null} [initial.pid=null]
   */
  constructor(initial = {}) {
    this.cwd = typeof initial.cwd === 'string' && initial.cwd ? initial.cwd : '/home/user';
    this.username = typeof initial.username === 'string' && initial.username ? initial.username : 'user';
    this.hostname = typeof initial.hostname === 'string' && initial.hostname ? initial.hostname : 'adityyaos';
    this.history = Array.isArray(initial.history) ? [...initial.history] : [];
    this.lines = Array.isArray(initial.lines) ? [...initial.lines] : [];
    this.exitCode = typeof initial.exitCode === 'number' ? initial.exitCode : 0;
    this.isActive = initial.isActive !== false;
    this.pid = typeof initial.pid === 'number' ? initial.pid : (initial.pid ?? null);
  }

  /**
   * Returns a snapshot-safe, immutable clone of the state.
   * @returns {{
   *   cwd: string,
   *   username: string,
   *   hostname: string,
   *   history: Array<string>,
   *   exitCode: number,
   *   isActive: boolean,
   *   pid: number|null
   * }}
   */
  getState() {
    return {
      cwd: this.cwd,
      username: this.username,
      hostname: this.hostname,
      history: [...this.history],
      exitCode: this.exitCode,
      isActive: this.isActive,
      pid: this.pid
    };
  }

  /**
   * JSON serialization support.
   */
  toJSON() {
    return this.getState();
  }
}
