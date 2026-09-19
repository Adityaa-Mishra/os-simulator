import mongoose from 'mongoose';
import SimulationHistory, { VALID_MODULES } from '../models/SimulationHistory.js';

// @desc    Record a completed simulation run in history
// @route   POST /api/history, POST /api/v1/history
export async function recordHistory(req, res, next) {
  try {
    const { module, algorithm, inputs, metrics } = req.body || {};

    if (!module || !VALID_MODULES.includes(module)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_MODULE', message: `Module must be one of: ${VALID_MODULES.join(', ')}` },
        message: `Module must be one of: ${VALID_MODULES.join(', ')}`
      });
    }

    if (!algorithm || typeof algorithm !== 'string' || !algorithm.trim()) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_ALGORITHM', message: 'Algorithm identifier is required' },
        message: 'Algorithm identifier is required'
      });
    }

    if (algorithm.trim().length > 50) {
      return res.status(400).json({
        success: false,
        error: { code: 'ALGORITHM_TOO_LONG', message: 'Algorithm identifier cannot exceed 50 characters' },
        message: 'Algorithm identifier cannot exceed 50 characters'
      });
    }

    if (!inputs || typeof inputs !== 'object' || Array.isArray(inputs)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUTS', message: 'Inputs must be a valid JSON object' },
        message: 'Inputs must be a valid JSON object'
      });
    }

    const inputsStr = JSON.stringify(inputs);
    if (inputsStr.length > 50000) {
      return res.status(400).json({
        success: false,
        error: { code: 'INPUTS_TOO_LARGE', message: 'Inputs payload exceeds 50KB limit' },
        message: 'Inputs payload exceeds 50KB limit'
      });
    }

    if (!metrics || typeof metrics !== 'object' || Array.isArray(metrics)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_METRICS', message: 'Metrics must be a valid JSON object' },
        message: 'Metrics must be a valid JSON object'
      });
    }

    // Strip snapshot traces to prevent database bloat
    const cleanMetrics = { ...metrics };
    delete cleanMetrics.snapshots;
    delete cleanMetrics.trace;
    delete cleanMetrics.ganttChart;

    const metricsStr = JSON.stringify(cleanMetrics);
    if (metricsStr.length > 50000) {
      return res.status(400).json({
        success: false,
        error: { code: 'METRICS_TOO_LARGE', message: 'Metrics payload exceeds 50KB limit' },
        message: 'Metrics payload exceeds 50KB limit'
      });
    }

    const historyRecord = await SimulationHistory.create({
      userId: req.user._id,
      module,
      algorithm: algorithm.trim(),
      inputs,
      metrics: cleanMetrics,
      completedAt: new Date()
    });

    res.status(201).json({
      success: true,
      data: historyRecord
    });
  } catch (error) {
    next(error);
  }
}

// @desc    Get simulation history for authenticated user
// @route   GET /api/history, GET /api/v1/history
export async function getHistory(req, res, next) {
  try {
    const { module, page = 1, limit = 20 } = req.query;

    const query = { userId: req.user._id };
    if (module && VALID_MODULES.includes(module)) {
      query.module = module;
    }

    const parsedPage = Math.max(1, parseInt(page, 10) || 1);
    const parsedLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (parsedPage - 1) * parsedLimit;

    const [history, total] = await Promise.all([
      SimulationHistory.find(query)
        .sort({ completedAt: -1 })
        .skip(skip)
        .limit(parsedLimit),
      SimulationHistory.countDocuments(query)
    ]);

    res.status(200).json({
      success: true,
      count: history.length,
      total,
      page: parsedPage,
      pages: Math.ceil(total / parsedLimit) || 1,
      data: history
    });
  } catch (error) {
    next(error);
  }
}

// @desc    Get a single history record by ID
// @route   GET /api/history/:id, GET /api/v1/history/:id
export async function getHistoryById(req, res, next) {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({
        success: false,
        error: { code: 'HISTORY_NOT_FOUND', message: 'History record not found' },
        message: 'History record not found'
      });
    }

    const record = await SimulationHistory.findOne({ _id: id, userId: req.user._id });
    if (!record) {
      return res.status(404).json({
        success: false,
        error: { code: 'HISTORY_NOT_FOUND', message: 'History record not found' },
        message: 'History record not found'
      });
    }

    res.status(200).json({
      success: true,
      data: record
    });
  } catch (error) {
    next(error);
  }
}

// @desc    Delete a single history record
// @route   DELETE /api/history/:id, DELETE /api/v1/history/:id
export async function deleteHistory(req, res, next) {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({
        success: false,
        error: { code: 'HISTORY_NOT_FOUND', message: 'History record not found' },
        message: 'History record not found'
      });
    }

    const record = await SimulationHistory.findOneAndDelete({ _id: id, userId: req.user._id });
    if (!record) {
      return res.status(404).json({
        success: false,
        error: { code: 'HISTORY_NOT_FOUND', message: 'History record not found' },
        message: 'History record not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'History record deleted successfully'
    });
  } catch (error) {
    next(error);
  }
}

// @desc    Clear all history for authenticated user
// @route   DELETE /api/history, DELETE /api/v1/history
export async function clearHistory(req, res, next) {
  try {
    await SimulationHistory.deleteMany({ userId: req.user._id });

    res.status(200).json({
      success: true,
      message: 'All simulation history cleared'
    });
  } catch (error) {
    next(error);
  }
}
