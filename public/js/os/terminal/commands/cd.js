/**
 * public/js/os/terminal/commands/cd.js
 * Command: cd [dir]
 */

export const metadata = {
  name: 'cd',
  description: 'Change the current working directory',
  usage: 'cd [dir]',
  supportedFlags: []
};

/**
 * @param {Array<string>} args
 * @param {Set<string>} flags
 * @param {import('../CommandContext.js').CommandContext} context
 * @returns {{ stdout: string, stderr: string, exitCode: number }}
 */
export async function handler(args, flags, context) {
  const targetInput = args.length > 0 ? args[0] : '~';
  const resolvedPath = context.resolvePath(targetInput);

  if (!context.fs) {
    return { stdout: '', stderr: 'cd: filesystem unavailable', exitCode: 1 };
  }

  const statRes = context.fs.stat(resolvedPath);
  if (!statRes.success || !statRes.data) {
    return {
      stdout: '',
      stderr: `cd: ${targetInput}: No such file or directory`,
      exitCode: 1
    };
  }

  if (statRes.data.type !== 'directory') {
    return {
      stdout: '',
      stderr: `cd: ${targetInput}: Not a directory`,
      exitCode: 1
    };
  }

  context.shell.setCwd(resolvedPath);

  return {
    stdout: '',
    stderr: '',
    exitCode: 0
  };
}
