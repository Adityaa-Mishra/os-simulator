/**
 * public/js/os/terminal/commands/clear.js
 * Command: clear
 */

export const metadata = {
  name: 'clear',
  description: 'Clear the terminal screen',
  usage: 'clear',
  supportedFlags: []
};

/**
 * @param {Array<string>} args
 * @param {Set<string>} flags
 * @param {import('../CommandContext.js').CommandContext} context
 * @returns {{ stdout: string, stderr: string, clear: boolean, exitCode: number }}
 */
export async function handler(args, flags, context) {
  return {
    stdout: '',
    stderr: '',
    clear: true,
    exitCode: 0
  };
}
