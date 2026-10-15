import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';

const isDev = !env.isProduction;

export const loginRateLimitKey = (req: Request) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.toLowerCase() : '';
  return `${ipKeyGenerator(req.ip ?? '')}:${email}`;
};

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  keyGenerator: loginRateLimitKey,
  skip: () => isDev,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req: Request, res: Response, _next: NextFunction) => {
    res.status(429).json({ message: 'Demasiados intentos. Espera 15 minutos.' });
  },
});

export const publicFormLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  skip: () => isDev,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req: Request, res: Response, _next: NextFunction) => {
    res.status(429).json({ message: 'Demasiados envíos. Intenta más tarde.' });
  },
});

export const adminLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 1200,
  skip: () => isDev,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req: Request, res: Response, _next: NextFunction) => {
    res.status(429).json({ message: 'Límite de solicitudes administrativas alcanzado.' });
  },
});
