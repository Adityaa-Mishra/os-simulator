/**
 * SystemCalls
 * Central System Call dispatch interface for AdityyaOS.
 * Structured API: kernel.syscall(callName, payload)
 * Enforces transactional validation, consistent return shapes, and decoupled security boundaries.
 */

import { OSEvents } from './OSEventEmitter.js';

export class SystemCalls {
  constructor(kernel) {
    this.kernel = kernel;
    this.handlers = new Map();
    this.registerDefaultHandlers();
  }

  /**
   * Register standard OS system calls across all subsystems.
   */
  registerDefaultHandlers() {
    // Process Syscalls
    this.register('process.create', payload => this.kernel.processManager.createProcess(payload));
    this.register('process.terminate', payload => this.kernel.processManager.terminateProcess(payload?.pid));
    this.register('process.suspend', payload => this.kernel.processManager.suspendProcess(payload?.pid));
    this.register('process.resume', payload => this.kernel.processManager.resumeProcess(payload?.pid));
    this.register('process.get', payload => {
      const p = this.kernel.processManager.getProcess(payload?.pid);
      return p ? { success: true, data: p } : { success: false, error: `Process ${payload?.pid} not found` };
    });
    this.register('process.list', payload => ({
      success: true,
      data: this.kernel.processManager.getProcesses(payload?.filter)
    }));

    // CPU / Scheduler Syscalls
    this.register('cpu.schedule', payload => this.kernel.schedulerManager.schedule(payload?.processes, payload?.options));
    this.register('cpu.set_algorithm', payload => this.kernel.schedulerManager.setAlgorithm(payload?.algorithm, payload?.options));
    this.register('cpu.get_algorithm', () => ({
      success: true,
      data: this.kernel.schedulerManager.getAlgorithm()
    }));

    // Memory Syscalls
    this.register('memory.allocate', payload => this.kernel.memoryManager.allocate(payload?.pid, payload?.size, payload?.strategy));
    this.register('memory.free', payload => this.kernel.memoryManager.free(payload?.pid));
    this.register('memory.get_state', () => ({
      success: true,
      data: this.kernel.memoryManager.getMemoryState()
    }));

    // File System Syscalls
    this.register('fs.mount', () => this.kernel.fileSystemManager.mount());
    this.register('fs.unmount', () => this.kernel.fileSystemManager.unmount());
    this.register('fs.exists', payload => ({
      success: true,
      data: { exists: this.kernel.fileSystemManager.exists(payload?.path) }
    }));
    this.register('fs.stat', payload => this.kernel.fileSystemManager.stat(payload?.path));
    this.register('fs.mkdir', payload => this.kernel.fileSystemManager.createDirectory(payload?.path, payload?.permissions));
    this.register('fs.rmdir', payload => this.kernel.fileSystemManager.deleteDirectory(payload?.path, payload?.options));
    this.register('fs.readdir', payload => this.kernel.fileSystemManager.listDirectory(payload?.path));
    this.register('fs.create', payload => this.kernel.fileSystemManager.createFile(payload?.path, payload?.size !== undefined ? payload.size : payload?.content, payload?.permissions));
    this.register('fs.read', payload => {
      if (typeof payload?.fd === 'number') {
        return this.kernel.fileSystemManager.readDescriptor(payload.fd, payload.length, payload.pid);
      }
      return this.kernel.fileSystemManager.readFile(payload?.path);
    });
    this.register('fs.write', payload => {
      if (typeof payload?.fd === 'number') {
        return this.kernel.fileSystemManager.writeDescriptor(payload.fd, payload.data, payload.pid);
      }
      return this.kernel.fileSystemManager.writeFile(payload?.path, payload?.data !== undefined ? payload.data : payload?.size);
    });
    this.register('fs.append', payload => this.kernel.fileSystemManager.appendFile(payload?.path, payload?.content));
    this.register('fs.delete', payload => this.kernel.fileSystemManager.deleteFile(payload?.path));
    this.register('fs.rename', payload => this.kernel.fileSystemManager.rename(payload?.sourcePath || payload?.source, payload?.destPath || payload?.dest));
    this.register('fs.copy', payload => this.kernel.fileSystemManager.copy(payload?.sourcePath || payload?.source, payload?.destPath || payload?.dest));
    this.register('fs.open', payload => this.kernel.fileSystemManager.openDescriptor(payload?.path, payload?.flags, payload?.pid));
    this.register('fs.close', payload => {
      if (typeof payload?.fd === 'number') {
        return this.kernel.fileSystemManager.closeDescriptor(payload.fd, payload.pid);
      }
      return this.kernel.fileSystemManager.closeFile(payload?.path, payload?.pid);
    });
    this.register('fs.seek', payload => this.kernel.fileSystemManager.seekDescriptor(payload?.fd, payload?.offset, payload?.whence, payload?.pid));

    // Compatibility Aliases
    this.register('fs.create_file', payload => this.kernel.fileSystemManager.createFile(payload?.path, payload?.size, payload?.permissions));
    this.register('fs.read_file', payload => this.kernel.fileSystemManager.readFile(payload?.path));
    this.register('fs.write_file', payload => this.kernel.fileSystemManager.writeFile(payload?.path, payload?.size));
    this.register('fs.delete_file', payload => this.kernel.fileSystemManager.deleteFile(payload?.path));
    this.register('fs.create_dir', payload => this.kernel.fileSystemManager.createDirectory(payload?.path, payload?.permissions));
    this.register('fs.delete_dir', payload => this.kernel.fileSystemManager.deleteDirectory(payload?.path));
    this.register('fs.open_file', payload => this.kernel.fileSystemManager.openFile(payload?.path));
    this.register('fs.close_file', payload => this.kernel.fileSystemManager.closeFile(payload?.path));
    this.register('fs.list_dir', payload => this.kernel.fileSystemManager.listDirectory(payload?.path));
    this.register('fs.change_dir', payload => this.kernel.fileSystemManager.changeDirectory(payload?.path));
    this.register('fs.get_metadata', payload => this.kernel.fileSystemManager.getMetadata(payload?.path));

    // Disk Syscalls
    this.register('disk.add_request', payload => this.kernel.diskManager.addRequest(payload?.cylinder, payload?.pid));
    this.register('disk.set_algorithm', payload => this.kernel.diskManager.setAlgorithm(payload?.algorithm));
    this.register('disk.schedule', payload => this.kernel.diskManager.schedule(payload));
    this.register('disk.get_state', () => ({
      success: true,
      data: this.kernel.diskManager.getDiskState()
    }));

    // Resource / Deadlock Syscalls
    this.register('resource.register', payload => this.kernel.resourceManager.registerResources(payload?.resources));
    this.register('resource.declare_max', payload => this.kernel.resourceManager.declareMax(payload?.pid, payload?.max));
    this.register('resource.request', payload => this.kernel.resourceManager.request(payload?.pid, payload?.request));
    this.register('resource.release', payload => this.kernel.resourceManager.release(payload?.pid, payload?.release));
    this.register('resource.check_safety', () => this.kernel.resourceManager.checkSafety());

    // System Status Syscalls
    this.register('system.info', () => ({
      success: true,
      data: {
        hostname: this.kernel.state.system.hostname,
        version: this.kernel.state.system.version,
        status: this.kernel.state.system.status,
        uptime: this.kernel.state.system.uptime
      }
    }));
    this.register('system.status', () => ({
      success: true,
      data: { status: this.kernel.state.system.status }
    }));

    // Virtual Hardware Syscalls
    this.register('hardware.info', () => ({
      success: true,
      data: this.kernel.hardwareManager.getHardwareState()
    }));
    this.register('hardware.device.get', payload => {
      const dev = this.kernel.hardwareManager.getDeviceInfo(payload?.deviceId);
      return dev
        ? { success: true, data: dev }
        : { success: false, error: `Device "${payload?.deviceId}" not found` };
    });
    this.register('hardware.diagnostics', () => ({
      success: true,
      data: this.kernel.hardwareManager.getDiagnostics()
    }));
    this.register('hardware.bus.request', payload => {
      return this.kernel.hardwareManager.request(
        payload?.deviceId,
        payload?.operation,
        payload?.payload
      );
    });

    // Phase 16: Process / Memory / Storage Integration Syscalls
    this.register('process.memory.allocate', payload =>
      this.kernel.memoryManager.allocate(payload?.pid, payload?.size, payload?.strategy)
    );
    this.register('process.memory.release', payload =>
      this.kernel.memoryManager.free(payload?.pid)
    );
    this.register('process.memory.read', payload =>
      this.kernel.memoryManager.readProcessMemory(payload?.pid, payload?.offset, payload?.length)
    );
    this.register('process.memory.write', payload =>
      this.kernel.memoryManager.writeProcessMemory(payload?.pid, payload?.offset, payload?.data)
    );
    this.register('storage.request', payload =>
      this.kernel.diskManager.addRequest(payload?.cylinder, payload?.pid, {
        sector: payload?.sector,
        operation: payload?.operation,
        data: payload?.data
      })
    );
    this.register('storage.cancel', payload =>
      this.kernel.diskManager.cancelRequestsForProcess(payload?.pid)
    );
    this.register('storage.get_request', payload => {
      const req = this.kernel.diskManager.getRequest(payload?.requestId);
      return req
        ? { success: true, data: { request: req, ...req } }
        : { success: false, error: `Storage request "${payload?.requestId}" not found` };
    });
    this.register('storage.read', payload => {
      const disk = this.kernel.hardwareManager.getDevice('disk0');
      return disk
        ? disk.read(payload?.sector, payload?.length)
        : { success: false, error: 'Storage device not found' };
    });
    this.register('storage.write', payload => {
      const disk = this.kernel.hardwareManager.getDevice('disk0');
      return disk
        ? disk.write(payload?.sector, payload?.data)
        : { success: false, error: 'Storage device not found' };
    });
  }

  /**
   * Register a system call handler.
   * @param {string} callName
   * @param {Function} handler
   */
  register(callName, handler) {
    if (typeof handler !== 'function') {
      throw new TypeError(`Syscall handler for "${callName}" must be a function`);
    }
    this.handlers.set(callName, handler);
  }

  /**
   * Dispatch a system call.
   * Format: kernel.syscall('process.create', { ...payload })
   * @param {string} callName
   * @param {Object} [payload={}]
   * @returns {{ success: boolean, data?: any, error?: string }}
   */
  dispatch(callName, payload = {}) {
    if (typeof callName !== 'string' || !callName.trim()) {
      return { success: false, error: 'System call name must be a non-empty string' };
    }

    const handler = this.handlers.get(callName);
    if (!handler) {
      const errorMsg = `Unknown system call "${callName}"`;
      if (this.kernel && this.kernel.events) {
        this.kernel.events.emit(OSEvents.SYSCALL_ERROR, { call: callName, error: errorMsg });
      }
      return { success: false, error: errorMsg };
    }

    if (this.kernel && this.kernel.events) {
      this.kernel.events.emit(OSEvents.SYSCALL_DISPATCHED, { call: callName, payload });
    }

    try {
      const result = handler(payload);
      const isSuccess = Boolean(result && result.success !== false && !result.error);

      if (isSuccess) {
        if (this.kernel && this.kernel.events) {
          this.kernel.events.emit(OSEvents.SYSCALL_SUCCESS, { call: callName, data: result?.data });
        }
        return {
          success: true,
          data: result?.data !== undefined ? result.data : result
        };
      } else {
        const error = result?.error || 'System call failed';
        if (this.kernel && this.kernel.events) {
          this.kernel.events.emit(OSEvents.SYSCALL_ERROR, { call: callName, error });
        }
        return { success: false, error };
      }
    } catch (err) {
      const error = err.message || 'Unhandled system call error';
      if (this.kernel && this.kernel.events) {
        this.kernel.events.emit(OSEvents.SYSCALL_ERROR, { call: callName, error });
      }
      return { success: false, error };
    }
  }
}
