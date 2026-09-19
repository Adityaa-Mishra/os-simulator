import jwt from 'jsonwebtoken';
import User from '../models/User.js';

export async function protect(req, res, next) {
  let token = req.cookies?.token;

  // Fallback to Bearer token if header is explicitly provided
  if (!token && req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      error: { code: 'AUTH_NO_TOKEN', message: 'Not authorized: No token provided' },
      message: 'Not authorized: No token provided'
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_dev_secret_key');
    const userId = decoded.id || decoded.userId;

    const user = await User.findById(userId).select('-password');
    if (!user) {
      return res.status(401).json({
        success: false,
        error: { code: 'AUTH_USER_NOT_FOUND', message: 'Not authorized: User no longer exists' },
        message: 'Not authorized: User no longer exists'
      });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      error: { code: 'AUTH_INVALID_TOKEN', message: 'Not authorized: Invalid or expired token' },
      message: 'Not authorized: Invalid or expired token'
    });
  }
}
