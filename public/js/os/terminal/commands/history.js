/**
 * public/js/os/terminal/commands/history.js
 * Command: history
 */

export const metadata = {
  name: 'history',
  description: 'Display command history with line numbers',
  usage: 'history',
  supportedFlags: []
};

/**
 * @param {Array<string>} args
 * @param {Set<string>} flags
 * @param {import('../CommandContext.js').CommandContext} context
 * @returns {{ stdout: string, stderr: string, exitCode: number }}
 */
export async function handler(args, flags, context) {
  const history = context.shell?.history;
  if (!history) {
    return { stdout: '', stderr: 'history: history buffer unavailable', exitCode: 1 };
  }

  const entries = history.getAll();
  if (entries.length === 0) {
    return { stdout: '', stderr: '', exitCode: 0 };
  }

  const lines = entries.map((cmd, idx) => {
    const num = String(idx + 1).padStart(4, ' ');
    return `${num}  ${cmd}`;
  });

  return {
    stdout: lines.join('\n'),
    stderr: '',
    exitCode: 0
  };
}
