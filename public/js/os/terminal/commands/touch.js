/**
 * public/js/os/terminal/commands/touch.js
 * Command: touch <path>
 */

export const metadata = {
  name: 'touch',
  description: 'Update file timestamps or create empty file',
  usage: 'touch <path>',
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
    return { stdout: '', stderr: 'touch: filesystem unavailable', exitCode: 1 };
  }

  if (args.length === 0) {
    return {
      stdout: '',
      stderr: 'touch: missing file operand',
      exitCode: 1
    };
  }

  const rawPath = args[0];
  const targetPath = context.resolvePath(rawPath);

  const statRes = context.fs.stat(targetPath);
  if (statRes.success && statRes.data) {
    // If it's a file, update its timestamp by rewriting existing content
    if (statRes.data.type === 'file') {
      const readRes = context.fs.readFile(targetPath);
      const content = readRes.success && readRes.data ? readRes.data.content : '';
      context.fs.writeFile(targetPath, content);
    }
    return { stdout: '', stderr: '', exitCode: 0 };
  }

  // Create new empty file
  const createRes = context.fs.createFile(targetPath, '');
  if (!createRes.success) {
    return {
      stdout: '',
      stderr: `touch: cannot touch '${rawPath}': ${createRes.error || 'Failed to create file'}`,
      exitCode: 1
    };
  }

  return { stdout: '', stderr: '', exitCode: 0 };
}
