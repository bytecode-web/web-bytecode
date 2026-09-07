import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { pool } from '../../db/pool.js';
import { requirePermission } from '../../middleware/auth.js';
import { requireProjectOwnership } from '../../middleware/abac.js';
import { requireCsrf } from '../../middleware/csrf.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { HttpError } from '../../utils/httpError.js';
import { auditService } from '../../services/audit.js';
import { sendDirectInAppNotification } from '../../services/notificationService.js';

export const projectAssignmentsRouter = Router();

projectAssignmentsRouter.get(
  '/projects/:id/assignments',
  requirePermission('admin.proyectos.view'),
  requireProjectOwnership,
  asyncHandler(async (req: Request, res: Response) => {
    const projectId = z.string().uuid().parse(req.params.id);    const result = await pool.query(
      `SELECT pa.project_id, pa.user_id, pa.role, pa.assigned_at, u.name, u.email
       FROM project_assignments pa
       JOIN admin_users u ON u.id = pa.user_id
       WHERE pa.project_id = $1
       ORDER BY pa.assigned_at DESC, u.name ASC`,
      [projectId],
    );
    res.json({ items: result.rows });
  }),
);

projectAssignmentsRouter.post(
  '/projects/:id/assignments',
  requireCsrf,
  requirePermission('admin.proyectos.assign'),
  requireProjectOwnership,
  asyncHandler(async (req: Request, res: Response) => {
    const projectId = z.string().uuid().parse(req.params.id);    const body = z.object({
      userId: z.string().uuid(),
      role: z.string().trim().max(120).optional().nullable(),
    }).parse(req.body);
    const result = await pool.query(
      `INSERT INTO project_assignments (project_id, user_id, role, assigned_at)
       SELECT p.id, u.id, $3, now()
       FROM projects p
       JOIN admin_users u ON u.id = $2 AND u.deleted_at IS NULL AND u.is_active = true
       WHERE p.id = $1 AND p.deleted_at IS NULL
       ON CONFLICT (project_id, user_id)
       DO UPDATE SET role = EXCLUDED.role, assigned_at = now()
       RETURNING project_id, user_id, role, assigned_at, (SELECT name FROM projects WHERE id = $1) as project_name`,
      [projectId, body.userId, body.role || null],
    );
    if (!result.rowCount) throw new HttpError(400, 'Proyecto o usuario invalido.');

    if (body.userId !== req.admin?.id) {
      await sendDirectInAppNotification(
        body.userId,
        "Proyecto Asignado",
        `Te han asignado al proyecto "${result.rows[0].project_name}".`,
        "projects",
        projectId
      );
    }

    await auditService.logAdminAction({ userId: req.admin?.id, action: 'assign_project_user', entityType: 'project_assignments', entity: projectId, req });
    res.status(201).json({ item: result.rows[0] });
  }),
);

projectAssignmentsRouter.delete(
  '/projects/:id/assignments/:userId',
  requireCsrf,
  requirePermission('admin.proyectos.assign'),
  requireProjectOwnership,
  asyncHandler(async (req: Request, res: Response) => {
    const projectId = z.string().uuid().parse(req.params.id);    const userId = z.string().uuid().parse(req.params.userId);
    const result = await pool.query(
      'DELETE FROM project_assignments WHERE project_id = $1 AND user_id = $2 RETURNING user_id, (SELECT name FROM projects WHERE id = $1) as project_name',
      [projectId, userId]
    );
    if (!result.rowCount) throw new HttpError(404, 'Asignación no encontrada.');

    if (userId !== req.admin?.id) {
      await sendDirectInAppNotification(
        userId,
        "Asignación Removida",
        `Has sido removido del equipo del proyecto "${result.rows[0].project_name}".`,
        "projects",
        undefined
      );
    }
    await auditService.logAdminAction({ userId: req.admin?.id, action: 'remove_project_user', entityType: 'project_assignments', entity: projectId, req });
    res.json({ ok: true });
  }),
);
