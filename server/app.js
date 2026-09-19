import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';

import authRoutes from './routes/authRoutes.js';
import userRoutes from './routes/userRoutes.js';
import simulationRoutes from './routes/simulationRoutes.js';
import historyRoutes from './routes/historyRoutes.js';
import progressRoutes from './routes/progressRoutes.js';
import { notFoundHandler, errorHandler } from './middleware/errorMiddleware.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, '..', 'public');

const app = express();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false // Allows inline scripts & Chart.js CDN during development
}));

// Cross-origin resource sharing
app.use(cors({
  origin: process.env.CLIENT_URL || true,
  credentials: true
}));

// Body & cookie parsers (bounded to 1MB to prevent large-payload DoS)
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());

// Serve static frontend assets
app.use(express.static(publicDir));

// API Routes (supporting both /api and /api/v1)
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/simulations', simulationRoutes);
app.use('/api/history', historyRoutes);
app.use('/api/progress', progressRoutes);
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/simulations', simulationRoutes);
app.use('/api/v1/history', historyRoutes);
app.use('/api/v1/progress', progressRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'development'
  });
});

// Fallback to index.html for SPA client-side routing
app.get('*', (req, res, next) => {
  if (req.originalUrl.startsWith('/api')) {
    return next();
  }
  res.sendFile(path.join(publicDir, 'index.html'));
});

// Centralized error handling
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
