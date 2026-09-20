/**
 * public/js/os/terminal/commands/rm.js
 * Command: rm [-r] [-f] [-rf] <path>
 */

export const metadata = {
  name: 'rm',
  description: 'Remove files or directories',
  usage: 'rm [-r] [-f] [-rf] <path>',
  supportedFlags: ['-r', '-R', '-f', '-rf', '--recursive', '--force']
};

/**
 * @param {Array<string>} args
 * @param {Set<string>} flags
 * @param {import('../CommandContext.js').CommandContext} context
 * @returns {{ stdout: string, stderr: string, exitCode: number }}
 */
export async function handler(args, flags, context) {
  if (!context.fs) {
    return { stdout: '', stderr: 'rm: filesystem unavailable', exitCode: 1 };
  }

  const isRecursive = flags.has('r') || flags.has('R') || flags.has('recursive');
  const isForce = flags.has('f') || flags.has('force');

  if (args.length === 0) {
    if (isForce) {
      return { stdout: '', stderr: '', exitCode: 0 };
    }
    return {
      stdout: '',
      stderr: 'rm: missing operand',
      exitCode: 1
    };
  }

  const rawPath = args[0];
  const targetPath = context.resolvePath(rawPath);

  const statRes = context.fs.stat(targetPath);
  if (!statRes.success || !statRes.data) {
    if (isForce) {
      return { stdout: '', stderr: '', exitCode: 0 };
    }
    return {
      stdout: '',
      stderr: `rm: cannot remove '${rawPath}': No such file or directory`,
      exitCode: 1
    };
  }

  // Directory handling
  if (statRes.data.type === 'directory') {
    if (!isRecursive) {
      return {
        stdout: '',
        stderr: `rm: cannot remove '${rawPath}': Is a directory`,
        exitCode: 1
      };
    }

    const res = context.fs.deleteDirectory(targetPath, { recursive: true });
    if (!res.success) {
      return {
        stdout: '',
        stderr: `rm: cannot remove '${rawPath}': ${res.error || 'Failed to remove directory'}`,
        exitCode: 1
      };
    }
    return { stdout: '', stderr: '', exitCode: 0 };
  }

  // Regular file handling
  const res = context.fs.deleteFile(targetPath);
  if (!res.success) {
    return {
      stdout: '',
      stderr: `rm: cannot remove '${rawPath}': ${res.error || 'Failed to remove file'}`,
      exitCode: 1
    };
  }

  return { stdout: '', stderr: '', exitCode: 0 };
}
