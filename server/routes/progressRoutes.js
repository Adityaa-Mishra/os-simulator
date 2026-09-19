import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import {
  getProgress,
  getModuleProgress,
  updateModuleProgress,
  recordActivity
} from '../controllers/progressController.js';

const router = express.Router();

router.route('/')
  .get(protect, getProgress);

router.route('/:module')
  .get(protect, getModuleProgress)
  .patch(protect, updateModuleProgress);

router.route('/:module/activity')
  .post(protect, recordActivity);

export default router;
