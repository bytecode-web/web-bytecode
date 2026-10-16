import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { pool } from '../../db/pool.js';
import { requirePermission, requireSuperAdmin } from '../../middleware/auth.js';
import { requireCsrf } from '../../middleware/csrf.js';
import { auditService } from '../../services/audit.js';
import { calculateLegalDueDate, calculateRemainingBusinessDays, type SystemHoliday } from '../../lib/slaCalculator.js';
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

interface RecalculatedComplaint {
  id: string;
  code: string;
  old_due_date: string | null;
  new_due_date: string;
}

/**
 * Recalibra de forma reactiva y transaccional los expedientes de reclamos en trámite (is_terminal = false)
 * ante la adición o supresión de un feriado en el sistema.
 * Registra un evento HOLIDAY_SCHEDULE_ADJUSTED en complaint_time_events únicamente si la fecha de vencimiento legal varía.
 */
async function recalibrateActiveComplaintsDueDate(
  client: any,
  adminInfo: { id?: string; name?: string; email?: string } | null | undefined,
  reasonContext: {
    action: 'created' | 'deleted';
    description: string;
    day: number;
    month: number;
    year: number | null;
  }
): Promise<RecalculatedComplaint[]> {
  // 1. Obtener todos los feriados actuales de Perú en el sistema
  const holidaysRes = await client.query(
    `SELECT sh.month, sh.day, sh.year, sh.description 
     FROM system_holidays sh 
     JOIN countries c ON sh.country_id = c.id 
     WHERE c.iso2 = 'PE'`
  );
  const currentHolidays: SystemHoliday[] = holidaysRes.rows;

  // 2. Obtener catálogo de prioridades para sincronización
  const prioRes = await client.query('SELECT id, code FROM priority_catalog WHERE is_active = true');
  const prioByCode = new Map<string, string>();
  prioRes.rows.forEach((r: { id: string; code: string }) => prioByCode.set(r.code, r.id));
  const normalPrioId = prioByCode.get('normal');
  const highPrioId = prioByCode.get('high');
  const urgentPrioId = prioByCode.get('urgent');

  // 3. Obtener expedientes abiertos/en trámite (is_terminal = false y no archivados físicamente)
  // Se aplica bloqueo FOR UPDATE OF c para garantizar concurrencia segura sin race conditions
  const complaintsRes = await client.query(
    `SELECT c.id, c.complaint_code, c.created_at, c.legal_response_due_at, c.priority_id
     FROM complaints c
     JOIN status_catalog sc ON c.status_id = sc.id
     WHERE sc.is_terminal = false
       AND sc.code NOT IN ('founded', 'unfounded', 'closed', 'rejected', 'resolved')
       AND c.deleted_at IS NULL
     ORDER BY c.created_at ASC
     FOR UPDATE OF c`
  );

  const now = new Date();
  const adjustedComplaints: RecalculatedComplaint[] = [];

  for (const c of complaintsRes.rows) {
    const regDate = new Date(c.created_at);
    const { dueDate: newDueDate, skippedWeekends, skippedHolidays } = calculateLegalDueDate(
      regDate,
      currentHolidays,
      15
    );

    const oldDueDate = c.legal_response_due_at ? new Date(c.legal_response_due_at) : null;
    const isDueChanged = !oldDueDate || Math.abs(newDueDate.getTime() - oldDueDate.getTime()) > 1000;

    if (isDueChanged) {
      // Calcular nueva prioridad por días hábiles restantes
      const remDays = calculateRemainingBusinessDays(newDueDate, now, currentHolidays);
      let targetPrioId = normalPrioId;
      if (remDays <= 2) {
        targetPrioId = urgentPrioId || normalPrioId;
      } else if (remDays <= 7) {
        targetPrioId = highPrioId || normalPrioId;
      }

      // Actualizar expediente
      await client.query(
        `UPDATE complaints
         SET legal_response_due_at = $1,
             priority_id = COALESCE($2, priority_id),
             updated_at = now()
         WHERE id = $3`,
        [newDueDate, targetPrioId, c.id]
      );

      // Registrar evento en la Caja Negra SLA (complaint_time_events)
      const dateLabel = `${reasonContext.day}/${reasonContext.month}${reasonContext.year ? `/${reasonContext.year}` : ''}`;
      const reasonText = reasonContext.action === 'created'
        ? `Ajuste normativo de SLA por registro de nuevo feriado oficial: ${reasonContext.description} (${dateLabel})`
        : `Ajuste normativo de SLA por supresión de feriado oficial: ${reasonContext.description} (${dateLabel})`;

      await client.query(
        `INSERT INTO complaint_time_events (complaint_id, event_type, metadata, event_date)
         VALUES ($1, 'HOLIDAY_SCHEDULE_ADJUSTED', $2, now())`,
        [
          c.id,
          JSON.stringify({
            reason: reasonText,
            holiday_action: reasonContext.action,
            holiday_description: reasonContext.description,
            holiday_date: dateLabel,
            old_due_date: oldDueDate ? oldDueDate.toISOString() : null,
            new_due_date: newDueDate.toISOString(),
            remaining_business_days: remDays,
            skipped_weekends: skippedWeekends,
            skipped_holidays: skippedHolidays,
            performed_by_admin_id: adminInfo?.id || null,
            adjusted_by: adminInfo?.email || adminInfo?.name || null,
            adjusted_at: now.toISOString(),
          }),
        ]
      );

      adjustedComplaints.push({
        id: c.id,
        code: c.complaint_code,
        old_due_date: oldDueDate ? oldDueDate.toISOString() : null,
        new_due_date: newDueDate.toISOString(),
      });
    }
  }

  return adjustedComplaints;
}

systemHolidaysRouter.get(
  '/system-holidays',
  requirePermission('admin.settings.view'),
  asyncHandler(async (_req: Request, res: Response) => {
    const result = await pool.query(
      `SELECT sh.*, c.iso2 as country_code, c.name as country_name 
       FROM system_holidays sh 
       JOIN countries c ON sh.country_id = c.id 
       ORDER BY sh.month ASC, sh.day ASC`
    );
    res.json({ items: result.rows });
  })
);

systemHolidaysRouter.post(
  '/system-holidays',
  requireCsrf,
  requirePermission('admin.settings.manage'),
  asyncHandler(async (req: Request, res: Response) => {
    const body = systemHolidaySchema.parse(req.body);
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // 1. Obtener datos del país para auditoría
      const countryRes = await client.query('SELECT id, iso2, name FROM countries WHERE id = $1', [body.country_id]);
      const country = countryRes.rows[0] || null;

      // 2. Insertar nuevo feriado
      const result = await client.query(
        'INSERT INTO system_holidays (country_id, month, day, year, description) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [body.country_id, body.month, body.day, body.year, body.description]
      );
      const insertedHoliday = result.rows[0];

      // 3. Recalibrar en la misma transacción los expedientes activos en trámite
      const recalculated = await recalibrateActiveComplaintsDueDate(client, req.admin, {
        action: 'created',
        description: body.description,
        day: body.day,
        month: body.month,
        year: body.year,
      });

      await client.query('COMMIT');

      // 4. Registro forense de auditoría inmutable
      await auditService.logAdminAction({
        userId: req.admin?.id,
        action: 'create_system_holiday',
        entityType: 'system_holidays',
        entityId: insertedHoliday.id,
        previousState: null,
        entity: {
          holiday_id: insertedHoliday.id,
          description: insertedHoliday.description,
          month: insertedHoliday.month,
          day: insertedHoliday.day,
          year: insertedHoliday.year,
          is_recurring: insertedHoliday.year === null,
          country: country ? { id: country.id, code: country.iso2, name: country.name } : null,
          created_by: {
            admin_id: req.admin?.id,
            name: req.admin?.name || null,
            email: req.admin?.email || null,
          },
          recalculated_complaints_count: recalculated.length,
          recalculated_complaints: recalculated,
        },
        req,
      });

      res.status(201).json({
        item: insertedHoliday,
        recalculated_complaints_count: recalculated.length,
        recalculated_complaints: recalculated,
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  })
);

systemHolidaysRouter.delete(
  '/system-holidays/:id',
  requireCsrf,
  requirePermission('admin.settings.manage'),
  asyncHandler(async (req: Request, res: Response) => {
    const id = z.string().uuid().parse(req.params.id);
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // 1. Obtener snapshot previo del feriado a eliminar
      const currentRes = await client.query(
        `SELECT sh.*, c.iso2 as country_code, c.name as country_name
         FROM system_holidays sh
         JOIN countries c ON sh.country_id = c.id
         WHERE sh.id = $1`,
        [id]
      );

      if (currentRes.rowCount === 0) {
        throw new HttpError(404, 'Feriado no encontrado en el sistema.');
      }

      const holidayToDelete = currentRes.rows[0];

      // 2. Eliminar físicamente el feriado
      await client.query('DELETE FROM system_holidays WHERE id = $1', [id]);

      // 3. Recalibrar en la misma transacción los expedientes activos en trámite
      const recalculated = await recalibrateActiveComplaintsDueDate(client, req.admin, {
        action: 'deleted',
        description: holidayToDelete.description,
        day: holidayToDelete.day,
        month: holidayToDelete.month,
        year: holidayToDelete.year,
      });

      await client.query('COMMIT');

      // 4. Registro forense de auditoría inmutable
      await auditService.logAdminAction({
        userId: req.admin?.id,
        action: 'delete_system_holiday',
        entityType: 'system_holidays',
        entityId: id,
        previousState: {
          holiday_id: holidayToDelete.id,
          description: holidayToDelete.description,
          month: holidayToDelete.month,
          day: holidayToDelete.day,
          year: holidayToDelete.year,
          is_recurring: holidayToDelete.year === null,
          country: {
            id: holidayToDelete.country_id,
            code: holidayToDelete.country_code,
            name: holidayToDelete.country_name,
          },
        },
        entity: {
          deleted_at: new Date().toISOString(),
          deleted_by: {
            admin_id: req.admin?.id,
            name: req.admin?.name || null,
            email: req.admin?.email || null,
          },
          recalculated_complaints_count: recalculated.length,
          recalculated_complaints: recalculated,
        },
        req,
      });

      res.json({
        success: true,
        recalculated_complaints_count: recalculated.length,
        recalculated_complaints: recalculated,
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
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
