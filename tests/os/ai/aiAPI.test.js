import { describe, it, expect, beforeEach } from 'vitest';
import { Kernel } from '../../../public/js/os/kernel/Kernel.js';
import { APIContext } from '../../../public/js/os/api/APIContext.js';
import { AIAPI } from '../../../public/js/os/api/AIAPI.js';
import { PackagePermissions } from '../../../public/js/os/packages/PackagePermissions.js';

describe('Phase 26 — AIAPI & Permission Enforcement', () => {
  let kernel;

  beforeEach(() => {
    kernel = new Kernel();
    kernel.boot();
  });

  it('denies all AI operations when ai.query permission is not granted', async () => {
    const context = new APIContext({
      appId: 'unpermitted-app',
      instanceId: 'inst-1',
      pid: 10,
      permissions: [] // Zero permissions
    });

    const api = new AIAPI({ kernel, context });

    await expect(api.query('hello')).rejects.toThrowError(/Permission denied.*ai\.query/);
    expect(() => api.createSession()).toThrowError(/Permission denied.*ai\.query/);
    expect(() => api.getModels()).toThrowError(/Permission denied.*ai\.query/);
    expect(() => api.getUsage()).toThrowError(/Permission denied.*ai\.query/);
  });

  it('allows AI operations when ai.query permission is granted', async () => {
    const context = new APIContext({
      appId: 'permitted-app',
      instanceId: 'inst-1',
      pid: 10,
      permissions: [PackagePermissions.AI_QUERY]
    });

    const api = new AIAPI({ kernel, context });

    // 1. Models
    const models = api.getModels();
    expect(Array.isArray(models)).toBe(true);
    expect(models.length).toBeGreaterThan(0);

    // 2. Query
    const response = await api.query('hello AI');
    expect(response.requestId).toBeDefined();
    expect(response.text).toBeDefined();
    expect(response.finishReason).toBe('stop');

    // 3. Multi-turn Session
    const session = api.createSession({ systemPrompt: 'Be concise' });
    expect(session.id).toBeDefined();
    expect(session.pid).toBe(10);

    const turn1 = await session.send('Say test');
    expect(turn1.text).toBeDefined();

    const history = session.getHistory();
    expect(history.length).toBe(3);

    // 4. Usage strictly for this PID
    const usage = api.getUsage();
    expect(usage.sessionCount).toBe(1);
    expect(usage.totalTokens).toBeGreaterThan(0);

    session.close();
  });

  it('isolates AI usage strictly per process PID', async () => {
    // App A (PID 10)
    const ctxA = new APIContext({
      appId: 'app-a',
      instanceId: 'inst-a',
      pid: 10,
      permissions: [PackagePermissions.AI_QUERY]
    });
    const apiA = new AIAPI({ kernel, context: ctxA });
    const sessA = apiA.createSession();
    await sessA.send('Query from App A');

    // App B (PID 20)
    const ctxB = new APIContext({
      appId: 'app-b',
      instanceId: 'inst-b',
      pid: 20,
      permissions: [PackagePermissions.AI_QUERY]
    });
    const apiB = new AIAPI({ kernel, context: ctxB });
    const sessB = apiB.createSession();
    await sessB.send('Query from App B');

    // Usage for App A should only reflect App A's sessions
    const usageA = apiA.getUsage();
    const usageB = apiB.getUsage();

    expect(usageA.sessionCount).toBe(1);
    expect(usageB.sessionCount).toBe(1);

    sessA.close();
    sessB.close();
  });

  it('does not expose internal kernel or subsystem references through return values', async () => {
    const context = new APIContext({
      appId: 'secure-app',
      instanceId: 'inst-1',
      pid: 10,
      permissions: [PackagePermissions.AI_QUERY]
    });

    const api = new AIAPI({ kernel, context });

    const models = api.getModels();
    expect(models[0].kernel).toBeUndefined();
    expect(models[0].aiCore).toBeUndefined();

    const response = await api.query('hello');
    expect(response.kernel).toBeUndefined();
    expect(response.aiCore).toBeUndefined();

    const session = api.createSession();
    expect(session._kernel).toBeUndefined();
    expect(session._aiCore).toBeUndefined();
    expect(session.kernel).toBeUndefined();

    session.close();
  });

  it('cleans up owned sessions on api.destroy()', () => {
    const context = new APIContext({
      appId: 'destroy-app',
      instanceId: 'inst-1',
      pid: 10,
      permissions: [PackagePermissions.AI_QUERY]
    });

    const api = new AIAPI({ kernel, context });
    const sess1 = api.createSession();
    const sess2 = api.createSession();

    expect(kernel.aiCore.activeSessions.has(sess1.id)).toBe(true);
    expect(kernel.aiCore.activeSessions.has(sess2.id)).toBe(true);

    api.destroy();

    expect(kernel.aiCore.activeSessions.has(sess1.id)).toBe(false);
    expect(kernel.aiCore.activeSessions.has(sess2.id)).toBe(false);
  });
});
