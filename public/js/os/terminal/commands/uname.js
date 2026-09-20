/**
 * public/js/os/terminal/commands/uname.js
 * Command: uname [-a]
 */

export const metadata = {
  name: 'uname',
  description: 'Print operating system information',
  usage: 'uname [-a]',
  supportedFlags: ['-a', '--all']
};

/**
 * @param {Array<string>} args
 * @param {Set<string>} flags
 * @param {import('../CommandContext.js').CommandContext} context
 * @returns {{ stdout: string, stderr: string, exitCode: number }}
 */
export async function handler(args, flags, context) {
  const isAll = flags.has('a') || flags.has('all');

  if (isAll) {
    return {
      stdout: 'AdityyaOS 1.0.0 AdityyaOS Kernel x86_64 browser-simulated',
      stderr: '',
      exitCode: 0
    };
  }

  return {
    stdout: 'AdityyaOS',
    stderr: '',
    exitCode: 0
  };
}
