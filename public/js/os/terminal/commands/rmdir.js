/**
 * public/js/os/terminal/commands/rmdir.js
 * Command: rmdir <path>
 */

export const metadata = {
  name: 'rmdir',
  description: 'Remove empty directories',
  usage: 'rmdir <path>',
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
    return { stdout: '', stderr: 'rmdir: filesystem unavailable', exitCode: 1 };
  }

  if (args.length === 0) {
    return {
      stdout: '',
      stderr: 'rmdir: missing operand',
      exitCode: 1
    };
  }

  const rawPath = args[0];
  const targetPath = context.resolvePath(rawPath);

  const res = context.fs.deleteDirectory(targetPath, { recursive: false });
  if (!res.success) {
    return {
      stdout: '',
      stderr: `rmdir: failed to remove '${rawPath}': ${res.error || 'Directory not empty or not found'}`,
      exitCode: 1
    };
  }

  return { stdout: '', stderr: '', exitCode: 0 };
}
