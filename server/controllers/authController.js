import jwt from 'jsonwebtoken';
import User from '../models/User.js';

// Helper to sign JWT token
function generateToken(userId) {
  return jwt.sign(
    { id: userId, userId: userId },
    process.env.JWT_SECRET || 'fallback_dev_secret_key',
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

// Helper to set HTTP-only cookie
function sendTokenCookie(res, token) {
  const isProduction = process.env.NODE_ENV === 'production';
  const cookieOptions = {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'strict' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  };

  res.cookie('token', token, cookieOptions);
}

// @desc    Register a new user
// @route   POST /api/auth/register, POST /api/v1/auth/register
export async function register(req, res, next) {
  try {
    const { name, email, password } = req.body || {};

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({
        success: false,
        error: { code: 'AUTH_INVALID_NAME', message: 'Please provide a valid name' },
        message: 'Please provide a valid name'
      });
    }

    if (!email || typeof email !== 'string' || !email.trim()) {
      return res.status(400).json({
        success: false,
        error: { code: 'AUTH_INVALID_EMAIL', message: 'Please provide an email address' },
        message: 'Please provide an email address'
      });
    }

    const emailRegex = /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/;
    const normalizedEmail = email.trim().toLowerCase();
    if (!emailRegex.test(normalizedEmail)) {
      return res.status(400).json({
        success: false,
        error: { code: 'AUTH_INVALID_EMAIL_FORMAT', message: 'Please provide a valid email format' },
        message: 'Please provide a valid email format'
      });
    }

    if (!password || typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({
        success: false,
        error: { code: 'AUTH_WEAK_PASSWORD', message: 'Password must be at least 8 characters long' },
        message: 'Password must be at least 8 characters long'
      });
    }

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        error: { code: 'AUTH_EMAIL_EXISTS', message: 'A user with this email already exists' },
        message: 'A user with this email already exists'
      });
    }

    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      password
    });

    const token = generateToken(user._id);
    sendTokenCookie(res, token);

    res.status(201).json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        avatar: user.avatar || '',
        preferences: user.preferences,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      }
    });
  } catch (error) {
    next(error);
  }
}

// @desc    Login user & set HTTP-only cookie
// @route   POST /api/auth/login, POST /api/v1/auth/login
export async function login(req, res, next) {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: { code: 'AUTH_MISSING_CREDENTIALS', message: 'Please provide email and password' },
        message: 'Please provide email and password'
      });
    }

    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const user = await User.findOne({ email: normalizedEmail }).select('+password');

    if (!user || !(await user.matchPassword(password))) {
      return res.status(401).json({
        success: false,
        error: { code: 'AUTH_INVALID_CREDENTIALS', message: 'Invalid email or password' },
        message: 'Invalid email or password'
      });
    }

    // Update lastLoginAt
    user.lastLoginAt = new Date();
    await user.save({ validateBeforeSave: false });

    const token = generateToken(user._id);
    sendTokenCookie(res, token);

    res.status(200).json({
      success: true,
      user: {
        id: user._id,
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

// @desc    Logout user & clear cookie
// @route   POST /api/auth/logout, POST /api/v1/auth/logout
export async function logout(req, res) {
  res.clearCookie('token', {
    httpOnly: true,
    sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
    secure: process.env.NODE_ENV === 'production'
  });

  res.status(200).json({
    success: true,
    message: 'Logged out successfully'
  });
}

// @desc    Get currently authenticated user
// @route   GET /api/auth/me, GET /api/v1/auth/me
export async function getMe(req, res, next) {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({
        success: false,
        error: { code: 'AUTH_UNAUTHORIZED', message: 'Not authorized: No session found' },
        message: 'Not authorized: No session found'
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
