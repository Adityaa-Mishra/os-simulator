import LearningProgress, { VALID_MODULES } from '../models/LearningProgress.js';

// @desc    Get all learning progress for authenticated user
// @route   GET /api/progress, GET /api/v1/progress
export async function getProgress(req, res, next) {
  try {
    const existing = await LearningProgress.find({ userId: req.user._id });
    const progressMap = new Map(existing.map(p => [p.module, p]));

    // Guarantee all 6 modules are represented
    const progressList = VALID_MODULES.map(mod => {
      if (progressMap.has(mod)) {
        return progressMap.get(mod);
      }
      return {
        userId: req.user._id,
        module: mod,
        completed: false,
        simulationsRun: 0,
        lastVisitedAt: null
      };
    });

    res.status(200).json({
      success: true,
      data: progressList
    });
  } catch (error) {
    next(error);
  }
}

// @desc    Get progress for a specific module
// @route   GET /api/progress/:module, GET /api/v1/progress/:module
export async function getModuleProgress(req, res, next) {
  try {
    const { module } = req.params;

    if (!VALID_MODULES.includes(module)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_MODULE', message: `Module must be one of: ${VALID_MODULES.join(', ')}` },
        message: `Module must be one of: ${VALID_MODULES.join(', ')}`
      });
    }

    let progress = await LearningProgress.findOne({ userId: req.user._id, module });
    if (!progress) {
      progress = {
        userId: req.user._id,
        module,
        completed: false,
        simulationsRun: 0,
        lastVisitedAt: null
      };
    }

    res.status(200).json({
      success: true,
      data: progress
    });
  } catch (error) {
    next(error);
  }
}

// @desc    Update progress for a specific module
// @route   PATCH /api/progress/:module, PATCH /api/v1/progress/:module
export async function updateModuleProgress(req, res, next) {
  try {
    const { module } = req.params;
    const { completed, simulationsRun, incrementSimulations, lastVisitedAt } = req.body || {};

    if (!VALID_MODULES.includes(module)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_MODULE', message: `Module must be one of: ${VALID_MODULES.join(', ')}` },
        message: `Module must be one of: ${VALID_MODULES.join(', ')}`
      });
    }

    let progress = await LearningProgress.findOne({ userId: req.user._id, module });
    if (!progress) {
      progress = new LearningProgress({
        userId: req.user._id,
        module,
        completed: false,
        simulationsRun: 0,
        lastVisitedAt: new Date()
      });
    }

    if (completed !== undefined) {
      progress.completed = Boolean(completed);
    }

    if (simulationsRun !== undefined) {
      const parsed = Number(simulationsRun);
      if (isNaN(parsed) || parsed < 0) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_SIMULATIONS_COUNT', message: 'Simulations run must be a non-negative number' },
          message: 'Simulations run must be a non-negative number'
        });
      }
      progress.simulationsRun = parsed;
    }

    if (incrementSimulations !== undefined) {
      const inc = Number(incrementSimulations);
      if (!isNaN(inc)) {
        progress.simulationsRun = Math.max(0, progress.simulationsRun + inc);
      }
    }

    if (lastVisitedAt !== undefined) {
      progress.lastVisitedAt = new Date(lastVisitedAt);
    } else {
      progress.lastVisitedAt = new Date();
    }

    await progress.save();

    res.status(200).json({
      success: true,
      data: progress
    });
  } catch (error) {
    next(error);
  }
}

// @desc    Record simulation activity for a module (increments count & updates lastVisitedAt)
// @route   POST /api/progress/:module/activity, POST /api/v1/progress/:module/activity
export async function recordActivity(req, res, next) {
  try {
    const { module } = req.params;

    if (!VALID_MODULES.includes(module)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_MODULE', message: `Module must be one of: ${VALID_MODULES.join(', ')}` },
        message: `Module must be one of: ${VALID_MODULES.join(', ')}`
      });
    }

    let progress = await LearningProgress.findOne({ userId: req.user._id, module });
    if (!progress) {
      progress = new LearningProgress({
        userId: req.user._id,
        module,
        completed: false,
        simulationsRun: 1,
        lastVisitedAt: new Date()
      });
    } else {
      progress.simulationsRun += 1;
      progress.lastVisitedAt = new Date();
    }

    await progress.save();

    res.status(200).json({
      success: true,
      data: progress
    });
  } catch (error) {
    next(error);
  }
}
