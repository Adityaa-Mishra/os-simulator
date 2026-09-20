/**
 * public/js/os/terminal/ShellParser.js
 * Deterministic command-line parser supporting quotes, escaping, flags, and > / >> redirection.
 */

export class ShellParser {
  /**
   * Parse a raw input command line into structured tokens, arguments, flags, and redirection.
   * @param {string} input
   * @returns {{
   *   raw: string,
   *   command: string,
   *   args: Array<string>,
   *   positionalArgs: Array<string>,
   *   flags: Set<string>,
   *   redirection: { type: '>'|'>>', target: string }|null,
   *   error: string|null,
   *   exitCode: number
   * }}
   */
  static parse(input) {
    const raw = typeof input === 'string' ? input : '';
    const trimmed = raw.trim();

    if (!trimmed) {
      return {
        raw,
        command: '',
        args: [],
        positionalArgs: [],
        flags: new Set(),
        redirection: null,
        error: null,
        exitCode: 0
      };
    }

    // Tokenize input string
    const tokens = [];
    let currentToken = '';
    let inSingleQuote = false;
    let inDoubleQuote = false;
    let escapeNext = false;
    let i = 0;

    while (i < trimmed.length) {
      const char = trimmed[i];

      if (escapeNext) {
        if (inDoubleQuote) {
          if (char === '"' || char === '\\') {
            currentToken += char;
          } else {
            currentToken += '\\' + char;
          }
        } else {
          currentToken += char;
        }
        escapeNext = false;
        i++;
        continue;
      }

      if (char === '\\' && !inSingleQuote) {
        escapeNext = true;
        i++;
        continue;
      }

      if (char === "'" && !inDoubleQuote) {
        inSingleQuote = !inSingleQuote;
        i++;
        continue;
      }

      if (char === '"' && !inSingleQuote) {
        inDoubleQuote = !inDoubleQuote;
        i++;
        continue;
      }

      // Check redirection operators when outside quotes
      if (!inSingleQuote && !inDoubleQuote) {
        if (char === '>') {
          if (currentToken !== '') {
            tokens.push(currentToken);
            currentToken = '';
          }

          if (i + 1 < trimmed.length && trimmed[i + 1] === '>') {
            // Check for >>>
            if (i + 2 < trimmed.length && trimmed[i + 2] === '>') {
              return {
                raw,
                command: '',
                args: [],
                positionalArgs: [],
                flags: new Set(),
                redirection: null,
                error: 'Syntax error: malformed redirection',
                exitCode: 2
              };
            }
            tokens.push('>>');
            i += 2;
          } else {
            tokens.push('>');
            i++;
          }
          continue;
        }

        if (/\s/.test(char)) {
          if (currentToken !== '') {
            tokens.push(currentToken);
            currentToken = '';
          }
          i++;
          continue;
        }
      }

      currentToken += char;
      i++;
    }

    if (inSingleQuote) {
      return {
        raw,
        command: '',
        args: [],
        positionalArgs: [],
        flags: new Set(),
        redirection: null,
        error: 'Syntax error: unterminated single quote',
        exitCode: 2
      };
    }

    if (inDoubleQuote) {
      return {
        raw,
        command: '',
        args: [],
        positionalArgs: [],
        flags: new Set(),
        redirection: null,
        error: 'Syntax error: unterminated double quote',
        exitCode: 2
      };
    }

    if (currentToken !== '') {
      tokens.push(currentToken);
    }

    // Process tokens for redirection, command, arguments, and flags
    let redirection = null;
    const commandTokens = [];
    let seenRedirection = false;

    for (let t = 0; t < tokens.length; t++) {
      const token = tokens[t];

      if (token === '>' || token === '>>') {
        if (seenRedirection) {
          return {
            raw,
            command: commandTokens[0] || '',
            args: [],
            positionalArgs: [],
            flags: new Set(),
            redirection: null,
            error: 'Syntax error: multiple redirection operators',
            exitCode: 2
          };
        }

        seenRedirection = true;
        const target = tokens[t + 1];

        if (!target || target === '>' || target === '>>') {
          return {
            raw,
            command: commandTokens[0] || '',
            args: [],
            positionalArgs: [],
            flags: new Set(),
            redirection: null,
            error: 'Syntax error: missing redirection target',
            exitCode: 2
          };
        }

        redirection = {
          type: token,
          target
        };
        t++; // Skip target token
      } else {
        commandTokens.push(token);
      }
    }

    if (commandTokens.length === 0) {
      return {
        raw,
        command: '',
        args: [],
        positionalArgs: [],
        flags: new Set(),
        redirection,
        error: null,
        exitCode: 0
      };
    }

    const command = commandTokens[0];
    const rawArgs = commandTokens.slice(1);
    const flags = new Set();
    const positionalArgs = [];

    for (const arg of rawArgs) {
      if (arg.startsWith('--') && arg.length > 2) {
        flags.add(arg);
        flags.add(arg.slice(2));
      } else if (arg.startsWith('-') && arg.length > 1 && !/^-\d+$/.test(arg)) {
        flags.add(arg);
        // Expand individual characters for combined flags (e.g. -la -> 'l', 'a')
        for (let c = 1; c < arg.length; c++) {
          flags.add(arg[c]);
        }
      } else {
        positionalArgs.push(arg);
      }
    }

    return {
      raw,
      command,
      args: rawArgs,
      positionalArgs,
      flags,
      redirection,
      error: null,
      exitCode: 0
    };
  }
}
