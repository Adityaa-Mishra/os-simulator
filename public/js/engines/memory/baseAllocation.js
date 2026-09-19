/**
 * BaseAllocationEngine
 * Common base class for contiguous fixed-partition memory allocation algorithms.
 * Implements validation, presets, snapshot generation, and metric calculations.
 */

import { BaseSimulationEngine } from '../../core/simulationEngine.js';

export class BaseAllocationEngine extends BaseSimulationEngine {
  constructor(algorithmId, name) {
    super('memory', algorithmId, name);
  }

  getPresets() {
    return [
      {
        name: 'Standard Textbook Workload',
        description: 'Classic textbook scenario: Blocks [100, 500, 200, 300, 600] and Processes [212, 417, 112, 426].',
        data: {
          blocks: [
            { id: 'B1', size: 100 },
            { id: 'B2', size: 500 },
            { id: 'B3', size: 200 },
            { id: 'B4', size: 300 },
            { id: 'B5', size: 600 }
          ],
          processes: [
            { id: 'P1', size: 212 },
            { id: 'P2', size: 417 },
            { id: 'P3', size: 112 },
            { id: 'P4', size: 426 }
          ]
        }
      },
      {
        name: 'Exact Fit Demonstration',
        description: 'Highlights zero internal fragmentation when process sizes match block capacities exactly.',
        data: {
          blocks: [
            { id: 'B1', size: 150 },
            { id: 'B2', size: 300 },
            { id: 'B3', size: 450 }
          ],
          processes: [
            { id: 'P1', size: 300 },
            { id: 'P2', size: 150 },
            { id: 'P3', size: 450 }
          ]
        }
      },
      {
        name: 'High Fragmentation & Allocation Failure',
        description: 'Shows allocation failure due to lack of contiguous block capacity (External Fragmentation).',
        data: {
          blocks: [
            { id: 'B1', size: 100 },
            { id: 'B2', size: 150 },
            { id: 'B3', size: 120 }
          ],
          processes: [
            { id: 'P1', size: 90 },
            { id: 'P2', size: 140 },
            { id: 'P3', size: 200 } // Total free space (110+10+120=240) > 200, but no single block can fit P3!
          ]
        }
      }
    ];
  }

  /**
   * Validate memory blocks and process inputs.
   */
  validate(inputs) {
    if (!inputs || typeof inputs !== 'object') {
      return { isValid: false, error: 'Input configuration must be an object' };
    }

    // Validate Blocks
    if (!Array.isArray(inputs.blocks) || inputs.blocks.length === 0) {
      return { isValid: false, error: 'At least one memory block must be provided' };
    }

    const seenBlockIds = new Set();
    for (let i = 0; i < inputs.blocks.length; i++) {
      const b = inputs.blocks[i];
      if (!b || typeof b !== 'object') {
        return { isValid: false, error: `Block at index ${i} must be an object` };
      }
      if (b.id === undefined || b.id === null || String(b.id).trim() === '') {
        return { isValid: false, error: `Block at index ${i} has an invalid or missing ID` };
      }
      const bId = String(b.id).trim();
      if (seenBlockIds.has(bId)) {
        return { isValid: false, error: `Duplicate block ID detected: "${bId}"` };
      }
      seenBlockIds.add(bId);

      if (typeof b.size !== 'number' || isNaN(b.size) || b.size <= 0) {
        return { isValid: false, error: `Block "${bId}" must have a positive size (> 0)` };
      }
    }

    // Validate Processes
    if (!Array.isArray(inputs.processes) || inputs.processes.length === 0) {
      return { isValid: false, error: 'At least one process request must be provided' };
    }

    const seenProcIds = new Set();
    for (let i = 0; i < inputs.processes.length; i++) {
      const p = inputs.processes[i];
      if (!p || typeof p !== 'object') {
        return { isValid: false, error: `Process at index ${i} must be an object` };
      }
      if (p.id === undefined || p.id === null || String(p.id).trim() === '') {
        return { isValid: false, error: `Process at index ${i} has an invalid or missing ID` };
      }
      const pId = String(p.id).trim();
      if (seenProcIds.has(pId)) {
        return { isValid: false, error: `Duplicate process ID detected: "${pId}"` };
      }
      seenProcIds.add(pId);

      if (typeof p.size !== 'number' || isNaN(p.size) || p.size <= 0) {
        return { isValid: false, error: `Process "${pId}" must have a positive size (> 0)` };
      }
    }

    return { isValid: true };
  }

  /**
   * Selection strategy to be implemented by FirstFit, BestFit, WorstFit.
   * @param {Array<Object>} blocks - Current state of all blocks
   * @param {Object} process - Current process attempting allocation
   * @returns {Object|null} - Selected block or null if no fit
   */
  selectBlock(blocks, process) {
    throw new Error(`Method 'selectBlock(blocks, process)' must be implemented by ${this.constructor.name}`);
  }

  /**
   * Run the deterministic memory allocation simulation.
   */
  run(inputs) {
    const validation = this.validate(inputs);
    if (!validation.isValid) {
      throw new Error(validation.error);
    }

    // Initialize blocks
    const blocks = inputs.blocks.map((b, idx) => ({
      id: String(b.id).trim(),
      index: idx,
      size: Number(b.size),
      isFree: true,
      allocatedProcessId: null,
      allocatedProcessSize: 0,
      internalFragmentation: 0
    }));

    // Initialize processes
    const processes = inputs.processes.map((p, idx) => ({
      id: String(p.id).trim(),
      index: idx,
      size: Number(p.size),
      status: 'pending', // 'pending' | 'allocated' | 'failed'
      allocatedBlockId: null,
      internalFragmentation: 0
    }));

    const snapshots = [];
    const eventsLog = [];
    let stepIndex = 0;

    // Snapshot 0: Initial state before any allocations
    snapshots.push(
      this.createSnapshot({
        stepIndex: stepIndex++,
        timeUnit: 0,
        activeUnit: null,
        state: {
          blocks: blocks.map(b => ({ ...b })),
          processes: processes.map(p => ({ ...p })),
          currentProcess: null,
          allocatedBlock: null,
          freeBlocks: blocks.map(b => b.id),
          failedProcesses: []
        },
        actionLog: 'Memory system initialized. All partitions are free.',
        educationalNote: `Starting ${this.name} allocation. Partitions are fixed; each partition accommodates at most one process.`
      })
    );

    // Process each allocation request sequentially
    for (let i = 0; i < processes.length; i++) {
      const currentProc = processes[i];
      const selectedBlock = this.selectBlock(blocks, currentProc);

      let actionLog = '';
      let educationalNote = '';

      if (selectedBlock) {
        // Allocation success
        selectedBlock.isFree = false;
        selectedBlock.allocatedProcessId = currentProc.id;
        selectedBlock.allocatedProcessSize = currentProc.size;
        selectedBlock.internalFragmentation = selectedBlock.size - currentProc.size;

        currentProc.status = 'allocated';
        currentProc.allocatedBlockId = selectedBlock.id;
        currentProc.internalFragmentation = selectedBlock.internalFragmentation;

        actionLog = `Allocated ${currentProc.id} (size: ${currentProc.size} KB) to Block ${selectedBlock.id} (size: ${selectedBlock.size} KB). Internal fragmentation: ${selectedBlock.internalFragmentation} KB.`;
        educationalNote = `${this.name} matched ${currentProc.id} with ${selectedBlock.id}. Remaining unused ${selectedBlock.internalFragmentation} KB inside this block cannot be used by other processes.`;
        eventsLog.push(`Step ${i + 1}: ${actionLog}`);
      } else {
        // Allocation failure
        currentProc.status = 'failed';
        actionLog = `Failed to allocate ${currentProc.id} (size: ${currentProc.size} KB). No free partition has sufficient capacity.`;
        educationalNote = `None of the currently available free blocks can accommodate ${currentProc.id} of size ${currentProc.size} KB. Process remains unallocated.`;
        eventsLog.push(`Step ${i + 1}: ${actionLog}`);
      }

      // Record snapshot for this step
      snapshots.push(
        this.createSnapshot({
          stepIndex: stepIndex++,
          timeUnit: i + 1,
          activeUnit: currentProc.id,
          state: {
            blocks: blocks.map(b => ({ ...b })),
            processes: processes.map(p => ({ ...p })),
            currentProcess: currentProc.id,
            allocatedBlock: selectedBlock ? selectedBlock.id : null,
            freeBlocks: blocks.filter(b => b.isFree).map(b => b.id),
            failedProcesses: processes.filter(p => p.status === 'failed').map(p => p.id)
          },
          actionLog,
          educationalNote
        })
      );
    }

    // Calculate aggregate metrics
    const totalMemory = blocks.reduce((sum, b) => sum + b.size, 0);
    const allocatedMemory = blocks.reduce((sum, b) => sum + (b.isFree ? 0 : b.allocatedProcessSize), 0);
    const totalInternalFragmentation = blocks.reduce((sum, b) => sum + (b.isFree ? 0 : b.internalFragmentation), 0);
    const totalFreeMemory = blocks.reduce((sum, b) => sum + (b.isFree ? b.size : 0), 0);
    const successfulAllocations = processes.filter(p => p.status === 'allocated').length;
    const failedAllocations = processes.filter(p => p.status === 'failed').length;

    // External fragmentation: total free space across unallocated blocks if any process failed despite totalFreeMemory >= failedProcessSize
    let externalFragmentation = 0;
    const hasExternalFragFailure = processes.some(p => p.status === 'failed' && totalFreeMemory >= p.size);
    if (hasExternalFragFailure) {
      externalFragmentation = totalFreeMemory;
    }

    const memoryUtilization = totalMemory > 0
      ? Math.round(((allocatedMemory / totalMemory) * 100) * 100) / 100
      : 0;

    const metrics = {
      totalMemory,
      allocatedMemory,
      totalFreeMemory,
      totalInternalFragmentation,
      externalFragmentation,
      memoryUtilization,
      successfulAllocations,
      failedAllocations,
      blockMetrics: blocks.map(b => ({
        id: b.id,
        size: b.size,
        isFree: b.isFree,
        allocatedProcessId: b.allocatedProcessId,
        allocatedProcessSize: b.allocatedProcessSize,
        internalFragmentation: b.internalFragmentation
      })),
      processMetrics: processes.map(p => ({
        id: p.id,
        size: p.size,
        status: p.status,
        allocatedBlockId: p.allocatedBlockId,
        internalFragmentation: p.internalFragmentation
      })),
      eventsLog
    };

    return this.formatResult({
      parameters: { model: 'fixed-partition' },
      snapshots,
      metrics
    });
  }
}
