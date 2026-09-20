/**
 * OSState
 * Central, deterministic, serializable OS state model for AdityyaOS.
 * Kernel-owned and controlled. Provides safe deep snapshot generation via getState().
 */

export const SystemStatus = Object.freeze({
  STOPPED: 'STOPPED',
  BOOTING: 'BOOTING',
  READY: 'READY',
  RUNNING: 'RUNNING',
  SHUTTING_DOWN: 'SHUTTING_DOWN'
});

export class OSState {
  constructor(initialConfig = {}) {
    this.initialConfig = initialConfig;
    this.reset();
  }

  /**
   * Reset state to pristine initial configuration.
   */
  reset() {
    this.system = {
      status: SystemStatus.STOPPED,
      uptime: 0,
      bootTime: null,
      hostname: this.initialConfig.hostname || 'adityya-os',
      version: '1.0.0'
    };

    this.cpu = {
      cores: this.initialConfig.cores || 1,
      utilization: 0,
      currentProcess: null,
      activeAlgorithm: 'FCFS'
    };

    this.memory = {
      total: this.initialConfig.totalMemory || 1024,
      used: 0,
      free: this.initialConfig.totalMemory || 1024,
      blocks: []
    };

    this.processes = [];

    this.filesystem = {
      currentPath: '/',
      totalBlocks: 32,
      allocatedBlocks: 0,
      freeBlocks: 32
    };

    this.disks = [
      {
        id: 'disk0',
        totalCylinders: 200,
        headPosition: 53,
        direction: 'right',
        activeAlgorithm: 'FCFS',
        pendingRequests: []
      }
    ];

    this.resources = {
      names: [],
      available: {},
      allocated: {},
      max: {}
    };

    this.applications = [];

    // Phase 25: Network State
    this.network = {
      interfaces: [],
      routingTable: [],
      arpTable: [],
      dnsRecords: {},
      sockets: [],
      stats: {
        rxPackets: 0,
        txPackets: 0,
        rxBytes: 0,
        txBytes: 0,
        droppedPackets: 0
      }
    };

    // Phase 26: AI State
    this.ai = {
      activeSessions: 0,
      totalRequests: 0,
      totalTokensUsed: {
        prompt: 0,
        completion: 0,
        total: 0
      },
      providers: []
    };

    // Phase 27 & 28: AI Control & Tools State
    this.aiControl = {
      activeActions: 0,
      pendingApprovals: 0,
      totalExecuted: 0,
      totalRejected: 0
    };

    // Phase 29: Experiments Sandbox State
    this.experiments = {
      activeExperiments: 0,
      totalCreated: 0
    };

    // Phase 30: User Profiles & Cloud State
    this.profiles = {
      activeProfile: 'user',
      activeProfileId: 'default',
      totalProfiles: 1
    };

    this.cloud = {
      totalSnapshots: 0,
      lastSyncTime: null
    };
  }

  /**
   * Return a safe, serializable deep copy of the OS state.
   * Consumers can inspect this snapshot without mutating internal state.
   * @returns {Object}
   */
  getState() {
    return JSON.parse(JSON.stringify({
      system: this.system,
      cpu: this.cpu,
      memory: this.memory,
      processes: this.processes,
      filesystem: this.filesystem,
      disks: this.disks,
      resources: this.resources,
      applications: this.applications,
      network: this.network,
      ai: this.ai,
      aiControl: this.aiControl,
      experiments: this.experiments,
      profiles: this.profiles,
      cloud: this.cloud
    }));
  }

  /**
   * Clone the current state snapshot.
   * @returns {Object}
   */
  clone() {
    return this.getState();
  }

  /**
   * JSON serialization support.
   * @returns {Object}
   */
  toJSON() {
    return this.getState();
  }
}
