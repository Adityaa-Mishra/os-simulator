/**
 * public/js/os/terminal/commands/mkdir.js
 * Command: mkdir [-p] <path>
 */

export const metadata = {
  name: 'mkdir',
  description: 'Create directory or directory hierarchy',
  usage: 'mkdir [-p] <path>',
  supportedFlags: ['-p', '--parents']
};

/**
 * @param {Array<string>} args
 * @param {Set<string>} flags
 * @param {import('../CommandContext.js').CommandContext} context
 * @returns {{ stdout: string, stderr: string, exitCode: number }}
 */
export async function handler(args, flags, context) {
  if (!context.fs) {
    return { stdout: '', stderr: 'mkdir: filesystem unavailable', exitCode: 1 };
  }

  if (args.length === 0) {
    return {
      stdout: '',
      stderr: 'mkdir: missing operand',
      exitCode: 1
    };
  }

  const rawPath = args[0];
  const targetPath = context.resolvePath(rawPath);
  const isParents = flags.has('p') || flags.has('parents');

  if (!isParents) {
    const res = context.fs.createDirectory(targetPath);
    if (!res.success) {
      return {
        stdout: '',
        stderr: `mkdir: cannot create directory '${rawPath}': ${res.error || 'Failed to create directory'}`,
        exitCode: 1
      };
    }
    return { stdout: '', stderr: '', exitCode: 0 };
  }

  // -p mode: recursively ensure each component exists
  const segments = targetPath.split('/').filter(Boolean);
  let currentPath = '';

  for (const segment of segments) {
    currentPath += '/' + segment;
    const statRes = context.fs.stat(currentPath);

    if (statRes.success && statRes.data) {
      if (statRes.data.type !== 'directory') {
        return {
          stdout: '',
          stderr: `mkdir: cannot create directory '${rawPath}': Not a directory`,
          exitCode: 1
        };
      }
      // Directory already exists, continue
    } else {
      const createRes = context.fs.createDirectory(currentPath);
      if (!createRes.success) {
        return {
          stdout: '',
          stderr: `mkdir: cannot create directory '${rawPath}': ${createRes.error || 'Failed to create directory'}`,
          exitCode: 1
        };
      }
    }
  }

  return { stdout: '', stderr: '', exitCode: 0 };
}
