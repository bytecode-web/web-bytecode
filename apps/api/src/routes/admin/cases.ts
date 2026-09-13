import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { pool } from '../../db/pool.js';
import { requirePermission } from '../../middleware/auth.js';
import { requireCsrf } from '../../middleware/csrf.js';
import { requireNonTerminalState } from '../../middleware/requireNonTerminalState.js';
import { auditService } from '../../services/audit.js';
import { sendDirectInAppNotification } from '../../services/notificationService.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { HttpError } from '../../utils/httpError.js';
import { listQuerySchema, statusHistorySelect } from './shared.js';

export const casesRouter = Router();
const updateSchema = z.object({
  status: z.string().trim().min(1).max(80).optional(),
  priority: z.string().trim().min(1).max(40).optional(),
  adminNotes: z.string().max(3000).optional(),
});

const contactColumns = `
  c.id,
  c.case_code,
  cu.first_name as nombre,
  cu.last_name as apellido,
  COALESCE(co.position_title, NULLIF(trim((regexp_match(c.message, 'Cargo:[[:space:]]*([^[:cntrl:]]+)'))[1]), ''), '') as cargo,
  cu.primary_email as email,
  cu.primary_phone as celular,
  COALESCE(o.legal_name, NULLIF(trim((regexp_match(c.message, 'Empresa:[[:space:]]*([^[:cntrl:]]+)'))[1]), ''), '') as empresa,
  COALESCE(
    (SELECT document_number FROM organization_documents od WHERE od.organization_id = o.id AND od.is_active = true LIMIT 1),
    NULLIF(trim((regexp_match(c.message, 'RUC:[[:space:]]*([^[:cntrl:]]+)'))[1]), ''), 
    ''
  ) as ruc,
  COALESCE(s.name, c.subject) as servicio,
  c.message,
  sc.code as status,
  sc.name as status_name,
  c.internal_notes as admin_notes, pc.code as priority, pc.name as priority_name, pc.weight as priority_weight, c.assigned_to, c.created_at, c.updated_at
`;

const contactJoins = `
  JOIN customers cu ON c.customer_id = cu.id
  JOIN status_catalog sc ON c.status_id = sc.id
  LEFT JOIN priority_catalog pc ON c.priority_id = pc.id
  LEFT JOIN organizations o ON c.organization_id = o.id
  LEFT JOIN service_catalog s ON c.service_id = s.id
  LEFT JOIN customer_organizations co ON co.customer_id = c.customer_id
    AND co.organization_id = c.organization_id
    AND co.deleted_at IS NULL
`;

const legacyContactColumns = `
  c.id,
  c.case_code,
  cu.first_name as nombre,
  cu.last_name as apellido,
  COALESCE(NULLIF(trim((regexp_match(c.message, 'Cargo:[[:space:]]*([^[:cntrl:]]+)'))[1]), ''), '') as cargo,
  cu.primary_email as email,
  cu.primary_phone as celular,
  COALESCE(NULLIF(trim((regexp_match(c.message, 'Empresa:[[:space:]]*([^[:cntrl:]]+)'))[1]), ''), '') as empresa,
  COALESCE(NULLIF(trim((regexp_match(c.message, 'RUC:[[:space:]]*([^[:cntrl:]]+)'))[1]), ''), '') as ruc,
  c.subject as servicio,
  c.message,
  sc.code as status,
  sc.name as status_name,
  c.internal_notes as admin_notes, pc.code as priority, pc.name as priority_name, pc.weight as priority_weight, c.assigned_to, c.created_at, c.updated_at
`;

const legacyContactJoins = `
  JOIN customers cu ON c.customer_id = cu.id
  JOIN status_catalog sc ON c.status_id = sc.id
  LEFT JOIN priority_catalog pc ON c.priority_id = pc.id
`;

let normalizedContactSchema: boolean | null = null;

const hasNormalizedContactSchema = async () => {
  if (normalizedContactSchema !== null) return normalizedContactSchema;

  const result = await pool.query(`
    SELECT
      to_regclass('public.organizations') IS NOT NULL AS has_organizations,
      to_regclass('public.customer_organizations') IS NOT NULL AS has_customer_organizations,
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'contact_cases' AND column_name = 'organization_id'
      ) AS has_organization_id,
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'contact_cases' AND column_name = 'service_id'
      ) AS has_service_id
  `);

  const row = result.rows[0];
  normalizedContactSchema = Boolean(
    row?.has_organizations &&
    row?.has_customer_organizations &&
    row?.has_organization_id &&
    row?.has_service_id,
  );

  return normalizedContactSchema;
};

const complaintColumns = `
  c.id, c.complaint_code as code, cu.first_name as nombres, cu.last_name as apellidos, 
  '' as domicilio, '' as tipo_doc, '' as numero_doc, '' as prefijo_telefono, 
  cu.primary_phone as telefono, cu.primary_email as email, '' as person_type, 
  cg.good_type, cg.claimed_amount as monto_cuantificable, cg.description as descripcion, 
  '' as nombre_unidad, '' as opcion_bien, ct.name as claim_type, cg.category as tipo_reclamo, 
  cd.incident_detail as detalle, cd.requested_solution as pedido, sc.code as status,
  sc.name as status_name,
  c.internal_notes as admin_notes, pc.code as priority, pc.name as priority_name, pc.weight as priority_weight, fa.original_name as attachment_original_name, 
  fa.mime_type as attachment_mime_type, fa.byte_size as attachment_size,
  c.assigned_to, c.created_at, c.updated_at
`;

const buildWhere = (status?: string, search?: string, fields: string[] = []) => {
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (status) {
    params.push(status);
    clauses.push(`sc.code = $${params.length}`);
  }

  if (search) {
    params.push(`%${search}%`);
    const index = params.length;
    clauses.push(`(${fields.map((field) => `${field} ILIKE $${index}`).join(' OR ')})`);      
  }

  return {
    whereSql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
    params,
  };
};

casesRouter.get(
  '/cases/assignment-options',
  asyncHandler(async (req: Request, res: Response) => {
    const domain = req.query.domain as string;
    let allowedRoles = ['super_admin', 'admin'];
    
    if (domain === 'contact') {
      allowedRoles.push('support_agent');
    } else if (domain === 'complaint') {
      allowedRoles.push('legal_reviewer');
    }

    const result = await pool.query(
      `
      SELECT DISTINCT u.id, u.name
      FROM admin_users u
      JOIN admin_user_roles aur ON u.id = aur.admin_user_id
      JOIN roles r ON aur.role_id = r.id
      WHERE u.is_active = true AND u.deleted_at IS NULL
      AND r.code = ANY($1::varchar[])
      ORDER BY u.name ASC
      `,
      [allowedRoles]
    );

    res.json({ data: result.rows });
  })
);

casesRouter.get(
  '/contacts',
  requirePermission('admin.contactos.view'),
  asyncHandler(async (req: Request, res: Response) => {
    const query = listQuerySchema.parse(req.query);
    const normalized = await hasNormalizedContactSchema();
    const contactSearchFields = normalized
      ? ['cu.first_name', 'cu.last_name', 'cu.primary_email', 'cu.primary_phone', 'c.subject', 'c.message', 'o.legal_name', 'o.ruc', 'co.position_title', 's.name']
      : ['cu.first_name', 'cu.last_name', 'cu.primary_email', 'cu.primary_phone', 'c.subject', 'c.message'];
    const { whereSql, params } = buildWhere(query.status, query.search, contactSearchFields);
    const [result, countResult] = await Promise.all([pool.query(
      `
      SELECT ${normalized ? contactColumns : legacyContactColumns}
      FROM contact_cases c
      ${normalized ? contactJoins : legacyContactJoins}
      ${whereSql}
      ORDER BY pc.weight DESC NULLS LAST, c.created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `,
      [...params, query.limit, query.offset],
    ), pool.query(
      `SELECT count(*)::int AS total FROM (
         SELECT DISTINCT c.id
         FROM contact_cases c
         ${normalized ? contactJoins : legacyContactJoins}
         ${whereSql}
       ) records`,
      params,
    )]);

    res.json({ data: result.rows, total: countResult.rows[0].total });
  }),
);

casesRouter.get(
  '/contacts/:id',
  requirePermission('admin.contactos.view'),
  asyncHandler(async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const normalized = await hasNormalizedContactSchema();
    const result = await pool.query(
      `SELECT ${normalized ? contactColumns : legacyContactColumns} FROM contact_cases c ${normalized ? contactJoins : legacyContactJoins} WHERE c.id = $1`, 
      [id]
    );
    if (result.rowCount === 0) throw new HttpError(404, 'Mensaje no encontrado.');
    res.json({ item: result.rows[0] });
  }),
);

casesRouter.patch(
  '/contacts/:id',
  requireCsrf,
  requirePermission('admin.contactos.manage'),
  requireNonTerminalState('contact_cases'),
  asyncHandler(async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const body = updateSchema.parse(req.body);
    const normalized = await hasNormalizedContactSchema();
    const client = await pool.connect();
    let currentRow: Record<string, unknown>;
    let updatedRow: Record<string, unknown>;

    try {
      await client.query('BEGIN');
      const current = await client.query('SELECT * FROM contact_cases WHERE id = $1 FOR UPDATE', [id]);
      if (current.rowCount === 0) throw new HttpError(404, 'Mensaje no encontrado.');
      currentRow = current.rows[0];

      let newStatusId: string | undefined;
      let newPriorityId: string | undefined;

      if (body.priority) {
        const priorityResult = await client.query(
          "SELECT id FROM priority_catalog WHERE code = $1 AND is_active = true",
          [body.priority]
        );
        if (!priorityResult.rowCount) throw new HttpError(400, 'Prioridad invalida.');
        newPriorityId = priorityResult.rows[0].id;
      }

      if (body.status) {
        const statusResult = await client.query(
          "SELECT id FROM status_catalog WHERE domain = 'case' AND code = $1 AND is_active = true",
          [body.status]
        );
        if (!statusResult.rowCount) throw new HttpError(400, 'Estado de contacto invalido.');
        newStatusId = statusResult.rows[0].id;
      }

      const result = await client.query(
        `UPDATE contact_cases
         SET status_id = COALESCE($2, status_id),
             internal_notes = COALESCE($3, internal_notes),
             priority_id = COALESCE($4, priority_id),
             updated_at = now()
         WHERE id = $1
         RETURNING id`,
        [id, newStatusId ?? null, body.adminNotes ?? null, newPriorityId ?? null],
      );
      if (result.rowCount === 0) throw new HttpError(404, 'Mensaje no encontrado.');

      const oldStatusId = currentRow.status_id as string | undefined;
      if (oldStatusId && newStatusId && oldStatusId !== newStatusId) {
        await client.query(
          `INSERT INTO contact_case_status_history (contact_case_id, old_status_id, new_status_id, changed_by)
           VALUES ($1, $2, $3, $4)`,
          [id, oldStatusId, newStatusId, req.admin?.id ?? null],
        );

        const assignedTo = currentRow.assigned_to as string | undefined;
        if (assignedTo && assignedTo !== req.admin?.id) {
          const caseCode = currentRow.case_code || id.split('-')[0];
          await sendDirectInAppNotification(
            assignedTo,
            "Actualización de Contacto",
            `El estado del ticket #${caseCode} ha sido modificado.`,
            "contacts",
            id
          );
        }
      }

      const updated = await client.query(
        `SELECT ${normalized ? contactColumns : legacyContactColumns} FROM contact_cases c ${normalized ? contactJoins : legacyContactJoins} WHERE c.id = $1`,
        [id],
      );
      updatedRow = updated.rows[0];
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    await auditService.logAdminAction({
        userId: req.admin?.id,
        action: 'update',
        entityType: 'contact_submission',
        entity: updatedRow,
        previousState: currentRow,
        req
    });

    res.json({ item: updatedRow });
  }),
);

const assignSchema = z.object({
  assigned_to: z.string().uuid().or(z.literal('')).optional().nullable(),
  notes: z.string().max(3000).optional(),
});

casesRouter.post(
  '/contacts/:id/assign',
  requireCsrf,
  requirePermission('admin.contactos.assign'),
  asyncHandler(async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const body = assignSchema.parse(req.body);
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const current = await client.query('SELECT * FROM contact_cases WHERE id = $1', [id]);
      if (current.rowCount === 0) throw new HttpError(404, 'Mensaje no encontrado.');

      const assignedTo = body.assigned_to ? body.assigned_to : null;

      await client.query(
        'UPDATE contact_case_assignments SET unassigned_at = NOW() WHERE contact_case_id = $1 AND unassigned_at IS NULL',
        [id]
      );
      
      if (assignedTo) {
        await client.query(
          'INSERT INTO contact_case_assignments (contact_case_id, assigned_to, assigned_by, notes) VALUES ($1, $2, $3, $4)',
          [id, assignedTo, req.admin?.id, body.notes ?? null]
        );
      }
      
      const updateResult = await client.query(
        'UPDATE contact_cases SET assigned_to = $2, updated_at = NOW() WHERE id = $1 RETURNING id',
        [id, assignedTo]
      );
      
      if (updateResult.rowCount === 0) {
        throw new HttpError(404, 'Mensaje no encontrado.');
      }
      
      await client.query('COMMIT');

      const caseCode = current.rows[0].case_code || current.rows[0].id.split('-')[0];

      if (assignedTo !== current.rows[0].assigned_to) {
        // Notificar al antiguo asignado (si no es el que hace el cambio)
        if (current.rows[0].assigned_to && current.rows[0].assigned_to !== req.admin?.id) {
          await sendDirectInAppNotification(
            current.rows[0].assigned_to,
            "Asignación Removida",
            `Has sido removido del ticket de contacto #${caseCode}.`,
            "contacts",
            id
          );
        }
        
        // Notificar al nuevo asignado (si no es el que hace el cambio)
        if (assignedTo && assignedTo !== req.admin?.id) {
          await sendDirectInAppNotification(
            assignedTo,
            "Contacto Asignado",
            `Te han asignado el ticket de contacto #${caseCode}.`,
            "contacts",
            id
          );
        }
      }
      
      const normalized = await hasNormalizedContactSchema();
      const updated = await client.query(
        `SELECT ${normalized ? contactColumns : legacyContactColumns} FROM contact_cases c ${normalized ? contactJoins : legacyContactJoins} WHERE c.id = $1`, 
        [id]
      );

      await auditService.logAdminAction({
        userId: req.admin?.id,
        action: 'assign',
        entityType: 'contact_submission',
        entity: updated.rows[0],
        previousState: current.rows[0],
        req
      });

      res.json({ item: updated.rows[0] });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }),
);

casesRouter.get(
  '/contacts/:id/assignment-history',
  requirePermission('admin.contactos.view'),
  asyncHandler(async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const result = await pool.query(
      `SELECT a.*, u1.name as assigned_to_name, u2.name as assigned_by_name 
      FROM contact_case_assignments a 
      JOIN admin_users u1 ON a.assigned_to = u1.id 
      LEFT JOIN admin_users u2 ON a.assigned_by = u2.id 
      WHERE a.contact_case_id = $1 
      ORDER BY a.assigned_at DESC`,
      [id]
    );
    res.json({ items: result.rows });
  }),
);

casesRouter.get(
  '/contacts/:id/history',
  requirePermission('admin.contactos.view'),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await pool.query(
      statusHistorySelect('contact_case_status_history', 'contact_case_id'),
      [String(req.params.id)],
    );
    res.json({ items: result.rows });
  }),
);

casesRouter.get(
  '/complaints',
  requirePermission('admin.reclamos.view'),
  asyncHandler(async (req: Request, res: Response) => {
    const query = listQuerySchema.parse(req.query);
    const { whereSql, params } = buildWhere(query.status, query.search, [
      'c.complaint_code',
      'cu.first_name',
      'cu.last_name',
      'cu.primary_email',
      'cg.category'
    ]);
    const [result, countResult] = await Promise.all([pool.query(
      `
      SELECT c.id, c.complaint_code as code, c.assigned_to, cu.first_name as nombres, cu.last_name as apellidos, cu.primary_email as email, cu.primary_phone as telefono, ct.name as claim_type, cg.category as tipo_reclamo, sc.code AS status, sc.name AS status_name, sc.is_terminal as "isTerminal", pc.code as priority, pc.name as priority_name, pc.weight as priority_weight, fa.original_name as attachment_original_name, c.created_at, c.updated_at
      FROM complaints c
      JOIN customers cu ON c.customer_id = cu.id
      JOIN status_catalog sc ON c.status_id = sc.id
      LEFT JOIN priority_catalog pc ON c.priority_id = pc.id
      JOIN complaint_types ct ON c.complaint_type_id = ct.id
      LEFT JOIN complaint_goods cg ON c.id = cg.complaint_id
      LEFT JOIN complaint_evidences ce ON c.id = ce.complaint_id
      LEFT JOIN file_assets fa ON ce.file_asset_id = fa.id
      ${whereSql}
      ORDER BY pc.weight DESC NULLS LAST, c.created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `,
      [...params, query.limit, query.offset],
    ), pool.query(
      `SELECT count(*)::int AS total FROM (
         SELECT DISTINCT c.id
         FROM complaints c
         JOIN customers cu ON c.customer_id = cu.id
         JOIN status_catalog sc ON c.status_id = sc.id
         LEFT JOIN priority_catalog pc ON c.priority_id = pc.id
         LEFT JOIN complaint_goods cg ON c.id = cg.complaint_id
         ${whereSql}
       ) records`,
      params,
    )]);

    res.json({ data: result.rows, total: countResult.rows[0].total });
  }),
);

casesRouter.get(
  '/complaints/:id/history',
  requirePermission('admin.reclamos.view'),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await pool.query(
      statusHistorySelect('complaint_status_history', 'complaint_id'),
      [String(req.params.id)],
    );
    res.json({ items: result.rows });
  }),
);

casesRouter.get(
  '/complaints/:id',
  requirePermission('admin.reclamos.view'),
  asyncHandler(async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const result = await pool.query(
      `SELECT ${complaintColumns} 
      FROM complaints c
      JOIN customers cu ON c.customer_id = cu.id
      JOIN status_catalog sc ON c.status_id = sc.id
      LEFT JOIN priority_catalog pc ON c.priority_id = pc.id
      JOIN complaint_types ct ON c.complaint_type_id = ct.id
      LEFT JOIN complaint_details cd ON c.id = cd.complaint_id
      LEFT JOIN complaint_goods cg ON c.id = cg.complaint_id
      LEFT JOIN complaint_evidences ce ON c.id = ce.complaint_id
      LEFT JOIN file_assets fa ON ce.file_asset_id = fa.id
      WHERE c.id = $1`, 
      [id]
    );
    if (result.rowCount === 0) throw new HttpError(404, 'Reclamo no encontrado.');
    res.json({ item: result.rows[0] });
  }),
);

casesRouter.patch(
  '/complaints/:id',
  requireCsrf,
  requirePermission('admin.reclamos.manage'),
  requireNonTerminalState('complaints'),
  asyncHandler(async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const body = updateSchema.parse(req.body);
    const client = await pool.connect();
    let currentRow: Record<string, unknown>;
    let updatedRow: Record<string, unknown>;

    try {
      await client.query('BEGIN');
      const current = await client.query(
        'SELECT id, status_id, internal_notes, assigned_to, updated_at FROM complaints WHERE id = $1 FOR UPDATE',
        [id],
      );
      if (current.rowCount === 0) throw new HttpError(404, 'Reclamo no encontrado.');
      currentRow = current.rows[0];

      let newStatusId: string | undefined;
      let newPriorityId: string | undefined;

      if (body.priority) {
        const priorityResult = await client.query(
          "SELECT id FROM priority_catalog WHERE code = $1 AND is_active = true",
          [body.priority]
        );
        if (!priorityResult.rowCount) throw new HttpError(400, 'Prioridad invalida.');
        newPriorityId = priorityResult.rows[0].id;
      }

      if (body.status) {
        const statusResult = await client.query(
          "SELECT id FROM status_catalog WHERE domain = 'complaint' AND code = $1 AND is_active = true",
          [body.status]
        );
        if (!statusResult.rowCount) throw new HttpError(400, 'Estado de reclamo invalido.');
        newStatusId = statusResult.rows[0].id;
      }

      const result = await client.query(
        `UPDATE complaints
         SET status_id = COALESCE($2, status_id),
             internal_notes = COALESCE($3, internal_notes),
             priority_id = COALESCE($4, priority_id),
             updated_at = now()
         WHERE id = $1
         RETURNING id`,
        [id, newStatusId ?? null, body.adminNotes ?? null, newPriorityId ?? null],
      );
      if (result.rowCount === 0) throw new HttpError(404, 'Reclamo no encontrado.');

      const oldStatusId = currentRow.status_id as string | undefined;
      if (oldStatusId && newStatusId && oldStatusId !== newStatusId) {
        await client.query(
          `INSERT INTO complaint_status_history (complaint_id, old_status_id, new_status_id, changed_by)
           VALUES ($1, $2, $3, $4)`,
          [id, oldStatusId, newStatusId, req.admin?.id ?? null],
        );

        const assignedTo = currentRow.assigned_to as string | undefined;
        if (assignedTo && assignedTo !== req.admin?.id) {
          const complaintCode = currentRow.complaint_code || id.split('-')[0];
          await sendDirectInAppNotification(
            assignedTo,
            "Actualización de Reclamo",
            `El estado del reclamo #${complaintCode} ha sido modificado.`,
            "complaints",
            id
          );
        }
      }

      const updated = await client.query(
        `SELECT ${complaintColumns}
         FROM complaints c
         JOIN customers cu ON c.customer_id = cu.id
         JOIN status_catalog sc ON c.status_id = sc.id
      LEFT JOIN priority_catalog pc ON c.priority_id = pc.id
      JOIN complaint_types ct ON c.complaint_type_id = ct.id
         LEFT JOIN complaint_details cd ON c.id = cd.complaint_id
         LEFT JOIN complaint_goods cg ON c.id = cg.complaint_id
         LEFT JOIN complaint_evidences ce ON c.id = ce.complaint_id
         LEFT JOIN file_assets fa ON ce.file_asset_id = fa.id
         WHERE c.id = $1`,
        [id],
      );
      updatedRow = updated.rows[0];
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    await auditService.logAdminAction({
      userId: req.admin?.id,
      action: 'update',
      entityType: 'complaint',
      entity: updatedRow,
      previousState: currentRow,
      req
    });

    res.json({ item: updatedRow });
  }),
);

casesRouter.get(
  '/complaints/:id/attachment',
  requirePermission('admin.reclamos.view'),
  asyncHandler(async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const result = await pool.query(
      `
      SELECT fa.original_name, fa.mime_type, fa.storage_provider, fa.storage_key, fa.public_url
      FROM complaints c
      JOIN complaint_evidences ce ON c.id = ce.complaint_id
      JOIN file_assets fa ON ce.file_asset_id = fa.id
      WHERE c.id = $1
      `,
      [id],
    );

    if (result.rowCount === 0) throw new HttpError(404, 'Reclamo o adjunto no encontrado.');

    const item = result.rows[0];
    const downloadUrl = item.public_url ?? (typeof item.storage_key === 'string' && item.storage_key.startsWith('https://') ? item.storage_key : null);
    if (item.storage_provider !== 'cloudinary' || !downloadUrl) {
      throw new HttpError(404, 'Adjunto no disponible en almacenamiento persistente.');
    }

    await auditService.logAdminAction({
      userId: req.admin?.id,
      action: 'download_attachment',
      entityType: 'complaint',
      entity: id,
      req
    });
    res.redirect(302, downloadUrl);
  }),
);

casesRouter.post(
  '/complaints/:id/assign',
  requireCsrf,
  requirePermission('admin.reclamos.assign'),
  asyncHandler(async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const body = assignSchema.parse(req.body);
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      const current = await client.query('SELECT id, complaint_code, customer_id, status_id, priority_id, assigned_to FROM complaints WHERE id = $1', [id]);
      if (current.rowCount === 0) throw new HttpError(404, 'Reclamo no encontrado.');

      const assignedTo = body.assigned_to ? body.assigned_to : null;

      await client.query(
        'UPDATE complaint_assignments SET unassigned_at = NOW() WHERE complaint_id = $1 AND unassigned_at IS NULL',
        [id]
      );
      
      if (assignedTo) {
        await client.query(
          'INSERT INTO complaint_assignments (complaint_id, assigned_to, assigned_by, notes) VALUES ($1, $2, $3, $4)',
          [id, assignedTo, req.admin?.id, body.notes ?? null]
        );
      }
      
      const updateResult = await client.query(
        'UPDATE complaints SET assigned_to = $2, updated_at = NOW() WHERE id = $1 RETURNING id, complaint_code',
        [id, assignedTo]
      );
      
      if (updateResult.rowCount === 0) {
        throw new HttpError(404, 'Reclamo no encontrado.');
      }
      
      await client.query('COMMIT');

      const complaintCode = current.rows[0].complaint_code || current.rows[0].id.split('-')[0];

      if (assignedTo !== current.rows[0].assigned_to) {
        if (current.rows[0].assigned_to && current.rows[0].assigned_to !== req.admin?.id) {
          await sendDirectInAppNotification(
            current.rows[0].assigned_to,
            "Asignación Removida",
            `Has sido removido del reclamo #${complaintCode}.`,
            "complaints",
            id
          );
        }
        
        if (assignedTo && assignedTo !== req.admin?.id) {
          await sendDirectInAppNotification(
            assignedTo,
            "Reclamo Asignado",
            `Te han asignado el reclamo #${complaintCode}.`,
            "complaints",
            id
          );
        }
      }

      const updated = await client.query(
        `SELECT ${complaintColumns} 
        FROM complaints c
        JOIN customers cu ON c.customer_id = cu.id
        JOIN status_catalog sc ON c.status_id = sc.id
        LEFT JOIN priority_catalog pc ON c.priority_id = pc.id
        JOIN complaint_types ct ON c.complaint_type_id = ct.id
        LEFT JOIN complaint_details cd ON c.id = cd.complaint_id
        LEFT JOIN complaint_goods cg ON c.id = cg.complaint_id
        LEFT JOIN complaint_evidences ce ON c.id = ce.complaint_id
        LEFT JOIN file_assets fa ON ce.file_asset_id = fa.id
        WHERE c.id = $1`, 
        [id]
      );

      await auditService.logAdminAction({
        userId: req.admin?.id,
        action: 'assign_complaint',
        entityType: 'complaint',
        entity: updated.rows[0],
        previousState: current.rows[0],
        req
      });

      res.json({ item: updated.rows[0] });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  })
);

casesRouter.get(
  '/complaints/:id/assignment-history',
  requirePermission('admin.reclamos.view'),
  asyncHandler(async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const result = await pool.query(
      `
      SELECT 
        ca.id, ca.assigned_to, ca.assigned_by, ca.assigned_at, ca.unassigned_at, ca.notes,
        u1.name as assigned_to_name,
        u2.name as assigned_by_name
      FROM complaint_assignments ca
      LEFT JOIN admin_users u1 ON ca.assigned_to = u1.id
      LEFT JOIN admin_users u2 ON ca.assigned_by = u2.id
      WHERE ca.complaint_id = $1
      ORDER BY ca.assigned_at DESC
      `,
      [id]
    );
    res.json({ items: result.rows });
  })
);
