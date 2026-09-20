/**
 * public/js/os/terminal/commands/cp.js
 * Command: cp <src> <dest>
 */

import { PathResolver } from '../../filesystem/PathResolver.js';

export const metadata = {
  name: 'cp',
  description: 'Copy source file to destination',
  usage: 'cp <src> <dest>',
  supportedFlags: []
};

/**
 * @param {Array<string>} args
 * @param {Set<string>} flags
 * @param {import('../CommandContext.js').CommandContext} context
 * @returns {{ stdout: string, stderr: string, exitCode: number }}
 */
export async function handler(args, flags, context) {
  if (!context.fs) {
    return { stdout: '', stderr: 'cp: filesystem unavailable', exitCode: 1 };
  }

  if (args.length === 0) {
    return {
      stdout: '',
      stderr: 'cp: missing file operand',
      exitCode: 1
    };
  }

  if (args.length === 1) {
    return {
      stdout: '',
      stderr: `cp: missing destination file operand after '${args[0]}'`,
      exitCode: 1
    };
  }

  const rawSrc = args[0];
  const rawDest = args[1];

  const srcPath = context.resolvePath(rawSrc);
  let destPath = context.resolvePath(rawDest);

  const srcStat = context.fs.stat(srcPath);
  if (!srcStat.success || !srcStat.data) {
    return {
      stdout: '',
      stderr: `cp: cannot stat '${rawSrc}': No such file or directory`,
      exitCode: 1
    };
  }

  // Strictly reject directory copying in Phase 18
  if (srcStat.data.type === 'directory') {
    return {
      stdout: '',
      stderr: `cp: -r not specified; omitting directory '${rawSrc}'`,
      exitCode: 1
    };
  }

  // If destination is an existing directory, copy into it with the source filename
  const destStat = context.fs.stat(destPath);
  if (destStat.success && destStat.data && destStat.data.type === 'directory') {
    const srcName = PathResolver.splitPath(srcPath).name;
    destPath = destPath === '/' ? `/${srcName}` : `${destPath}/${srcName}`;
  }

  const copyRes = context.fs.copy(srcPath, destPath);
  if (!copyRes.success) {
    return {
      stdout: '',
      stderr: `cp: ${copyRes.error || 'Failed to copy file'}`,
      exitCode: 1
    };
  }

  return { stdout: '', stderr: '', exitCode: 0 };
}
