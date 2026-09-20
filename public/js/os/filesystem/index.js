/**
 * public/js/os/filesystem/index.js
 * Public gateway barrel for the AdityyaOS Filesystem Subsystem (AdityyaFS).
 */

export { FileSystem } from './FileSystem.js';
export { File } from './File.js';
export { Directory } from './Directory.js';
export { Inode } from './Inode.js';
export { FileDescriptor } from './FileDescriptor.js';
export { PathResolver } from './PathResolver.js';
export { FileSystemStatus, FileSystemErrorCode, createFsError } from './FileSystemState.js';
export { FileSystemEvents } from './FileSystemEvents.js';
