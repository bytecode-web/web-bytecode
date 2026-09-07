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
import { createBusinessCode, getProjectStatusInfo } from './shared.js';
import { auditService } from '../../services/audit.js';
import { sendDirectInAppNotification } from '../../services/notificationService.js';
import { projectSelectSql } from './projectRead.js';

export const projectMutationsRouter = Router();

const nullableProjectUrl = z.string().trim().url().max(255).optional().nullable();
const projectCreateSchema = z.object({
  customerId: z.string().uuid(),
  serviceId: z.string().uuid(),
  organizationId: z.string().uuid().optional().nullable(),
  quoteId: z.string().uuid().optional().nullable(),
  name: z.string().trim().min(2).max(180),
  description: z.string().trim().max(3000).optional().nullable(),
  status: z.string().trim().min(1).max(80),
  githubRepo: nullableProjectUrl,
  startDate: z.string().date(),
  estimatedEndDate: z.string().date(),
  actualEndDate: z.string().date().optional().nullable(),
  totalBudget: z.coerce.number().min(0),
  currencyCode: z.string().trim().length(3).transform((value) => value.toUpperCase()).default('PEN'),
});
const projectUpdateSchema = projectCreateSchema.partial().extend({
  currencyCode: z.string().trim().length(3).transform((value) => value.toUpperCase()).optional(),
  applyKillFee: z.boolean().optional(),
});

projectMutationsRouter.post(
  '/projects',
  requireCsrf,
  requirePermission('admin.proyectos.create'),
  asyncHandler(async (req: Request, res: Response) => {
    const body = projectCreateSchema.parse(req.body);
    const { id: statusId } = await getProjectStatusInfo(pool, body.status);
    const isRestrictedDeveloper = req.admin?.roles.includes('developer') && !req.admin?.roles.includes('super_admin') && !req.admin?.roles.includes('admin');
    
    if (body.quoteId) {
      const quote = await pool.query(
        `SELECT q.id, q.total_amount, q.currency_code
         FROM quotes q
         JOIN customers quote_customer ON quote_customer.id = q.customer_id
         JOIN customers project_customer ON project_customer.id = $2
         WHERE q.id = $1 AND q.deleted_at IS NULL
           AND lower(quote_customer.primary_email) = lower(project_customer.primary_email)`,
        [body.quoteId, body.customerId],
      );
      if (!quote.rowCount) throw new HttpError(400, 'La cotizacion no pertenece al cliente seleccionado.');
      
      body.totalBudget = Number(quote.rows[0].total_amount);
      body.currencyCode = quote.rows[0].currency_code;
      
      const existingProject = await pool.query(
        `SELECT id FROM projects WHERE quote_id = $1 AND deleted_at IS NULL`,
        [body.quoteId]
      );
      if (existingProject.rowCount) throw new HttpError(400, 'Esta cotización ya se encuentra asignada a un proyecto registrado.');
    } else if (isRestrictedDeveloper) {
      body.totalBudget = 0;
    }
    const result = await pool.query(
      `INSERT INTO projects (
         project_code, customer_id, organization_id, service_id, name, description,
         status_id, github_repo, start_date, estimated_end_date,
         actual_end_date, total_budget, currency_code, quote_id
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING id`,
      [createBusinessCode('PRJ'), body.customerId, body.organizationId ?? null, body.serviceId,
       body.name, body.description ?? null, statusId, body.githubRepo ?? null,
       body.startDate, body.estimatedEndDate,
       body.actualEndDate ?? null, body.totalBudget, body.currencyCode, body.quoteId ?? null],
    );
    const created = await pool.query(`${projectSelectSql} AND p.id = $1`, [result.rows[0].id]);
    await auditService.logAdminAction({ userId: req.admin?.id, action: 'create_project', entityType: 'project', entity: created.rows[0], req });
    res.status(201).json({ item: created.rows[0] });
  }),
);

projectMutationsRouter.patch(
  '/projects/:id',
  requireCsrf,
  requirePermission('admin.proyectos.manage'),
  requireProjectOwnership,
  requireNonTerminalState('projects'),
  asyncHandler(async (req: Request, res: Response) => {
    const id = z.string().uuid().parse(req.params.id);
    const body = projectUpdateSchema.parse(req.body);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const current = await client.query(
        `${projectSelectSql} AND p.id = $1 FOR UPDATE OF p`,
        [id],
      );
      if (!current.rowCount) throw new HttpError(404, 'Proyecto no encontrado');
      const oldStatusId = current.rows[0].status_id as string | null;
      const statusInfo = body.status ? await getProjectStatusInfo(client, body.status) : null;
      const statusId = statusInfo?.id ?? null;
      if (body.quoteId && body.quoteId !== current.rows[0].quote_id) {
        const customerId = body.customerId ?? current.rows[0].customer_id;
        const quote = await client.query(
          `SELECT q.id
           FROM quotes q
           JOIN customers quote_customer ON quote_customer.id = q.customer_id
           JOIN customers project_customer ON project_customer.id = $2
           WHERE q.id = $1 AND q.deleted_at IS NULL
             AND lower(quote_customer.primary_email) = lower(project_customer.primary_email)`,
          [body.quoteId, customerId],
        );
        if (!quote.rowCount) throw new HttpError(400, 'La cotizacion no pertenece al cliente seleccionado.');
        
        const existingProject = await client.query(
          `SELECT id FROM projects WHERE quote_id = $1 AND id != $2 AND deleted_at IS NULL`,
          [body.quoteId, id]
        );
        if (existingProject.rowCount) throw new HttpError(400, 'Esta cotización ya se encuentra asignada a otro proyecto.');
      }
      let finalActualEndDate = body.actualEndDate ?? current.rows[0].actual_end_date;
      if (oldStatusId && statusId && oldStatusId !== statusId) {
        if (statusInfo?.is_terminal) {
          finalActualEndDate = new Date().toISOString().split('T')[0];
        } else {
          finalActualEndDate = null;
        }

        if (statusInfo?.code === 'cancelled' && body.applyKillFee) {
          const statusCatRes = await client.query(`SELECT code, id FROM status_catalog WHERE domain = 'milestone'`);
          const milestoneCancelledId = statusCatRes.rows.find(r => r.code === 'cancelled' || r.code === 'canceled')?.id;
          const milestoneCompletedId = statusCatRes.rows.find(r => r.code === 'completed')?.id;
          const milestonePendingId = statusCatRes.rows.find(r => r.code !== 'cancelled' && r.code !== 'canceled' && r.code !== 'completed')?.id;
          const activeQuoteId = current.rows[0].quote_id;

          if (activeQuoteId) {
            // 1. Cancelar de golpe todos los hitos técnicos que estaban en progreso o pendientes ANTES de inyectar el Kill Fee
            await client.query(`
              UPDATE project_milestones 
              SET status_id = $1 
              WHERE project_id = $2 AND status_id != $3 AND status_id != $1
            `, [milestoneCancelledId, id, milestoneCompletedId]);

            // 2. Obtener todas las cotizaciones involucradas (Raíz + Adendas usadas en hitos)
            const quotesToEvaluateRes = await client.query(`
              SELECT DISTINCT q.id as quote_id, q.total_amount
              FROM quotes q
              WHERE q.id = $1
                 OR q.id IN (SELECT quote_id FROM project_milestones WHERE project_id = $2 AND quote_id IS NOT NULL)
            `, [activeQuoteId, id]);

            // 3. Iterar sobre cada cotización para inyectar su respectivo Kill Fee si no está 100% pagada
            for (const qRow of quotesToEvaluateRes.rows) {
              const currentQuoteId = qRow.quote_id;
              const totalQuoteAmount = Number(qRow.total_amount);

              // 3.1. Calcular el dinero real validado pagado para ESTA cotización en ESTE proyecto
              const paidMoneyRes = await client.query(`
                SELECT COALESCE(SUM(mp.amount_paid), 0) as total_paid_money
                FROM project_milestones pm
                JOIN milestone_payments mp ON mp.milestone_id = pm.id AND mp.status = 'valid' AND mp.deleted_at IS NULL
                WHERE pm.project_id = $1 AND pm.quote_id = $2
              `, [id, currentQuoteId]);

              const totalPaidMoney = Number(paidMoneyRes.rows[0].total_paid_money);
              const paidPercentage = totalQuoteAmount > 0 ? (totalPaidMoney / totalQuoteAmount) * 100 : 0;
              const actualPaidPercentage = Math.min(100, paidPercentage);
              const pendingPercentage = 100 - actualPaidPercentage;

              // 3.2. Si queda porcentaje por cobrar, inyectar el Kill Fee
              if (pendingPercentage > 0) {
                // Verificar que no exista ya un Kill Fee para esta cotización
                const existingKillFee = await client.query(`
                  SELECT id FROM project_milestones 
                  WHERE project_id = $1 AND quote_id = $2 AND title = 'Compensación por Cancelación'
                `, [id, currentQuoteId]);

                if (existingKillFee.rowCount === 0) {
                  // El tope del Kill Fee es 20%, o lo que reste si es menor a 20%
                  const killFeePercentage = Math.min(20, pendingPercentage);
                  await client.query(`
                    INSERT INTO project_milestones (project_id, title, due_date, payment_percentage, status_id, quote_id)
                    VALUES ($1, 'Compensación por Cancelación', CURRENT_DATE, $2, $3, $4)
                  `, [id, killFeePercentage, milestonePendingId, currentQuoteId]);
                }
              }
            }
          }
        }
      }

      await client.query(
        `UPDATE projects SET
           customer_id = COALESCE($2, customer_id), organization_id = COALESCE($3, organization_id),
           service_id = COALESCE($4, service_id), name = COALESCE($5, name),
           description = CASE WHEN $14 THEN $6 ELSE description END, status_id = COALESCE($7, status_id),
           github_repo = CASE WHEN $15 THEN $8 ELSE github_repo END,
           start_date = COALESCE($9, start_date), estimated_end_date = COALESCE($10, estimated_end_date),
           actual_end_date = COALESCE($11, actual_end_date), total_budget = COALESCE($12, total_budget),
           currency_code = COALESCE($13, currency_code),
           quote_id = CASE WHEN $17 THEN $16 ELSE quote_id END,
           updated_at = now()
         WHERE id = $1 AND deleted_at IS NULL`,
        [id, body.customerId ?? null, body.organizationId ?? null, body.serviceId ?? null,
         body.name ?? null, body.description ?? null, statusId, body.githubRepo ?? null,
         body.startDate ?? null, body.estimatedEndDate ?? null,
         finalActualEndDate ?? null, body.totalBudget ?? null, body.currencyCode ?? null,
         body.description !== undefined, body.githubRepo !== undefined,
         body.quoteId ?? null, body.quoteId !== undefined],
      );
      if (oldStatusId && statusId && oldStatusId !== statusId) {
        await client.query(
          `INSERT INTO project_status_history (
             project_id, old_status_id, new_status_id, changed_by
           ) VALUES ($1, $2, $3, $4)`,
          [id, oldStatusId, statusId, req.admin?.id ?? null],
        );

        const assignedUsersRes = await client.query('SELECT user_id FROM project_assignments WHERE project_id = $1', [id]);
        if (assignedUsersRes.rows.length > 0) {
          const statusNamesRes = await client.query('SELECT id, name FROM status_catalog WHERE id IN ($1, $2)', [oldStatusId, statusId]);
          const statusMap = Object.fromEntries(statusNamesRes.rows.map((r: { id: string; name: string }) => [r.id, r.name]));
          const newStatusName = statusMap[statusId] || 'Actualizado';

          for (const row of assignedUsersRes.rows) {
            if (row.user_id !== req.admin?.id) {
              await sendDirectInAppNotification(
                row.user_id,
                "Actualización de Proyecto",
                `El estado del proyecto "${current.rows[0].name}" ha cambiado a "${newStatusName}".`,
                "projects",
                id
              );
            }
          }
        }
      }
      const updated = await client.query(`${projectSelectSql} AND p.id = $1`, [id]);
      await auditService.logAdminAction({ userId: req.admin?.id, action: 'update_project', entityType: 'project', entity: updated.rows[0], previousState: current.rows[0], req });
      await client.query('COMMIT');
      res.json({ item: updated.rows[0] });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }),
);

projectMutationsRouter.delete(
  '/projects/:id',
  requireCsrf,
  requirePermission('admin.proyectos.manage'),
  requireProjectOwnership,
  asyncHandler(async (req: Request, res: Response) => {
    const id = z.string().uuid().parse(req.params.id);
    const result = await pool.query('UPDATE projects SET deleted_at = now(), updated_at = now() WHERE id = $1 AND deleted_at IS NULL RETURNING *', [id]);
    if (!result.rowCount) throw new HttpError(404, 'Proyecto no encontrado');
    await auditService.logAdminAction({ userId: req.admin?.id, action: 'delete_project', entityType: 'project', entity: result.rows[0], req });
    res.json({ ok: true });
  }),
);
