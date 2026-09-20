/**
 * public/js/os/terminal/commands/ls.js
 * Command: ls [-l] [-a] [path]
 */

export const metadata = {
  name: 'ls',
  description: 'List information about files and directories',
  usage: 'ls [-l] [-a] [path]',
  supportedFlags: ['-l', '-a', '-la', '--all']
};

/**
 * Format a Date string into standard short format (e.g. "Sep 20 14:30")
 * @param {string|null} dateStr
 * @returns {string}
 */
function formatShortDate(dateStr) {
  if (!dateStr) return 'Jan  1 00:00';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return 'Jan  1 00:00';
    const month = d.toLocaleString('en-US', { month: 'short' });
    const day = String(d.getDate()).padStart(2, ' ');
    const time = d.toTimeString().slice(0, 5);
    return `${month} ${day} ${time}`;
  } catch {
    return 'Jan  1 00:00';
  }
}

/**
 * @param {Array<string>} args
 * @param {Set<string>} flags
 * @param {import('../CommandContext.js').CommandContext} context
 * @returns {{ stdout: string, stderr: string, exitCode: number }}
 */
export async function handler(args, flags, context) {
  if (!context.fs) {
    return { stdout: '', stderr: 'ls: filesystem unavailable', exitCode: 1 };
  }

  const rawPath = args.length > 0 ? args[0] : null;
  const targetPath = rawPath ? context.resolvePath(rawPath) : context.cwd;

  const statRes = context.fs.stat(targetPath);
  if (!statRes.success || !statRes.data) {
    return {
      stdout: '',
      stderr: `ls: cannot access '${rawPath || targetPath}': No such file or directory`,
      exitCode: 1
    };
  }

  const isLong = flags.has('l');
  const showAll = flags.has('a') || flags.has('all');

  // Target is a single file
  if (statRes.data.type !== 'directory') {
    const fileStat = statRes.data;
    if (isLong) {
      const typeChar = '-';
      const perms = fileStat.permissions || 'rw-';
      const size = String(fileStat.size || 0).padStart(6, ' ');
      const date = formatShortDate(fileStat.modifiedAt);
      return {
        stdout: `${typeChar}${perms} 1 ${context.username} ${context.username} ${size} ${date} ${fileStat.name}`,
        stderr: '',
        exitCode: 0
      };
    }
    return {
      stdout: fileStat.name,
      stderr: '',
      exitCode: 0
    };
  }

  // Target is a directory
  const listRes = context.fs.listDirectory(targetPath);
  if (!listRes.success || !listRes.data) {
    return {
      stdout: '',
      stderr: `ls: cannot access '${rawPath || targetPath}': ${listRes.error || 'Failed to list directory'}`,
      exitCode: 1
    };
  }

  let entries = Array.isArray(listRes.data)
    ? listRes.data
    : (Array.isArray(listRes.data?.entries) ? listRes.data.entries : []);

  if (!showAll) {
    entries = entries.filter(e => !e.name.startsWith('.'));
  }

  // Sort alphabetically
  entries.sort((a, b) => a.name.localeCompare(b.name));

  if (entries.length === 0) {
    return { stdout: '', stderr: '', exitCode: 0 };
  }

  if (isLong) {
    const lines = entries.map(entry => {
      const typeChar = entry.type === 'directory' ? 'd' : '-';
      const perms = entry.permissions || (entry.type === 'directory' ? 'rwx' : 'rw-');
      const size = String(entry.size || 0).padStart(6, ' ');
      const date = formatShortDate(entry.modifiedAt);
      return `${typeChar}${perms} 1 ${context.username} ${context.username} ${size} ${date} ${entry.name}`;
    });
    return {
      stdout: lines.join('\n'),
      stderr: '',
      exitCode: 0
    };
  }

  return {
    stdout: entries.map(e => e.name).join('  '),
    stderr: '',
    exitCode: 0
  };
}
