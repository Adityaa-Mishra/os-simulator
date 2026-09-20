/**
 * public/js/os/terminal/commands/cat.js
 * Command: cat <path>
 */

export const metadata = {
  name: 'cat',
  description: 'Concatenate and print file contents',
  usage: 'cat <path>',
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
    return { stdout: '', stderr: 'cat: filesystem unavailable', exitCode: 1 };
  }

  if (args.length === 0) {
    return {
      stdout: '',
      stderr: 'cat: missing operand',
      exitCode: 1
    };
  }

  const rawPath = args[0];
  const targetPath = context.resolvePath(rawPath);

  const statRes = context.fs.stat(targetPath);
  if (!statRes.success || !statRes.data) {
    return {
      stdout: '',
      stderr: `cat: ${rawPath}: No such file or directory`,
      exitCode: 1
    };
  }

  if (statRes.data.type === 'directory') {
    return {
      stdout: '',
      stderr: `cat: ${rawPath}: Is a directory`,
      exitCode: 1
    };
  }

  const readRes = context.fs.readFile(targetPath);
  if (!readRes.success || !readRes.data) {
    return {
      stdout: '',
      stderr: `cat: ${rawPath}: ${readRes.error || 'Failed to read file'}`,
      exitCode: 1
    };
  }

  const content = readRes.data.content !== undefined ? String(readRes.data.content) : '';

  return {
    stdout: content,
    stderr: '',
    exitCode: 0
  };
}
