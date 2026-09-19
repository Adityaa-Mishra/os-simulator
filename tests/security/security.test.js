import { describe, it, expect, vi, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import User from '../../server/models/User.js';
import SavedSimulation from '../../server/models/SavedSimulation.js';
import SimulationHistory from '../../server/models/SimulationHistory.js';
import LearningProgress from '../../server/models/LearningProgress.js';
import { protect } from '../../server/middleware/authMiddleware.js';
import {
  createSimulation,
  getSimulationById,
  updateSimulation,
  deleteSimulation
} from '../../server/controllers/simulationController.js';
import {
  recordHistory,
  getHistoryById,
  deleteHistory
} from '../../server/controllers/historyController.js';
import { getProfile, updateProfile } from '../../server/controllers/userController.js';
import { escapeHtml } from '../../public/js/utils/sanitize.js';

describe('Phase 11: Security Hardening & Audit Tests', () => {
  describe('Authentication & Authorization Gatekeeping', () => {
    it('blocks unauthenticated requests when no token is present in cookie or header', async () => {
      const req = { cookies: {}, headers: {} };
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };
      const next = vi.fn();

      await protect(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: 'AUTH_NO_TOKEN' })
      }));
      expect(next).not.toHaveBeenCalled();
    });

    it('blocks requests with invalid or forged JWT tokens', async () => {
      const req = {
        cookies: { token: 'invalid.forged.jwt.token' },
        headers: {}
      };
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };
      const next = vi.fn();

      await protect(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: 'AUTH_INVALID_TOKEN' })
      }));
      expect(next).not.toHaveBeenCalled();
    });

    it('blocks requests when the token corresponds to a deleted user', async () => {
      const validToken = jwt.sign({ id: '507f1f77bcf86cd799439011' }, process.env.JWT_SECRET || 'fallback_dev_secret_key');
      vi.spyOn(User, 'findById').mockReturnValue({
        select: vi.fn().mockResolvedValue(null)
      });

      const req = {
        cookies: { token: validToken },
        headers: {}
      };
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };
      const next = vi.fn();

      await protect(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: 'AUTH_USER_NOT_FOUND' })
      }));
    });
  });

  describe('IDOR & Multi-Tenant Cross-User Isolation', () => {
    const userA_id = new mongoose.Types.ObjectId();
    const userB_id = new mongoose.Types.ObjectId();
    const sim_id = new mongoose.Types.ObjectId();
    const history_id = new mongoose.Types.ObjectId();

    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it('prevents User A from viewing User B saved simulation by ID', async () => {
      // User B owns the simulation; User A attempts to access it
      vi.spyOn(SavedSimulation, 'findOne').mockResolvedValue(null);

      const req = {
        params: { id: sim_id.toString() },
        user: { _id: userA_id }
      };
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };
      const next = vi.fn();

      await getSimulationById(req, res, next);

      expect(SavedSimulation.findOne).toHaveBeenCalledWith({
        _id: sim_id.toString(),
        userId: userA_id
      });
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: 'SIMULATION_NOT_FOUND' })
      }));
    });

    it('prevents User A from updating User B saved simulation', async () => {
      vi.spyOn(SavedSimulation, 'findOne').mockResolvedValue(null);

      const req = {
        params: { id: sim_id.toString() },
        body: { name: 'Malicious Overwrite' },
        user: { _id: userA_id }
      };
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };
      const next = vi.fn();

      await updateSimulation(req, res, next);

      expect(SavedSimulation.findOne).toHaveBeenCalledWith({
        _id: sim_id.toString(),
        userId: userA_id
      });
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('prevents User A from deleting User B saved simulation', async () => {
      vi.spyOn(SavedSimulation, 'findOneAndDelete').mockResolvedValue(null);

      const req = {
        params: { id: sim_id.toString() },
        user: { _id: userA_id }
      };
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };
      const next = vi.fn();

      await deleteSimulation(req, res, next);

      expect(SavedSimulation.findOneAndDelete).toHaveBeenCalledWith({
        _id: sim_id.toString(),
        userId: userA_id
      });
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('prevents User A from reading or deleting User B history record', async () => {
      vi.spyOn(SimulationHistory, 'findOne').mockResolvedValue(null);
      vi.spyOn(SimulationHistory, 'findOneAndDelete').mockResolvedValue(null);

      const req = {
        params: { id: history_id.toString() },
        user: { _id: userA_id }
      };
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };
      const next = vi.fn();

      await getHistoryById(req, res, next);
      expect(res.status).toHaveBeenCalledWith(404);

      await deleteHistory(req, res, next);
      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe('Sensitive Data Exposure & Password Exclusion', () => {
    it('excludes password and internal __v from User.toJSON() serialization', () => {
      const user = new User({
        name: 'Grace Hopper',
        email: 'grace@example.com',
        password: 'securePassword123'
      });

      const json = user.toJSON();
      expect(json.password).toBeUndefined();
      expect(json.__v).toBeUndefined();
      expect(json.name).toBe('Grace Hopper');
      expect(json.email).toBe('grace@example.com');
    });

    it('getProfile never returns password or hashes', async () => {
      const req = {
        user: {
          _id: new mongoose.Types.ObjectId(),
          name: 'Ada Lovelace',
          email: 'ada@example.com',
          password: 'hashed_password_should_not_leak',
          preferences: { theme: 'light', defaultSpeed: 1.0 },
          createdAt: new Date(),
          updatedAt: new Date(),
          lastLoginAt: new Date()
        }
      };
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };
      const next = vi.fn();

      await getProfile(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      const data = res.json.mock.calls[0][0];
      expect(data.user.password).toBeUndefined();
      expect(data.user.name).toBe('Ada Lovelace');
      expect(data.user.email).toBe('ada@example.com');
    });
  });

  describe('Profile Field Whitelisting & Privilege Escalation Prevention', () => {
    it('ignores attempts to elevate role, change email, or modify password via updateProfile', async () => {
      const userMock = {
        name: 'Standard User',
        email: 'standard@example.com',
        role: 'user',
        preferences: { theme: 'light', defaultSpeed: 1.0 },
        save: vi.fn().mockResolvedValue(true)
      };

      const req = {
        user: userMock,
        body: {
          name: 'Updated Name',
          role: 'admin', // Attack attempt
          email: 'hacked@example.com', // Attack attempt
          password: 'new_hacked_password', // Attack attempt
          _id: '507f1f77bcf86cd799439099' // Attack attempt
        }
      };
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };
      const next = vi.fn();

      await updateProfile(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(userMock.name).toBe('Updated Name');
      expect(userMock.role).toBe('user'); // Unchanged
      expect(userMock.email).toBe('standard@example.com'); // Unchanged
      expect(userMock.password).toBeUndefined();
      expect(userMock.save).toHaveBeenCalled();
    });

    it('rejects profile update with empty or excessive name length', async () => {
      const userMock = { name: 'Valid Name', save: vi.fn() };
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };
      const next = vi.fn();

      // Empty name
      await updateProfile({ user: userMock, body: { name: '   ' } }, res, next);
      expect(res.status).toHaveBeenCalledWith(400);

      // Excessive length (>50 chars)
      await updateProfile({ user: userMock, body: { name: 'A'.repeat(51) } }, res, next);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('rejects invalid preference values in updateProfile', async () => {
      const userMock = { preferences: { theme: 'light' }, save: vi.fn() };
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };
      const next = vi.fn();

      // Invalid theme
      await updateProfile({ user: userMock, body: { preferences: { theme: 'neon' } } }, res, next);
      expect(res.status).toHaveBeenCalledWith(400);

      // Invalid speed (negative or non-number)
      await updateProfile({ user: userMock, body: { preferences: { defaultSpeed: -5 } } }, res, next);
      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('Input Bounds & Denial-of-Service Payload Limits', () => {
    it('rejects oversized inputs (>50KB) in createSimulation', async () => {
      const req = {
        user: { _id: new mongoose.Types.ObjectId() },
        body: {
          module: 'cpu',
          name: 'Oversized Simulation',
          inputs: { heavyData: 'x'.repeat(51000) }
        }
      };
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };
      const next = vi.fn();

      await createSimulation(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: 'INPUTS_TOO_LARGE' })
      }));
    });

    it('strips heavy trace/snapshot data from history metrics to prevent DB bloat', async () => {
      vi.spyOn(SimulationHistory, 'create').mockImplementation(async (doc) => doc);

      const req = {
        user: { _id: new mongoose.Types.ObjectId() },
        body: {
          module: 'cpu',
          algorithm: 'FCFS',
          inputs: { processes: [] },
          metrics: {
            averageTurnaroundTime: 12.5,
            averageWaitingTime: 4.2,
            snapshots: [{ time: 0, state: 'huge' }], // Should be stripped
            trace: ['step1', 'step2'], // Should be stripped
            ganttChart: [{ p: 'P1' }] // Should be stripped
          }
        }
      };
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };
      const next = vi.fn();

      await recordHistory(req, res, next);

      expect(res.status).toHaveBeenCalledWith(201);
      const savedDoc = res.json.mock.calls[0][0].data;
      expect(savedDoc.metrics.averageTurnaroundTime).toBe(12.5);
      expect(savedDoc.metrics.averageWaitingTime).toBe(4.2);
      expect(savedDoc.metrics.snapshots).toBeUndefined();
      expect(savedDoc.metrics.trace).toBeUndefined();
      expect(savedDoc.metrics.ganttChart).toBeUndefined();
    });
  });

  describe('DOM XSS Safety & Entity Escaping (escapeHtml)', () => {
    it('escapes standard script tags', () => {
      const input = '<script>alert("XSS")</script>';
      const output = escapeHtml(input);
      expect(output).toBe('&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;');
      expect(output).not.toContain('<script>');
    });

    it('escapes image onerror payloads', () => {
      const input = '<img src=x onerror=alert(1) />';
      const output = escapeHtml(input);
      expect(output).toBe('&lt;img src=x onerror=alert(1) /&gt;');
      expect(output).not.toContain('<img');
    });

    it('escapes quotes and ampersands safely', () => {
      const input = `Tom & Jerry said "Hello" and 'Bye'`;
      const output = escapeHtml(input);
      expect(output).toBe('Tom &amp; Jerry said &quot;Hello&quot; and &#39;Bye&#39;');
    });

    it('handles null and undefined gracefully without throwing', () => {
      expect(escapeHtml(null)).toBe('');
      expect(escapeHtml(undefined)).toBe('');
      expect(escapeHtml('')).toBe('');
    });
  });
});
