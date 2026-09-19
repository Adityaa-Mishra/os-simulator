/**
 * Bankers Algorithms
 * Pure simulation engines for Banker's Safety and Resource Request Algorithms.
 * Deterministic execution, lowest-index tie-breaking, immutable state snapshots.
 */

import { BaseDeadlockEngine } from './baseDeadlock.js';

export class BankersSafetyEngine extends BaseDeadlockEngine {
  constructor() {
    super('deadlock_bankers_safety', "Banker's Safety Algorithm");
  }

  run(inputs) {
    const validation = this.validate(inputs);
    if (!validation.isValid) {
      throw new Error(validation.error);
    }

    const processes = [...inputs.processes];
    const numProcesses = processes.length;
    const numResources = inputs.available.length;

    // Deep clone input structures to preserve original state
    const available = [...inputs.available];
    const max = inputs.max.map(row => [...row]);
    const allocation = inputs.allocation.map(row => [...row]);
    const need = this.calculateNeed(max, allocation);

    // Banker's Safety state
    const work = [...available];
    const finish = Array(numProcesses).fill(false);
    const safeSequence = [];
    const snapshots = [];
    const eventsLog = [];

    // Snapshot 0: Initial State
    snapshots.push({
      step: 0,
      phase: 'initial',
      work: [...work],
      finish: [...finish],
      safeSequence: [...safeSequence],
      eligibleProcesses: [],
      selectedProcess: null,
      selectedProcessIndex: null,
      allocationReleased: null,
      needChecked: null,
      action: `Initialized Work = Available [${work.join(', ')}]. All processes set to Finish = false.`,
      educationalNote: `Starting with Work = [${work.join(', ')}]. The safety algorithm evaluates which process can finish with currently available resources.`
    });

    let stepCount = 0;
    while (true) {
      stepCount++;

      // Find all unfinished processes where Need[i] <= Work
      const eligible = [];
      for (let i = 0; i < numProcesses; i++) {
        if (!finish[i]) {
          const canAllocate = need[i].every((req, j) => req <= work[j]);
          if (canAllocate) {
            eligible.push(i);
          }
        }
      }

      if (eligible.length === 0) {
        break;
      }

      // Tie-breaking rule: Choose the process with the lowest index
      const selectedIdx = eligible[0];
      const pName = processes[selectedIdx];
      const workBefore = [...work];

      // Mark process as finished and release its allocated resources to Work
      finish[selectedIdx] = true;
      for (let j = 0; j < numResources; j++) {
        work[j] += allocation[selectedIdx][j];
      }
      safeSequence.push(pName);

      const actionText = `Selected ${pName} (Need [${need[selectedIdx].join(', ')}] <= Work [${workBefore.join(', ')}]). Finished, released Allocation [${allocation[selectedIdx].join(', ')}]. New Work: [${work.join(', ')}].`;
      eventsLog.push(actionText);

      snapshots.push({
        step: stepCount,
        phase: 'safety_step',
        workBefore,
        work: [...work],
        finish: [...finish],
        safeSequence: [...safeSequence],
        eligibleProcesses: eligible.map(idx => processes[idx]),
        selectedProcess: pName,
        selectedProcessIndex: selectedIdx,
        allocationReleased: [...allocation[selectedIdx]],
        needChecked: [...need[selectedIdx]],
        action: actionText,
        educationalNote: `Process ${pName} had Need [${need[selectedIdx].join(', ')}] \u2264 Work [${workBefore.join(', ')}]. It completes execution and returns its allocated resources [${allocation[selectedIdx].join(', ')}], increasing Work to [${work.join(', ')}].`
      });
    }

    const isSafe = finish.every(f => f === true);
    const finalAction = isSafe
      ? `System is in a SAFE state! Safe sequence: <${safeSequence.join(', ')}>.`
      : `System is in an UNSAFE state! Deadlock possible. Unfinished processes: ${processes.filter((_, i) => !finish[i]).join(', ')}.`;

    eventsLog.push(finalAction);

    snapshots.push({
      step: stepCount,
      phase: isSafe ? 'safe_complete' : 'unsafe_deadlock',
      work: [...work],
      finish: [...finish],
      safeSequence: [...safeSequence],
      eligibleProcesses: [],
      selectedProcess: null,
      selectedProcessIndex: null,
      allocationReleased: null,
      needChecked: null,
      action: finalAction,
      educationalNote: isSafe
        ? `All processes can safely execute to completion in the order <${safeSequence.join(', ')}> without encountering deadlock.`
        : `No remaining process has Need \u2264 Work. The system cannot guarantee deadlock avoidance and is in an unsafe state.`
    });

    return {
      algorithm: this.algorithmId,
      name: this.name,
      inputs: {
        processes: [...inputs.processes],
        available: [...inputs.available],
        max: inputs.max.map(r => [...r]),
        allocation: inputs.allocation.map(r => [...r]),
        need: need.map(r => [...r])
      },
      safe: isSafe,
      safeSequence: [...safeSequence],
      unfinishedProcesses: processes.filter((_, i) => !finish[i]),
      metrics: {
        safe: isSafe,
        safeSequence: [...safeSequence],
        stepsCompleted: safeSequence.length,
        totalProcesses: numProcesses,
        finalWork: [...work]
      },
      snapshots,
      eventsLog
    };
  }
}

export class BankersRequestEngine extends BaseDeadlockEngine {
  constructor() {
    super('deadlock_bankers_request', "Banker's Resource Request Algorithm");
  }

  validate(inputs) {
    const baseValidation = super.validate(inputs);
    if (!baseValidation.isValid) {
      return baseValidation;
    }

    if (!inputs.request || typeof inputs.request !== 'object') {
      return { isValid: false, error: 'Request object must be provided with process and resources' };
    }

    if (typeof inputs.request.process !== 'string' || !inputs.processes.includes(inputs.request.process)) {
      return { isValid: false, error: `Requesting process "${inputs.request.process}" is not in processes list` };
    }

    if (!Array.isArray(inputs.request.resources) || inputs.request.resources.length !== inputs.available.length) {
      return {
        isValid: false,
        error: `Request resources vector must have length ${inputs.available.length} matching resource count`
      };
    }

    for (let j = 0; j < inputs.request.resources.length; j++) {
      const val = inputs.request.resources[j];
      if (typeof val !== 'number' || isNaN(val) || val < 0 || !Number.isInteger(val)) {
        return { isValid: false, error: `Request resource at index ${j} must be a non-negative integer` };
      }
    }

    return { isValid: true };
  }

  run(inputs) {
    const validation = this.validate(inputs);
    if (!validation.isValid) {
      throw new Error(validation.error);
    }

    const pIdx = inputs.processes.indexOf(inputs.request.process);
    const pName = inputs.request.process;
    const reqVec = [...inputs.request.resources];
    const available = [...inputs.available];
    const max = inputs.max.map(r => [...r]);
    const allocation = inputs.allocation.map(r => [...r]);
    const need = this.calculateNeed(max, allocation);
    const snapshots = [];
    const eventsLog = [];

    // Step 0: Initial request snapshot
    snapshots.push({
      step: 0,
      phase: 'request_start',
      status: 'evaluating',
      process: pName,
      request: [...reqVec],
      need: [...need[pIdx]],
      available: [...available],
      action: `Evaluating request from ${pName}: [${reqVec.join(', ')}].`,
      educationalNote: `Step 1 of Banker's Resource Request Algorithm: Check if Request \u2264 Need.`
    });

    // Step 1: Check Request <= Need
    for (let j = 0; j < reqVec.length; j++) {
      if (reqVec[j] > need[pIdx][j]) {
        const errorReason = `Process ${pName} has exceeded its maximum claim: Request[${j}] (${reqVec[j]}) > Need[${pIdx}][${j}] (${need[pIdx][j]}).`;
        eventsLog.push(errorReason);

        snapshots.push({
          step: 1,
          phase: 'claim_exceeded',
          status: 'error_exceeds_claim',
          process: pName,
          request: [...reqVec],
          need: [...need[pIdx]],
          available: [...available],
          action: `Request REJECTED: ${errorReason}`,
          educationalNote: `Error condition: A process cannot request more resources than its declared maximum claim (Max - Allocation).`
        });

        return {
          algorithm: this.algorithmId,
          name: this.name,
          inputs: {
            processes: [...inputs.processes],
            available: [...inputs.available],
            max: inputs.max.map(r => [...r]),
            allocation: inputs.allocation.map(r => [...r]),
            need: need.map(r => [...r]),
            request: { process: pName, resources: [...reqVec] }
          },
          granted: false,
          status: 'error_exceeds_claim',
          reason: errorReason,
          tentativeState: null,
          safetyResult: null,
          metrics: {
            granted: false,
            status: 'error_exceeds_claim',
            safe: false,
            safeSequence: [],
            process: pName,
            request: [...reqVec]
          },
          snapshots,
          eventsLog
        };
      }
    }

    // Step 2: Check Request <= Available
    for (let j = 0; j < reqVec.length; j++) {
      if (reqVec[j] > available[j]) {
        const waitReason = `Process ${pName} must wait: insufficient resources available (Request[${j}] (${reqVec[j]}) > Available[${j}] (${available[j]})).`;
        eventsLog.push(waitReason);

        snapshots.push({
          step: 1,
          phase: 'insufficient_available',
          status: 'must_wait',
          process: pName,
          request: [...reqVec],
          need: [...need[pIdx]],
          available: [...available],
          action: `Request DENIED (Must Wait): ${waitReason}`,
          educationalNote: `Resources are currently unavailable. The process must wait until other processes release resources.`
        });

        return {
          algorithm: this.algorithmId,
          name: this.name,
          inputs: {
            processes: [...inputs.processes],
            available: [...inputs.available],
            max: inputs.max.map(r => [...r]),
            allocation: inputs.allocation.map(r => [...r]),
            need: need.map(r => [...r]),
            request: { process: pName, resources: [...reqVec] }
          },
          granted: false,
          status: 'must_wait',
          reason: waitReason,
          tentativeState: null,
          safetyResult: null,
          metrics: {
            granted: false,
            status: 'must_wait',
            safe: false,
            safeSequence: [],
            process: pName,
            request: [...reqVec]
          },
          snapshots,
          eventsLog
        };
      }
    }

    // Step 3: Pretend to allocate requested resources (tentative state)
    const tentativeAvailable = available.map((a, j) => a - reqVec[j]);
    const tentativeAllocation = allocation.map((row, i) =>
      i === pIdx ? row.map((a, j) => a + reqVec[j]) : [...row]
    );
    const tentativeNeed = need.map((row, i) =>
      i === pIdx ? row.map((n, j) => n - reqVec[j]) : [...row]
    );

    const tentativeAction = `Tentative allocation applied for ${pName}: Available' = [${tentativeAvailable.join(', ')}], Allocation'[${pName}] = [${tentativeAllocation[pIdx].join(', ')}], Need'[${pName}] = [${tentativeNeed[pIdx].join(', ')}].`;
    eventsLog.push(tentativeAction);

    snapshots.push({
      step: 1,
      phase: 'tentative_allocation',
      status: 'tentative',
      process: pName,
      request: [...reqVec],
      tentativeAvailable: [...tentativeAvailable],
      tentativeAllocation: tentativeAllocation.map(r => [...r]),
      tentativeNeed: tentativeNeed.map(r => [...r]),
      action: tentativeAction,
      educationalNote: `Tentatively modifying system state: Available \u2190 Available - Request, Allocation \u2190 Allocation + Request, Need \u2190 Need - Request. Next: run Safety Algorithm.`
    });

    // Step 4: Run safety algorithm on tentative state
    const safetyEngine = new BankersSafetyEngine();
    const safetyResult = safetyEngine.run({
      processes: inputs.processes,
      available: tentativeAvailable,
      max: inputs.max,
      allocation: tentativeAllocation
    });

    // Map safety snapshots into request snapshots
    safetyResult.snapshots.forEach((sSnap, idx) => {
      snapshots.push({
        step: 2 + idx,
        phase: 'safety_check_' + sSnap.phase,
        status: 'verifying_safety',
        safetyStep: sSnap.step,
        work: sSnap.work ? [...sSnap.work] : null,
        finish: sSnap.finish ? [...sSnap.finish] : null,
        safeSequence: [...sSnap.safeSequence],
        selectedProcess: sSnap.selectedProcess,
        action: `[Safety Check] ${sSnap.action}`,
        educationalNote: sSnap.educationalNote
      });
    });

    const isSafe = safetyResult.safe;
    let finalStatus = '';
    let finalReason = '';

    if (isSafe) {
      finalStatus = 'granted';
      finalReason = `Request GRANTED. Tentative state is safe with safe sequence: <${safetyResult.safeSequence.join(', ')}>.`;
    } else {
      finalStatus = 'denied_unsafe';
      finalReason = `Request DENIED. Granting request leads to an unsafe state (deadlock potential). State reverted.`;
    }

    eventsLog.push(finalReason);

    snapshots.push({
      step: snapshots.length,
      phase: isSafe ? 'request_granted' : 'request_denied_unsafe',
      status: finalStatus,
      process: pName,
      request: [...reqVec],
      safe: isSafe,
      safeSequence: [...safetyResult.safeSequence],
      action: finalReason,
      educationalNote: isSafe
        ? `Because the tentative state leaves the system in a safe state, the resources are safely allocated to ${pName}.`
        : `If allocated, the system would enter an unsafe state where remaining available resources cannot satisfy all processes. The request is denied and the original state is restored.`
    });

    return {
      algorithm: this.algorithmId,
      name: this.name,
      inputs: {
        processes: [...inputs.processes],
        available: [...inputs.available],
        max: inputs.max.map(r => [...r]),
        allocation: inputs.allocation.map(r => [...r]),
        need: need.map(r => [...r]),
        request: { process: pName, resources: [...reqVec] }
      },
      granted: isSafe,
      status: finalStatus,
      reason: finalReason,
      tentativeState: {
        available: tentativeAvailable,
        allocation: tentativeAllocation,
        need: tentativeNeed
      },
      safetyResult,
      metrics: {
        granted: isSafe,
        status: finalStatus,
        safe: isSafe,
        safeSequence: [...safetyResult.safeSequence],
        process: pName,
        request: [...reqVec]
      },
      snapshots,
      eventsLog
    };
  }
}
