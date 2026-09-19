/**
 * User Account Controller
 * Manages user profile retrieval and safe profile updates.
 */

// @desc    Get current user profile
// @route   GET /api/users/me, GET /api/v1/users/me
export async function getProfile(req, res, next) {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({
        success: false,
        error: { code: 'AUTH_UNAUTHORIZED', message: 'Not authorized' },
        message: 'Not authorized'
      });
    }

    res.status(200).json({
      success: true,
      user: {
        id: user._id || user.id,
        name: user.name,
        email: user.email,
        avatar: user.avatar || '',
        preferences: user.preferences,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        lastLoginAt: user.lastLoginAt
      }
    });
  } catch (error) {
    next(error);
  }
}

// @desc    Update current user profile
// @route   PATCH /api/users/me, PATCH /api/v1/users/me
export async function updateProfile(req, res, next) {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({
        success: false,
        error: { code: 'AUTH_UNAUTHORIZED', message: 'Not authorized' },
        message: 'Not authorized'
      });
    }

    const { name, preferences, avatar } = req.body || {};

    // Validate name if provided
    if (name !== undefined) {
      if (typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({
          success: false,
          error: { code: 'USER_INVALID_NAME', message: 'Name cannot be empty' },
          message: 'Name cannot be empty'
        });
      }
      if (name.trim().length > 50) {
        return res.status(400).json({
          success: false,
          error: { code: 'USER_NAME_TOO_LONG', message: 'Name cannot exceed 50 characters' },
          message: 'Name cannot exceed 50 characters'
        });
      }
      user.name = name.trim();
    }

    // Validate avatar if provided
    if (avatar !== undefined) {
      if (typeof avatar !== 'string') {
        return res.status(400).json({
          success: false,
          error: { code: 'USER_INVALID_AVATAR', message: 'Avatar must be a string' },
          message: 'Avatar must be a string'
        });
      }
      user.avatar = avatar.trim();
    }

    // Validate preferences if provided
    if (preferences !== undefined) {
      if (typeof preferences !== 'object' || preferences === null || Array.isArray(preferences)) {
        return res.status(400).json({
          success: false,
          error: { code: 'USER_INVALID_PREFERENCES', message: 'Preferences must be an object' },
          message: 'Preferences must be an object'
        });
      }

      if (preferences.theme !== undefined) {
        if (!['dark', 'light'].includes(preferences.theme)) {
          return res.status(400).json({
            success: false,
            error: { code: 'USER_INVALID_THEME', message: 'Theme must be either "dark" or "light"' },
            message: 'Theme must be either "dark" or "light"'
          });
        }
        user.preferences.theme = preferences.theme;
      }

      if (preferences.defaultSpeed !== undefined) {
        const speed = Number(preferences.defaultSpeed);
        if (isNaN(speed) || speed <= 0) {
          return res.status(400).json({
            success: false,
            error: { code: 'USER_INVALID_SPEED', message: 'Default speed must be a positive number' },
            message: 'Default speed must be a positive number'
          });
        }
        user.preferences.defaultSpeed = speed;
      }

      if (preferences.showEducationalTooltips !== undefined) {
        user.preferences.showEducationalTooltips = Boolean(preferences.showEducationalTooltips);
      }
    }

    await user.save();

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      user: {
        id: user._id || user.id,
        name: user.name,
        email: user.email,
        avatar: user.avatar || '',
        preferences: user.preferences,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        lastLoginAt: user.lastLoginAt
      }
    });
  } catch (error) {
    next(error);
  }
}
