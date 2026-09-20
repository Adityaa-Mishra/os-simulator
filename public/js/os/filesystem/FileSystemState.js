/**
 * public/js/os/filesystem/FileSystemState.js
 * Filesystem lifecycle status, error codes, and standardized error formatting for AdityyaOS.
 */

export const FileSystemStatus = Object.freeze({
  UNMOUNTED: 'UNMOUNTED',
  MOUNTING: 'MOUNTING',
  MOUNTED: 'MOUNTED',
  READY: 'READY',
  UNMOUNTING: 'UNMOUNTING'
});

export const FileSystemErrorCode = Object.freeze({
  ENOENT: 'ENOENT',       // No such file or directory
  EEXIST: 'EEXIST',       // File or directory already exists
  ENOTDIR: 'ENOTDIR',     // Not a directory
  EISDIR: 'EISDIR',       // Is a directory
  ENOTEMPTY: 'ENOTEMPTY', // Directory not empty
  EINVAL: 'EINVAL',       // Invalid argument or path
  ENOSPC: 'ENOSPC',       // No space left on device
  EACCES: 'EACCES',       // Permission denied
  EBUSY: 'EBUSY',         // Resource busy or file is open
  EBADF: 'EBADF'          // Bad file descriptor
});

const DEFAULT_ERROR_MESSAGES = {
  [FileSystemErrorCode.ENOENT]: 'No such file or directory',
  [FileSystemErrorCode.EEXIST]: 'File or directory already exists',
  [FileSystemErrorCode.ENOTDIR]: 'Not a directory',
  [FileSystemErrorCode.EISDIR]: 'Is a directory',
  [FileSystemErrorCode.ENOTEMPTY]: 'Directory not empty',
  [FileSystemErrorCode.EINVAL]: 'Invalid argument or path',
  [FileSystemErrorCode.ENOSPC]: 'No space left on device',
  [FileSystemErrorCode.EACCES]: 'Permission denied',
  [FileSystemErrorCode.EBUSY]: 'Resource busy or file is open',
  [FileSystemErrorCode.EBADF]: 'Bad file descriptor'
};

/**
 * Format a structured filesystem error result.
 * @param {string} code
 * @param {string} [customMessage]
 * @returns {{ success: false, error: string, code: string }}
 */
export function createFsError(code, customMessage = null) {
  const message = customMessage || DEFAULT_ERROR_MESSAGES[code] || 'Filesystem error';
  return {
    success: false,
    error: `${message} (${code})`,
    code
  };
}
