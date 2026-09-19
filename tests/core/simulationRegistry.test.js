import { describe, it, expect, beforeEach } from 'vitest';
import { BaseSimulationEngine } from '../../public/js/core/simulationEngine.js';
import { simulationRegistry } from '../../public/js/core/simulationRegistry.js';

// Mock engine implementing BaseSimulationEngine for testing the contract
class MockCpuEngine extends BaseSimulationEngine {
  constructor() {
    super('cpu', 'mock_fcfs', 'Mock FCFS');
  }

  validate(inputs) {
    if (!inputs || !Array.isArray(inputs.processes)) {
      return { isValid: false, error: 'Processes array required' };
    }
    return { isValid: true };
  }

  run(inputs) {
    const validation = this.validate(inputs);
    if (!validation.isValid) {
      throw new Error(validation.error);
    }

    const snapshots = [
      this.createSnapshot({
        stepIndex: 0,
        timeUnit: 0,
        activeUnit: 'P1',
        state: { running: 'P1' },
        actionLog: 'Started P1',
        educationalNote: 'Initial step'
      })
    ];

    return this.formatResult({
      parameters: { count: inputs.processes.length },
      snapshots,
      metrics: { avgWaitTime: 2.5 }
    });
  }

  getComplexity() {
    return {
      time: 'O(n)',
      space: 'O(n)',
      description: 'Linear mock complexity'
    };
  }
}

describe('Simulation Engine Contract & Registry (Phase 1)', () => {
  beforeEach(() => {
    simulationRegistry.clear();
  });

  it('should not allow direct instantiation of BaseSimulationEngine', () => {
    expect(() => new BaseSimulationEngine('cpu', 'test', 'Test')).toThrow(TypeError);
  });

  it('should register and retrieve a valid simulation engine', () => {
    const mockEngine = new MockCpuEngine();
    simulationRegistry.register(mockEngine);

    const retrieved = simulationRegistry.get('cpu', 'mock_fcfs');
    expect(retrieved).toBe(mockEngine);
    expect(retrieved.name).toBe('Mock FCFS');
    expect(retrieved.moduleType).toBe('cpu');
    expect(retrieved.algorithmId).toBe('mock_fcfs');
  });

  it('should reject registration of objects that do not extend BaseSimulationEngine', () => {
    const invalidEngine = { moduleType: 'cpu', algorithmId: 'fake' };
    expect(() => simulationRegistry.register(invalidEngine)).toThrow();
  });

  it('should list all algorithms registered under a module', () => {
    const mockEngine = new MockCpuEngine();
    simulationRegistry.register(mockEngine);

    const algorithms = simulationRegistry.getAlgorithmsByModule('cpu');
    expect(algorithms).toHaveLength(1);
    expect(algorithms[0].id).toBe('mock_fcfs');
    expect(algorithms[0].name).toBe('Mock FCFS');
  });

  it('should return empty list for unknown modules', () => {
    const algorithms = simulationRegistry.getAlgorithmsByModule('non_existent');
    expect(algorithms).toEqual([]);
  });

  it('should produce deterministic snapshots and formatted results', () => {
    const mockEngine = new MockCpuEngine();
    const result = mockEngine.run({ processes: [{ id: 'P1' }] });

    expect(result.metadata.module).toBe('cpu');
    expect(result.metadata.algorithm).toBe('mock_fcfs');
    expect(result.snapshots).toHaveLength(1);
    expect(result.snapshots[0].activeUnit).toBe('P1');
    expect(result.snapshots[0].actionLog).toBe('Started P1');
    expect(result.metrics.avgWaitTime).toBe(2.5);
  });

  it('should validate inputs correctly', () => {
    const mockEngine = new MockCpuEngine();
    const validCheck = mockEngine.validate({ processes: [] });
    expect(validCheck.isValid).toBe(true);

    const invalidCheck = mockEngine.validate({});
    expect(invalidCheck.isValid).toBe(false);
    expect(invalidCheck.error).toBe('Processes array required');
  });
});
