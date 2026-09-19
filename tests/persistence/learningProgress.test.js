import { describe, it, expect, vi, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import LearningProgress, { VALID_MODULES } from '../../server/models/LearningProgress.js';
import {
  getProgress,
  getModuleProgress,
  updateModuleProgress,
  recordActivity
} from '../../server/controllers/progressController.js';

describe('Phase 9: Learning Progress Backend & Security Tests', () => {
  describe('LearningProgress Model', () => {
    it('validates required fields: userId, module', () => {
      const progress = new LearningProgress({});
      const err = progress.validateSync();
      expect(err).toBeDefined();
      expect(err.errors.userId).toBeDefined();
      expect(err.errors.module).toBeDefined();
    });

    it('rejects negative simulationsRun', () => {
      const progress = new LearningProgress({
        userId: new mongoose.Types.ObjectId(),
        module: 'cpu',
        simulationsRun: -1
      });
      const err = progress.validateSync();
      expect(err?.errors?.simulationsRun).toBeDefined();
    });

    it('defaults completed to false and simulationsRun to 0', () => {
      const progress = new LearningProgress({
        userId: new mongoose.Types.ObjectId(),
        module: 'cpu'
      });
      expect(progress.completed).toBe(false);
      expect(progress.simulationsRun).toBe(0);
      expect(progress.lastVisitedAt).toBeInstanceOf(Date);
    });

    it('toJSON transform removes __v', () => {
      const progress = new LearningProgress({
        userId: new mongoose.Types.ObjectId(),
        module: 'deadlock',
        completed: true
      });
      const json = progress.toJSON();
      expect(json.__v).toBeUndefined();
    });
  });

  describe('Progress Controller', () => {
    let mockReq;
    let mockRes;
    let next;
    const userAId = new mongoose.Types.ObjectId();
    const userBId = new mongoose.Types.ObjectId();

    beforeEach(() => {
      mockReq = {
        user: { _id: userAId },
        body: {},
        params: {},
        query: {}
      };
      mockRes = {
        statusCode: 200,
        status(code) {
          this.statusCode = code;
          return this;
        },
        json: vi.fn(function (data) {
          this.body = data;
          return this;
        })
      };
      next = vi.fn();
      vi.restoreAllMocks();
    });

    describe('getProgress', () => {
      it('returns all 6 modules for authenticated user, providing defaults for unvisited modules', async () => {
        const existingRecord = {
          userId: userAId,
          module: 'cpu',
          completed: true,
          simulationsRun: 3,
          lastVisitedAt: new Date()
        };
        vi.spyOn(LearningProgress, 'find').mockResolvedValueOnce([existingRecord]);

        await getProgress(mockReq, mockRes, next);

        expect(LearningProgress.find).toHaveBeenCalledWith({ userId: userAId });
        expect(mockRes.statusCode).toBe(200);
        expect(mockRes.body.data).toHaveLength(6);

        const cpuProgress = mockRes.body.data.find(p => p.module === 'cpu');
        expect(cpuProgress.completed).toBe(true);
        expect(cpuProgress.simulationsRun).toBe(3);

        const memoryProgress = mockRes.body.data.find(p => p.module === 'memory');
        expect(memoryProgress.completed).toBe(false);
        expect(memoryProgress.simulationsRun).toBe(0);
      });
    });

    describe('getModuleProgress', () => {
      it('rejects invalid module name', async () => {
        mockReq.params.module = 'invalid_topic';
        await getModuleProgress(mockReq, mockRes, next);
        expect(mockRes.statusCode).toBe(400);
        expect(mockRes.body.error.code).toBe('INVALID_MODULE');
      });

      it('returns progress record for user', async () => {
        mockReq.params.module = 'disk';
        const mockProg = { userId: userAId, module: 'disk', simulationsRun: 5, completed: false };
        vi.spyOn(LearningProgress, 'findOne').mockResolvedValueOnce(mockProg);

        await getModuleProgress(mockReq, mockRes, next);

        expect(LearningProgress.findOne).toHaveBeenCalledWith({ userId: userAId, module: 'disk' });
        expect(mockRes.statusCode).toBe(200);
        expect(mockRes.body.data.simulationsRun).toBe(5);
      });
    });

    describe('updateModuleProgress & IDOR Security', () => {
      it('IDOR TEST: updates or creates progress ONLY for authenticated user (cannot touch User B)', async () => {
        mockReq.user._id = userBId; // User B is operating
        mockReq.params.module = 'deadlock';
        mockReq.body = { completed: true };

        const mockProg = {
          userId: userBId,
          module: 'deadlock',
          completed: false,
          save: vi.fn().mockResolvedValueOnce(true)
        };
        vi.spyOn(LearningProgress, 'findOne').mockResolvedValueOnce(mockProg);

        await updateModuleProgress(mockReq, mockRes, next);

        expect(LearningProgress.findOne).toHaveBeenCalledWith({
          userId: userBId, // Scoped to userBId
          module: 'deadlock'
        });
        expect(mockProg.completed).toBe(true);
        expect(mockProg.save).toHaveBeenCalled();
        expect(mockRes.statusCode).toBe(200);
      });

      it('rejects negative simulationsRun in update', async () => {
        mockReq.params.module = 'cpu';
        mockReq.body = { simulationsRun: -5 };
        vi.spyOn(LearningProgress, 'findOne').mockResolvedValueOnce({ userId: userAId, module: 'cpu' });

        await updateModuleProgress(mockReq, mockRes, next);

        expect(mockRes.statusCode).toBe(400);
        expect(mockRes.body.error.code).toBe('INVALID_SIMULATIONS_COUNT');
      });
    });

    describe('recordActivity', () => {
      it('increments simulationsRun by 1 and updates lastVisitedAt', async () => {
        mockReq.params.module = 'filesystem';

        const mockProg = {
          userId: userAId,
          module: 'filesystem',
          simulationsRun: 2,
          lastVisitedAt: null,
          save: vi.fn().mockResolvedValueOnce(true)
        };
        vi.spyOn(LearningProgress, 'findOne').mockResolvedValueOnce(mockProg);

        await recordActivity(mockReq, mockRes, next);

        expect(mockProg.simulationsRun).toBe(3);
        expect(mockProg.lastVisitedAt).toBeInstanceOf(Date);
        expect(mockProg.save).toHaveBeenCalled();
        expect(mockRes.statusCode).toBe(200);
      });
    });
  });
});
