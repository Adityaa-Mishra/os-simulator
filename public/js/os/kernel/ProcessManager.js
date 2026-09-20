/**
 * ProcessManager
 * Coordinates process lifecycles, PCB tracking, and state transitions for AdityyaOS.
 * Enforces explicit sequential PID generation with reset semantics.
 */

import { OSEvents } from './OSEventEmitter.js';

export const ProcessState = Object.freeze({
  NEW: 'NEW',
  READY: 'READY',
  RUNNING: 'RUNNING',
  WAITING: 'WAITING',
  TERMINATED: 'TERMINATED'
});

export class ProcessManager {
  constructor(kernel) {
    this.kernel = kernel;
    this.processes = new Map();
    this.pidCounter = 0;
  }

  /**
   * Reset the process manager and PID sequence.
   * After reset, the first newly created process will receive PID 1.
   */
  reset() {
    this.processes.clear();
    this.pidCounter = 0;
    if (this.kernel && this.kernel.state) {
      this.kernel.state.processes = [];
      if (this.kernel.state.cpu.currentProcess !== null) {
        this.kernel.state.cpu.currentProcess = null;
      }
    }
    if (this.kernel && this.kernel.hardware) {
      const cpu = this.kernel.hardware.getDevice('cpu0');
      if (cpu) {
        cpu.releaseProcess();
      }
    }
  }

  /**
   * Create a new process with a stable sequential PID.
   * @param {Object} config
   * @param {string} config.name
   * @param {number} [config.priority=1]
   * @param {number} [config.burstTime=1]
   * @param {number} [config.arrivalTime=0]
   * @param {number} [config.memoryRequired=0]
   * @returns {{ success: boolean, data?: Object, error?: string }}
   */
  createProcess(config = {}) {
    if (!config || typeof config !== 'object') {
      return { success: false, error: 'Process configuration must be an object' };
    }

    const name = String(config.name || '').trim();
    if (!name) {
      return { success: false, error: 'Process name must be a non-empty string' };
    }

    const priority = typeof config.priority === 'number' && !isNaN(config.priority) ? config.priority : 1;
    const burstTime = typeof config.burstTime === 'number' && !isNaN(config.burstTime) ? config.burstTime : 1;
    const arrivalTime = typeof config.arrivalTime === 'number' && !isNaN(config.arrivalTime) ? config.arrivalTime : 0;
    const memoryRequired = typeof config.memoryRequired === 'number' && !isNaN(config.memoryRequired) ? config.memoryRequired : 0;

    if (burstTime <= 0) {
      return { success: false, error: 'Process burstTime must be greater than 0' };
    }
    if (arrivalTime < 0) {
      return { success: false, error: 'Process arrivalTime must be non-negative' };
    }
    if (memoryRequired < 0) {
      return { success: false, error: 'Process memoryRequired must be non-negative' };
    }

    // Generate next sequential PID (first process receives PID 1)
    this.pidCounter++;
    const pid = this.pidCounter;

    const profileId = config.profileId || this.kernel?.profileManager?.activeProfileId || 'default';
    const username = config.username || this.kernel?.profileManager?.activeUsername || 'user';

    const pcb = {
      pid,
      name,
      profileId,
      username,
      state: ProcessState.READY,
      priority,
      burstTime,
      remainingTime: burstTime,
      arrivalTime,
      memoryRequired,
      allocatedMemory: 0,
      allocations: [],
      createdAt: Date.now()
    };

    this.processes.set(pid, pcb);

    // Sync to kernel state
    if (this.kernel && this.kernel.state) {
      this.kernel.state.processes = this.getProcesses();
    }

    // Emit event only on success
    if (this.kernel && this.kernel.events) {
      this.kernel.events.emit(OSEvents.PROCESS_CREATED, { pid, process: { ...pcb } });
    }

    return { success: true, data: { ...pcb } };
  }

  /**
   * Terminate a process.
   * Guaranteed: Terminated processes CANNOT remain RUNNING.
   * @param {number} pid
   * @returns {{ success: boolean, data?: Object, error?: string }}
   */
  terminateProcess(pid) {
    const process = this.processes.get(pid);
    if (!process) {
      return { success: false, error: `Process ${pid} not found` };
    }

    if (process.state === ProcessState.TERMINATED) {
      return { success: false, error: `Process ${pid} is already terminated` };
    }

    process.state = ProcessState.TERMINATED;

    // Ensure CPU does not point to terminated process
    let cpuWasAssigned = false;
    if (this.kernel && this.kernel.state && this.kernel.state.cpu.currentProcess === pid) {
      this.kernel.state.cpu.currentProcess = null;
      cpuWasAssigned = true;
    }
    if (this.kernel && this.kernel.hardware) {
      const cpu = this.kernel.hardware.getDevice('cpu0');
      if (cpu && cpu.currentProcess === pid) {
        cpu.releaseProcess();
        cpuWasAssigned = true;
      }
    }
    if (cpuWasAssigned && this.kernel && this.kernel.events) {
      this.kernel.events.emit(OSEvents.PROCESS_CPU_RELEASED, { pid });
    }

    // Sync to kernel state
    if (this.kernel && this.kernel.state) {
      this.kernel.state.processes = this.getProcesses();
    }

    // Emit process termination event for decoupled cross-resource cleanup
    if (this.kernel && this.kernel.events) {
      this.kernel.events.emit(OSEvents.PROCESS_TERMINATED, { pid });
    }

    return { success: true, data: { pid } };
  }

  /**
   * Suspend a process (transition from READY or RUNNING to WAITING).
   * @param {number} pid
   * @returns {{ success: boolean, data?: Object, error?: string }}
   */
  suspendProcess(pid) {
    const process = this.processes.get(pid);
    if (!process) {
      return { success: false, error: `Process ${pid} not found` };
    }

    if (process.state === ProcessState.TERMINATED) {
      return { success: false, error: `Cannot suspend terminated process ${pid}` };
    }

    if (process.state === ProcessState.WAITING) {
      return { success: false, error: `Process ${pid} is already waiting/suspended` };
    }

    process.state = ProcessState.WAITING;

    // Release CPU if this process was running
    let cpuWasAssigned = false;
    if (this.kernel && this.kernel.state && this.kernel.state.cpu.currentProcess === pid) {
      this.kernel.state.cpu.currentProcess = null;
      cpuWasAssigned = true;
    }
    if (this.kernel && this.kernel.hardware) {
      const cpu = this.kernel.hardware.getDevice('cpu0');
      if (cpu && cpu.currentProcess === pid) {
        cpu.releaseProcess();
        cpuWasAssigned = true;
      }
    }
    if (cpuWasAssigned && this.kernel && this.kernel.events) {
      this.kernel.events.emit(OSEvents.PROCESS_CPU_RELEASED, { pid });
    }

    if (this.kernel && this.kernel.state) {
      this.kernel.state.processes = this.getProcesses();
    }

    if (this.kernel && this.kernel.events) {
      this.kernel.events.emit(OSEvents.PROCESS_SUSPENDED, { pid });
    }

    return { success: true, data: { pid, state: ProcessState.WAITING } };
  }

  /**
   * Resume a suspended process (transition from WAITING to READY).
   * @param {number} pid
   * @returns {{ success: boolean, data?: Object, error?: string }}
   */
  resumeProcess(pid) {
    const process = this.processes.get(pid);
    if (!process) {
      return { success: false, error: `Process ${pid} not found` };
    }

    if (process.state !== ProcessState.WAITING) {
      return { success: false, error: `Process ${pid} is not suspended (current state: ${process.state})` };
    }

    process.state = ProcessState.READY;

    if (this.kernel && this.kernel.state) {
      this.kernel.state.processes = this.getProcesses();
    }

    if (this.kernel && this.kernel.events) {
      this.kernel.events.emit(OSEvents.PROCESS_RESUMED, { pid });
    }

    return { success: true, data: { pid, state: ProcessState.READY } };
  }

  /**
   * Set process state with lifecycle validation.
   * @param {number} pid
   * @param {string} newState
   * @returns {{ success: boolean, data?: Object, error?: string }}
   */
  setProcessState(pid, newState) {
    const validStates = Object.values(ProcessState);
    if (!validStates.includes(newState)) {
      return { success: false, error: `Invalid process state "${newState}". Valid: ${validStates.join(', ')}` };
    }

    const process = this.processes.get(pid);
    if (!process) {
      return { success: false, error: `Process ${pid} not found` };
    }

    if (newState === ProcessState.TERMINATED) {
      return this.terminateProcess(pid);
    }

    const oldState = process.state;
    process.state = newState;

    // Maintain CPU currentProcess consistency
    if (newState === ProcessState.RUNNING) {
      if (this.kernel && this.kernel.state) {
        this.kernel.state.cpu.currentProcess = pid;
      }
      if (this.kernel && this.kernel.hardware) {
        const cpu = this.kernel.hardware.getDevice('cpu0');
        if (cpu) {
          cpu.assignProcess(pid);
        }
      }
      if (this.kernel && this.kernel.events) {
        this.kernel.events.emit(OSEvents.PROCESS_CPU_ASSIGNED, { pid });
      }
    } else if (oldState === ProcessState.RUNNING) {
      if (this.kernel && this.kernel.state && this.kernel.state.cpu.currentProcess === pid) {
        this.kernel.state.cpu.currentProcess = null;
      }
      if (this.kernel && this.kernel.hardware) {
        const cpu = this.kernel.hardware.getDevice('cpu0');
        if (cpu && cpu.currentProcess === pid) {
          cpu.releaseProcess();
        }
      }
      if (this.kernel && this.kernel.events) {
        this.kernel.events.emit(OSEvents.PROCESS_CPU_RELEASED, { pid });
      }
    }

    if (this.kernel && this.kernel.state) {
      this.kernel.state.processes = this.getProcesses();
    }

    if (this.kernel && this.kernel.events) {
      this.kernel.events.emit(OSEvents.PROCESS_STATE_CHANGED, { pid, oldState, newState });
    }

    return { success: true, data: { pid, oldState, newState } };
  }

  /**
   * Get a safe clone of a single process by PID.
   * @param {number} pid
   * @returns {Object|null}
   */
  getProcess(pid) {
    const process = this.processes.get(pid);
    return process ? { ...process } : null;
  }

  /**
   * Get a list of all processes, optionally filtered.
   * @param {Object|Function} [filter]
   * @returns {Array<Object>}
   */
  getProcesses(filter) {
    let list = Array.from(this.processes.values()).map(p => ({ ...p }));
    if (typeof filter === 'function') {
      list = list.filter(filter);
    } else if (filter && typeof filter === 'object' && filter.state) {
      list = list.filter(p => p.state === filter.state);
    }
    return list;
  }
}
