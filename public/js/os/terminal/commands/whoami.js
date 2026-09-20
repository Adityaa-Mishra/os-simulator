/**
 * public/js/os/terminal/commands/whoami.js
 * Command: whoami
 */

export const metadata = {
  name: 'whoami',
  description: 'Print current username',
  usage: 'whoami',
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
    stdout: context.username || 'user',
    stderr: '',
    exitCode: 0
  };
}
