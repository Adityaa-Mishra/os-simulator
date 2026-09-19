import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import {
  recordHistory,
  getHistory,
  getHistoryById,
  deleteHistory,
  clearHistory
} from '../controllers/historyController.js';

const router = express.Router();

router.route('/')
  .post(protect, recordHistory)
  .get(protect, getHistory)
  .delete(protect, clearHistory);

router.route('/:id')
  .get(protect, getHistoryById)
  .delete(protect, deleteHistory);

export default router;
