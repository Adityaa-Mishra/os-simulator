/**
 * public/js/os/filesystem/File.js
 * Represents a regular file in AdityyaOS.
 * Holds file metadata (Inode) and content buffer (UTF-8 text / byte data).
 */

import { Inode } from './Inode.js';

export class File extends Inode {
  /**
   * @param {Object} options
   * @param {number} options.inodeId
   * @param {string} options.name
   * @param {number|null} [options.parentId=null]
   * @param {number} [options.size=0]
   * @param {string} [options.permissions='rw-']
   * @param {string|Array<number>} [options.content='']
   * @param {Array<Object>} [options.storageBlocks=[]]
   * @param {string} [options.createdAt]
   * @param {string} [options.modifiedAt]
   * @param {string} [options.accessedAt]
   */
  constructor(options) {
    super({
      ...options,
      type: 'file',
      permissions: options.permissions || 'rw-'
    });

    const initialContent = options.content !== undefined && options.content !== null ? options.content : '';
    if (typeof initialContent === 'string') {
      this.content = initialContent;
      this.size = options.size !== undefined ? options.size : initialContent.length;
    } else if (Array.isArray(initialContent)) {
      this.content = [...initialContent];
      this.size = options.size !== undefined ? options.size : initialContent.length;
    } else {
      this.content = String(initialContent);
      this.size = options.size !== undefined ? options.size : this.content.length;
    }
  }

  /**
   * Read data from file at offset.
   * @param {number} [offset=0]
   * @param {number} [length]
   * @returns {string|Array<number>}
   */
  read(offset = 0, length = null) {
    this.touch();
    const start = Math.max(0, offset);
    const end = length !== null && length !== undefined ? start + length : this.content.length;
    return this.content.slice(start, end);
  }

  /**
   * Write data into file starting at offset.
   * Expands file size if offset + data.length > current length.
   * @param {string|Array<number>} data
   * @param {number} [offset=0]
   * @returns {number} bytesWritten
   */
  write(data, offset = 0) {
    const isArray = Array.isArray(this.content);
    const writeData = typeof data === 'string' ? (isArray ? Array.from(data).map(c => c.charCodeAt(0)) : data) : data;
    const writeLength = writeData.length;

    if (isArray) {
      const neededLength = offset + writeLength;
      while (this.content.length < offset) {
        this.content.push(0);
      }
      for (let i = 0; i < writeLength; i++) {
        this.content[offset + i] = writeData[i];
      }
    } else {
      let currentStr = this.content;
      if (currentStr.length < offset) {
        currentStr = currentStr.padEnd(offset, '\0');
      }
      const before = currentStr.slice(0, offset);
      const after = currentStr.slice(offset + writeLength);
      this.content = before + writeData + after;
    }

    this.size = this.content.length;
    this.markModified();
    return writeLength;
  }

  /**
   * Append data to the end of the file.
   * @param {string|Array<number>} data
   * @returns {number} bytesWritten
   */
  append(data) {
    return this.write(data, this.size);
  }

  /**
   * Truncate or extend the file content to a given size.
   * @param {number} newSize
   */
  truncate(newSize) {
    if (typeof newSize !== 'number' || newSize < 0) {
      throw new TypeError('newSize must be a non-negative number');
    }

    if (Array.isArray(this.content)) {
      if (newSize < this.content.length) {
        this.content = this.content.slice(0, newSize);
      } else {
        while (this.content.length < newSize) {
          this.content.push(0);
        }
      }
    } else {
      if (newSize < this.content.length) {
        this.content = this.content.slice(0, newSize);
      } else {
        this.content = this.content.padEnd(newSize, '\0');
      }
    }

    this.size = newSize;
    this.markModified();
  }

  /**
   * Return a serializable snapshot including content for persistence.
   * @returns {Object}
   */
  toJSON() {
    return {
      ...super.toJSON(),
      content: this.content
    };
  }

  /**
   * Create File instance from JSON.
   * @param {Object} json
   * @returns {File}
   */
  static fromJSON(json) {
    return new File(json);
  }
}
