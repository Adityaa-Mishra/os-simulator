import { describe, it, expect, vi, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import SimulationHistory, { VALID_MODULES } from '../../server/models/SimulationHistory.js';
import {
  recordHistory,
  getHistory,
  getHistoryById,
  deleteHistory,
  clearHistory
} from '../../server/controllers/historyController.js';

describe('Phase 9: Simulation History Backend & Security Tests', () => {
  describe('SimulationHistory Model', () => {
    it('validates required fields: userId, module, algorithm, inputs, metrics', () => {
      const history = new SimulationHistory({});
      const err = history.validateSync();
      expect(err).toBeDefined();
      expect(err.errors.userId).toBeDefined();
      expect(err.errors.module).toBeDefined();
      expect(err.errors.algorithm).toBeDefined();
      expect(err.errors.inputs).toBeDefined();
      expect(err.errors.metrics).toBeDefined();
    });

    it('rejects metrics containing snapshot traces', () => {
      const historyWithSnapshots = new SimulationHistory({
        userId: new mongoose.Types.ObjectId(),
        module: 'cpu',
        algorithm: 'fcfs',
        inputs: { processes: [] },
        metrics: {
          avgTurnaroundTime: 5,
          snapshots: [{ step: 1 }, { step: 2 }] // Should be rejected
        }
      });
      const err = historyWithSnapshots.validateSync();
      expect(err?.errors?.metrics).toBeDefined();
      expect(err.errors.metrics.message).toContain('without snapshot traces');
    });

    it('accepts clean summary metrics', () => {
      const cleanHistory = new SimulationHistory({
        userId: new mongoose.Types.ObjectId(),
        module: 'cpu',
        algorithm: 'fcfs',
        inputs: { processes: [] },
        metrics: {
          avgTurnaroundTime: 5,
          avgWaitingTime: 2,
          throughput: 0.5
        }
      });
      const err = cleanHistory.validateSync();
      expect(err?.errors?.metrics).toBeUndefined();
    });

    it('toJSON transform removes __v', () => {
      const history = new SimulationHistory({
        userId: new mongoose.Types.ObjectId(),
        module: 'disk',
        algorithm: 'sstf',
        inputs: { requests: [10, 20] },
        metrics: { totalHeadMovement: 50 }
      });
      const json = history.toJSON();
      expect(json.__v).toBeUndefined();
    });
  });

  describe('History Controller', () => {
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

    describe('recordHistory', () => {
      it('rejects invalid module', async () => {
        mockReq.body = { module: 'invalid', algorithm: 'fcfs', inputs: {}, metrics: {} };
        await recordHistory(mockReq, mockRes, next);
        expect(mockRes.statusCode).toBe(400);
        expect(mockRes.body.error.code).toBe('INVALID_MODULE');
      });

      it('rejects missing algorithm', async () => {
        mockReq.body = { module: 'cpu', algorithm: '', inputs: {}, metrics: {} };
        await recordHistory(mockReq, mockRes, next);
        expect(mockRes.statusCode).toBe(400);
        expect(mockRes.body.error.code).toBe('INVALID_ALGORITHM');
      });

      it('strips snapshots and trace before creating record', async () => {
        mockReq.body = {
          module: 'cpu',
          algorithm: 'fcfs',
          inputs: { processes: [{ id: 'P1', burstTime: 5 }] },
          metrics: {
            avgTurnaroundTime: 5,
            snapshots: [{ huge: 'trace-array' }],
            trace: [{ step: 1 }]
          }
        };

        const createdRecord = {
          _id: new mongoose.Types.ObjectId(),
          userId: userAId,
          module: 'cpu',
          algorithm: 'fcfs',
          inputs: mockReq.body.inputs,
          metrics: { avgTurnaroundTime: 5 },
          completedAt: new Date()
        };
        vi.spyOn(SimulationHistory, 'create').mockResolvedValueOnce(createdRecord);

        await recordHistory(mockReq, mockRes, next);

        expect(SimulationHistory.create).toHaveBeenCalledWith(
          expect.objectContaining({
            userId: userAId,
            metrics: { avgTurnaroundTime: 5 } // Snapshots and trace stripped!
          })
        );
        expect(mockRes.statusCode).toBe(201);
      });
    });

    describe('getHistory & IDOR Security', () => {
      it('queries only history owned by authenticated user', async () => {
        mockReq.query = { module: 'disk', page: '1', limit: '10' };

        const mockRecords = [
          { _id: new mongoose.Types.ObjectId(), module: 'disk', algorithm: 'sstf', userId: userAId }
        ];

        const mockFind = {
          sort: vi.fn().mockReturnThis(),
          skip: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValueOnce(mockRecords)
        };
        vi.spyOn(SimulationHistory, 'find').mockReturnValueOnce(mockFind);
        vi.spyOn(SimulationHistory, 'countDocuments').mockResolvedValueOnce(1);

        await getHistory(mockReq, mockRes, next);

        expect(SimulationHistory.find).toHaveBeenCalledWith({ userId: userAId, module: 'disk' });
        expect(mockRes.statusCode).toBe(200);
        expect(mockRes.body.data).toHaveLength(1);
      });

      it('IDOR TEST: User B cannot retrieve User A history record (returns 404)', async () => {
        const historyId = new mongoose.Types.ObjectId();
        mockReq.user._id = userBId; // User B is requesting
        mockReq.params.id = historyId.toString();

        vi.spyOn(SimulationHistory, 'findOne').mockResolvedValueOnce(null);

        await getHistoryById(mockReq, mockRes, next);

        expect(SimulationHistory.findOne).toHaveBeenCalledWith({
          _id: historyId.toString(),
          userId: userBId
        });
        expect(mockRes.statusCode).toBe(404);
        expect(mockRes.body.error.code).toBe('HISTORY_NOT_FOUND');
      });
    });

    describe('deleteHistory & clearHistory', () => {
      it('IDOR TEST: User B cannot delete User A history record (returns 404)', async () => {
        const historyId = new mongoose.Types.ObjectId();
        mockReq.user._id = userBId;
        mockReq.params.id = historyId.toString();

        vi.spyOn(SimulationHistory, 'findOneAndDelete').mockResolvedValueOnce(null);

        await deleteHistory(mockReq, mockRes, next);

        expect(SimulationHistory.findOneAndDelete).toHaveBeenCalledWith({
          _id: historyId.toString(),
          userId: userBId
        });
        expect(mockRes.statusCode).toBe(404);
      });

      it('deletes history record when owned by user', async () => {
        const historyId = new mongoose.Types.ObjectId();
        mockReq.params.id = historyId.toString();

        vi.spyOn(SimulationHistory, 'findOneAndDelete').mockResolvedValueOnce({ _id: historyId, userId: userAId });

        await deleteHistory(mockReq, mockRes, next);

        expect(mockRes.statusCode).toBe(200);
        expect(mockRes.body.message).toContain('deleted successfully');
      });

      it('clearHistory removes only authenticated user records', async () => {
        vi.spyOn(SimulationHistory, 'deleteMany').mockResolvedValueOnce({ deletedCount: 5 });

        await clearHistory(mockReq, mockRes, next);

        expect(SimulationHistory.deleteMany).toHaveBeenCalledWith({ userId: userAId });
        expect(mockRes.statusCode).toBe(200);
        expect(mockRes.body.message).toContain('cleared');
      });
    });
  });
});
