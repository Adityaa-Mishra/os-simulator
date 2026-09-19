import mongoose from 'mongoose';
import SavedSimulation, { VALID_MODULES } from '../models/SavedSimulation.js';

// @desc    Save a new simulation configuration
// @route   POST /api/simulations, POST /api/v1/simulations
export async function createSimulation(req, res, next) {
  try {
    const { module, name, description, inputs, tags, presetName } = req.body || {};

    if (!module || !VALID_MODULES.includes(module)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_MODULE', message: `Module must be one of: ${VALID_MODULES.join(', ')}` },
        message: `Module must be one of: ${VALID_MODULES.join(', ')}`
      });
    }

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_NAME', message: 'Simulation name is required' },
        message: 'Simulation name is required'
      });
    }

    if (name.trim().length > 100) {
      return res.status(400).json({
        success: false,
        error: { code: 'NAME_TOO_LONG', message: 'Name cannot exceed 100 characters' },
        message: 'Name cannot exceed 100 characters'
      });
    }

    if (!inputs || typeof inputs !== 'object' || Array.isArray(inputs)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUTS', message: 'Inputs must be a valid JSON object' },
        message: 'Inputs must be a valid JSON object'
      });
    }

    const jsonStr = JSON.stringify(inputs);
    if (jsonStr.length > 50000) {
      return res.status(400).json({
        success: false,
        error: { code: 'INPUTS_TOO_LARGE', message: 'Inputs payload exceeds 50KB limit' },
        message: 'Inputs payload exceeds 50KB limit'
      });
    }

    const simulation = await SavedSimulation.create({
      userId: req.user._id,
      module,
      name: name.trim(),
      description: typeof description === 'string' ? description.trim() : '',
      inputs,
      tags: Array.isArray(tags) ? tags.map(t => String(t).trim()) : [],
      presetName: typeof presetName === 'string' ? presetName.trim() : ''
    });

    res.status(201).json({
      success: true,
      data: simulation
    });
  } catch (error) {
    next(error);
  }
}

// @desc    Get all saved simulations for authenticated user
// @route   GET /api/simulations, GET /api/v1/simulations
export async function getSimulations(req, res, next) {
  try {
    const { module, page = 1, limit = 20 } = req.query;

    const query = { userId: req.user._id };
    if (module && VALID_MODULES.includes(module)) {
      query.module = module;
    }

    const parsedPage = Math.max(1, parseInt(page, 10) || 1);
    const parsedLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (parsedPage - 1) * parsedLimit;

    const [simulations, total] = await Promise.all([
      SavedSimulation.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parsedLimit),
      SavedSimulation.countDocuments(query)
    ]);

    res.status(200).json({
      success: true,
      count: simulations.length,
      total,
      page: parsedPage,
      pages: Math.ceil(total / parsedLimit) || 1,
      data: simulations
    });
  } catch (error) {
    next(error);
  }
}

// @desc    Get a single saved simulation by ID
// @route   GET /api/simulations/:id, GET /api/v1/simulations/:id
export async function getSimulationById(req, res, next) {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({
        success: false,
        error: { code: 'SIMULATION_NOT_FOUND', message: 'Saved simulation not found' },
        message: 'Saved simulation not found'
      });
    }

    // Strict ownership enforcement
    const simulation = await SavedSimulation.findOne({ _id: id, userId: req.user._id });
    if (!simulation) {
      return res.status(404).json({
        success: false,
        error: { code: 'SIMULATION_NOT_FOUND', message: 'Saved simulation not found' },
        message: 'Saved simulation not found'
      });
    }

    res.status(200).json({
      success: true,
      data: simulation
    });
  } catch (error) {
    next(error);
  }
}

// @desc    Update a saved simulation
// @route   PATCH /api/simulations/:id, PATCH /api/v1/simulations/:id
export async function updateSimulation(req, res, next) {
  try {
    const { id } = req.params;
    const { name, description, inputs, tags, presetName } = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({
        success: false,
        error: { code: 'SIMULATION_NOT_FOUND', message: 'Saved simulation not found' },
        message: 'Saved simulation not found'
      });
    }

    const simulation = await SavedSimulation.findOne({ _id: id, userId: req.user._id });
    if (!simulation) {
      return res.status(404).json({
        success: false,
        error: { code: 'SIMULATION_NOT_FOUND', message: 'Saved simulation not found' },
        message: 'Saved simulation not found'
      });
    }

    if (name !== undefined) {
      if (typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_NAME', message: 'Name cannot be empty' },
          message: 'Name cannot be empty'
        });
      }
      if (name.trim().length > 100) {
        return res.status(400).json({
          success: false,
          error: { code: 'NAME_TOO_LONG', message: 'Name cannot exceed 100 characters' },
          message: 'Name cannot exceed 100 characters'
        });
      }
      simulation.name = name.trim();
    }

    if (description !== undefined) {
      simulation.description = typeof description === 'string' ? description.trim() : '';
    }

    if (inputs !== undefined) {
      if (!inputs || typeof inputs !== 'object' || Array.isArray(inputs)) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_INPUTS', message: 'Inputs must be a valid JSON object' },
          message: 'Inputs must be a valid JSON object'
        });
      }
      const jsonStr = JSON.stringify(inputs);
      if (jsonStr.length > 50000) {
        return res.status(400).json({
          success: false,
          error: { code: 'INPUTS_TOO_LARGE', message: 'Inputs payload exceeds 50KB limit' },
          message: 'Inputs payload exceeds 50KB limit'
        });
      }
      simulation.inputs = inputs;
    }

    if (tags !== undefined && Array.isArray(tags)) {
      simulation.tags = tags.map(t => String(t).trim());
    }

    if (presetName !== undefined) {
      simulation.presetName = typeof presetName === 'string' ? presetName.trim() : '';
    }

    await simulation.save();

    res.status(200).json({
      success: true,
      data: simulation
    });
  } catch (error) {
    next(error);
  }
}

// @desc    Delete a saved simulation
// @route   DELETE /api/simulations/:id, DELETE /api/v1/simulations/:id
export async function deleteSimulation(req, res, next) {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({
        success: false,
        error: { code: 'SIMULATION_NOT_FOUND', message: 'Saved simulation not found' },
        message: 'Saved simulation not found'
      });
    }

    const simulation = await SavedSimulation.findOneAndDelete({ _id: id, userId: req.user._id });
    if (!simulation) {
      return res.status(404).json({
        success: false,
        error: { code: 'SIMULATION_NOT_FOUND', message: 'Saved simulation not found' },
        message: 'Saved simulation not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Simulation deleted successfully'
    });
  } catch (error) {
    next(error);
  }
}
