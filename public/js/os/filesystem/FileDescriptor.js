/**
 * public/js/os/filesystem/FileDescriptor.js
 * Lightweight descriptor-state model for AdityyaOS open files.
 * Owns fd, pid, inodeId, cursor position, and flags.
 * Does NOT independently implement filesystem or storage mutations.
 */

export class FileDescriptor {
  /**
   * @param {Object} options
   * @param {number} options.fd
   * @param {number} options.inodeId
   * @param {number|string|null} [options.pid=null]
   * @param {Array<string>} [options.flags=['READ']]
   * @param {number} [options.position=0]
   * @param {string} [options.openedAt]
   */
  constructor({
    fd,
    inodeId,
    pid = null,
    flags = ['READ'],
    position = 0,
    openedAt = null
  }) {
    if (typeof fd !== 'number' || isNaN(fd) || fd < 0) {
      throw new TypeError('File descriptor (fd) must be a non-negative integer');
    }
    if (typeof inodeId !== 'number' || isNaN(inodeId) || inodeId <= 0) {
      throw new TypeError('Inode ID must be a positive integer');
    }

    this.fd = fd;
    this.inodeId = inodeId;
    this.pid = pid !== undefined && pid !== null ? pid : null;
    this.flags = Array.isArray(flags) ? flags.map(f => String(f).toUpperCase()) : ['READ'];
    this.position = typeof position === 'number' && position >= 0 ? position : 0;
    this.openedAt = openedAt || new Date().toISOString();
  }

  /**
   * Check if descriptor allows reading.
   * @returns {boolean}
   */
  canRead() {
    return this.flags.includes('READ') || this.flags.includes('RDWR') || this.flags.includes('R');
  }

  /**
   * Check if descriptor allows writing.
   * @returns {boolean}
   */
  canWrite() {
    return this.flags.includes('WRITE') || this.flags.includes('RDWR') || this.flags.includes('W') || this.flags.includes('APPEND');
  }

  /**
   * Check if descriptor is in append mode.
   * @returns {boolean}
   */
  isAppend() {
    return this.flags.includes('APPEND') || this.flags.includes('A');
  }

  /**
   * Seek cursor to new position.
   * @param {number} offset
   * @param {'SET'|'CUR'|'END'} [whence='SET']
   * @param {number} [fileSize=0]
   * @returns {number} new position
   */
  seek(offset, whence = 'SET', fileSize = 0) {
    if (typeof offset !== 'number' || isNaN(offset)) {
      throw new TypeError('Seek offset must be a number');
    }

    let target = 0;
    const mode = String(whence || 'SET').toUpperCase();

    switch (mode) {
      case 'SET':
        target = offset;
        break;
      case 'CUR':
        target = this.position + offset;
        break;
      case 'END':
        target = fileSize + offset;
        break;
      default:
        throw new TypeError(`Invalid seek whence "${whence}". Use 'SET', 'CUR', or 'END'.`);
    }

    if (target < 0) {
      throw new RangeError(`Negative seek position: ${target}`);
    }

    this.position = target;
    return this.position;
  }

  /**
   * Advance cursor by byte count.
   * @param {number} bytes
   * @returns {number} new position
   */
  advance(bytes) {
    if (typeof bytes === 'number' && bytes > 0) {
      this.position += bytes;
    }
    return this.position;
  }

  /**
   * Return a snapshot representation.
   * @returns {Object}
   */
  toJSON() {
    return {
      fd: this.fd,
      inodeId: this.inodeId,
      pid: this.pid,
      position: this.position,
      flags: [...this.flags],
      openedAt: this.openedAt
    };
  }
}
