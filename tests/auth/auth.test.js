import { describe, it, expect, vi, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../../server/models/User.js';
import { register, login, logout, getMe } from '../../server/controllers/authController.js';
import { protect } from '../../server/middleware/authMiddleware.js';
import { getProfile, updateProfile } from '../../server/controllers/userController.js';

describe('Phase 8: Authentication & User Accounts (Backend Unit Tests)', () => {
  describe('User Model', () => {
    it('validates that name, email, and password are required', () => {
      const user = new User({});
      const err = user.validateSync();
      expect(err).toBeDefined();
      expect(err.errors.name).toBeDefined();
      expect(err.errors.email).toBeDefined();
      expect(err.errors.password).toBeDefined();
    });

    it('rejects passwords shorter than 8 characters', () => {
      const user = new User({
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        password: 'short'
      });
      const err = user.validateSync();
      expect(err).toBeDefined();
      expect(err.errors.password).toBeDefined();
      expect(err.errors.password.message).toContain('at least 8 characters');
    });

    it('accepts valid passwords of 8 or more characters', () => {
      const user = new User({
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        password: 'securepassword123'
      });
      const err = user.validateSync();
      expect(err?.errors?.password).toBeUndefined();
    });

    it('normalizes email to lowercase and trims whitespace', () => {
      const user = new User({
        name: 'Alan Turing',
        email: '  Alan.Turing@Example.COM  ',
        password: 'password123'
      });
      expect(user.email).toBe('alan.turing@example.com');
    });

    it('rejects invalid email formats', () => {
      const user = new User({
        name: 'Invalid Email',
        email: 'not-an-email',
        password: 'password123'
      });
      const err = user.validateSync();
      expect(err?.errors?.email).toBeDefined();
    });

    it('correctly compares passwords with matchPassword', async () => {
      const plain = 'supersecret123';
      const hash = await bcrypt.hash(plain, 10);
      const user = new User({
        name: 'Test',
        email: 'test@example.com',
        password: hash
      });

      expect(await user.matchPassword(plain)).toBe(true);
      expect(await user.matchPassword('wrongpassword')).toBe(false);
    });

    it('toJSON transform removes password and __v', () => {
      const user = new User({
        name: 'Privacy Test',
        email: 'privacy@example.com',
        password: 'hashedpassword'
      });
      const json = user.toJSON();
      expect(json.password).toBeUndefined();
      expect(json.__v).toBeUndefined();
      expect(json.name).toBe('Privacy Test');
    });
  });

  describe('Auth Controller', () => {
    let mockReq;
    let mockRes;
    let next;

    beforeEach(() => {
      mockReq = { body: {}, cookies: {}, headers: {} };
      mockRes = {
        statusCode: 200,
        cookies: {},
        clearedCookies: [],
        status(code) {
          this.statusCode = code;
          return this;
        },
        json: vi.fn(function (data) {
          this.body = data;
          return this;
        }),
        cookie(name, val, opts) {
          this.cookies[name] = { val, opts };
          return this;
        },
        clearCookie(name, opts) {
          this.clearedCookies.push({ name, opts });
          return this;
        }
      };
      next = vi.fn();
    });

    describe('register', () => {
      it('rejects missing name', async () => {
        mockReq.body = { email: 'test@example.com', password: 'password123' };
        await register(mockReq, mockRes, next);
        expect(mockRes.statusCode).toBe(400);
        expect(mockRes.body.error.code).toBe('AUTH_INVALID_NAME');
      });

      it('rejects invalid email format', async () => {
        mockReq.body = { name: 'Test', email: 'invalid-email', password: 'password123' };
        await register(mockReq, mockRes, next);
        expect(mockRes.statusCode).toBe(400);
        expect(mockRes.body.error.code).toBe('AUTH_INVALID_EMAIL_FORMAT');
      });

      it('rejects passwords shorter than 8 characters', async () => {
        mockReq.body = { name: 'Test', email: 'test@example.com', password: '123' };
        await register(mockReq, mockRes, next);
        expect(mockRes.statusCode).toBe(400);
        expect(mockRes.body.error.code).toBe('AUTH_WEAK_PASSWORD');
      });

      it('rejects registration if email already exists', async () => {
        mockReq.body = { name: 'Existing', email: 'exist@example.com', password: 'password123' };
        vi.spyOn(User, 'findOne').mockResolvedValueOnce({ _id: '123', email: 'exist@example.com' });

        await register(mockReq, mockRes, next);
        expect(mockRes.statusCode).toBe(409);
        expect(mockRes.body.error.code).toBe('AUTH_EMAIL_EXISTS');
      });

      it('successfully registers a user, sets HTTP-only cookie, and returns safe user data', async () => {
        mockReq.body = { name: 'Ada Lovelace', email: 'ada@example.com', password: 'password123' };
        vi.spyOn(User, 'findOne').mockResolvedValueOnce(null);
        vi.spyOn(User, 'create').mockResolvedValueOnce({
          _id: 'user-123',
          name: 'Ada Lovelace',
          email: 'ada@example.com',
          avatar: '',
          preferences: { theme: 'dark', defaultSpeed: 1, showEducationalTooltips: true },
          createdAt: new Date(),
          updatedAt: new Date()
        });

        await register(mockReq, mockRes, next);

        expect(mockRes.statusCode).toBe(201);
        expect(mockRes.body.success).toBe(true);
        expect(mockRes.body.user.name).toBe('Ada Lovelace');
        expect(mockRes.body.user.password).toBeUndefined();
        expect(mockRes.cookies.token).toBeDefined();
        expect(mockRes.cookies.token.opts.httpOnly).toBe(true);
      });
    });

    describe('login', () => {
      it('rejects missing credentials', async () => {
        mockReq.body = { email: '' };
        await login(mockReq, mockRes, next);
        expect(mockRes.statusCode).toBe(400);
        expect(mockRes.body.error.code).toBe('AUTH_MISSING_CREDENTIALS');
      });

      it('rejects invalid email or nonexistent user', async () => {
        mockReq.body = { email: 'unknown@example.com', password: 'password123' };
        vi.spyOn(User, 'findOne').mockReturnValueOnce({
          select: vi.fn().mockResolvedValueOnce(null)
        });

        await login(mockReq, mockRes, next);
        expect(mockRes.statusCode).toBe(401);
        expect(mockRes.body.error.code).toBe('AUTH_INVALID_CREDENTIALS');
      });

      it('rejects wrong password', async () => {
        mockReq.body = { email: 'ada@example.com', password: 'wrongpassword' };
        const mockUser = {
          _id: 'user-123',
          matchPassword: vi.fn().mockResolvedValueOnce(false)
        };
        vi.spyOn(User, 'findOne').mockReturnValueOnce({
          select: vi.fn().mockResolvedValueOnce(mockUser)
        });

        await login(mockReq, mockRes, next);
        expect(mockRes.statusCode).toBe(401);
        expect(mockRes.body.error.code).toBe('AUTH_INVALID_CREDENTIALS');
      });

      it('successfully logs in with valid credentials, sets cookie, updates lastLoginAt', async () => {
        mockReq.body = { email: 'ada@example.com', password: 'correctpassword123' };
        const mockUser = {
          _id: 'user-123',
          name: 'Ada Lovelace',
          email: 'ada@example.com',
          matchPassword: vi.fn().mockResolvedValueOnce(true),
          lastLoginAt: null,
          save: vi.fn().mockResolvedValueOnce(true)
        };
        vi.spyOn(User, 'findOne').mockReturnValueOnce({
          select: vi.fn().mockResolvedValueOnce(mockUser)
        });

        await login(mockReq, mockRes, next);

        expect(mockRes.statusCode).toBe(200);
        expect(mockRes.body.success).toBe(true);
        expect(mockRes.body.user.name).toBe('Ada Lovelace');
        expect(mockRes.cookies.token).toBeDefined();
        expect(mockRes.cookies.token.opts.httpOnly).toBe(true);
        expect(mockUser.lastLoginAt).toBeInstanceOf(Date);
        expect(mockUser.save).toHaveBeenCalled();
      });
    });

    describe('logout', () => {
      it('clears token cookie and returns 200', async () => {
        await logout(mockReq, mockRes);
        expect(mockRes.statusCode).toBe(200);
        expect(mockRes.clearedCookies.length).toBe(1);
        expect(mockRes.clearedCookies[0].name).toBe('token');
        expect(mockRes.clearedCookies[0].opts.httpOnly).toBe(true);
      });
    });

    describe('getMe', () => {
      it('returns 401 if req.user is absent', async () => {
        mockReq.user = null;
        await getMe(mockReq, mockRes, next);
        expect(mockRes.statusCode).toBe(401);
        expect(mockRes.body.error.code).toBe('AUTH_UNAUTHORIZED');
      });

      it('returns authenticated user data when req.user is present', async () => {
        mockReq.user = {
          _id: 'user-123',
          name: 'Ada Lovelace',
          email: 'ada@example.com',
          avatar: '',
          preferences: { theme: 'dark' },
          createdAt: new Date(),
          updatedAt: new Date()
        };
        await getMe(mockReq, mockRes, next);
        expect(mockRes.statusCode).toBe(200);
        expect(mockRes.body.user.name).toBe('Ada Lovelace');
        expect(mockRes.body.user.email).toBe('ada@example.com');
      });
    });
  });

  describe('Auth Middleware (protect)', () => {
    let mockReq;
    let mockRes;
    let next;

    beforeEach(() => {
      mockReq = { cookies: {}, headers: {} };
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
    });

    it('returns 401 if neither cookie nor Bearer token is provided', async () => {
      await protect(mockReq, mockRes, next);
      expect(mockRes.statusCode).toBe(401);
      expect(mockRes.body.error.code).toBe('AUTH_NO_TOKEN');
      expect(next).not.toHaveBeenCalled();
    });

    it('returns 401 if token is invalid or expired', async () => {
      mockReq.cookies = { token: 'invalid.jwt.token' };
      await protect(mockReq, mockRes, next);
      expect(mockRes.statusCode).toBe(401);
      expect(mockRes.body.error.code).toBe('AUTH_INVALID_TOKEN');
      expect(next).not.toHaveBeenCalled();
    });

    it('returns 401 if token is valid but user no longer exists in database', async () => {
      const secret = process.env.JWT_SECRET || 'fallback_dev_secret_key';
      const validToken = jwt.sign({ id: 'ghost-user' }, secret);
      mockReq.cookies = { token: validToken };

      vi.spyOn(User, 'findById').mockReturnValueOnce({
        select: vi.fn().mockResolvedValueOnce(null)
      });

      await protect(mockReq, mockRes, next);
      expect(mockRes.statusCode).toBe(401);
      expect(mockRes.body.error.code).toBe('AUTH_USER_NOT_FOUND');
      expect(next).not.toHaveBeenCalled();
    });

    it('attaches req.user and calls next() when token from cookie is valid', async () => {
      const secret = process.env.JWT_SECRET || 'fallback_dev_secret_key';
      const validToken = jwt.sign({ id: 'user-123' }, secret);
      mockReq.cookies = { token: validToken };

      const mockUser = { _id: 'user-123', name: 'Ada Lovelace' };
      vi.spyOn(User, 'findById').mockReturnValueOnce({
        select: vi.fn().mockResolvedValueOnce(mockUser)
      });

      await protect(mockReq, mockRes, next);
      expect(next).toHaveBeenCalled();
      expect(mockReq.user).toEqual(mockUser);
    });

    it('attaches req.user and calls next() when Bearer token header is valid', async () => {
      const secret = process.env.JWT_SECRET || 'fallback_dev_secret_key';
      const validToken = jwt.sign({ id: 'user-456' }, secret);
      mockReq.headers.authorization = `Bearer ${validToken}`;

      const mockUser = { _id: 'user-456', name: 'Grace Hopper' };
      vi.spyOn(User, 'findById').mockReturnValueOnce({
        select: vi.fn().mockResolvedValueOnce(mockUser)
      });

      await protect(mockReq, mockRes, next);
      expect(next).toHaveBeenCalled();
      expect(mockReq.user).toEqual(mockUser);
    });
  });

  describe('User Controller', () => {
    let mockReq;
    let mockRes;
    let next;

    beforeEach(() => {
      mockReq = { user: null, body: {} };
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
    });

    describe('getProfile', () => {
      it('returns 401 if req.user is absent', async () => {
        await getProfile(mockReq, mockRes, next);
        expect(mockRes.statusCode).toBe(401);
      });

      it('returns safe user profile if req.user is present', async () => {
        mockReq.user = {
          _id: 'user-123',
          name: 'Ada Lovelace',
          email: 'ada@example.com',
          preferences: { theme: 'dark' }
        };
        await getProfile(mockReq, mockRes, next);
        expect(mockRes.statusCode).toBe(200);
        expect(mockRes.body.user.name).toBe('Ada Lovelace');
        expect(mockRes.body.user.email).toBe('ada@example.com');
      });
    });

    describe('updateProfile', () => {
      it('rejects empty name update', async () => {
        mockReq.user = { _id: 'user-123', name: 'Ada', preferences: {} };
        mockReq.body = { name: '   ' };

        await updateProfile(mockReq, mockRes, next);
        expect(mockRes.statusCode).toBe(400);
        expect(mockRes.body.error.code).toBe('USER_INVALID_NAME');
      });

      it('rejects name exceeding 50 characters', async () => {
        mockReq.user = { _id: 'user-123', name: 'Ada', preferences: {} };
        mockReq.body = { name: 'a'.repeat(51) };

        await updateProfile(mockReq, mockRes, next);
        expect(mockRes.statusCode).toBe(400);
        expect(mockRes.body.error.code).toBe('USER_NAME_TOO_LONG');
      });

      it('rejects invalid preferences theme', async () => {
        mockReq.user = { _id: 'user-123', name: 'Ada', preferences: {} };
        mockReq.body = { preferences: { theme: 'neon' } };

        await updateProfile(mockReq, mockRes, next);
        expect(mockRes.statusCode).toBe(400);
        expect(mockRes.body.error.code).toBe('USER_INVALID_THEME');
      });

      it('successfully updates name and preferences, ignoring protected fields', async () => {
        const mockUser = {
          _id: 'user-123',
          name: 'Ada Lovelace',
          email: 'ada@example.com',
          preferences: { theme: 'dark', defaultSpeed: 1 },
          save: vi.fn().mockResolvedValueOnce(true)
        };
        mockReq.user = mockUser;
        mockReq.body = {
          name: 'Countess of Lovelace',
          preferences: { theme: 'light' },
          password: 'hacked_password', // Should be ignored
          role: 'admin' // Should be ignored
        };

        await updateProfile(mockReq, mockRes, next);

        expect(mockRes.statusCode).toBe(200);
        expect(mockUser.name).toBe('Countess of Lovelace');
        expect(mockUser.preferences.theme).toBe('light');
        expect(mockUser.password).toBeUndefined(); // Was not altered
        expect(mockUser.save).toHaveBeenCalled();
        expect(mockRes.body.user.name).toBe('Countess of Lovelace');
      });
    });
  });
});
