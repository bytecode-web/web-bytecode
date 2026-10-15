import express from 'express';
import cors, { type CorsOptionsDelegate } from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import { ZodError } from 'zod';
import { createRequire } from 'node:module';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { env } from './config/env.js';
import { MAX_UPLOAD_MB } from './config/constants.js';
import authRoutes from './routes/auth.js';
import publicRoutes from './routes/public.js';
import adminRoutes from './routes/admin.js';
import webhooksRoutes from './routes/webhooks.js';
import { HttpError } from './utils/httpError.js';
import { adminLimiter } from './middleware/rateLimiters.js';
import crypto from 'node:crypto';

export const app = express();
const allowedCorsOrigins = new Set(env.corsOrigins);
const require = createRequire(import.meta.url);

const corsOptions: CorsOptionsDelegate<Request> = (req, callback) => {
  const origin = req.get('Origin');
  const isAllowed = !origin
    || allowedCorsOrigins.has(origin)
    || origin.startsWith('http://localhost')
    || /^https:\/\/pr\d+\.env\.bytecode\.com\.pe$/.test(origin);

  if (!isAllowed) {
    callback(new Error('CORS origin not allowed.'));
    return;
  }

  callback(null, {
    origin: true,
    credentials: Boolean(origin),
  });
};

const compressionMiddleware = (): RequestHandler => {
  try {
    const compression = require('compression') as () => RequestHandler;
    return compression();
  } catch (error: unknown) {
    return (_req: Request, _res: Response, next: NextFunction) => next();
  }
};

app.set('trust proxy', 1);

// Correlation ID Middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  req.headers['x-correlation-id'] = req.headers['x-correlation-id'] || crypto.randomUUID();
  res.setHeader('x-correlation-id', req.headers['x-correlation-id']);
  next();
});

// Advanced Helmet Config
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "res.cloudinary.com"],
      connectSrc: ["'self'", "https://api.bytecode.com.pe", "https://*.bytecode.com.pe"],
    },
  },
  crossOriginResourcePolicy: { policy: "cross-origin" },
  dnsPrefetchControl: { allow: false },
  frameguard: { action: 'deny' },
  hidePoweredBy: true,
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  ieNoOpen: true,
  noSniff: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  xssFilter: true,
}));

app.use(cors(corsOptions));
app.use(cookieParser());
app.use(compressionMiddleware());
app.use(express.json({
  limit: '1mb',
  verify: (req, _res, buffer) => {
    (req as Request).rawBody = Buffer.from(buffer);
  },
}));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Global Rate Limiter
app.use(
  '/api',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 1500,
    skip: (req: Request) => {
      if (!env.isProduction) return true;
      const path = req.path || '';
      const originalUrl = req.originalUrl || '';
      // Admin routes are governed by dedicated adminLimiter with role checks
      if (path.startsWith('/admin') || originalUrl.startsWith('/api/admin')) return true;
      // CSRF token handshake must not be blocked by global rate limiting
      if (path === '/auth/csrf' || originalUrl.startsWith('/api/auth/csrf')) return true;
      // Healthcheck routes
      if (path === '/health' || originalUrl.startsWith('/api/health')) return true;
      return false;
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req: Request, res: Response) => {
      res.status(429).json({ message: 'Demasiadas solicitudes. Por favor, espere unos minutos.' });
    },
  }),
);

// Structured Request Logging
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (env.isProduction) {
      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        correlationId: req.headers['x-correlation-id'],
        method: req.method,
        url: req.originalUrl,
        status: res.statusCode,
        durationMs: duration,
        ip: req.ip,
      }));
    }
  });
  next();
});

import { pool } from './db/pool.js';

// Healthchecks
app.get('/api/health', async (_req: Request, res: Response) => {
  try {
    await pool.query('SELECT 1');
    res.status(200).json({ status: 'ok', database: 'connected', app_env: env.appEnv });
  } catch {
    res.status(500).json({ status: 'error', database: 'disconnected', app_env: env.appEnv });
  }
});

app.get('/health', async (_req: Request, res: Response) => {
  let dbOk = false;
  try {
    const resDb = await pool.query('SELECT 1');
    if (resDb.rowCount === 1) dbOk = true;
  } catch (error: unknown) {
    dbOk = false;
  }
  
  res.json({ 
    ok: dbOk,
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    env: env.nodeEnv,
    db: dbOk ? 'connected' : 'disconnected'
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/webhooks', webhooksRoutes);
app.use('/api/public', publicRoutes);
app.use('/api', publicRoutes);
app.use('/api/admin', adminLimiter, adminRoutes);

app.use((_req: Request, res: Response) => {
  res.status(404).json({ message: 'Ruta no encontrada.' });
});

// Global Error Handler
app.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
  const correlationId = req.headers['x-correlation-id'];
  
  if (error instanceof ZodError) {
    if (env.isProduction) {
      const fields = [...new Set(error.issues.map((issue) => issue.path.join('.')).filter(Boolean))];
      const errorMsg = error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
      res.status(400).json({
        message: `Datos inválidos. Detalles: ${errorMsg}`,
        error: 'Datos inválidos',
        fields,
        correlationId,
      });
      return;
    }

    res.status(400).json({
      message: 'Datos inválidos.',
      issues: error.issues,
      correlationId,
    });
    return;
  }

  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({ message: `El archivo supera el limite de ${MAX_UPLOAD_MB}MB.`, correlationId });
      return;
    }

    res.status(400).json({ message: 'Archivo adjunto invalido.', correlationId });
    return;
  }

  if (error instanceof HttpError) {
    res.status(error.statusCode).json({ message: error.message, correlationId });
    return;
  }

  // Structured Error Logging
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'error',
    correlationId,
    message: error instanceof Error ? error.message : 'Unknown error',
    stack: error instanceof Error ? error.stack : undefined,
  }));
  
  res.status(500).json({ message: 'Error interno del servidor.', correlationId });
});
