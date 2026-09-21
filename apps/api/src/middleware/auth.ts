import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';
import { pool } from '../db/pool.js';
import { HttpError } from '../utils/httpError.js';
import { COOKIE_NAME, COOKIE_SAME_SITE, COOKIE_SECURE } from '../config/constants.js';

export const clearAdminCookie = (res: Response) => {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    sameSite: COOKIE_SAME_SITE,
    secure: env.isProduction,
    path: '/',
  });
  res.clearCookie('bc_csrf', {
    httpOnly: false,
    sameSite: COOKIE_SAME_SITE,
    secure: env.isProduction,
    path: '/',
  });
};

export const requireAdmin = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = req.cookies?.[COOKIE_NAME];
    if (!token) {
      throw new HttpError(401, 'No autenticado.');
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const result = await pool.query(
      `
      SELECT 
        s.id AS session_id,
        s.expires_at,
        u.id, u.email, u.name, u.is_active, u.expires_at AS account_expires_at, u.email_otp_enabled,
        COALESCE(array_agg(DISTINCT r.code) FILTER (WHERE r.code IS NOT NULL), ARRAY[]::varchar[]) as roles,
        COALESCE((
          SELECT array_agg(DISTINCT p.code)
          FROM permissions p
          JOIN role_permissions rp ON p.id = rp.permission_id
          WHERE rp.role_id IN (SELECT role_id FROM admin_user_roles WHERE admin_user_id = u.id)
        ), ARRAY[]::varchar[]) as permissions
      FROM admin_sessions s
      JOIN admin_users u ON s.admin_user_id = u.id
      LEFT JOIN admin_user_roles aur ON u.id = aur.admin_user_id
      LEFT JOIN roles r ON aur.role_id = r.id
      WHERE s.token_hash = $1
        AND s.expires_at > NOW()
        AND s.revoked_at IS NULL
      GROUP BY s.id, u.id
      `,
      [tokenHash],
    );

    if (result.rowCount === 0) {
      clearAdminCookie(res);
      throw new HttpError(401, 'Sesión inválida o expirada.');
    }

    const row = result.rows[0];

    if (!row.is_active) {
      clearAdminCookie(res);
      throw new HttpError(401, 'Usuario inactivo.');
    }

    if (row.account_expires_at && new Date(row.account_expires_at) < new Date()) {
      clearAdminCookie(res);
      throw new HttpError(403, 'Su cuenta ha expirado. Contacte a un administrador.');
    }

    const timeRemaining = new Date(row.expires_at).getTime() - Date.now();
    if (timeRemaining < (45 * 60 * 1000)) {
      pool.query(`UPDATE admin_sessions SET expires_at = NOW() + INTERVAL '1 hour' WHERE id = $1`, [row.session_id]).catch(console.error);
      res.cookie(COOKIE_NAME, token, { httpOnly: true, secure: COOKIE_SECURE, sameSite: COOKIE_SAME_SITE, maxAge: 60 * 60 * 1000, path: '/' });
    }

    req.admin = {
      id: row.id,
      email: row.email,
      name: row.name,
      roles: row.roles,
      permissions: row.permissions,
      email_otp_enabled: row.email_otp_enabled,
    };
    req.sessionId = row.session_id;

    next();
  } catch (error: unknown) {
    next(error instanceof HttpError ? error : new HttpError(401, 'Sesión inválida.'));
  }
};

export const requireRole = (allowedRoles: string[]) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.admin) return next(new HttpError(401, 'No autenticado.'));
    if (req.admin.roles.includes('super_admin')) return next();
    
    const hasRole = req.admin.roles.some((role) => allowedRoles.includes(role));
    if (!hasRole) {
      return next(new HttpError(403, 'Acceso denegado (Rol no autorizado).'));
    }
    next();
  };
};

export const requireSuperAdmin = (req: Request, _res: Response, next: NextFunction) => {
  if (!req.admin) return next(new HttpError(401, 'No autenticado.'));
  if (!req.admin.roles.includes('super_admin')) {
    return next(new HttpError(403, 'Acceso denegado (Super administrador requerido).'));
  }
  next();
};

export const requirePermission = (permissionCode: string) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.admin) return next(new HttpError(401, 'No autenticado.'));
    if (req.admin.roles.includes('super_admin')) return next();
    
    if (!req.admin.permissions?.includes(permissionCode)) {
      return next(new HttpError(403, 'Acceso denegado (Permiso requerido).'));
    }
    next();
  };
};
