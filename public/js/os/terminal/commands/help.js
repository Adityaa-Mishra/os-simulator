/**
 * public/js/os/terminal/commands/help.js
 * Command: help [command]
 */

export const metadata = {
  name: 'help',
  description: 'Display information about available shell commands',
  usage: 'help [command]',
  supportedFlags: []
};

/**
 * @param {Array<string>} args
 * @param {Set<string>} flags
 * @param {import('../CommandContext.js').CommandContext} context
 * @returns {{ stdout: string, stderr: string, exitCode: number }}
 */
export async function handler(args, flags, context) {
  const registry = context.shell?.registry;
  if (!registry) {
    return { stdout: '', stderr: 'help: command registry unavailable', exitCode: 1 };
  }

  if (args.length === 0) {
    const all = registry.getAll();
    const lines = [
      'AdityyaOS Simulated Shell, version 1.0.0',
      'These shell commands are defined internally. Type "help <command>" for details.\n'
    ];

    for (const cmd of all) {
      const name = (cmd.metadata.name || cmd.name).padEnd(12);
      const desc = cmd.metadata.description || '';
      lines.push(`  ${name} ${desc}`);
    }

    return {
      stdout: lines.join('\n'),
      stderr: '',
      exitCode: 0
    };
  }

  const query = args[0].toLowerCase();
  const cmd = registry.get(query);

  if (!cmd) {
    return {
      stdout: '',
      stderr: `help: no help topics match '${query}'`,
      exitCode: 1
    };
  }

  const meta = cmd.metadata;
  const flagsStr = meta.supportedFlags && meta.supportedFlags.length > 0
    ? meta.supportedFlags.join(', ')
    : 'None';

  const output = [
    `${meta.name}: ${meta.description}`,
    `Usage: ${meta.usage}`,
    `Supported Flags: ${flagsStr}`
  ].join('\n');

  return {
    stdout: output,
    stderr: '',
    exitCode: 0
  };
}
