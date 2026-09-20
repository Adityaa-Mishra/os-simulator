/**
 * public/js/os/terminal/commands/pwd.js
 * Command: pwd
 */

export const metadata = {
  name: 'pwd',
  description: 'Print the current working directory',
  usage: 'pwd',
  supportedFlags: []
};

/**
 * @param {Array<string>} args
 * @param {Set<string>} flags
 * @param {import('../CommandContext.js').CommandContext} context
 * @returns {{ stdout: string, stderr: string, exitCode: number }}
 */
export async function handler(args, flags, context) {
  return {
    stdout: context.cwd,
    stderr: '',
    exitCode: 0
  };
}
