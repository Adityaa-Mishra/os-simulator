/**
 * tests/os/apiContext.test.js
 * Unit tests for APIContext, APIError, and APIEvents.
 */

import { describe, it, expect } from 'vitest';
import { APIContext } from '../../public/js/os/api/APIContext.js';
import { APIError } from '../../public/js/os/api/APIError.js';
import { APIEvents } from '../../public/js/os/api/APIEvents.js';

describe('Phase 19: APIContext, APIError & APIEvents', () => {
  describe('APIContext', () => {
    it('creates a valid APIContext with required options', () => {
      const ctx = new APIContext({
        appId: 'test-app',
        instanceId: 'test-app-1',
        pid: 42,
        username: 'aditya',
        permissions: ['fs:read', 'fs:write'],
        cwd: '/home/aditya'
      });

      expect(ctx.appId).toBe('test-app');
      expect(ctx.instanceId).toBe('test-app-1');
      expect(ctx.pid).toBe(42);
      expect(ctx.username).toBe('aditya');
      expect(ctx.permissions).toEqual(['fs:read', 'fs:write']);
      expect(ctx.cwd).toBe('/home/aditya');
    });

    it('applies default values for optional parameters', () => {
      const ctx = new APIContext({
        appId: 'test-app',
        instanceId: 'test-app-1',
        pid: 5
      });

      expect(ctx.username).toBe('user');
      expect(ctx.permissions).toEqual([]);
      expect(ctx.cwd).toBe('/home/user');
    });

    it('rejects invalid or missing appId', () => {
      expect(() => new APIContext({ instanceId: 'inst-1', pid: 1 })).toThrow(TypeError);
      expect(() => new APIContext({ appId: '', instanceId: 'inst-1', pid: 1 })).toThrow(TypeError);
      expect(() => new APIContext({ appId: 123, instanceId: 'inst-1', pid: 1 })).toThrow(TypeError);
    });

    it('rejects invalid or missing instanceId', () => {
      expect(() => new APIContext({ appId: 'app', pid: 1 })).toThrow(TypeError);
      expect(() => new APIContext({ appId: 'app', instanceId: '', pid: 1 })).toThrow(TypeError);
    });

    it('rejects invalid or non-positive pid', () => {
      expect(() => new APIContext({ appId: 'app', instanceId: 'inst-1', pid: 0 })).toThrow(TypeError);
      expect(() => new APIContext({ appId: 'app', instanceId: 'inst-1', pid: -1 })).toThrow(TypeError);
      expect(() => new APIContext({ appId: 'app', instanceId: 'inst-1', pid: '1' })).toThrow(TypeError);
      expect(() => new APIContext({ appId: 'app', instanceId: 'inst-1', pid: NaN })).toThrow(TypeError);
    });

    it('guarantees snapshot safety on getState() and toJSON()', () => {
      const perms = ['read', 'write'];
      const ctx = new APIContext({
        appId: 'app',
        instanceId: 'inst-1',
        pid: 1,
        permissions: perms
      });

      const state = ctx.getState();
      state.permissions.push('execute');
      expect(ctx.permissions).toEqual(['read', 'write']);

      const json = ctx.toJSON();
      expect(json.appId).toBe('app');
      expect(json.pid).toBe(1);
    });
  });

  describe('APIError', () => {
    it('creates structured APIError with code, operation, and appId', () => {
      const err = new APIError({
        code: 'EPERM',
        message: 'Permission denied',
        operation: 'process.getInfo',
        appId: 'app-1'
      });

      expect(err).toBeInstanceOf(Error);
      expect(err.name).toBe('APIError');
      expect(err.code).toBe('EPERM');
      expect(err.message).toBe('Permission denied');
      expect(err.operation).toBe('process.getInfo');
      expect(err.appId).toBe('app-1');

      const json = err.toJSON();
      expect(json.name).toBe('APIError');
      expect(json.code).toBe('EPERM');
      expect(json.operation).toBe('process.getInfo');
    });
  });

  describe('APIEvents', () => {
    it('is frozen and contains expected event constants', () => {
      expect(Object.isFrozen(APIEvents)).toBe(true);
      expect(APIEvents.API_READY).toBe('api:ready');
      expect(APIEvents.APP_SUSPENDED).toBe('app:suspended');
      expect(APIEvents.APP_RESUMED).toBe('app:resumed');
      expect(APIEvents.APP_TERMINATING).toBe('app:terminating');
    });
  });
});
