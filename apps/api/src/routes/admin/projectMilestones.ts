import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { pool } from '../../db/pool.js';
import { requirePermission } from '../../middleware/auth.js';
import { requireProjectOwnership } from '../../middleware/abac.js';
import { requireCsrf } from '../../middleware/csrf.js';
import { requireNonTerminalState } from '../../middleware/requireNonTerminalState.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { HttpError } from '../../utils/httpError.js';
import { auditService } from '../../services/audit.js';

export const projectMilestonesRouter = Router();

const projectStatusSchema = z.object({ status: z.string().trim().min(1).max(80) });

const milestoneCreateSchema = z.object({
  title: z.string().trim().min(1).max(180),
  dueDate: z.string().date(),
  paymentPercentage: z.coerce.number().min(0).max(100),
  statusId: z.string().uuid(),
  quoteId: z.string().uuid().optional().nullable(),
  cancelPending: z.boolean().optional(),
});

projectMilestonesRouter.post(
  '/projects/:id/milestones',
  requireCsrf,
  requirePermission('admin.proyectos.manage'),
  requireProjectOwnership,
  asyncHandler(async (req: Request, res: Response) => {
    const projectId = z.string().uuid().parse(req.params.id);
    const body = milestoneCreateSchema.parse(req.body);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      const projectData = await client.query('SELECT quote_id FROM projects WHERE id = $1', [projectId]);
      const activeQuoteId = body.quoteId || projectData.rows[0]?.quote_id;
      if (!activeQuoteId) throw new HttpError(400, 'El proyecto no tiene una cotización asignada para calcular hitos.');

      if (body.cancelPending) {
        await client.query(`
          UPDATE project_milestones
          SET status_id = (SELECT id FROM status_catalog WHERE code IN ('canceled', 'cancelled') AND domain = 'milestone' LIMIT 1)
          WHERE project_id = $1 AND quote_id = $2 
            AND status_id IN (SELECT id FROM status_catalog WHERE domain = 'milestone' AND code NOT IN ('completed', 'canceled', 'cancelled'))
        `, [projectId, activeQuoteId]);
        
        if (activeQuoteId === projectData.rows[0]?.quote_id) {
          await client.query(`UPDATE projects SET status_id = (SELECT id FROM status_catalog WHERE code = 'cancelled' AND domain = 'project'), updated_at = now() WHERE id = $1`, [projectId]);
        }
      }

      const sumResult = await client.query(
        `SELECT COALESCE(SUM(pm.payment_percentage), 0) as total 
         FROM project_milestones pm 
         JOIN status_catalog sc ON pm.status_id = sc.id 
         WHERE pm.project_id = $1 AND pm.quote_id = $2 AND sc.code != 'canceled'`,
        [projectId, activeQuoteId]
      );
      const currentTotal = parseFloat(sumResult.rows[0].total);
      if (currentTotal + body.paymentPercentage > 100) {
        throw new HttpError(400, 'El porcentaje total de los hitos para esta cotización no puede superar el 100%.');
      }

      const result = await client.query(
        `INSERT INTO project_milestones (project_id, title, due_date, payment_percentage, status_id, quote_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [projectId, body.title, body.dueDate, body.paymentPercentage, body.statusId, activeQuoteId],
      );
      await client.query('COMMIT');
      await auditService.logAdminAction({ userId: req.admin?.id, action: 'create_milestone', entityType: 'project_milestones', entity: result.rows[0], req });
      res.status(201).json({ id: result.rows[0].id });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }),
);

projectMilestonesRouter.get(
  '/projects/:id/milestones',
  requirePermission('admin.proyectos.view'),
  requireProjectOwnership,
  asyncHandler(async (req: Request, res: Response) => {
    const id = z.string().uuid().parse(req.params.id);
    const result = await pool.query(
      `SELECT pm.id, pm.project_id, pm.title, pm.due_date, pm.payment_percentage, pm.quote_id,
              pm.completed_at, pm.created_at, pm.updated_at,
              sc.code AS status, sc.name AS status_name, sc.is_terminal as "isTerminal",
              COALESCE(q.currency_code, p.currency_code) AS currency_code,
              COALESCE(payments_data.payments, '[]'::json) AS payments
       FROM project_milestones pm
       JOIN status_catalog sc ON pm.status_id = sc.id
       JOIN projects p ON pm.project_id = p.id
       LEFT JOIN quotes q ON pm.quote_id = q.id
       LEFT JOIN LATERAL (
         SELECT json_agg(json_build_object(
           'id', mp.id,
           'milestone_id', mp.milestone_id,
           'amount_paid', mp.amount_paid,
           'currency_code', mp.currency_code,
           'payment_method', mp.payment_method,
           'reference_number', mp.reference_number,
           'receipt_file_id', mp.receipt_file_id,
           'receipt_url', fa.public_url,
           'paid_at', mp.paid_at,
           'status', mp.status,
           'created_at', mp.created_at
         ) ORDER BY mp.created_at ASC) AS payments
         FROM milestone_payments mp
         LEFT JOIN file_assets fa ON mp.receipt_file_id = fa.id
         WHERE mp.milestone_id = pm.id AND mp.deleted_at IS NULL
       ) payments_data ON true
       WHERE pm.project_id = $1 AND sc.domain = 'milestone'
       ORDER BY pm.due_date ASC, pm.created_at ASC`,
      [id],
    );
    res.json({ items: result.rows });
  }),
);

projectMilestonesRouter.patch(
  '/projects/:id/milestones/:milestone_id',
  requireCsrf,
  requirePermission('admin.proyectos.manage'),
  requireProjectOwnership,
  requireNonTerminalState('projects'),
  asyncHandler(async (req: Request, res: Response) => {
    const projectId = z.string().uuid().parse(req.params.id);
    const milestoneId = z.string().uuid().parse(req.params.milestone_id);
    const body = projectStatusSchema.parse(req.body);
    const oldStateRes = await pool.query('SELECT * FROM project_milestones WHERE id = $1', [milestoneId]);
    if (!oldStateRes.rowCount) throw new HttpError(404, 'Hito no encontrado.');

    const result = await pool.query(
      `UPDATE project_milestones pm
       SET status_id = sc.id,
           completed_at = CASE WHEN sc.code = 'completed' THEN COALESCE(pm.completed_at, now()) ELSE NULL END,
           updated_at = now()
       FROM status_catalog sc
       WHERE pm.id = $1 AND pm.project_id = $2
         AND sc.domain = 'milestone' AND sc.code = $3 AND sc.is_active = true
       RETURNING pm.*`,
      [milestoneId, projectId, body.status],
    );
    if (!result.rowCount) throw new HttpError(400, 'Estado invalido.');
    await auditService.logAdminAction({ userId: req.admin?.id, action: 'update_milestone_status', entityType: 'project_milestones', entity: result.rows[0], previousState: oldStateRes.rows[0], req });
    res.json({ ok: true });
  }),
);

projectMilestonesRouter.delete(
  '/projects/:id/milestones/:milestone_id',
  requireCsrf,
  requirePermission('admin.proyectos.manage'),
  requireProjectOwnership,
  requireNonTerminalState('projects'),
  asyncHandler(async (req: Request, res: Response) => {
    const projectId = z.string().uuid().parse(req.params.id);
    const milestoneId = z.string().uuid().parse(req.params.milestone_id);
    
    const checkRes = await pool.query('SELECT title, (SELECT COUNT(*) FROM milestone_payments WHERE milestone_id = $1 AND status != \'rejected\') as count FROM project_milestones WHERE id = $1', [milestoneId]);
    
    if (checkRes.rowCount === 0) throw new HttpError(404, 'Hito no encontrado.');
    if (checkRes.rows[0].title === 'Compensación por Cancelación') {
       throw new HttpError(403, 'Protección de Sistema: Este es un hito penal (Kill Fee) autogenerado y no puede ser eliminado manualmente.');
    }
    if (Number(checkRes.rows[0].count) > 0) {
      throw new HttpError(400, 'No se puede eliminar un hito que ya tiene pagos registrados.');
    }
    
    const result = await pool.query('DELETE FROM project_milestones WHERE id = $1 AND project_id = $2 RETURNING *', [milestoneId, projectId]);
    if (result.rowCount === 0) throw new HttpError(404, 'Hito no encontrado.');
    
    await auditService.logAdminAction({ userId: req.admin?.id, action: 'delete_milestone', entityType: 'project_milestones', entityId: milestoneId, previousState: result.rows[0], req });
    res.status(200).json({ success: true });
  }),
);
