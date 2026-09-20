/**
 * public/js/os/filesystem/FileSystemEvents.js
 * Filesystem lifecycle and operation event definitions for AdityyaOS.
 */

export const FileSystemEvents = Object.freeze({
  FILESYSTEM_MOUNTING: 'fs:mounting',
  FILESYSTEM_MOUNTED: 'fs:mounted',
  FILESYSTEM_UNMOUNTING: 'fs:unmounting',
  FILESYSTEM_UNMOUNTED: 'fs:unmounted',

  FILE_CREATED: 'fs:file_created',
  FILE_READ: 'fs:file_read',
  FILE_WRITTEN: 'fs:file_written',
  FILE_DELETED: 'fs:file_deleted',
  FILE_RENAMED: 'fs:file_renamed',
  FILE_OPENED: 'fs:file_opened',
  FILE_CLOSED: 'fs:file_closed',

  DIRECTORY_CREATED: 'fs:dir_created',
  DIRECTORY_DELETED: 'fs:dir_deleted',

  STORAGE_ALLOCATED: 'fs:storage_allocated',
  STORAGE_RELEASED: 'fs:storage_released'
});
