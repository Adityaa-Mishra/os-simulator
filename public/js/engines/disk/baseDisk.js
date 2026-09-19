/**
 * BaseDiskEngine
 * Common base class for Disk Scheduling simulation algorithms.
 * Implements validation, presets, snapshot generation, and metric calculations.
 */

import { BaseSimulationEngine } from '../../core/simulationEngine.js';

export class BaseDiskEngine extends BaseSimulationEngine {
  constructor(algorithmId, name) {
    super('disk', algorithmId, name);
  }

  getPresets() {
    return [
      {
        name: 'Classic Textbook Scenario',
        description: 'Standard textbook problem: requests [98, 183, 37, 122, 14, 124, 65, 67] starting at cylinder 53.',
        data: {
          requests: [98, 183, 37, 122, 14, 124, 65, 67],
          initialHead: 53,
          diskSize: 200,
          direction: 'right'
        }
      },
      {
        name: 'Concentrated Near Beginning',
        description: 'Requests concentrated near cylinder 0 to observe seek optimization: [12, 5, 28, 19, 35, 8].',
        data: {
          requests: [12, 5, 28, 19, 35, 8],
          initialHead: 20,
          diskSize: 200,
          direction: 'left'
        }
      },
      {
        name: 'Concentrated Near End',
        description: 'Requests concentrated near the upper disk boundary: [175, 190, 160, 185, 150].',
        data: {
          requests: [175, 190, 160, 185, 150],
          initialHead: 140,
          diskSize: 200,
          direction: 'right'
        }
      },
      {
        name: 'Direction Reversal Stress Test',
        description: 'Requests alternating between extreme ends: [10, 190, 20, 180, 30, 170].',
        data: {
          requests: [10, 190, 20, 180, 30, 170],
          initialHead: 100,
          diskSize: 200,
          direction: 'right'
        }
      }
    ];
  }

  /**
   * Normalize direction string to 'right' or 'left'.
   */
  normalizeDirection(dir) {
    if (!dir) return 'right';
    const s = String(dir).toLowerCase().trim();
    if (s === 'left' || s === 'low' || s === 'down') return 'left';
    return 'right';
  }

  /**
   * Validate disk scheduling inputs.
   */
  validate(inputs) {
    if (!inputs || typeof inputs !== 'object') {
      return { isValid: false, error: 'Input configuration must be an object' };
    }

    // Validate diskSize
    const diskSize = inputs.diskSize !== undefined ? inputs.diskSize : 200;
    if (typeof diskSize !== 'number' || isNaN(diskSize) || diskSize < 2 || !Number.isInteger(diskSize)) {
      return { isValid: false, error: 'Disk size must be an integer >= 2' };
    }

    // Validate initialHead
    if (typeof inputs.initialHead !== 'number' || isNaN(inputs.initialHead) || !Number.isInteger(inputs.initialHead)) {
      return { isValid: false, error: 'Initial head position must be an integer' };
    }
    if (inputs.initialHead < 0 || inputs.initialHead >= diskSize) {
      return { isValid: false, error: `Initial head (${inputs.initialHead}) must be between 0 and diskSize - 1 (${diskSize - 1})` };
    }

    // Validate direction
    if (inputs.direction !== undefined) {
      const dirStr = String(inputs.direction).toLowerCase().trim();
      const validDirs = ['right', 'left', 'high', 'low', 'up', 'down'];
      if (!validDirs.includes(dirStr)) {
        return { isValid: false, error: `Invalid direction "${inputs.direction}". Use "right" or "left"` };
      }
    }

    // Validate requests
    if (!Array.isArray(inputs.requests)) {
      return { isValid: false, error: 'Requests must be an array of cylinder numbers' };
    }

    for (let i = 0; i < inputs.requests.length; i++) {
      const r = inputs.requests[i];
      if (typeof r !== 'number' || isNaN(r) || !Number.isInteger(r)) {
        return { isValid: false, error: `Request at index ${i} must be an integer cylinder number` };
      }
      if (r < 0 || r >= diskSize) {
        return { isValid: false, error: `Request cylinder ${r} at index ${i} is out of bounds (0 to ${diskSize - 1})` };
      }
    }

    return { isValid: true };
  }

  /**
   * Algorithm-specific step generator.
   * To be implemented by FCFS, SSTF, SCAN, C-SCAN, LOOK, C-LOOK.
   * @param {number[]} requests - Array of cylinder requests
   * @param {number} initialHead - Starting cylinder
   * @param {number} diskSize - Number of cylinders (0 to diskSize - 1)
   * @param {"right"|"left"} direction - Initial movement direction
   * @returns {Array<{ targetHead: number, servicedRequest: number|null, stepType: "service"|"boundary"|"wrap", direction: "right"|"left", actionLog: string, educationalNote: string }>}
   */
  computeSequence(requests, initialHead, diskSize, direction) {
    throw new Error(`Method 'computeSequence' must be implemented by ${this.constructor.name}`);
  }

  /**
   * Run the deterministic disk scheduling simulation.
   */
  run(inputs) {
    const validation = this.validate(inputs);
    if (!validation.isValid) {
      throw new Error(validation.error);
    }

    const diskSize = inputs.diskSize !== undefined ? Number(inputs.diskSize) : 200;
    const initialHead = Number(inputs.initialHead);
    const direction = this.normalizeDirection(inputs.direction);
    const requests = inputs.requests.map(Number);

    const snapshots = [];
    const eventsLog = [];
    const serviceOrder = [];
    let pendingRequests = [...requests];
    let servicedRequests = [];
    let currentHead = initialHead;
    let totalMovement = 0;
    let maxIndividualMovement = 0;
    let stepIndex = 0;

    // Snapshot 0: Initial state
    snapshots.push(
      this.createSnapshot({
        stepIndex: stepIndex++,
        timeUnit: 0,
        activeUnit: `Head: ${initialHead}`,
        state: {
          currentHead: initialHead,
          previousHead: initialHead,
          servicedRequest: null,
          stepType: 'initial',
          movement: 0,
          totalMovement: 0,
          pendingRequests: [...pendingRequests],
          servicedRequests: [],
          direction,
          diskSize
        },
        actionLog: `Head starts at cylinder ${initialHead}.`,
        educationalNote: `${this.name} initialized. Direction: ${direction}. Total requests: ${requests.length}.`
      })
    );
    eventsLog.push(`Step 0: Head starts at cylinder ${initialHead}.`);

    // Handle empty requests gracefully
    if (requests.length === 0) {
      return this.formatResult({
        parameters: { initialHead, diskSize, direction, requests },
        snapshots,
        metrics: {
          totalRequests: 0,
          servicedRequests: 0,
          totalMovement: 0,
          averageMovement: 0,
          maxIndividualMovement: 0,
          initialHead,
          finalHead: initialHead,
          diskSize,
          serviceOrder: [],
          direction,
          algorithm: this.name,
          eventsLog
        }
      });
    }

    // Compute trajectory
    const steps = this.computeSequence([...requests], initialHead, diskSize, direction);

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const previousHead = currentHead;
      currentHead = step.targetHead;
      const movement = Math.abs(currentHead - previousHead);
      totalMovement += movement;
      maxIndividualMovement = Math.max(maxIndividualMovement, movement);

      if (step.servicedRequest !== null) {
        serviceOrder.push(step.servicedRequest);
        servicedRequests.push(step.servicedRequest);

        // Remove first matching instance from pendingRequests
        const pIdx = pendingRequests.indexOf(step.servicedRequest);
        if (pIdx !== -1) {
          pendingRequests.splice(pIdx, 1);
        }
      }

      eventsLog.push(`Step ${i + 1}: ${step.actionLog}`);

      snapshots.push(
        this.createSnapshot({
          stepIndex: stepIndex++,
          timeUnit: i + 1,
          activeUnit: step.servicedRequest !== null ? `Req: ${step.servicedRequest}` : `Move: ${currentHead}`,
          state: {
            currentHead,
            previousHead,
            servicedRequest: step.servicedRequest,
            stepType: step.stepType,
            movement,
            totalMovement,
            pendingRequests: [...pendingRequests],
            servicedRequests: [...servicedRequests],
            direction: step.direction,
            diskSize
          },
          actionLog: step.actionLog,
          educationalNote: step.educationalNote
        })
      );
    }

    const totalRequests = requests.length;
    const servicedCount = serviceOrder.length;
    const averageMovement = totalRequests > 0
      ? Math.round((totalMovement / totalRequests) * 100) / 100
      : 0;

    const metrics = {
      totalRequests,
      servicedRequests: servicedCount,
      totalMovement,
      averageMovement,
      maxIndividualMovement,
      initialHead,
      finalHead: currentHead,
      diskSize,
      serviceOrder,
      direction,
      algorithm: this.name,
      eventsLog
    };

    return this.formatResult({
      parameters: { initialHead, diskSize, direction, requests },
      snapshots,
      metrics
    });
  }
}
