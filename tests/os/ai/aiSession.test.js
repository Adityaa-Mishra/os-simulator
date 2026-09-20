import { describe, it, expect, beforeEach } from 'vitest';
import { Kernel } from '../../../public/js/os/kernel/Kernel.js';
import { AISession } from '../../../public/js/os/ai/AISession.js';

describe('Phase 26 — AISession & Multi-Turn Conversation', () => {
  let kernel;
  let aiCore;

  beforeEach(() => {
    kernel = new Kernel();
    kernel.boot();
    aiCore = kernel.aiCore;
  });

  it('enforces valid positive PID on session creation', () => {
    expect(() => aiCore.createSession({ pid: null })).toThrow(TypeError);
    expect(() => aiCore.createSession({ pid: -5 })).toThrow(TypeError);

    const session = aiCore.createSession({
      pid: 12,
      model: 'adityya-sim-v1',
      systemPrompt: 'You are a helpful assistant.'
    });

    expect(session.id).toBeDefined();
    expect(session.pid).toBe(12);
    expect(session.model).toBe('adityya-sim-v1');
    expect(session.systemPrompt).toBe('You are a helpful assistant.');
  });

  it('tracks multi-turn message history and accumulates token usage', async () => {
    const session = aiCore.createSession({
      pid: 12,
      model: 'adityya-sim-v1',
      systemPrompt: 'System initialization instruction'
    });

    // Initial history has system prompt
    let history = session.getHistory();
    expect(history.length).toBe(1);
    expect(history[0].role).toBe('system');
    expect(history[0].content).toBe('System initialization instruction');

    // Turn 1
    const res1 = await session.send('Hello there!');
    expect(res1.text).toBeDefined();

    history = session.getHistory();
    expect(history.length).toBe(3); // system, user, assistant
    expect(history[1].role).toBe('user');
    expect(history[1].content).toBe('Hello there!');
    expect(history[2].role).toBe('assistant');
    expect(history[2].content).toBe(res1.text);

    expect(session.tokenUsage.totalTokens).toBeGreaterThan(0);
    const tokensAfterTurn1 = session.tokenUsage.totalTokens;

    // Turn 2
    const res2 = await session.send('How are you today?');
    expect(res2.text).toBeDefined();

    history = session.getHistory();
    expect(history.length).toBe(5); // system, user, assistant, user, assistant
    expect(history[3].role).toBe('user');
    expect(history[4].role).toBe('assistant');

    expect(session.tokenUsage.totalTokens).toBeGreaterThan(tokensAfterTurn1);
  });

  it('clears history while preserving system prompt', async () => {
    const session = aiCore.createSession({
      pid: 12,
      systemPrompt: 'System prompt'
    });

    await session.send('User prompt');
    expect(session.getHistory().length).toBe(3);

    session.clearHistory();
    const history = session.getHistory();
    expect(history.length).toBe(1);
    expect(history[0].role).toBe('system');
  });

  it('disallows sending messages after session is closed', async () => {
    const session = aiCore.createSession({ pid: 12 });
    session.close();
    expect(session.closed).toBe(true);

    await expect(session.send('Hello')).rejects.toThrowError(/ESESSIONCLOSED/);
  });

  it('automatically closes process sessions upon process termination', () => {
    const sess1 = aiCore.createSession({ pid: 50 });
    const sess2 = aiCore.createSession({ pid: 50 });
    const sess3 = aiCore.createSession({ pid: 99 });

    expect(aiCore.activeSessions.has(sess1.id)).toBe(true);
    expect(aiCore.activeSessions.has(sess2.id)).toBe(true);
    expect(aiCore.activeSessions.has(sess3.id)).toBe(true);

    aiCore.abortProcessRequests(50);

    expect(sess1.closed).toBe(true);
    expect(sess2.closed).toBe(true);
    expect(aiCore.activeSessions.has(sess1.id)).toBe(false);
    expect(aiCore.activeSessions.has(sess2.id)).toBe(false);
    // PID 99 untouched
    expect(sess3.closed).toBe(false);
    expect(aiCore.activeSessions.has(sess3.id)).toBe(true);
  });
});
