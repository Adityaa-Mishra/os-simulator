/**
 * public/js/os/terminal/AITerminalHandler.js
 * Terminal-scoped AI natural language and command handler for AdityyaOS.
 * Parses 'AI:' and 'AI:-' commands, maps them to allowlisted developer tools,
 * and manages immutable, session-isolated confirmation state for mutating actions
 * using AIAction and AIApprovalRequest.
 */

import { AIDeveloperTools } from '../ai-tools/AIDeveloperTools.js';
import { AIAction, ActionStatus } from '../ai-control/AIAction.js';
import { AIApprovalRequest, ApprovalStatus } from '../ai-control/AIApprovalRequest.js';

let handlerSeq = 0;

export class AITerminalHandler {
  /**
   * @param {Object} options
   * @param {import('../api/AdityyaOSAPI.js').AdityyaOSAPI} options.api
   * @param {import('./Shell.js').Shell} options.shell
   * @param {number} [options.pid] - Process ID of owning Terminal
   * @param {string} [options.appId] - Application ID of owning Terminal
   * @param {string} [options.sessionId] - Session ID
   */
  constructor({ api, shell, pid = null, appId = null, sessionId = null } = {}) {
    if (!api) {
      throw new TypeError('AITerminalHandler requires an AdityyaOSAPI instance');
    }
    this.api = api;
    this.shell = shell;
    this.pid = typeof pid === 'number' ? pid : (api.context?.pid ?? 1);
    this.appId = String(appId || api.context?.appId || 'terminal');
    this.profileId = String(api.context?.profileId || 'default');
    this.username = String(api.context?.username || 'user');
    this.sessionId = sessionId || `aisess-term-${++handlerSeq}`;

    this.devTools = new AIDeveloperTools(api);
    this.pendingRecord = null;
    this.aiHistory = [];
  }

  /**
   * Safe getter for pending action inspection.
   * @returns {Object|null}
   */
  get pendingAction() {
    if (!this.pendingRecord) return null;
    return {
      id: this.pendingRecord.actionId,
      type: this.pendingRecord.actionType,
      args: JSON.parse(JSON.stringify(this.pendingRecord.args)),
      preview: this.pendingRecord.preview
    };
  }

  /**
   * Check if a command string is an AI developer command.
   * @param {string} input
   * @returns {boolean}
   */
  isAICommand(input) {
    if (!input || typeof input !== 'string') return false;
    const trimmed = input.trim();
    return /^ai(?::\s*-|:-|:|-)\s*/i.test(trimmed);
  }

  /**
   * Check if this terminal instance is currently waiting for user confirmation.
   * @returns {boolean}
   */
  isAwaitingConfirmation() {
    return this.pendingRecord !== null &&
           this.pendingRecord.approval.status === ApprovalStatus.PENDING &&
           this.pendingRecord.action.status === ActionStatus.WAITING_FOR_APPROVAL;
  }

  /**
   * Cancel pending confirmation, cleanly transitioning underlying action/approval.
   */
  cancel() {
    if (this.pendingRecord) {
      try {
        if (this.pendingRecord.approval.status === ApprovalStatus.PENDING) {
          this.pendingRecord.approval.cancel();
        }
        if (this.pendingRecord.action.status === ActionStatus.WAITING_FOR_APPROVAL) {
          this.pendingRecord.action.transition(ActionStatus.CANCELLED, { error: 'Terminal session cancelled' });
        }
      } catch {}
      this.pendingRecord = null;
    }
  }

  /**
   * Propose a mutating action with an immutable, ownership-bound record.
   * @private
   */
  _proposeAction({ actionType, tool, args, previewSummary, previewText }) {
    const frozenArgs = Object.freeze(JSON.parse(JSON.stringify(args)));

    const action = new AIAction({
      pid: this.pid,
      appId: this.appId,
      tool,
      args: frozenArgs,
      requiredPermissions: ['filesystem.write'],
      requiresApproval: true,
      risk: 'medium'
    });
    action.transition(ActionStatus.PLANNED);
    action.transition(ActionStatus.WAITING_FOR_APPROVAL);

    const approval = new AIApprovalRequest({
      actionId: action.id,
      pid: action.pid,
      appId: action.appId,
      tool,
      args: frozenArgs,
      target: args.path || args.oldPath || 'filesystem',
      requiredPermissions: action.requiredPermissions,
      risk: action.risk,
      summary: previewSummary,
      expectedEffect: previewSummary
    });

    this.pendingRecord = {
      action,
      approval,
      actionId: action.id,
      approvalId: approval.id,
      actionType,
      tool,
      pid: this.pid,
      appId: this.appId,
      profileId: this.profileId,
      username: this.username,
      sessionId: this.sessionId,
      args: frozenArgs,
      argsSnapshotStr: JSON.stringify(frozenArgs),
      requiredPermissions: action.requiredPermissions,
      risk: action.risk,
      expectedEffect: approval.expectedEffect,
      preview: previewText
    };

    return { stdout: previewText, stderr: '', exitCode: 0 };
  }

  /**
   * Handle user confirmation ('yes'/'y' or 'no'/'n') for a pending mutating action.
   * Strictly validates session, PID, appId, profile, status, and argument immutability.
   * @param {string} input
   * @returns {Promise<{ handled: boolean, stdout?: string, stderr?: string, exitCode?: number }>}
   */
  async handleConfirmation(input) {
    if (!this.pendingRecord) {
      return { handled: false };
    }

    const record = this.pendingRecord;

    // Validate same Terminal session, PID, appId, and profile
    if (this.sessionId !== record.sessionId ||
        this.pid !== record.pid ||
        (this.appId && record.appId && this.appId !== record.appId) ||
        (this.profileId && record.profileId && this.profileId !== record.profileId) ||
        (this.username && record.username && this.username !== record.username)) {
      return { handled: false };
    }

    // Validate approval is still PENDING and action is still WAITING_FOR_APPROVAL
    if (record.approval.status !== ApprovalStatus.PENDING ||
        record.action.status !== ActionStatus.WAITING_FOR_APPROVAL ||
        record.approval.executed) {
      this.pendingRecord = null;
      return { handled: false };
    }

    // Check if process has terminated
    if (this.api?.process && this.api?.context?.hasPermission?.('process.self')) {
      try {
        const proc = this.api.process.getCurrent();
        if (proc && proc.state === 'TERMINATED') {
          this.cancel();
          return { handled: false };
        }
      } catch {}
    }

    // Validate arguments have not been mutated
    const currentArgsStr = JSON.stringify(record.args);
    if (currentArgsStr !== record.argsSnapshotStr) {
      this.cancel();
      return {
        handled: true,
        stdout: '',
        stderr: 'Security violation: Action arguments were mutated after proposal.',
        exitCode: 1
      };
    }

    const trimmed = input.trim().toLowerCase();

    if (trimmed === 'yes' || trimmed === 'y') {
      // Single-use execution
      record.approval.approve();
      record.action.transition(ActionStatus.APPROVED);
      record.approval.markExecuted();
      record.action.transition(ActionStatus.EXECUTING);

      // Clear pending record immediately so stale yes does nothing
      this.pendingRecord = null;

      try {
        let resultMessage = '';
        if (record.actionType === 'createFile') {
          const res = await this.devTools.executeCreateFile({
            path: record.args.path,
            content: record.args.content,
            cwd: this.shell?.state?.cwd || '/home/user'
          });
          resultMessage = `Action executed successfully: File created (${res.path}, ${res.size} bytes)`;
        } else if (record.actionType === 'createDirectory') {
          const res = await this.devTools.executeCreateDirectory({
            path: record.args.path,
            cwd: this.shell?.state?.cwd || '/home/user'
          });
          resultMessage = `Action executed successfully: Directory created (${res.path})`;
        } else if (record.actionType === 'rename') {
          const res = await this.devTools.executeRename({
            oldPath: record.args.oldPath,
            newPath: record.args.newPath,
            cwd: this.shell?.state?.cwd || '/home/user'
          });
          resultMessage = `Action executed successfully: Renamed ${res.from} -> ${res.to}`;
        } else if (record.actionType === 'deleteFile') {
          const res = await this.devTools.executeDeleteFile({
            path: record.args.path,
            cwd: this.shell?.state?.cwd || '/home/user'
          });
          resultMessage = `Action executed successfully: File deleted (${res.path})`;
        }

        record.action.transition(ActionStatus.COMPLETED, { result: resultMessage });

        return {
          handled: true,
          stdout: resultMessage,
          stderr: '',
          exitCode: 0
        };
      } catch (err) {
        record.action.transition(ActionStatus.FAILED, { error: err.message });
        return {
          handled: true,
          stdout: '',
          stderr: `AI Error: ${err.message}`,
          exitCode: 1
        };
      }
    } else if (trimmed === 'no' || trimmed === 'n') {
      record.approval.reject({ reason: 'User denied' });
      record.action.transition(ActionStatus.REJECTED, { error: 'Action cancelled by user' });
      this.pendingRecord = null;
      return {
        handled: true,
        stdout: 'Action cancelled by user. No changes were made.',
        stderr: '',
        exitCode: 0
      };
    }

    return {
      handled: true,
      stdout: "Type \"yes\" to confirm, or \"no\" to cancel:\n" + record.preview,
      stderr: '',
      exitCode: 0
    };
  }

  /**
   * Execute an AI command line.
   * @param {string} inputLine
   * @returns {Promise<{ stdout: string, stderr: string, exitCode: number }>}
   */
  async execute(inputLine) {
    const raw = typeof inputLine === 'string' ? inputLine.trim() : '';

    // Extract query after 'AI:', 'AI:-', 'AI: -', or 'AI-'
    const match = raw.match(/^ai(?::\s*-|:-|:|-)\s*(.*)$/i);
    if (!match) {
      return {
        stdout: '',
        stderr: 'AI: Malformed AI command syntax.',
        exitCode: 1
      };
    }

    const query = match[1].trim();
    if (!query) {
      return {
        stdout: '',
        stderr: 'AI: No request provided. Example: AI: read /home/user/notes.txt',
        exitCode: 1
      };
    }

    this.aiHistory.push({ query, timestamp: Date.now() });
    const cwd = this.shell?.state?.cwd || '/home/user';

    // 1. Help command
    if (/^help\b/i.test(query)) {
      const helpText = [
        'AI Terminal Commands:',
        '  AI: read <path>             Read a virtual file',
        '  AI: search <query> [<path>] Search for text inside files',
        '  AI: find <pattern> [<path>] Find files matching pattern',
        '  AI: exists <path>           Check if path exists',
        '  AI: status                  Show OS and system status',
        '  AI: info                    Show OS system information',
        '  AI: create <path> <content> Propose creating a file (requires confirmation)',
        '  AI: rename <old> <new>      Propose renaming a file (requires confirmation)',
        '  AI: delete <path>           Propose deleting a file (requires confirmation)',
        '  AI: help                    Display this help message'
      ].join('\n');
      return { stdout: helpText, stderr: '', exitCode: 0 };
    }

    // 2. Status command
    if (/^status\b/i.test(query)) {
      const sysInfo = await this.devTools.getSystemInfo();
      const statusText = [
        `OS Status: ${sysInfo.status || 'RUNNING'}`,
        `Hostname: ${sysInfo.hostname || 'adityya-os'}`,
        `Uptime: ${sysInfo.uptime || 0}s`,
        `CPU Utilization: ${sysInfo.cpu?.utilization || 0}%`
      ].join('\n');
      return { stdout: statusText, stderr: '', exitCode: 0 };
    }

    // 3. Info command
    if (/^info\b/i.test(query)) {
      const sysInfo = await this.devTools.getSystemInfo();
      const infoText = [
        `System: ${sysInfo.hostname || 'adityya-os'} (v${sysInfo.version || '1.0.0'})`,
        `Status: ${sysInfo.status || 'RUNNING'}`,
        `Cores: ${sysInfo.cpu?.cores || 1}`
      ].join('\n');
      return { stdout: infoText, stderr: '', exitCode: 0 };
    }

    // 4. Mutating Commands: Create
    const createMatch = query.match(/^create\s+(?:file\s+)?([^\s"']+|["'][^"']+["'])(?:\s+(?:with\s+content\s+)?(.*))?$/i);
    if (createMatch) {
      const targetPath = createMatch[1].replace(/["']/g, '');
      const content = (createMatch[2] || '').replace(/^["']|["']$/g, '');
      const preview = [
        'Action Proposed:',
        `  create ${targetPath}`,
        `  Content: "${content}"`,
        '',
        'Type "yes" to confirm, or "no" to cancel:'
      ].join('\n');

      return this._proposeAction({
        actionType: 'createFile',
        tool: 'filesystem.createFile',
        args: { path: targetPath, content },
        previewSummary: `Create file ${targetPath}`,
        previewText: preview
      });
    }

    // 5. Mutating Commands: Rename / Move
    const renameMatch = query.match(/^(?:rename|move)\s+(?:file\s+)?([^\s"']+|["'][^"']+["'])\s+(?:to\s+)?([^\s"']+|["'][^"']+["'])$/i);
    if (renameMatch) {
      const oldPath = renameMatch[1].replace(/["']/g, '');
      const newPath = renameMatch[2].replace(/["']/g, '');
      const preview = [
        'Action Proposed:',
        `  rename ${oldPath} -> ${newPath}`,
        '',
        'Type "yes" to confirm, or "no" to cancel:'
      ].join('\n');

      return this._proposeAction({
        actionType: 'rename',
        tool: 'filesystem.rename',
        args: { oldPath, newPath },
        previewSummary: `Rename ${oldPath} -> ${newPath}`,
        previewText: preview
      });
    }

    // 6. Mutating Commands: Delete / Remove
    const deleteMatch = query.match(/^(?:delete|rm|remove)\s+(?:file\s+)?([^\s"']+|["'][^"']+["'])$/i);
    if (deleteMatch) {
      const targetPath = deleteMatch[1].replace(/["']/g, '');
      const preview = [
        'Action Proposed:',
        `  delete ${targetPath}`,
        '',
        'Type "yes" to confirm, or "no" to cancel:'
      ].join('\n');

      return this._proposeAction({
        actionType: 'deleteFile',
        tool: 'filesystem.deleteFile',
        args: { path: targetPath },
        previewSummary: `Delete ${targetPath}`,
        previewText: preview
      });
    }

    // 7. Read-only: Read file
    const readMatch = query.match(/^(?:read|cat)\s+(?:file\s+)?([^\s"']+|["'][^"']+["'])$/i);
    if (readMatch) {
      const targetPath = readMatch[1].replace(/["']/g, '');
      try {
        const fileRes = await this.devTools.readFile({ path: targetPath, cwd });
        return { stdout: fileRes.content, stderr: '', exitCode: 0 };
      } catch (err) {
        return { stdout: '', stderr: `AI Error: ${err.message}`, exitCode: 1 };
      }
    }

    // 8. Read-only: Search text
    const searchMatch = query.match(/^search\s+([^\s"']+|["'][^"']+["'])(?:\s+(?:in\s+)?([^\s"']+|["'][^"']+["']))?$/i);
    if (searchMatch) {
      const searchTerm = searchMatch[1].replace(/["']/g, '');
      const searchPath = (searchMatch[2] || cwd).replace(/["']/g, '');
      try {
        const searchRes = await this.devTools.searchText({ query: searchTerm, path: searchPath, cwd });
        if (searchRes.matches.length === 0) {
          return { stdout: `No matches found for "${searchTerm}" in ${searchPath}`, stderr: '', exitCode: 0 };
        }
        const lines = [`Matches for "${searchTerm}" in ${searchPath}:`];
        for (const m of searchRes.matches) {
          lines.push(`  ${m.path || m.file}:${m.line}: ${m.snippet}`);
        }
        return { stdout: lines.join('\n'), stderr: '', exitCode: 0 };
      } catch (err) {
        return { stdout: '', stderr: `AI Error: ${err.message}`, exitCode: 1 };
      }
    }

    // 9. Read-only: Find files
    const findMatch = query.match(/^find\s+([^\s"']+|["'][^"']+["'])(?:\s+(?:in\s+)?([^\s"']+|["'][^"']+["']))?$/i);
    if (findMatch) {
      const pattern = findMatch[1].replace(/["']/g, '');
      const findPath = (findMatch[2] || cwd).replace(/["']/g, '');
      try {
        const findRes = await this.devTools.findFiles({ pattern, path: findPath, cwd });
        if (findRes.files.length === 0) {
          return { stdout: `No files found matching "${pattern}" in ${findPath}`, stderr: '', exitCode: 0 };
        }
        const lines = [`Found files matching "${pattern}":`];
        for (const f of findRes.files) {
          lines.push(`  ${f}`);
        }
        return { stdout: lines.join('\n'), stderr: '', exitCode: 0 };
      } catch (err) {
        return { stdout: '', stderr: `AI Error: ${err.message}`, exitCode: 1 };
      }
    }

    // 10. Read-only: Exists / Check if exists
    const existsMatch = query.match(/^(?:exists|check\s+if\s+(?:this\s+)?(?:folder|file|path\s+)?exists|does\s+(?:folder|file|path)?\s*([^\s"']+|["'][^"']+["'])\s+exist)/i) ||
                        query.match(/^check\s+if\s+([^\s"']+|["'][^"']+["'])\s+exists/i);
    if (existsMatch) {
      const target = (existsMatch[1] || query.match(/["']([^"']+)["']/)?.[1] || query.split(/\s+/).pop()).replace(/["']/g, '');
      const res = await this.devTools.exists({ path: target, cwd });
      if (res.exists) {
        return {
          stdout: `✓ Path exists: ${res.path} (${res.type})`,
          stderr: '',
          exitCode: 0
        };
      } else {
        return {
          stdout: `✗ Path does not exist: ${res.path}`,
          stderr: '',
          exitCode: 0
        };
      }
    }

    // Fallback: Unknown AI command
    const firstWord = query.split(/\s+/)[0];
    return {
      stdout: '',
      stderr: `Unknown AI command: ${firstWord}`,
      exitCode: 1
    };
  }

  /**
   * Teardown and clean up all state and pending actions.
   */
  destroy() {
    this.cancel();
    this.api = null;
    this.shell = null;
    this.devTools = null;
  }
}
