import { describe, it, expect, beforeEach } from 'vitest';
import { Kernel } from '../../../public/js/os/kernel/Kernel.js';
import { AICore } from '../../../public/js/os/ai/AICore.js';
import { MockAIProvider } from '../../../public/js/os/ai/MockAIProvider.js';
import { AIContext } from '../../../public/js/os/ai/AIContext.js';

describe('Phase 26 — AICore & MockAIProvider', () => {
  let kernel;
  let aiCore;

  beforeEach(() => {
    kernel = new Kernel();
    kernel.boot();
    aiCore = kernel.aiCore;
  });

  it('initializes with default mock provider and models', () => {
    const providers = aiCore.getProviders();
    expect(providers.length).toBe(1);
    expect(providers[0].id).toBe('mock-local');

    const models = aiCore.getAvailableModels();
    expect(models.length).toBe(2);
    expect(models.some(m => m.id === 'adityya-sim-v1')).toBe(true);
    expect(models.some(m => m.id === 'adityya-fast')).toBe(true);
  });

  it('executes deterministic queries with mock provider', async () => {
    const context = new AIContext({
      appId: 'test-app',
      username: 'tester',
      osVersion: '1.0.0',
      hostname: 'adityya-test'
    });

    const response = await aiCore.query({
      pid: 10,
      prompt: 'Hello AI',
      model: 'adityya-sim-v1',
      context
    });

    expect(response.requestId).toBeDefined();
    expect(response.text).toContain('Hello! I am AdityyaOS AI Core simulator');
    expect(response.model).toBe('adityya-sim-v1');
    expect(response.finishReason).toBe('stop');
    expect(response.usage.promptTokens).toBeGreaterThan(0);
    expect(response.usage.completionTokens).toBeGreaterThan(0);
    expect(response.usage.totalTokens).toBe(response.usage.promptTokens + response.usage.completionTokens);
  });

  it('answers OS information queries using context metadata', async () => {
    const context = new AIContext({
      appId: 'system-monitor',
      username: 'admin',
      osVersion: '2.0.0',
      hostname: 'prod-adityya'
    });

    const response = await aiCore.query({
      pid: 10,
      prompt: 'Tell me about the system and os version',
      context
    });

    expect(response.text).toContain('AdityyaOS Simulator v2.0.0 (prod-adityya) running for user admin');
  });

  it('supports custom rules and canned responses in MockAIProvider', async () => {
    const provider = aiCore.getProvider('mock-local');
    provider.addRule(/weather/i, 'The weather in AdityyaOS is always sunny in memory.');

    const res1 = await aiCore.query({ pid: 10, prompt: 'What is the weather today?' });
    expect(res1.text).toBe('The weather in AdityyaOS is always sunny in memory.');

    provider.setCannedResponse('Global canned override');
    const res2 = await aiCore.query({ pid: 10, prompt: 'Any random question' });
    expect(res2.text).toBe('Global canned override');

    provider.clearRules();
  });

  it('tracks token usage accurately in AICore stats', async () => {
    const initialUsage = aiCore.getUsage();
    expect(initialUsage.totalRequests).toBe(0);
    expect(initialUsage.totalTokensUsed.total).toBe(0);

    await aiCore.query({ pid: 10, prompt: 'First test prompt' });
    await aiCore.query({ pid: 10, prompt: 'Second test prompt' });

    const updatedUsage = aiCore.getUsage();
    expect(updatedUsage.totalRequests).toBe(2);
    expect(updatedUsage.totalTokensUsed.total).toBeGreaterThan(0);
  });

  it('aborts active requests on request.abort() or process termination', async () => {
    const slowProvider = new MockAIProvider({ id: 'slow-mock', delayMs: 50 });
    slowProvider.models = [{ id: 'slow-model', name: 'Slow Model', maxTokens: 1000 }];
    aiCore.registerProvider(slowProvider);

    const queryPromise = aiCore.query({
      pid: 99,
      prompt: 'long running request',
      model: 'slow-model'
    });

    // Abort requests for PID 99
    aiCore.abortProcessRequests(99);

    const response = await queryPromise;
    expect(response.finishReason).toBe('aborted');
  });

  it('synchronizes AI state to kernel.state.ai cleanly', async () => {
    await aiCore.query({ pid: 10, prompt: 'test query' });

    const osState = kernel.getState();
    expect(osState.ai).toBeDefined();
    expect(osState.ai.totalRequests).toBe(1);
    expect(osState.ai.totalTokensUsed.total).toBeGreaterThan(0);
    expect(osState.ai.providers.length).toBe(1);
  });
});
