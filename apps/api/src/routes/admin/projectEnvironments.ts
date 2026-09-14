import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { pool } from '../../db/pool.js';
import { requirePermission } from '../../middleware/auth.js';
import { requireProjectOwnership } from '../../middleware/abac.js';
import { requireCsrf } from '../../middleware/csrf.js';
import { triggerEnvironmentVerification } from '../../services/environmentVerification.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { HttpError } from '../../utils/httpError.js';
import { auditService } from '../../services/audit.js';

export const projectEnvironmentsRouter = Router();

const projectEnvironmentSchema = z.object({
  type: z.enum(['production', 'staging']),
  name: z.string().trim().min(2).max(180),
  url: z.string().trim().url().max(500),
  apiUrl: z.string().trim().url().max(500).optional().nullable(),
});

projectEnvironmentsRouter.get(
  '/projects/:id/environments',
  requirePermission('admin.proyectos.view'),
  requireProjectOwnership,
  asyncHandler(async (req: Request, res: Response) => {
    const projectId = z.string().uuid().parse(req.params.id);
    const result = await pool.query(
      `SELECT id, project_id, type, name, url, api_url, branch_name, commit_sha, status, error_details, audit_report, created_at
       FROM project_environments
       WHERE project_id = $1
       ORDER BY CASE type WHEN 'production' THEN 0 WHEN 'staging' THEN 1 ELSE 2 END,
                created_at DESC`,
      [projectId],
    );
    res.json({ items: result.rows });
  }),
);

projectEnvironmentsRouter.post(
  '/projects/:id/environments',
  requireCsrf,
  requirePermission('admin.proyectos.manage'),
  requireProjectOwnership,
  asyncHandler(async (req: Request, res: Response) => {
    const projectId = z.string().uuid().parse(req.params.id);
    const body = projectEnvironmentSchema.parse(req.body);
    const result = await pool.query(
      `INSERT INTO project_environments (project_id, type, name, url, api_url, status)
       SELECT id, $2, $3, $4, $5, 'verifying'
       FROM projects
       WHERE id = $1 AND deleted_at IS NULL
       ON CONFLICT (project_id, type, name)
       DO UPDATE SET url = EXCLUDED.url, api_url = EXCLUDED.api_url, status = 'verifying', error_details = NULL
       RETURNING *, project_id, type, name, url, api_url, status, error_details, created_at`,
      [projectId, body.type, body.name, body.url, body.apiUrl || null],
    );
    if (!result.rowCount) throw new HttpError(404, 'Proyecto no encontrado');
    triggerEnvironmentVerification(result.rows[0].id, projectId);
    await auditService.logAdminAction({ userId: req.admin?.id, action: 'create_environment', entityType: 'project_environments', entity: result.rows[0], req });
    res.status(201).json({ item: result.rows[0] });
  }),
);

projectEnvironmentsRouter.post(
  '/projects/:id/environments/:environment_id/verify',
  requireCsrf,
  requirePermission('admin.proyectos.view'),
  requireProjectOwnership,
  asyncHandler(async (req: Request, res: Response) => {
    const projectId = z.string().uuid().parse(req.params.id);
    const environmentId = z.string().uuid().parse(req.params.environment_id);
    const result = await pool.query(
      `UPDATE project_environments
       SET status = 'verifying', error_details = NULL
       WHERE id = $1 AND project_id = $2
         AND type IN ('ephemeral', 'staging')
         AND status IN ('deployed_ui', 'active', 'ready', 'failed')
       RETURNING *`,
      [environmentId, projectId],
    );
    if (!result.rowCount) throw new HttpError(409, 'El entorno no está listo para iniciar la verificación.');
    triggerEnvironmentVerification(environmentId, projectId);
    await auditService.logAdminAction({ userId: req.admin?.id, action: 'verify_environment', entityType: 'project_environments', entityId: environmentId, previousState: result.rows[0], req });
    res.status(202).json({ ok: true });
  }),
);

projectEnvironmentsRouter.delete(
  '/projects/:id/environments/:environment_id',
  requireCsrf,
  requirePermission('admin.proyectos.manage'),
  requireProjectOwnership,
  asyncHandler(async (req: Request, res: Response) => {
    const projectId = z.string().uuid().parse(req.params.id);
    const environmentId = z.string().uuid().parse(req.params.environment_id);
    const result = await pool.query(
      'DELETE FROM project_environments WHERE id = $1 AND project_id = $2 RETURNING *',
      [environmentId, projectId],
    );
    if (!result.rowCount) throw new HttpError(404, 'Entorno no encontrado');
    await auditService.logAdminAction({ userId: req.admin?.id, action: 'delete_environment', entityType: 'project_environments', entityId: environmentId, previousState: result.rows[0], req });
    res.json({ ok: true });
  }),
);
