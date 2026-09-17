import { Router } from 'express';
import type { Request, Response } from 'express';
import type { PoolClient } from 'pg';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { pool } from '../../db/pool.js';
import { requirePermission, requireSuperAdmin } from '../../middleware/auth.js';
import { requireCsrf } from '../../middleware/csrf.js';
import { auditService } from '../../services/audit.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { HttpError } from '../../utils/httpError.js';
import { paginationQuerySchema } from './shared.js';

export const accessRouter = Router();
export const usersRouter = Router();
export const settingsRouter = Router();
const roleCodeSchema = z.string().trim().min(2).max(80).regex(/^[a-z0-9_:.+-]+$/);

const roleCreateSchema = z.object({
  code: roleCodeSchema,
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(1000).optional().nullable(),
  permissionIds: z.array(z.string().uuid()).default([]),
});

const roleUpdateSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  description: z.string().trim().max(1000).optional().nullable(),
  isActive: z.boolean().optional(),
  permissionIds: z.array(z.string().uuid()).optional(),
});

const ensurePermissionsExist = async (client: PoolClient, permissionIds: string[]) => {
  if (permissionIds.length === 0) return;
  const result = await client.query('SELECT id FROM permissions WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL', [permissionIds]);
  if (result.rowCount !== new Set(permissionIds).size) {
    throw new HttpError(400, 'Uno o mas permisos son invalidos.');
  }
};

const replaceRolePermissions = async (client: PoolClient, roleId: string, permissionIds: string[], adminId?: string) => {
  await ensurePermissionsExist(client, permissionIds);
  await client.query('DELETE FROM role_permissions WHERE role_id = $1', [roleId]);

  for (const permissionId of new Set(permissionIds)) {
    await client.query(
      `INSERT INTO role_permissions (role_id, permission_id, granted_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (role_id, permission_id) DO NOTHING`,
      [roleId, permissionId, adminId ?? null],
    );
  }
};

accessRouter.get(
  '/permissions',
  requireSuperAdmin,
  asyncHandler(async (_req: Request, res: Response) => {
    const result = await pool.query(
      `SELECT id, module_code, action_code, code, name, description
       FROM permissions
       WHERE deleted_at IS NULL
       ORDER BY module_code ASC, action_code ASC, name ASC`,
    );
    res.json({ items: result.rows });
  }),
);
accessRouter.get(
  '/roles',
  requireSuperAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    const { limit, offset } = paginationQuerySchema.parse(req.query);
    const [result, countResult] = await Promise.all([pool.query(
      `
      SELECT
        r.id,
        r.code,
        r.name,
        r.description,
        r.is_system,
        r.is_active,
        r.created_at,
        r.updated_at,
        COALESCE(array_remove(array_agg(rp.permission_id), NULL), ARRAY[]::uuid[]) as permission_ids,
        COALESCE(array_remove(array_agg(p.code), NULL), ARRAY[]::varchar[]) as permission_codes
      FROM roles r
      LEFT JOIN role_permissions rp ON rp.role_id = r.id
      LEFT JOIN permissions p ON p.id = rp.permission_id AND p.deleted_at IS NULL
      WHERE r.deleted_at IS NULL
      GROUP BY r.id
      ORDER BY r.is_system DESC, r.name ASC
      LIMIT $1 OFFSET $2
      `,
      [limit, offset],
    ), pool.query('SELECT count(*)::int AS total FROM roles WHERE deleted_at IS NULL')]);
    res.json({ data: result.rows, total: countResult.rows[0].total });
  }),
);

accessRouter.get(
  '/roles/:id',
  requireSuperAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    const id = z.string().uuid().parse(req.params.id);
    const result = await pool.query(
      `
      SELECT
        r.id,
        r.code,
        r.name,
        r.description,
        r.is_system,
        r.is_active,
        r.created_at,
        r.updated_at,
        COALESCE(array_remove(array_agg(rp.permission_id), NULL), ARRAY[]::uuid[]) as permission_ids,
        COALESCE(array_remove(array_agg(p.code), NULL), ARRAY[]::varchar[]) as permission_codes
      FROM roles r
      LEFT JOIN role_permissions rp ON rp.role_id = r.id
      LEFT JOIN permissions p ON p.id = rp.permission_id AND p.deleted_at IS NULL
      WHERE r.id = $1 AND r.deleted_at IS NULL
      GROUP BY r.id
      `,
      [id],
    );
    if (result.rowCount === 0) throw new HttpError(404, 'Rol no encontrado.');
    res.json({ item: result.rows[0] });
  }),
);

accessRouter.post(
  '/roles',
  requireCsrf,
  requireSuperAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    const body = roleCreateSchema.parse(req.body);
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      await ensurePermissionsExist(client, body.permissionIds);
      const result = await client.query(
        `INSERT INTO roles (code, name, description, is_system, created_by)
         VALUES ($1, $2, $3, false, $4)
         RETURNING id, code, name, description, is_system, is_active, created_at, updated_at`,
        [body.code, body.name, body.description ?? null, req.admin?.id ?? null],
      );

      await replaceRolePermissions(client, result.rows[0].id, body.permissionIds, req.admin?.id);
      await client.query('COMMIT');
      await auditService.logAdminAction({
        userId: req.admin?.id,
        action: 'create',
        entityType: 'role',
        entity: result.rows[0],
        req
      });
      res.status(201).json({ item: { ...result.rows[0], permission_ids: body.permissionIds } });
    } catch (error: unknown) {
      await client.query('ROLLBACK');
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
        throw new HttpError(409, 'El codigo del rol ya existe.');
      }
      throw error;
    } finally {
      client.release();
    }
  }),
);

accessRouter.put(
  '/roles/:id',
  requireCsrf,
  requireSuperAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    const id = z.string().uuid().parse(req.params.id);

    if (req.body) {
      delete req.body.code;
      delete req.body.is_system;
    }

    const body = roleUpdateSchema.parse(req.body);
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      const current = await client.query('SELECT * FROM roles WHERE id = $1 AND deleted_at IS NULL', [id]);
      if (current.rowCount === 0) throw new HttpError(404, 'Rol no encontrado.');
      if (current.rows[0].code === 'super_admin') {
        throw new HttpError(403, 'No se puede modificar el rol super_admin.');
      }

      if (body.permissionIds) {
        await replaceRolePermissions(client, id, body.permissionIds, req.admin?.id);
      }

      const descriptionValue = Object.prototype.hasOwnProperty.call(body, 'description') ? body.description ?? null : undefined;

      const result = await client.query(
        `UPDATE roles
         SET name = COALESCE($2, name),
             description = CASE WHEN $3::boolean THEN $4 ELSE description END,
             is_active = COALESCE($5, is_active),
             updated_by = $6,
             updated_at = now()
         WHERE id = $1
         RETURNING id, code, name, description, is_system, is_active, created_at, updated_at`,
        [
          id,
          body.name ?? null,
          descriptionValue !== undefined,
          descriptionValue ?? null,
          body.isActive ?? null,
          req.admin?.id ?? null,
        ],
      );

      await client.query('COMMIT');
      await auditService.logAdminAction({
        userId: req.admin?.id,
        action: 'update',
        entityType: 'role',
        entity: result.rows[0],
        previousState: current.rows[0],
        req
      });
      res.json({ item: result.rows[0] });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }),
);

accessRouter.delete(
  '/roles/:id',
  requireCsrf,
  requireSuperAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    throw new HttpError(405, 'La eliminación de roles no está soportada por el sistema.');
  }),
);

accessRouter.get(
  '/menu',
  asyncHandler(async (req: Request, res: Response) => {
    const isSuperAdmin = req.admin?.roles.includes('super_admin') ?? false;
    const result = await pool.query(
      `
      SELECT mi.id, mi.label, mi.url, mi.route_name, mi.icon_name, mi.sort_order, p.code as permission_code
      FROM menu_items mi
      LEFT JOIN permissions p ON p.id = mi.permission_id
      WHERE mi.is_active = true
        AND mi.deleted_at IS NULL
        AND (
          mi.permission_id IS NULL
          OR $1::boolean = true
          OR p.code = ANY($2::varchar[])
        )
      ORDER BY mi.sort_order ASC, mi.label ASC
      `,
      [isSuperAdmin, req.admin?.permissions ?? []],
    );
    res.json({ items: result.rows });
  }),
);

// --- User Management Endpoints ---

const userCreateSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2),
  password: z.string().min(8),
  role: z.string(),
  expiresAt: z.string().datetime().nullable().optional(),
});

const userUpdateSchema = z.object({
  name: z.string().min(2).optional(),
  password: z.string().min(8).optional(),
  role: z.string().optional(),
  isActive: z.boolean().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
});

usersRouter.get(
  '/users',
  requireSuperAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const { limit, offset } = paginationQuerySchema.parse(req.query);
      const status = req.query.status as string;

      let statusParam: boolean | null = null;
      if (status === 'active') statusParam = true;
      else if (status === 'inactive') statusParam = false;

      const [result, countResult] = await Promise.all([pool.query(`
        SELECT
          u.id,
          u.name,
          u.email,
          u.is_active,
          (array_remove(array_agg(r.code), NULL))[1] as role,
          array_remove(array_agg(r.code), NULL) as roles,
          u.created_at,
          u.last_login_at
        FROM admin_users u
        LEFT JOIN admin_user_roles aur ON u.id = aur.admin_user_id
        LEFT JOIN roles r ON aur.role_id = r.id
        WHERE u.deleted_at IS NULL AND ($3::boolean IS NULL OR u.is_active = $3::boolean)
        GROUP BY u.id
        ORDER BY u.name ASC
        LIMIT $1 OFFSET $2
      `, [limit, offset, statusParam]), pool.query(
        'SELECT count(*)::int AS total FROM admin_users WHERE deleted_at IS NULL AND ($1::boolean IS NULL OR is_active = $1::boolean)',
        [statusParam]
      )]);
      res.json({ data: result.rows, total: countResult.rows[0].total });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }),
);

usersRouter.post(
  '/users',
  requireCsrf,
  requireSuperAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    const body = userCreateSchema.parse(req.body);
    const passwordHash = await bcrypt.hash(body.password, 12);
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const roleResult = await client.query('SELECT id FROM roles WHERE code = $1 AND is_active = true AND deleted_at IS NULL', [body.role]);
      if (roleResult.rowCount === 0) throw new HttpError(400, 'Rol inválido.');
      const roleId = roleResult.rows[0].id;

      const result = await client.query(
        `INSERT INTO admin_users (email, name, password_hash, created_by, is_verified, force_password_change, expires_at)
         VALUES ($1, $2, $3, $4, false, true, $5) RETURNING id, email, name, is_active, created_at, expires_at`,
        [body.email.toLowerCase(), body.name, passwordHash, req.admin?.id, body.expiresAt || null]
      );

      await client.query(
        `INSERT INTO admin_user_roles (admin_user_id, role_id, assigned_by) VALUES ($1, $2, $3)`,
        [result.rows[0].id, roleId, req.admin?.id]
      );

      await client.query('COMMIT');
      await auditService.logAdminAction({
        userId: req.admin?.id,
        action: 'create',
        entityType: 'admin_user',
        entity: result.rows[0],
        req
      });
      res.status(201).json({ item: result.rows[0] });
    } catch (err: unknown) {
      await client.query('ROLLBACK');
      if (typeof err === 'object' && err !== null && 'code' in err && err.code === '23505') {
        throw new HttpError(409, 'El correo ya está en uso.');
      }
      throw err;
    } finally {
      client.release();
    }
  }),
);

usersRouter.patch(
  '/users/:id',
  requireCsrf,
  requireSuperAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const body = userUpdateSchema.parse(req.body);
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const currentUser = await client.query(`
        SELECT u.id, u.is_active, (array_remove(array_agg(r.code), NULL))[1] as role
        FROM admin_users u
        LEFT JOIN admin_user_roles aur ON u.id = aur.admin_user_id
        LEFT JOIN roles r ON aur.role_id = r.id
        WHERE u.id = $1
        GROUP BY u.id
      `, [id]);

      if (currentUser.rowCount === 0) throw new HttpError(404, 'Usuario no encontrado.');
      const currentRole = currentUser.rows[0].role;

      if (currentRole === 'super_admin' && !req.admin?.roles.includes('super_admin')) {
        throw new HttpError(403, 'No puedes modificar a un super administrador.');
      }

      let updatedRole = currentRole;

      if (body.role && body.role !== currentRole) {
        const roleResult = await client.query('SELECT id FROM roles WHERE code = $1 AND is_active = true AND deleted_at IS NULL', [body.role]);
        if (roleResult.rowCount === 0) throw new HttpError(400, 'Rol inválido.');
        const roleId = roleResult.rows[0].id;

        await client.query('DELETE FROM admin_user_roles WHERE admin_user_id = $1', [id]);
        await client.query(
          `INSERT INTO admin_user_roles (admin_user_id, role_id, assigned_by) VALUES ($1, $2, $3)`,
          [id, roleId, req.admin?.id]
        );
        updatedRole = body.role;
      }

      const passwordHash = body.password ? await bcrypt.hash(body.password, 12) : null;

      const result = await client.query(
        `UPDATE admin_users
          SET name = COALESCE($2, name),
              is_active = COALESCE($3, is_active),
              password_hash = COALESCE($5, password_hash),
              expires_at = CASE WHEN $6::boolean = true THEN $7 ELSE expires_at END,
              updated_at = now(),
              updated_by = $4
          WHERE id = $1
          RETURNING id, email, name, is_active, updated_at, expires_at`,
        [id, body.name ?? null, body.isActive ?? null, req.admin?.id, passwordHash, body.expiresAt !== undefined, body.expiresAt ?? null]
      );

      await client.query('COMMIT');
      await auditService.logAdminAction({
        userId: req.admin?.id,
        action: 'update',
        entityType: 'admin_user',
        entity: { ...result.rows[0], role: updatedRole },
        previousState: currentUser.rows[0],
        req
      });
      res.json({ item: { ...result.rows[0], role: updatedRole } });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }),
);

usersRouter.delete(
  '/users/:id',
  requireCsrf,
  requireSuperAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const currentUser = await client.query('SELECT id, is_active FROM admin_users WHERE id = $1', [id]);
      if (currentUser.rowCount === 0) throw new HttpError(404, 'Usuario no encontrado.');
      if (currentUser.rows[0].is_active) throw new HttpError(400, 'Solo se pueden eliminar usuarios inactivos.');

      await client.query('DELETE FROM admin_user_roles WHERE admin_user_id = $1', [id]);
      await client.query('DELETE FROM admin_users WHERE id = $1', [id]);

      await client.query('COMMIT');

      await auditService.logAdminAction({
        userId: req.admin?.id,
        action: 'delete',
        entityType: 'admin_user',
        entity: { id },
        req
      });

      res.json({ success: true });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }),
);

usersRouter.patch(
  '/users/:id/roles',
  requireCsrf,
  requireSuperAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const { role } = z.object({ role: z.string() }).parse(req.body);
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const currentUser = await client.query(`
        SELECT u.id, (array_remove(array_agg(r.code), NULL))[1] as role
        FROM admin_users u
        LEFT JOIN admin_user_roles aur ON u.id = aur.admin_user_id
        LEFT JOIN roles r ON aur.role_id = r.id
        WHERE u.id = $1
        GROUP BY u.id
      `, [id]);

      if (currentUser.rowCount === 0) throw new HttpError(404, 'Usuario no encontrado.');
      const currentRole = currentUser.rows[0].role;

      if (currentRole === 'super_admin' && !req.admin?.roles.includes('super_admin')) {
        throw new HttpError(403, 'No puedes modificar a un super administrador.');
      }

      const roleResult = await client.query('SELECT id FROM roles WHERE code = $1 AND is_active = true AND deleted_at IS NULL', [role]);
      if (roleResult.rowCount === 0) throw new HttpError(400, 'Rol inválido.');
      const roleId = roleResult.rows[0].id;

      await client.query('DELETE FROM admin_user_roles WHERE admin_user_id = $1', [id]);
      await client.query(
        `INSERT INTO admin_user_roles (admin_user_id, role_id, assigned_by) VALUES ($1, $2, $3)`,
        [id, roleId, req.admin?.id]
      );
      await client.query('UPDATE admin_users SET updated_at = now(), updated_by = $2 WHERE id = $1', [id, req.admin?.id]);

      await client.query('COMMIT');
      await auditService.logAdminAction({
        userId: req.admin?.id,
        action: 'update_role',
        entityType: 'admin_user',
        entity: { id, role },
        previousState: currentUser.rows[0],
        req
      });
      res.json({ item: { id, role } });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }),
);

// --- Settings Endpoints ---

const settingsUpdateSchema = z.object({
  settings: z.array(z.object({
    setting_key: z.string(),
    setting_value: z.any(),
    is_sensitive: z.boolean().optional(),
    description: z.string().optional()
  }))
});

settingsRouter.get(
  '/settings',
  requirePermission('admin.configuracion.view'),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await pool.query('SELECT setting_key, setting_value, description, is_sensitive FROM system_settings ORDER BY setting_key');


    const items = result.rows.map((row: any) => {
      let value = row.setting_value ? { ...row.setting_value } : {};

      if (row.setting_key === 'smtp_config') {
        value = {
          ...value,
          host: value.host || '',
          port: String(value.port || ''),
          secure: value.secure ?? false,
          user: value.user || '',
          pass: value.pass ? '********' : '',
        };
      }

      if (row.setting_key === 'cloudinary_config') {
        value = {
          ...value,
          cloud_name: value.cloud_name || '',
          api_key: value.api_key || '',
          api_secret: value.api_secret ? '********' : '',
        };
      }

      return { ...row, setting_value: value };
    });


    res.json({ items });
  })
);

settingsRouter.patch(
  '/settings',
  requireCsrf,
  requirePermission('admin.configuracion.manage'),
  asyncHandler(async (req: Request, res: Response) => {
    const { settings } = settingsUpdateSchema.parse(req.body);
    const currentSettings = await pool.query('SELECT * FROM system_settings');
    const previousState = currentSettings.rows;
    const previousStates: any[] = [];
    const newStates: any[] = [];

    for (const setting of settings) {
      // Evitar sobreescribir con valores enmascarados
      let valueToSave = setting.setting_value;

      if (setting.is_sensitive) {
        // Recuperar el actual para evitar sobreescribir secretos con asteriscos
        const current = await pool.query('SELECT setting_value FROM system_settings WHERE setting_key = $1', [setting.setting_key]);
        if (current.rowCount && current.rowCount > 0) {
          const currentVal = current.rows[0].setting_value;
          const merged = { ...valueToSave };

          if (setting.setting_key === 'smtp_config' && merged.pass === '********') {
            merged.pass = currentVal.pass;
          }
          if (setting.setting_key === 'cloudinary_config' && merged.api_secret === '********') {
            merged.api_secret = currentVal.api_secret;
          }

          valueToSave = merged;
        }
      }

      const updateRes = await pool.query(
        `UPDATE system_settings
         SET setting_value = $2,
             updated_at = now(),
             updated_by = $3
         WHERE setting_key = $1
         RETURNING *`,
        [setting.setting_key, JSON.stringify(valueToSave), req.admin?.id]
      );

      if (!updateRes.rowCount) {
        throw new HttpError(400, `La clave de configuracin '${setting.setting_key}' es invlida o no existe.`);
      }

      const rawUpdatedRow = updateRes.rows[0];
      const rawOldRow = previousState.find((s: any) => s.setting_key === setting.setting_key);

      if (rawOldRow) previousStates.push(rawOldRow);
      newStates.push(rawUpdatedRow);
    }

    await auditService.logAdminAction({
      userId: req.admin?.id,
      action: 'batch_update',
      entityType: 'system_settings',
      entity: newStates,
      previousState: previousStates,
      req
    });

    res.json({ ok: true });
  })
);
