import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { UAParser } from 'ua-parser-js';
import { env } from '../config/env.js';
import { COOKIE_NAME, COOKIE_SAME_SITE, COOKIE_SECURE } from '../config/constants.js';
import { pool } from '../db/pool.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { HttpError } from '../utils/httpError.js';
import { clearAdminCookie, requireAdmin, requirePermission } from '../middleware/auth.js';
import { loginLimiter } from '../middleware/rateLimiters.js';
import { requireCsrf } from '../middleware/csrf.js';
import { auditService } from '../services/audit.js';

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  timezone: z.string().optional(),
});

// ... (se salta el resto pero necesito reemplazar ambos, así que mejor reemplazo dos veces o uso un nodo js)

router.post(
  '/login',
  loginLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const body = loginSchema.parse(req.body);
    const result = await pool.query(
      `
      SELECT u.id, u.email, u.name, u.password_hash, u.is_verified, u.force_password_change, u.verification_token, u.expires_at, u.failed_login_count, u.locked_until, u.email_otp_enabled,
      COALESCE(array_agg(DISTINCT r.code) FILTER (WHERE r.code IS NOT NULL), ARRAY[]::varchar[]) as roles,
      COALESCE((
        SELECT array_agg(DISTINCT p.code)
        FROM permissions p
        JOIN role_permissions rp ON p.id = rp.permission_id
        WHERE rp.role_id IN (SELECT role_id FROM admin_user_roles WHERE admin_user_id = u.id)
      ), ARRAY[]::varchar[]) as permissions
      FROM admin_users u 
      LEFT JOIN admin_user_roles aur ON u.id = aur.admin_user_id
      LEFT JOIN roles r ON aur.role_id = r.id
      WHERE u.email = $1 AND u.is_active = true AND u.deleted_at IS NULL
      GROUP BY u.id
      `,
      [body.email.toLowerCase()],
    );

    if (result.rowCount === 0) {
      await auditService.logAdminAction({
        action: 'login_failed',
        entityType: 'admin_sessions',
        entity: { email: body.email },
        req
      });
      throw new HttpError(401, 'Credenciales inválidas.');
    }

    const admin = result.rows[0];

    if (admin.expires_at && new Date(admin.expires_at) < new Date()) {
      throw new HttpError(403, 'Su cuenta ha pasado el tiempo de expiración. Contacte a un administrador.');
    }

    if (admin.locked_until && new Date(admin.locked_until) > new Date()) {
      const remainingMinutes = Math.ceil((new Date(admin.locked_until).getTime() - Date.now()) / 60000);
      throw new HttpError(423, `Cuenta bloqueada temporalmente. Intente en ${remainingMinutes} minutos.`);
    }

    const validPassword = await bcrypt.compare(body.password, admin.password_hash);
    if (!validPassword) {
      const newFailedCount = (admin.failed_login_count || 0) + 1;
      let queryStr = 'UPDATE admin_users SET failed_login_count = $1 WHERE id = $2';
      
      if (newFailedCount >= 5) {
         queryStr = "UPDATE admin_users SET failed_login_count = $1, locked_until = NOW() + INTERVAL '15 minutes' WHERE id = $2";
      }
      await pool.query(queryStr, [newFailedCount, admin.id]);

      await auditService.logAdminAction({
        userId: admin.id,
        action: 'login_failed',
        entityType: 'admin_sessions',
        entity: { email: body.email },
        req
      });
      throw new HttpError(401, 'Credenciales inválidas.');
    }

    // Si fue exitoso y tenía intentos fallidos:
    if (admin.failed_login_count > 0 || admin.locked_until) {
      await pool.query('UPDATE admin_users SET failed_login_count = 0, locked_until = NULL WHERE id = $1', [admin.id]);
    }

    // Task 1.2: Check if verified
    if (admin.is_verified === false) {
      let verificationToken = admin.verification_token;
      
      if (!verificationToken) {
        verificationToken = crypto.randomBytes(32).toString('hex');
        await pool.query(
          'UPDATE admin_users SET verification_token = $1, updated_at = now() WHERE id = $2',
          [verificationToken, admin.id]
        );
      }

      const frontendUrl = process.env.FRONTEND_URL || 'https://www.bytecode.com.pe';
      const verifyUrl = `${frontendUrl}/admin/verify-account?token=${verificationToken}`;
      
      const { buildAdminVerification } = await import('../services/emailTemplates.js');
      const emailHtml = buildAdminVerification(admin.name, verifyUrl);

      const { notifyCustomer } = await import('../services/email.js');
      notifyCustomer(admin.email, 'Verificación de Cuenta Administrativa - Bytecode', emailHtml, 'system').catch(console.error);

      return res.status(403).json({
        status: 'error',
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Se ha enviado un correo de verificación.'
      });
    }

    // Task 1.3: Check if forced password change
    if (admin.is_verified === true && admin.force_password_change === true) {
      return res.status(403).json({
        status: 'error',
        code: 'FORCE_PASSWORD_CHANGE',
        message: 'Debe cambiar su contraseña.',
        userId: admin.id
      });
    }

    // Task 1.4: Check Email OTP
    if (admin.email_otp_enabled === true) {
      const otpCode = Math.floor(100000 + Math.random() * 900000).toString(); // 6 digits
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      
      await pool.query(
        'UPDATE admin_users SET login_otp_code = $1, login_otp_expires_at = $2, updated_at = now() WHERE id = $3',
        [otpCode, expiresAt, admin.id]
      );

      import('../services/emailTemplates.js').then(({ buildOtpEmail }) => {
        import('../services/email.js').then(({ notifyCustomer }) => {
          notifyCustomer(admin.email, 'Código de Acceso - Bytecode', buildOtpEmail(admin.name, otpCode), 'system').catch(console.error);
        });
      });

      const tempToken = jwt.sign({ sub: admin.id, type: 'otp_auth' }, env.jwtSecret, { expiresIn: '30m' });

      return res.status(200).json({
        ok: true,
        mfaRequired: true,
        tempToken
      });
    }
    await generateAdminSession(admin, req, res, body.timezone);
  })
);

async function generateAdminSession(admin: any, req: Request, res: Response, providedTimezone?: string) {
  await pool.query('UPDATE admin_users SET last_login_at = now(), updated_at = now() WHERE id = $1', [admin.id]);

  // Phase 1: Secure Session Management
  const plainToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(plainToken).digest('hex');
  
  const forwardedFor = req.headers['x-forwarded-for'];
  const ipAddress = typeof forwardedFor === 'string' ? forwardedFor.split(',')[0].trim() : req.socket.remoteAddress || req.ip;
  const rawUa = req.headers['user-agent'] || '';
  const chPlatform = req.headers['sec-ch-ua-platform'];
  const chPlatformVersion = req.headers['sec-ch-ua-platform-version'];
  const userAgent = JSON.stringify({ raw: rawUa, platform: chPlatform, platformVersion: chPlatformVersion });
  
  const ONE_HOUR_MS = 60 * 60 * 1000;
  const expiresAt = new Date(Date.now() + ONE_HOUR_MS);

  // Phase 2: Device Recognition (Security Alert)
  const deviceCheck = await pool.query(
    `SELECT 1 FROM admin_sessions 
     WHERE admin_user_id = $1 
     AND (ip_address = $2 OR user_agent = $3)
     AND created_at > NOW() - INTERVAL '6 months'
     LIMIT 1`,
    [admin.id, ipAddress, userAgent]
  );
  const isNewDevice = deviceCheck.rowCount === 0;

  // Database Insertion
  await pool.query(
    `
    INSERT INTO admin_sessions (admin_user_id, token_hash, ip_address, user_agent, expires_at)
    VALUES ($1, $2, $3, $4, $5)
    `,
    [admin.id, tokenHash, ipAddress, userAgent, expiresAt]
  );

  // Trigger Email asynchronously
  if (isNewDevice) {
    import('ua-parser-js').then(({ UAParser }) => {
      const parser = new UAParser(rawUa);
      const browserInfo = parser.getBrowser();
      const osInfo = parser.getOS();
      const osName = `${osInfo.name || 'Desconocido'} ${osInfo.version || ''}`.trim();
      const browserName = `${browserInfo.name || 'Desconocido'} ${browserInfo.version || ''}`.trim();
      const resolvedTz = providedTimezone || 'UTC';
      const timeStr = new Date().toLocaleString('es-PE', { timeZone: resolvedTz }) + ` (${resolvedTz})`;
      const frontendUrl = process.env.FRONTEND_URL || 'https://www.bytecode.com.pe';
      const profileUrl = `${frontendUrl}/admin`; 

      import('../services/emailTemplates.js').then(({ buildNewDeviceAlert }) => {
        const emailHtml = buildNewDeviceAlert(admin.name, osName, browserName, ipAddress || 'Desconocida', timeStr, profileUrl);
        import('../services/email.js').then(({ notifyCustomer }) => {
          notifyCustomer(admin.email, 'Alerta de Seguridad - Bytecode', emailHtml, 'system').catch(console.error);
        });
      });
    }).catch(console.error);
  }

  // Secure Cookies
  res.cookie(COOKIE_NAME, plainToken, {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: COOKIE_SAME_SITE,
    maxAge: ONE_HOUR_MS,
    path: '/',
  });
  
  res.cookie('bc_csrf', crypto.randomUUID(), {
    httpOnly: false,
    secure: COOKIE_SECURE,
    sameSite: COOKIE_SAME_SITE,
    maxAge: ONE_HOUR_MS,
    path: '/',
  });

  const publicAdmin = {
    id: admin.id,
    email: admin.email,
    name: admin.name,
    roles: admin.roles,
    permissions: admin.permissions,
  };

  await auditService.logAdminAction({
    userId: admin.id,
    action: 'login',
    entityType: 'admin_sessions',
    entity: publicAdmin,
    req
  });
  res.json({ admin: publicAdmin });
}

router.post('/verify-login-otp', requireCsrf, loginLimiter, asyncHandler(async (req: Request, res: Response) => {
  const schema = z.object({
    tempToken: z.string(),
    otpCode: z.string().length(6),
    timezone: z.string().optional()
  });
  const body = schema.parse(req.body);

  let payload;
  try {
    payload = jwt.verify(body.tempToken, env.jwtSecret) as { sub: string, type: string };
  } catch (err) {
    throw new HttpError(401, 'Sesión expirada o token inválido.');
  }

  if (payload.type !== 'otp_auth') {
    throw new HttpError(401, 'Token de origen inválido.');
  }

  const result = await pool.query(
    `SELECT u.id, u.email, u.name, u.password_hash, u.is_verified, u.force_password_change, u.verification_token, u.expires_at, u.failed_login_count, u.locked_until, u.email_otp_enabled, u.login_otp_code, u.login_otp_expires_at,
      COALESCE(array_agg(DISTINCT r.code) FILTER (WHERE r.code IS NOT NULL), ARRAY[]::varchar[]) as roles,
      COALESCE((
        SELECT array_agg(DISTINCT p.code)
        FROM permissions p
        JOIN role_permissions rp ON p.id = rp.permission_id
        WHERE rp.role_id IN (SELECT role_id FROM admin_user_roles WHERE admin_user_id = u.id)
      ), ARRAY[]::varchar[]) as permissions
     FROM admin_users u 
     LEFT JOIN admin_user_roles aur ON u.id = aur.admin_user_id
     LEFT JOIN roles r ON aur.role_id = r.id
     WHERE u.id = $1 AND u.is_active = true AND u.deleted_at IS NULL
     GROUP BY u.id`,
    [payload.sub]
  );

  if (result.rowCount === 0) {
    throw new HttpError(401, 'Usuario no encontrado.');
  }

  const admin = result.rows[0];

  if (!admin.login_otp_code || admin.login_otp_code !== body.otpCode) {
    throw new HttpError(400, 'El código ingresado es incorrecto.');
  }

  if (new Date() > new Date(admin.login_otp_expires_at)) {
    throw new HttpError(400, 'El código ha expirado. Vuelva a iniciar sesión.');
  }

  // Clear OTP
  await pool.query('UPDATE admin_users SET login_otp_code = NULL, login_otp_expires_at = NULL WHERE id = $1', [admin.id]);

  await generateAdminSession(admin, req, res, body.timezone);
}));

router.post('/resend-otp', requireCsrf, loginLimiter, asyncHandler(async (req: Request, res: Response) => {
  const schema = z.object({
    tempToken: z.string()
  });
  const body = schema.parse(req.body);

  let payload;
  try {
    payload = jwt.verify(body.tempToken, env.jwtSecret) as { sub: string, type: string };
  } catch (err) {
    throw new HttpError(401, 'Sesión expirada o token inválido.');
  }

  if (payload.type !== 'otp_auth') {
    throw new HttpError(401, 'Token de origen inválido.');
  }

  const result = await pool.query('SELECT id, email, name, email_otp_enabled FROM admin_users WHERE id = $1 AND is_active = true AND deleted_at IS NULL', [payload.sub]);
  if (result.rowCount === 0) throw new HttpError(401, 'Usuario no encontrado.');
  const admin = result.rows[0];

  if (!admin.email_otp_enabled) throw new HttpError(400, 'MFA no está activado para este usuario.');

  const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  
  await pool.query(
    'UPDATE admin_users SET login_otp_code = $1, login_otp_expires_at = $2, updated_at = now() WHERE id = $3',
    [otpCode, expiresAt, admin.id]
  );

  import('../services/emailTemplates.js').then(({ buildOtpEmail }) => {
    import('../services/email.js').then(({ notifyCustomer }) => {
      notifyCustomer(admin.email, 'Nuevo Código de Acceso - Bytecode', buildOtpEmail(admin.name, otpCode), 'system').catch(console.error);
    });
  });

  res.json({ ok: true, message: 'Se ha reenviado un nuevo código a tu correo.' });
}));


router.get('/csrf', (req: Request, res: Response) => {
  let token = req.cookies?.bc_csrf;
  if (!token) {
    token = crypto.randomUUID();
    res.cookie('bc_csrf', token, {
      httpOnly: false,
      secure: COOKIE_SECURE,
      sameSite: COOKIE_SAME_SITE,
      maxAge: 60 * 60 * 1000, // 1 Hour
      path: '/',
    });
  }
  return res.status(200).json({ csrfToken: token });
});

router.post('/logout', requireCsrf, requireAdmin, asyncHandler(async (req: Request, res: Response) => {
  if (req.sessionId) {
    await pool.query('UPDATE admin_sessions SET revoked_at = NOW() WHERE id = $1', [req.sessionId]);
  }
  await auditService.logAdminAction({
    userId: req.admin?.id,
    action: 'logout',
    entityType: 'admin_sessions',
    entity: req.admin,
    req
  });
  clearAdminCookie(res);
  res.json({ ok: true });
}));

router.get('/me', requireAdmin, (req: Request, res: Response) => {
  res.json({ admin: req.admin });
});

router.get('/me/sessions', requireAdmin, asyncHandler(async (req: Request, res: Response) => {
  const result = await pool.query(
    `
    SELECT 
      s.*, 
      u.email as user_email, 
      u.name as user_name,
      (array_remove(array_agg(r.code), NULL))[1] as target_role
    FROM admin_sessions s
    JOIN admin_users u ON s.admin_user_id = u.id
    LEFT JOIN admin_user_roles aur ON u.id = aur.admin_user_id
    LEFT JOIN roles r ON aur.role_id = r.id
    WHERE s.revoked_at IS NULL
      AND s.expires_at > NOW()
      AND s.admin_user_id = $1
    GROUP BY s.id, u.id
    ORDER BY s.created_at DESC
    `,
    [req.admin?.id]
  );

  const sessions = result.rows.map((row) => {
    let uaData: { raw: string; platform?: string; platformVersion?: string } = { raw: '' };
    try {
      const parsed = JSON.parse(row.user_agent || '{}');
      if (parsed && typeof parsed === 'object' && 'raw' in parsed) uaData = parsed;
      else uaData = { raw: row.user_agent || '' };
    } catch {
      uaData = { raw: row.user_agent || '' };
    }

    const parser = new UAParser(uaData.raw);
    const browser = parser.getBrowser();
    const os = parser.getOS();
    const device = parser.getDevice();

    const deviceType = device.type || 'desktop';
    let osName = os.name || 'Unknown OS';
    const platformToMatch = uaData.platform || os.name || '';
    if (platformToMatch.includes('Windows')) osName = 'Windows';
    else if (platformToMatch.includes('Android')) osName = 'Android';
    else if (platformToMatch.includes('Mac OS') || platformToMatch.includes('iOS')) {
      osName = platformToMatch.includes('iOS') ? 'iOS' : 'macOS';
    }

    return {
      id: row.id,
      ip_address: row.ip_address,
      deviceType,
      osName,
      browserName: browser.name || 'Unknown Browser',
      created_at: row.created_at,
      expires_at: row.expires_at,
      isCurrentSession: row.id === req.sessionId,
      userName: row.user_name,
      userEmail: row.user_email,
      roleName: row.target_role || 'No Asignado',
      canRevoke: true, // It's their own session
    };
  });

  res.json({ sessions });
}));

router.post('/me/sessions/:sessionId/revoke', requireCsrf, requireAdmin, asyncHandler(async (req: Request, res: Response) => {
  const params = revokeSchema.parse(req.params);

  const sessionResult = await pool.query(
    `SELECT id, admin_user_id FROM admin_sessions WHERE id = $1`,
    [params.sessionId]
  );

  if (sessionResult.rowCount === 0) {
    throw new HttpError(404, 'Sesión no encontrada.');
  }

  if (sessionResult.rows[0].admin_user_id !== req.admin?.id) {
    throw new HttpError(403, 'Privilegios insuficientes. Esta sesión pertenece a otro usuario.');
  }

  await pool.query(`UPDATE admin_sessions SET revoked_at = NOW() WHERE id = $1`, [params.sessionId]);
  await auditService.logAdminAction({ userId: req.admin?.id, action: 'revoke_own_session', entityType: 'admin_sessions', entity: params.sessionId, req });

  res.json({ ok: true, message: 'Sesión revocada exitosamente.' });
}));

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'La contraseña actual es requerida'),
  newPassword: z.string().min(8, 'La nueva contraseña debe tener al menos 8 caracteres')
});

router.post('/me/password', requireCsrf, loginLimiter, requireAdmin, asyncHandler(async (req: Request, res: Response) => {
  const body = changePasswordSchema.parse(req.body);

  const result = await pool.query(
    'SELECT password_hash, email, name FROM admin_users WHERE id = $1 AND is_active = true AND deleted_at IS NULL',
    [req.admin!.id]
  );

  if (result.rowCount === 0) {
    throw new HttpError(401, 'Usuario no válido.');
  }

  const admin = result.rows[0];
  const isValid = await bcrypt.compare(body.currentPassword, admin.password_hash);
  if (!isValid) {
    await auditService.logAdminAction({ userId: req.admin?.id, action: 'change_password_failed', entityType: 'admin_users', entity: req.admin!.id, req });
    throw new HttpError(401, 'La contraseña actual es incorrecta.');
  }

  const newHash = await bcrypt.hash(body.newPassword, 12);
  
  await pool.query(
    'UPDATE admin_users SET password_hash = $1, updated_at = now() WHERE id = $2',
    [newHash, req.admin!.id]
  );

  if (req.sessionId) {
    await pool.query(
      'UPDATE admin_sessions SET revoked_at = now() WHERE admin_user_id = $1 AND id != $2 AND revoked_at IS NULL',
      [req.admin!.id, req.sessionId]
    );
  }

  await auditService.logAdminAction({ userId: req.admin?.id, action: 'change_password', entityType: 'admin_users', entity: req.admin!.id, req });

  import('../services/emailTemplates.js').then(({ buildSimpleEmail }) => {
    import('../services/email.js').then(({ notifyCustomer }) => {
      const emailHtml = buildSimpleEmail(
        admin.name, 
        'Tu contraseña ha sido cambiada', 
        'Te informamos que tu contraseña ha sido actualizada exitosamente. Si no fuiste tú, por favor contacta al administrador del sistema de inmediato.'
      );
      notifyCustomer(admin.email, 'Alerta de Seguridad: Contraseña Actualizada', emailHtml, 'system').catch(console.error);
    });
  });

  res.json({ ok: true, message: 'Contraseña actualizada correctamente. Las demás sesiones han sido cerradas.' });
}));

router.get('/sessions', requireAdmin, requirePermission('admin.seguridad.view'), asyncHandler(async (req: Request, res: Response) => {
  const isSuperAdmin = req.admin?.roles.includes('super_admin');

  const query = `
    SELECT 
      s.*, 
      u.email as user_email, 
      u.name as user_name,
      (array_remove(array_agg(r.code), NULL))[1] as target_role
    FROM admin_sessions s
    JOIN admin_users u ON s.admin_user_id = u.id
    LEFT JOIN admin_user_roles aur ON u.id = aur.admin_user_id
    LEFT JOIN roles r ON aur.role_id = r.id
    WHERE s.revoked_at IS NULL
      AND s.expires_at > NOW()
    GROUP BY s.id, u.id
    ${!isSuperAdmin ? "HAVING (array_remove(array_agg(r.code), NULL))[1] IS DISTINCT FROM 'super_admin' OR s.admin_user_id = $1" : ""}
    ORDER BY s.created_at DESC
  `;
  const queryParams = !isSuperAdmin ? [req.admin?.id] : [];

  const result = await pool.query(query, queryParams);

  const sessions = result.rows.map((row) => {
    let uaData: { raw: string; platform?: string; platformVersion?: string } = { raw: '' };
    try {
      const parsed = JSON.parse(row.user_agent || '{}');
      if (parsed && typeof parsed === 'object' && 'raw' in parsed) {
        uaData = parsed;
      } else {
        uaData = { raw: row.user_agent || '' };
      }
    } catch {
      uaData = { raw: row.user_agent || '' };
    }

    const parser = new UAParser(uaData.raw);
    const browser = parser.getBrowser();
    const os = parser.getOS();
    const device = parser.getDevice();

    const deviceType = device.type || 'desktop';
    
    let osName = os.name || 'Unknown OS';
    const platformToMatch = uaData.platform || os.name || '';
    if (platformToMatch.includes('Windows')) {
      osName = 'Windows';
    } else if (platformToMatch.includes('Android')) {
      osName = 'Android';
    } else if (platformToMatch.includes('Mac OS') || platformToMatch.includes('iOS')) {
      osName = platformToMatch.includes('iOS') ? 'iOS' : 'macOS';
    }

    const browserName = browser.name || 'Unknown Browser';

    return {
      id: row.id,
      ip_address: row.ip_address,
      deviceType,
      osName,
      browserName,
      created_at: row.created_at,
      expires_at: row.expires_at,
      isCurrentSession: row.id === req.sessionId,
      userName: row.user_name,
      userEmail: row.user_email,
      roleName: row.target_role || 'No Asignado',
      canRevoke: isSuperAdmin || row.admin_user_id === req.admin?.id
    };
  });

  res.json({ sessions });
}));

const revokeSchema = z.object({
  sessionId: z.string().uuid(),
});

router.post('/sessions/:sessionId/revoke', requireCsrf, requireAdmin, requirePermission('admin.seguridad.manage'), asyncHandler(async (req: Request, res: Response) => {
  const params = revokeSchema.parse(req.params);

  const sessionResult = await pool.query(
    `
    SELECT s.id, s.admin_user_id, (array_remove(array_agg(r.code), NULL))[1] as target_role
    FROM admin_sessions s
    JOIN admin_users u ON s.admin_user_id = u.id
    LEFT JOIN admin_user_roles aur ON u.id = aur.admin_user_id
    LEFT JOIN roles r ON aur.role_id = r.id
    WHERE s.id = $1
    GROUP BY s.id, s.admin_user_id
    `,
    [params.sessionId]
  );

  if (sessionResult.rowCount === 0) {
    throw new HttpError(404, 'Sesión no encontrada.');
  }

  const targetSession = sessionResult.rows[0];
  const isSelfRevoke = targetSession.admin_user_id === req.admin?.id;
  const isSuperAdmin = req.admin?.roles.includes('super_admin');

  if (!isSelfRevoke && !isSuperAdmin) {
    await auditService.logAdminAction({
      userId: req.admin?.id,
      action: 'intento_no_autorizado',
      entityType: 'admin_sessions',
      entity: params.sessionId,
      req,
      previousState: { attempted_action: 'revoke_session', target_role: targetSession.target_role }
    });
    throw new HttpError(403, 'Privilegios insuficientes. Solo puedes revocar tus propias sesiones desde otros dispositivos, o bien ser Super Admin para revocar accesos a terceros.');
  }

  const result = await pool.query(
    `
    UPDATE admin_sessions
    SET revoked_at = NOW()
    WHERE id = $1
    RETURNING id
    `,
    [params.sessionId]
  );

  await auditService.logAdminAction({ userId: req.admin?.id, action: 'revoke_session', entityType: 'admin_sessions', entity: params.sessionId, req });
  
  res.json({ ok: true, message: 'Sesión revocada exitosamente.' });
}));

const firstPasswordChangeSchema = z.object({
  userId: z.string().uuid(),
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

router.post('/first-password-change', requireCsrf, loginLimiter, asyncHandler(async (req: Request, res: Response) => {
  const body = firstPasswordChangeSchema.parse(req.body);

  const result = await pool.query(
    'SELECT password_hash, force_password_change FROM admin_users WHERE id = $1',
    [body.userId]
  );

  if (result.rowCount === 0) {
    throw new HttpError(404, 'Usuario no encontrado.');
  }

  const user = result.rows[0];

  if (!user.force_password_change) {
    throw new HttpError(400, 'Este usuario no requiere cambio de contraseña obligatorio.');
  }

  const validPassword = await bcrypt.compare(body.currentPassword, user.password_hash);
  if (!validPassword) {
    throw new HttpError(401, 'La contraseña actual es incorrecta.');
  }

  const newHash = await bcrypt.hash(body.newPassword, 12);
  await pool.query(
    'UPDATE admin_users SET password_hash = $1, force_password_change = false, updated_at = now() WHERE id = $2',
    [newHash, body.userId]
  );

  await auditService.logAdminAction({ userId: body.userId, action: 'update_password', entityType: 'admin_user', entity: body.userId, req });

  res.json({ ok: true, message: 'Contraseña actualizada correctamente.' });
}));

router.get('/verify-email', loginLimiter, asyncHandler(async (req: Request, res: Response) => {
  const token = req.query.token;
  if (!token || typeof token !== 'string') {
    throw new HttpError(400, 'Token inválido.');
  }

  const result = await pool.query(
    'UPDATE admin_users SET is_verified = true, verification_token = NULL, updated_at = now() WHERE verification_token = $1 RETURNING id',
    [token]
  );

  if (result.rowCount === 0) {
    throw new HttpError(400, 'Token inválido o expirado.');
  }

  await auditService.logAdminAction({ userId: result.rows[0].id, action: 'verify_email', entityType: 'admin_user', entity: result.rows[0].id, req });

  res.json({ ok: true, message: 'Cuenta verificada exitosamente.' });
}));

export default router;

