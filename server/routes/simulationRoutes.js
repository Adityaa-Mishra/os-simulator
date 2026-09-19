import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import {
  createSimulation,
  getSimulations,
  getSimulationById,
  updateSimulation,
  deleteSimulation
} from '../controllers/simulationController.js';

const router = express.Router();

router.route('/')
  .post(protect, createSimulation)
  .get(protect, getSimulations);

router.route('/:id')
  .get(protect, getSimulationById)
  .patch(protect, updateSimulation)
  .delete(protect, deleteSimulation);

export default router;
