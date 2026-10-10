import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { pool } from '../../db/pool.js';
import { requirePermission, requireSuperAdmin } from '../../middleware/auth.js';
import { requireCsrf } from '../../middleware/csrf.js';
import { auditService } from '../../services/audit.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { HttpError } from '../../utils/httpError.js';
import { listQuerySchema } from './shared.js';

export const dashboardRouter = Router();
export const auditLogsRouter = Router();
export const governanceRouter = Router();
export const systemHolidaysRouter = Router();

const systemHolidaySchema = z.object({
  country_id: z.string().uuid(),
  month: z.number().int().min(1).max(12),
  day: z.number().int().min(1).max(31),
  year: z.number().int().nullable(),
  description: z.string().min(1).max(255)
});

systemHolidaysRouter.get(
  '/system-holidays',
  requirePermission('admin.settings.view'),
  asyncHandler(async (_req: Request, res: Response) => {
    const result = await pool.query('SELECT sh.*, c.iso2 as country_code, c.name as country_name FROM system_holidays sh JOIN countries c ON sh.country_id = c.id ORDER BY sh.month ASC, sh.day ASC');
    res.json({ items: result.rows });
  })
);

systemHolidaysRouter.post(
  '/system-holidays',
  requireCsrf,
  requirePermission('admin.settings.manage'),
  asyncHandler(async (req: Request, res: Response) => {
    const body = systemHolidaySchema.parse(req.body);
    const result = await pool.query(
      'INSERT INTO system_holidays (country_id, month, day, year, description) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [body.country_id, body.month, body.day, body.year, body.description]
    );
    res.json({ item: result.rows[0] });
  })
);

systemHolidaysRouter.delete(
  '/system-holidays/:id',
  requireCsrf,
  requirePermission('admin.settings.manage'),
  asyncHandler(async (req: Request, res: Response) => {
    const id = z.string().uuid().parse(req.params.id);
    await pool.query('DELETE FROM system_holidays WHERE id = $1', [id]);
    res.json({ success: true });
  })
);

dashboardRouter.get(
  '/stats',
  requirePermission('admin.dashboard.view'),
  asyncHandler(async (_req: Request, res: Response) => {
    const [contactsStats, complaintsStats, recentContacts, recentComplaints, activeAdmins] = await Promise.all([
      pool.query('SELECT sc.code as status, count(*)::int AS total FROM contact_cases c JOIN status_catalog sc ON c.status_id = sc.id GROUP BY sc.code'),
      pool.query('SELECT sc.code as status, count(*)::int AS total FROM complaints c JOIN status_catalog sc ON c.status_id = sc.id GROUP BY sc.code'),
      pool.query(`SELECT c.id, cu.first_name as nombre, cu.primary_email as email, sc.code as status, c.created_at FROM contact_cases c JOIN customers cu ON c.customer_id = cu.id JOIN status_catalog sc ON c.status_id = sc.id ORDER BY c.created_at DESC LIMIT 5`),
      pool.query(`SELECT c.id, c.complaint_code as code, cu.first_name as nombre, cu.primary_email as email, sc.code as status, c.created_at FROM complaints c JOIN customers cu ON c.customer_id = cu.id JOIN status_catalog sc ON c.status_id = sc.id ORDER BY c.created_at DESC LIMIT 5`),
      pool.query(`SELECT count(*)::int AS total FROM admin_users WHERE is_active = true`),
    ]);

    res.json({
      contactsStats: contactsStats.rows,
      complaintsStats: complaintsStats.rows,
      recentContacts: recentContacts.rows,
      recentComplaints: recentComplaints.rows,
      activeAdminsTotal: activeAdmins.rows[0].total,
    });
  }),
);

auditLogsRouter.get(
  '/logs',
  requirePermission('admin.auditoria.view'),
  asyncHandler(async (req: Request, res: Response) => {
    const query = listQuerySchema.parse(req.query);
    const [result, countResult] = await Promise.all([
      pool.query(
        `
        SELECT l.id, l.action, l.entity_type, l.entity_id, l.ip_address, l.user_agent, l.details, l.created_at, u.name as admin_name, u.email as admin_email
        FROM admin_audit_logs l
        LEFT JOIN admin_users u ON l.admin_id = u.id
        ORDER BY l.created_at DESC
        LIMIT $1 OFFSET $2
        `,
        [query.limit, query.offset]
      ),
      pool.query('SELECT COUNT(*)::int AS total FROM admin_audit_logs'),
    ]);

    const items = result.rows.map((row) => ({
      id: row.id,
      action: row.action,
      entity_type: row.entity_type,
      entity_id: row.entity_id,
      ip_address: row.ip_address,
      user_agent: row.user_agent,
      details: typeof row.details === 'string' ? JSON.parse(row.details) : row.details,
      created_at: row.created_at,
      admin_name: row.admin_name,
      admin_email: row.admin_email,
    }));

    res.json({
      items,
      total: countResult.rows[0]?.total ?? 0,
      limit: query.limit,
      offset: query.offset,
    });
  })
);

const statusCatalogUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  sort_order: z.number().int().optional(),
  is_active: z.boolean().optional(),
});

governanceRouter.put(
  '/status-catalog/:id',
  requireCsrf,
  requireSuperAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    const id = z.string().uuid().parse(req.params.id);

    if (req.body) {
      delete req.body.code;
      delete req.body.domain;
      delete req.body.is_terminal;
    }

    const body = statusCatalogUpdateSchema.parse(req.body);
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      const current = await client.query('SELECT * FROM status_catalog WHERE id = $1', [id]);

      if (current.rowCount === 0) {
        throw new HttpError(404, 'Estado no encontrado en el catálogo.');
      }

      const result = await client.query(
        `UPDATE status_catalog
         SET name = COALESCE($2, name),
             sort_order = COALESCE($3, sort_order),
             is_active = COALESCE($4, is_active),
             updated_at = now()
         WHERE id = $1
         RETURNING *`,
        [id, body.name ?? null, body.sort_order ?? null, body.is_active ?? null],
      );

      await client.query('COMMIT');
      await auditService.logAdminAction({
        userId: req.admin?.id,
        action: 'update',
        entityType: 'status_catalog',
        entity: result.rows[0],
        previousState: current.rows[0],
        req,
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

governanceRouter.delete(
  '/status-catalog/:id',
  requireCsrf,
  requireSuperAdmin,
  asyncHandler(async (_req: Request, _res: Response) => {
    throw new HttpError(405, 'La eliminación de estados no está permitida para mantener la integridad del sistema.');
  }),
);

const pricingMutationNotAllowed = asyncHandler(async (_req: Request, _res: Response) => {
  throw new HttpError(405, 'La modificación de ítems de precio no está soportada para garantizar la integridad financiera.');
});

governanceRouter.put('/pricing-catalog/:id', requireCsrf, requireSuperAdmin, pricingMutationNotAllowed);
governanceRouter.patch('/pricing-catalog/:id', requireCsrf, requireSuperAdmin, pricingMutationNotAllowed);
governanceRouter.delete(
  '/pricing-catalog/:id',
  requireCsrf,
  requireSuperAdmin,
  asyncHandler(async (_req: Request, _res: Response) => {
    throw new HttpError(405, 'La eliminación física de ítems de precio no está permitida para mantener la integridad de las cotizaciones históricas.');
  }),
);

const blockAuditMutation = asyncHandler(async (_req: Request, _res: Response) => {
  throw new HttpError(405, 'Los registros de auditoría son inmutables (Append-Only) y no pueden ser alterados ni eliminados por razones de seguridad y cumplimiento normativo.');
});

for (const route of [
  '/audit-logs/:id',
  '/data-change-history/:id',
  '/project-status-history/:id',
  '/quote-status-history/:id',
  '/complaint-status-history/:id',
  '/contact-case-status-history/:id',
]) {
  governanceRouter.put(route, requireCsrf, requireSuperAdmin, blockAuditMutation);
  governanceRouter.patch(route, requireCsrf, requireSuperAdmin, blockAuditMutation);
  governanceRouter.delete(route, requireCsrf, requireSuperAdmin, blockAuditMutation);
}
