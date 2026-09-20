/**
 * public/js/os/terminal/commands/mv.js
 * Command: mv <src> <dest>
 */

import { PathResolver } from '../../filesystem/PathResolver.js';

export const metadata = {
  name: 'mv',
  description: 'Move (rename) files or directories',
  usage: 'mv <src> <dest>',
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
    return { stdout: '', stderr: 'mv: filesystem unavailable', exitCode: 1 };
  }

  if (args.length === 0) {
    return {
      stdout: '',
      stderr: 'mv: missing file operand',
      exitCode: 1
    };
  }

  if (args.length === 1) {
    return {
      stdout: '',
      stderr: `mv: missing destination file operand after '${args[0]}'`,
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
      stderr: `mv: cannot stat '${rawSrc}': No such file or directory`,
      exitCode: 1
    };
  }

  // Self-descendant check for directory moves
  if (srcStat.data.type === 'directory') {
    if (destPath === srcPath || destPath.startsWith(srcPath + '/')) {
      return {
        stdout: '',
        stderr: `mv: cannot move '${rawSrc}' to a subdirectory of itself, '${rawDest}'`,
        exitCode: 1
      };
    }
  }

  // If destination is an existing directory, move into it with source's name
  const destStat = context.fs.stat(destPath);
  if (destStat.success && destStat.data && destStat.data.type === 'directory') {
    const srcName = PathResolver.splitPath(srcPath).name;
    destPath = destPath === '/' ? `/${srcName}` : `${destPath}/${srcName}`;

    // Re-verify self-descendant constraint with resolved path
    if (srcStat.data.type === 'directory') {
      if (destPath === srcPath || destPath.startsWith(srcPath + '/')) {
        return {
          stdout: '',
          stderr: `mv: cannot move '${rawSrc}' to a subdirectory of itself, '${rawDest}'`,
          exitCode: 1
        };
      }
    }
  }

  const renameRes = context.fs.rename(srcPath, destPath);
  if (!renameRes.success) {
    return {
      stdout: '',
      stderr: `mv: ${renameRes.error || 'Failed to move/rename'}`,
      exitCode: 1
    };
  }

  return { stdout: '', stderr: '', exitCode: 0 };
}
