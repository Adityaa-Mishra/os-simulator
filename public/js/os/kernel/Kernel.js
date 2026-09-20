/**
 * Kernel
 * Master OS coordinator for AdityyaOS.
 * Orchestrates OS state, event emitter, lifecycle, subsystems, and system calls.
 * Can be instantiated via new Kernel() for testing/DI, or used via singleton export.
 */

import { OSEventEmitter, OSEvents } from './OSEventEmitter.js';
import { OSState, SystemStatus } from './OSState.js';
import { ProcessManager } from './ProcessManager.js';
import { SchedulerManager } from './SchedulerManager.js';
import { MemoryManager } from './MemoryManager.js';
import { FileSystemManager } from './FileSystemManager.js';
import { DiskManager } from './DiskManager.js';
import { ResourceManager } from './ResourceManager.js';
import { SystemCalls } from './SystemCalls.js';
import { HardwareManager } from '../hardware/HardwareManager.js';
import { NetworkManager } from '../network/NetworkManager.js';
import { AICore } from '../ai/AICore.js';
import { AIControlService } from '../ai-control/AIControlService.js';
import { ProfileManager } from '../profiles/ProfileManager.js';
import { CloudSyncService } from '../cloud/CloudSyncService.js';
import { ExperimentManager } from '../experiments/ExperimentManager.js';

export class Kernel {
  constructor(config = {}) {
    this.events = new OSEventEmitter();
    this.state = new OSState(config);

    // Virtual Hardware Layer (single owner of device registry)
    this.hardwareManager = new HardwareManager(this, config.hardware);
    this.hardware = this.hardwareManager;

    // Subsystem Managers
    this.processManager = new ProcessManager(this);
    this.schedulerManager = new SchedulerManager(this);
    this.memoryManager = new MemoryManager(this, { totalMemory: config.totalMemory, ...config.memory });
    this.fileSystemManager = new FileSystemManager(this, config.filesystem);
    this.diskManager = new DiskManager(this, config.disk);
    this.resourceManager = new ResourceManager(this);

    // Phase 25 & 26: Network and AI Subsystems
    this.networkManager = new NetworkManager(this, config.network);
    this.aiCore = new AICore(this, config.ai);

    // Phase 27: AI Control Subsystem
    this.aiControlService = new AIControlService(this, config.aiControl);

    // Phase 29 & 30: Experiments, Profiles, and Cloud Subsystems
    this.profileManager = new ProfileManager(this, config.profiles);
    this.cloudSyncService = new CloudSyncService(this, config.cloud);
    this.experimentManager = new ExperimentManager(this, config.experiments);

    // System Call Dispatch Layer
    this.systemCalls = new SystemCalls(this);

    // Cross-subsystem resource cleanup on process termination
    this.events.on(OSEvents.PROCESS_TERMINATED, ({ pid }) => {
      if (this.memoryManager) {
        this.memoryManager.free(pid);
      }
      if (this.diskManager) {
        this.diskManager.cancelRequestsForProcess(pid);
      }
      if (this.hardwareManager) {
        const cpu = this.hardwareManager.getDevice('cpu0');
        if (cpu && cpu.currentProcess === pid) {
          cpu.releaseProcess();
          this.events.emit(OSEvents.PROCESS_CPU_RELEASED, { pid });
        }
      }
      if (this.fileSystemManager) {
        this.fileSystemManager.closeProcessDescriptors(pid);
      }
      if (this.networkManager) {
        this.networkManager.closeProcessSockets(pid);
      }
      if (this.aiCore) {
        this.aiCore.abortProcessRequests(pid);
      }
      if (this.aiControlService) {
        this.aiControlService.cancelProcessActions(pid);
      }
      if (this.experimentManager) {
        this.experimentManager.cancelProcessExperiments(pid);
      }
      if (this.profileManager) {
        this.profileManager.cancelProcessSwitches(pid);
      }
    });
  }

  /**
   * Boot the operating system kernel and initialize all subsystems.
   * Explicit PID semantics: Boot guarantees first created process gets PID 1.
   * Transactional: if hardware or filesystem mount fails, kernel ends in STOPPED.
   * @returns {{ success: boolean, status: string, error?: string }}
   */
  boot() {
    this.state.system.status = SystemStatus.BOOTING;
    this.events.emit(OSEvents.SYSTEM_BOOTING, { timestamp: Date.now() });

    // Transactional Hardware Initialization
    const hwResult = this.hardwareManager.initialize();
    if (!hwResult.success) {
      this.state.system.status = SystemStatus.STOPPED;
      this.events.emit(OSEvents.SYSTEM_STOPPED, { timestamp: Date.now(), error: hwResult.error });
      return { success: false, status: SystemStatus.STOPPED, error: hwResult.error };
    }

    // Initialize all subsystems to pristine running state
    this.processManager.reset();
    this.schedulerManager.reset();
    this.memoryManager.reset();
    this.diskManager.reset();
    this.resourceManager.reset();
    if (this.networkManager) {
      this.networkManager.reset();
    }
    if (this.aiCore) {
      this.aiCore.reset();
    }
    if (this.aiControlService) {
      this.aiControlService.reset();
    }

    // Transactional Filesystem Mount
    const fsResult = this.fileSystemManager.mount();
    if (!fsResult.success) {
      this.hardwareManager.shutdown();
      this.state.system.status = SystemStatus.STOPPED;
      this.events.emit(OSEvents.SYSTEM_STOPPED, { timestamp: Date.now(), error: fsResult.error });
      return { success: false, status: SystemStatus.STOPPED, error: fsResult.error };
    }

    // Initialize default profile, experiments sandbox, and cloud state
    if (this.profileManager) {
      this.profileManager.initDefaultProfile();
    }
    if (this.experimentManager) {
      this.experimentManager.reset();
    }
    if (this.cloudSyncService) {
      this.cloudSyncService.reset();
    }

    this.state.system.bootTime = Date.now();
    this.state.system.uptime = 0;

    this.state.system.status = SystemStatus.READY;
    this.events.emit(OSEvents.SYSTEM_READY, { timestamp: Date.now() });

    this.state.system.status = SystemStatus.RUNNING;
    this.events.emit(OSEvents.SYSTEM_RUNNING, { timestamp: Date.now() });

    return { success: true, status: SystemStatus.RUNNING };
  }

  /**
   * Shutdown the operating system.
   * Closes active files, terminates active processes, and halts hardware.
   * @returns {{ success: boolean, status: string }}
   */
  shutdown() {
    this.state.system.status = SystemStatus.SHUTTING_DOWN;
    this.events.emit(OSEvents.SYSTEM_SHUTTING_DOWN, { timestamp: Date.now() });

    // Terminate all non-terminated processes
    const activeProcesses = this.processManager.getProcesses(p => p.state !== 'TERMINATED');
    for (const p of activeProcesses) {
      this.processManager.terminateProcess(p.pid);
    }

    // Cleanly unmount filesystem
    if (this.fileSystemManager) {
      this.fileSystemManager.unmount();
    }

    // Cleanly shutdown network, AI, AI control, experiments, cloud, and profiles subsystems
    if (this.networkManager) {
      this.networkManager.shutdown();
    }
    if (this.aiCore) {
      this.aiCore.shutdown();
    }
    if (this.aiControlService) {
      this.aiControlService.shutdown();
    }
    if (this.experimentManager) {
      this.experimentManager.shutdown();
    }
    if (this.cloudSyncService) {
      this.cloudSyncService.shutdown();
    }
    if (this.profileManager) {
      this.profileManager.shutdown();
    }

    // Cleanly shutdown all hardware devices
    this.hardwareManager.shutdown();

    this.state.system.status = SystemStatus.STOPPED;
    this.events.emit(OSEvents.SYSTEM_STOPPED, { timestamp: Date.now() });

    return { success: true, status: SystemStatus.STOPPED };
  }

  /**
   * Reset kernel state, all subsystems, and virtual hardware.
   * Resets PID sequence so next process gets PID 1.
   * @param {Object} [options={}]
   * @returns {{ success: boolean, status: string }}
   */
  reset(options = {}) {
    this.state.reset();
    this.processManager.reset();
    this.schedulerManager.reset();
    this.memoryManager.reset();
    if (options.format || options.clearStorage) {
      this.fileSystemManager.format();
    } else {
      this.fileSystemManager.unmount();
      this.fileSystemManager.reset();
    }
    this.diskManager.reset();
    this.resourceManager.reset();
    this.hardwareManager.reset(options);
    if (this.networkManager) {
      this.networkManager.reset();
    }
    if (this.aiCore) {
      this.aiCore.reset();
    }
    if (this.aiControlService) {
      this.aiControlService.reset();
    }
    if (this.profileManager) {
      this.profileManager.reset();
    }
    if (this.cloudSyncService) {
      this.cloudSyncService.reset();
    }
    if (this.experimentManager) {
      this.experimentManager.reset();
    }

    // Keep state.filesystem.allocatedBlocks at 0 while kernel is STOPPED
    this.state.filesystem.allocatedBlocks = 0;
    this.state.filesystem.freeBlocks = this.state.filesystem.totalBlocks;

    this.events.emit(OSEvents.SYSTEM_RESET, { timestamp: Date.now() });
    return { success: true, status: SystemStatus.STOPPED };
  }

  /**
   * Dispatch a system call.
   * Format: kernel.syscall('process.create', { ...payload })
   * @param {string} callName
   * @param {Object} [payload={}]
   * @returns {{ success: boolean, data?: any, error?: string }}
   */
  syscall(callName, payload = {}) {
    return this.systemCalls.dispatch(callName, payload);
  }

  /**
   * Safe deep snapshot of OS state for external inspection.
   * @returns {Object}
   */
  getState() {
    const state = this.state.getState();
    if (this.hardwareManager) {
      state.hardware = this.hardwareManager.getHardwareState();
    }
    return state;
  }

  /**
   * Get current lifecycle status string.
   * @returns {string}
   */
  getStatus() {
    return this.state.system.status;
  }
}

// Singleton export for future application integration
export const kernel = new Kernel();
