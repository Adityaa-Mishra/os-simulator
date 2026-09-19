import { describe, it, expect, vi, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import SavedSimulation, { VALID_MODULES } from '../../server/models/SavedSimulation.js';
import {
  createSimulation,
  getSimulations,
  getSimulationById,
  updateSimulation,
  deleteSimulation
} from '../../server/controllers/simulationController.js';

describe('Phase 9: Saved Simulations Backend & Security Tests', () => {
  describe('SavedSimulation Model', () => {
    it('validates required fields: userId, module, name, inputs', () => {
      const sim = new SavedSimulation({});
      const err = sim.validateSync();
      expect(err).toBeDefined();
      expect(err.errors.userId).toBeDefined();
      expect(err.errors.module).toBeDefined();
      expect(err.errors.name).toBeDefined();
      expect(err.errors.inputs).toBeDefined();
    });

    it('accepts all valid modules and rejects unsupported modules', () => {
      for (const mod of VALID_MODULES) {
        const sim = new SavedSimulation({
          userId: new mongoose.Types.ObjectId(),
          module: mod,
          name: `${mod} sim`,
          inputs: { test: 1 }
        });
        const err = sim.validateSync();
        expect(err?.errors?.module).toBeUndefined();
      }

      const invalidSim = new SavedSimulation({
        userId: new mongoose.Types.ObjectId(),
        module: 'invalid_module',
        name: 'test',
        inputs: { test: 1 }
      });
      const err = invalidSim.validateSync();
      expect(err?.errors?.module).toBeDefined();
    });

    it('rejects names exceeding 100 characters', () => {
      const sim = new SavedSimulation({
        userId: new mongoose.Types.ObjectId(),
        module: 'cpu',
        name: 'a'.repeat(101),
        inputs: { test: 1 }
      });
      const err = sim.validateSync();
      expect(err?.errors?.name).toBeDefined();
    });

    it('rejects oversized inputs (>50KB)', () => {
      const largeInputs = { data: 'x'.repeat(51000) };
      const sim = new SavedSimulation({
        userId: new mongoose.Types.ObjectId(),
        module: 'cpu',
        name: 'Large Input Sim',
        inputs: largeInputs
      });
      const err = sim.validateSync();
      expect(err?.errors?.inputs).toBeDefined();
    });

    it('toJSON transform removes __v', () => {
      const sim = new SavedSimulation({
        userId: new mongoose.Types.ObjectId(),
        module: 'disk',
        name: 'Disk Scan Test',
        inputs: { algorithm: 'scan' }
      });
      const json = sim.toJSON();
      expect(json.__v).toBeUndefined();
      expect(json.name).toBe('Disk Scan Test');
    });
  });

  describe('Simulation Controller', () => {
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

    describe('createSimulation', () => {
      it('rejects invalid or missing module', async () => {
        mockReq.body = { name: 'Test', inputs: { a: 1 } };
        await createSimulation(mockReq, mockRes, next);
        expect(mockRes.statusCode).toBe(400);
        expect(mockRes.body.error.code).toBe('INVALID_MODULE');
      });

      it('rejects missing or empty name', async () => {
        mockReq.body = { module: 'cpu', name: '   ', inputs: { a: 1 } };
        await createSimulation(mockReq, mockRes, next);
        expect(mockRes.statusCode).toBe(400);
        expect(mockRes.body.error.code).toBe('INVALID_NAME');
      });

      it('rejects non-object or array inputs', async () => {
        mockReq.body = { module: 'cpu', name: 'Test', inputs: [1, 2, 3] };
        await createSimulation(mockReq, mockRes, next);
        expect(mockRes.statusCode).toBe(400);
        expect(mockRes.body.error.code).toBe('INVALID_INPUTS');
      });

      it('rejects inputs exceeding 50KB payload limit', async () => {
        mockReq.body = { module: 'cpu', name: 'Test', inputs: { big: 'x'.repeat(51000) } };
        await createSimulation(mockReq, mockRes, next);
        expect(mockRes.statusCode).toBe(400);
        expect(mockRes.body.error.code).toBe('INPUTS_TOO_LARGE');
      });

      it('successfully creates simulation associated with req.user._id (ignores client userId)', async () => {
        const clientSuppliedUserId = new mongoose.Types.ObjectId();
        mockReq.body = {
          userId: clientSuppliedUserId, // Attacker tries to spoof userId
          module: 'cpu',
          name: 'RR Quantum 3',
          description: 'Testing RR',
          inputs: { algorithm: 'roundRobin', quantum: 3 },
          tags: ['cpu', 'test']
        };

        const createdSim = {
          _id: new mongoose.Types.ObjectId(),
          userId: userAId, // Correctly set to authenticated user
          module: 'cpu',
          name: 'RR Quantum 3',
          description: 'Testing RR',
          inputs: { algorithm: 'roundRobin', quantum: 3 },
          tags: ['cpu', 'test']
        };
        vi.spyOn(SavedSimulation, 'create').mockResolvedValueOnce(createdSim);

        await createSimulation(mockReq, mockRes, next);

        expect(SavedSimulation.create).toHaveBeenCalledWith(
          expect.objectContaining({
            userId: userAId, // Must use req.user._id
            module: 'cpu',
            name: 'RR Quantum 3'
          })
        );
        expect(mockRes.statusCode).toBe(201);
        expect(mockRes.body.success).toBe(true);
        expect(mockRes.body.data.userId).toEqual(userAId);
      });
    });

    describe('getSimulations', () => {
      it('queries only simulations owned by authenticated user', async () => {
        mockReq.query = { module: 'memory', page: '1', limit: '10' };

        const mockSims = [
          { _id: new mongoose.Types.ObjectId(), name: 'Best Fit Test', module: 'memory', userId: userAId }
        ];

        const mockFind = {
          sort: vi.fn().mockReturnThis(),
          skip: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValueOnce(mockSims)
        };
        vi.spyOn(SavedSimulation, 'find').mockReturnValueOnce(mockFind);
        vi.spyOn(SavedSimulation, 'countDocuments').mockResolvedValueOnce(1);

        await getSimulations(mockReq, mockRes, next);

        expect(SavedSimulation.find).toHaveBeenCalledWith({ userId: userAId, module: 'memory' });
        expect(mockRes.statusCode).toBe(200);
        expect(mockRes.body.data).toHaveLength(1);
        expect(mockRes.body.total).toBe(1);
        expect(mockRes.body.pages).toBe(1);
      });
    });

    describe('getSimulationById & IDOR Security', () => {
      it('returns 404 for malformed ObjectId', async () => {
        mockReq.params.id = 'not-an-objectid';
        await getSimulationById(mockReq, mockRes, next);
        expect(mockRes.statusCode).toBe(404);
        expect(mockRes.body.error.code).toBe('SIMULATION_NOT_FOUND');
      });

      it('IDOR TEST: prevents User B from viewing User A simulation (returns 404)', async () => {
        const simId = new mongoose.Types.ObjectId();
        mockReq.user._id = userBId; // User B is requesting
        mockReq.params.id = simId.toString();

        // User A's simulation is in database, so querying with userId: userBId yields null
        vi.spyOn(SavedSimulation, 'findOne').mockResolvedValueOnce(null);

        await getSimulationById(mockReq, mockRes, next);

        expect(SavedSimulation.findOne).toHaveBeenCalledWith({
          _id: simId.toString(),
          userId: userBId
        });
        expect(mockRes.statusCode).toBe(404);
        expect(mockRes.body.error.code).toBe('SIMULATION_NOT_FOUND');
      });

      it('returns simulation when owned by authenticated user', async () => {
        const simId = new mongoose.Types.ObjectId();
        mockReq.params.id = simId.toString();

        const mockSim = { _id: simId, userId: userAId, name: 'User A Sim' };
        vi.spyOn(SavedSimulation, 'findOne').mockResolvedValueOnce(mockSim);

        await getSimulationById(mockReq, mockRes, next);

        expect(mockRes.statusCode).toBe(200);
        expect(mockRes.body.data.name).toBe('User A Sim');
      });
    });

    describe('updateSimulation & IDOR Security', () => {
      it('IDOR TEST: prevents User B from updating User A simulation (returns 404)', async () => {
        const simId = new mongoose.Types.ObjectId();
        mockReq.user._id = userBId; // User B attempts update
        mockReq.params.id = simId.toString();
        mockReq.body = { name: 'Hacked Name' };

        vi.spyOn(SavedSimulation, 'findOne').mockResolvedValueOnce(null);

        await updateSimulation(mockReq, mockRes, next);

        expect(SavedSimulation.findOne).toHaveBeenCalledWith({
          _id: simId.toString(),
          userId: userBId
        });
        expect(mockRes.statusCode).toBe(404);
      });

      it('updates allowed fields when owned by user', async () => {
        const simId = new mongoose.Types.ObjectId();
        mockReq.params.id = simId.toString();
        mockReq.body = { name: 'Updated Name', description: 'Updated Desc' };

        const mockSim = {
          _id: simId,
          userId: userAId,
          name: 'Old Name',
          description: 'Old Desc',
          save: vi.fn().mockResolvedValueOnce(true)
        };
        vi.spyOn(SavedSimulation, 'findOne').mockResolvedValueOnce(mockSim);

        await updateSimulation(mockReq, mockRes, next);

        expect(mockSim.name).toBe('Updated Name');
        expect(mockSim.description).toBe('Updated Desc');
        expect(mockSim.save).toHaveBeenCalled();
        expect(mockRes.statusCode).toBe(200);
      });
    });

    describe('deleteSimulation & IDOR Security', () => {
      it('IDOR TEST: prevents User B from deleting User A simulation (returns 404)', async () => {
        const simId = new mongoose.Types.ObjectId();
        mockReq.user._id = userBId; // User B attempts delete
        mockReq.params.id = simId.toString();

        vi.spyOn(SavedSimulation, 'findOneAndDelete').mockResolvedValueOnce(null);

        await deleteSimulation(mockReq, mockRes, next);

        expect(SavedSimulation.findOneAndDelete).toHaveBeenCalledWith({
          _id: simId.toString(),
          userId: userBId
        });
        expect(mockRes.statusCode).toBe(404);
      });

      it('deletes simulation when owned by user', async () => {
        const simId = new mongoose.Types.ObjectId();
        mockReq.params.id = simId.toString();

        vi.spyOn(SavedSimulation, 'findOneAndDelete').mockResolvedValueOnce({ _id: simId, userId: userAId });

        await deleteSimulation(mockReq, mockRes, next);

        expect(mockRes.statusCode).toBe(200);
        expect(mockRes.body.message).toContain('deleted successfully');
      });
    });
  });
});
