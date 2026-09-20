/**
 * public/js/os/terminal/commands/exit.js
 * Command: exit
 */

export const metadata = {
  name: 'exit',
  description: 'Exit the terminal shell session',
  usage: 'exit',
  supportedFlags: []
};

/**
 * @param {Array<string>} args
 * @param {Set<string>} flags
 * @param {import('../CommandContext.js').CommandContext} context
 * @returns {{ stdout: string, stderr: string, exit: boolean, exitCode: number }}
 */
export async function handler(args, flags, context) {
  return {
    stdout: 'exit',
    stderr: '',
    exit: true,
    exitCode: 0
  };
}
