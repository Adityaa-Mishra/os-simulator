/**
 * public/js/os/terminal/commands/echo.js
 * Command: echo [args...]
 */

export const metadata = {
  name: 'echo',
  description: 'Write arguments to the standard output',
  usage: 'echo [args...]',
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
    stdout: args.join(' '),
    stderr: '',
    exitCode: 0
  };
}
