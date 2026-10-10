import crypto from 'crypto';
import bcrypt from 'bcryptjs';
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
import { notifyCustomer } from '../../services/email.js';
import { buildComplaintResolution } from '../../services/emailTemplates.js';
import { upload } from './shared.js';
import { validateUpload } from '../../lib/validateUpload.js';
import { uploadComplaintEvidenceToCloudinary } from '../../lib/cloudinary.js';
import { listQuerySchema, statusHistorySelect } from './shared.js';

export const casesRouter = Router();

const createContactSchema = z.object({
  customer_id: z.string().uuid(),
  organization_id: z.string().uuid().optional().nullable(),
  category_id: z.string().uuid().optional().nullable(),
  source_channel_id: z.string().uuid().optional().nullable(),
  priority_id: z.string().uuid().optional().nullable(),
  subject: z.string().trim().max(220).optional().nullable(),
  message: z.string().trim().optional().nullable(),
});

const updateSchema = z.object({
  status: z.string().trim().min(1).max(80).optional(),
  priority: z.string().trim().min(1).max(40).optional(),
  adminNotes: z.string().max(3000).optional(),
  category_id: z.string().uuid().optional().nullable(),
  reason: z.string().trim().optional().nullable(),
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
  c.internal_notes as admin_notes, pc.code as priority, pc.name as priority_name, pc.weight as priority_weight, c.assigned_to, c.created_at, c.updated_at, c.first_response_due_at, c.resolved_at, c.closed_at,
  ccat.code as source_channel, ccat.icon_name as channel_icon, ccat.color_hex as channel_color,
  c.category_id, cat.name as category_name, cat.code as category_code,
  c.organization_id,
  cu.person_type as customer_person_type,
  CASE
    WHEN c.organization_id IS NOT NULL 
      OR NULLIF(trim(COALESCE(o.legal_name, (regexp_match(c.message, 'Empresa:[[:space:]]*([^[:cntrl:]]+)'))[1])), '') IS NOT NULL
      OR NULLIF(trim(COALESCE((SELECT document_number FROM organization_documents od WHERE od.organization_id = o.id AND od.is_active = true LIMIT 1), (regexp_match(c.message, 'RUC:[[:space:]]*([^[:cntrl:]]+)'))[1])), '') IS NOT NULL
      OR cu.person_type = 'company'
    THEN 'B2B'
    ELSE 'B2C'
  END as b2_type,
  (
    SELECT dt.name
    FROM customer_documents cd
    JOIN document_types dt ON cd.document_type_id = dt.id
    WHERE cd.customer_id = cu.id AND cd.is_primary = true AND cd.deleted_at IS NULL
    LIMIT 1
  ) as document_type_name,
  (
    SELECT cd.document_number
    FROM customer_documents cd
    WHERE cd.customer_id = cu.id AND cd.is_primary = true AND cd.deleted_at IS NULL
    LIMIT 1
  ) as document_number
`;

const contactJoins = `
  JOIN customers cu ON c.customer_id = cu.id LEFT JOIN channel_catalog ccat ON c.source_channel_id = ccat.id
  JOIN status_catalog sc ON c.status_id = sc.id
  LEFT JOIN priority_catalog pc ON c.priority_id = pc.id
  LEFT JOIN organizations o ON c.organization_id = o.id
  LEFT JOIN service_catalog s ON c.service_id = s.id
  LEFT JOIN customer_organizations co ON co.customer_id = c.customer_id
    AND co.organization_id = c.organization_id
    AND co.deleted_at IS NULL
  LEFT JOIN contact_categories cat ON c.category_id = cat.id
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
  c.internal_notes as admin_notes, pc.code as priority, pc.name as priority_name, pc.weight as priority_weight, c.assigned_to, c.created_at, c.updated_at, c.first_response_due_at, c.resolved_at, c.closed_at,
  ccat.code as source_channel, ccat.icon_name as channel_icon, ccat.color_hex as channel_color,
  c.category_id, cat.name as category_name, cat.code as category_code,
  NULL::uuid as organization_id,
  cu.person_type as customer_person_type,
  CASE
    WHEN NULLIF(trim((regexp_match(c.message, 'Empresa:[[:space:]]*([^[:cntrl:]]+)'))[1]), '') IS NOT NULL
      OR NULLIF(trim((regexp_match(c.message, 'RUC:[[:space:]]*([^[:cntrl:]]+)'))[1]), '') IS NOT NULL
      OR cu.person_type = 'company'
    THEN 'B2B'
    ELSE 'B2C'
  END as b2_type,
  (
    SELECT dt.name
    FROM customer_documents cd
    JOIN document_types dt ON cd.document_type_id = dt.id
    WHERE cd.customer_id = cu.id AND cd.is_primary = true AND cd.deleted_at IS NULL
    LIMIT 1
  ) as document_type_name,
  (
    SELECT cd.document_number
    FROM customer_documents cd
    WHERE cd.customer_id = cu.id AND cd.is_primary = true AND cd.deleted_at IS NULL
    LIMIT 1
  ) as document_number
`;

const legacyContactJoins = `
  JOIN customers cu ON c.customer_id = cu.id LEFT JOIN channel_catalog ccat ON c.source_channel_id = ccat.id
  JOIN status_catalog sc ON c.status_id = sc.id
  LEFT JOIN priority_catalog pc ON c.priority_id = pc.id
  LEFT JOIN contact_categories cat ON c.category_id = cat.id
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
  c.id, c.complaint_code as code, 
  COALESCE(c.customer_snapshot->>'nombres', cu.first_name) as nombres, 
  COALESCE(c.customer_snapshot->>'apellidos', cu.last_name) as apellidos, 
  COALESCE(c.customer_snapshot->>'domicilio', '') as domicilio, 
  COALESCE(c.customer_snapshot->>'tipoDoc', '') as tipo_doc, 
  COALESCE(c.customer_snapshot->>'numeroDoc', '') as numero_doc, 
  COALESCE(c.customer_snapshot->>'prefijoTelefono', '') as prefijo_telefono, 
  COALESCE(c.customer_snapshot->>'telefono', cu.primary_phone) as telefono, 
  COALESCE(c.customer_snapshot->>'email', cu.primary_email) as email, 
  COALESCE(c.customer_snapshot->>'personType', '') as person_type, 
  cg.good_type, cg.claimed_amount as monto_cuantificable, cg.description as descripcion, 
  cg.project_or_unit_name as nombre_unidad, '' as opcion_bien, ct.name as claim_type, cg.category as tipo_reclamo, 
  cd.incident_detail as detalle, cd.requested_solution as pedido, sc.code as status,
  sc.name as status_name, sc.is_terminal as is_terminal,
  cd.customer_ip, cd.customer_user_agent, c.legal_response_due_at, c.legal_acceptance_at,
  c.internal_notes as admin_notes, pc.code as priority, pc.name as priority_name, pc.weight as priority_weight, fa.original_name as attachment_original_name, 
  fa.mime_type as attachment_mime_type, fa.byte_size as attachment_size,
  c.assigned_to, c.created_at, c.updated_at,
  ccat.code as source_channel, ccat.icon_name as channel_icon, ccat.color_hex as channel_color
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

casesRouter.post(
  '/contacts',
  requirePermission('admin.contactos.manage'),
  requireCsrf,
  asyncHandler(async (req: Request, res: Response) => {
    const schema = z.object({
      customer_id: z.string().uuid(),
      organization_id: z.string().uuid().optional().nullable(),
      source_channel_id: z.string().uuid(),
      category_id: z.string().uuid(),
      subject: z.string().min(1),
      message: z.string().min(1)
    });
    const body = schema.parse(req.body);
    
    // Obtener default priority desde category
    const catRes = await pool.query('SELECT default_priority_id FROM contact_categories WHERE id = $1', [body.category_id]);
    let priorityId = catRes.rows[0]?.default_priority_id;
    
    if (!priorityId) {
      const prioRes = await pool.query("SELECT id FROM priority_catalog WHERE code = 'normal'");
      priorityId = prioRes.rows[0]?.id;
    }
    
    const caseCode = `CAS-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

    const result = await pool.query(
      `
      INSERT INTO contact_cases (
        case_code, customer_id, organization_id, source_channel_id, category_id, subject, message, priority_id, first_response_due_at, status_id, created_by
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, NOW() + INTERVAL '24 hours', (SELECT id FROM status_catalog WHERE code = 'new' AND domain = 'case'), $9
      ) RETURNING id
      `,
      [caseCode, body.customer_id, body.organization_id || null, body.source_channel_id, body.category_id, body.subject, body.message, priorityId, (req as any).admin.id]
    );

    const insertedId = result.rows[0].id;
    const normalized = await hasNormalizedContactSchema();
    const fullTicketResult = await pool.query(
      `SELECT ${normalized ? contactColumns : legacyContactColumns} FROM contact_cases c ${normalized ? contactJoins : legacyContactJoins} WHERE c.id = $1`, 
      [insertedId]
    );
    const fullTicket = fullTicketResult.rows[0];

    await auditService.logAdminAction({
      userId: (req as any).admin.id,
      action: 'create',
      entityType: 'contact_submission',
      entity: fullTicket,
      req
    });

    res.status(201).json({ item: fullTicket });
  })
);

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
      
      const currentFull = await client.query(
        `SELECT ${normalized ? contactColumns : legacyContactColumns} FROM contact_cases c ${normalized ? contactJoins : legacyContactJoins} WHERE c.id = $1`,
        [id]
      );
      currentRow = currentFull.rows[0];
      const rawCurrent = current.rows[0];

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

      let extraUpdate = "";
      if (body.status) {
        if (body.status === 'resolved') {
           extraUpdate = ", resolved_at = COALESCE(resolved_at, now()), closed_at = NULL";
        } else if (body.status === 'closed' || body.status === 'lost') {
           extraUpdate = ", resolved_at = COALESCE(resolved_at, now()), closed_at = COALESCE(closed_at, now())";
        } else {
           extraUpdate = ", resolved_at = NULL, closed_at = NULL";
        }
      }

      const result = await client.query(
        `UPDATE contact_cases
         SET status_id = COALESCE($2, status_id),
             internal_notes = COALESCE($3, internal_notes),
             priority_id = COALESCE($4, priority_id),
             category_id = COALESCE($5, category_id),
             updated_at = now()
             ${extraUpdate}
         WHERE id = $1
         RETURNING id`,
        [id, newStatusId ?? null, body.adminNotes ?? null, newPriorityId ?? null, body.category_id ?? null],
      );
      if (result.rowCount === 0) throw new HttpError(404, 'Mensaje no encontrado.');

      const oldStatusId = rawCurrent.status_id as string | undefined;
      if (oldStatusId && newStatusId && oldStatusId !== newStatusId) {
        if (!body.reason || !body.reason.trim()) {
          throw new HttpError(400, 'El motivo del cambio de estado es obligatorio.');
        }
        await client.query(
          `INSERT INTO contact_case_status_history (contact_case_id, old_status_id, new_status_id, changed_by, reason)
           VALUES ($1, $2, $3, $4, $5)`,
          [id, oldStatusId, newStatusId, req.admin?.id ?? null, body.reason ?? null],
        );

        const assignedTo = rawCurrent.assigned_to as string | undefined;
        if (assignedTo && assignedTo !== req.admin?.id) {
          const caseCode = rawCurrent.case_code || id.split('-')[0];
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
      
      // Inject reason into audit log
      if (body.reason && body.status) {
        updatedRow.status_change_reason = body.reason;
        currentRow.status_change_reason = null;
      }

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
      
      const normalized = await hasNormalizedContactSchema();
      const currentFullResult = await client.query(
        `SELECT ${normalized ? contactColumns : legacyContactColumns} FROM contact_cases c ${normalized ? contactJoins : legacyContactJoins} WHERE c.id = $1`,
        [id]
      );
      const currentFull = currentFullResult.rows[0];

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
      
      const updated = await client.query(
        `SELECT ${normalized ? contactColumns : legacyContactColumns} FROM contact_cases c ${normalized ? contactJoins : legacyContactJoins} WHERE c.id = $1`, 
        [id]
      );

      await auditService.logAdminAction({
        userId: req.admin?.id,
        action: 'assign',
        entityType: 'contact_submission',
        entity: updated.rows[0],
        previousState: currentFull,
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
  '/complaints/metrics',
  requirePermission('admin.reclamos.view'),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE sc.is_terminal = false AND c.deleted_at IS NULL) as total_activos,
        COUNT(*) FILTER (WHERE sc.is_terminal = false AND c.deleted_at IS NULL AND c.legal_response_due_at >= NOW() AND c.legal_response_due_at <= NOW() + INTERVAL '7 days') as por_vencer,
        AVG(EXTRACT(EPOCH FROM (c.updated_at - c.created_at)) / 86400) FILTER (WHERE sc.is_terminal = true AND c.deleted_at IS NULL) as avg_resolution_days
      FROM complaints c
      JOIN status_catalog sc ON c.status_id = sc.id
    `);
    
    res.json({ data: result.rows[0] });
  })
);

export const complaintsQuerySchema = z.object({
  status: z.string().optional(),
  search: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(9),
  offset: z.coerce.number().int().min(0).default(0),
  urgency: z.string().optional(),
  tipo: z.string().optional(),
  origin: z.string().optional(),
  agent: z.string().optional(),
  archived: z.enum(['true', 'false']).optional().default('false')
});

casesRouter.get(
  '/complaints',
  requirePermission('admin.reclamos.view'),
  asyncHandler(async (req: Request, res: Response) => {
    const query = complaintsQuerySchema.parse(req.query);
    const { whereSql, params } = buildWhere(query.status, query.search, [
      'c.complaint_code',
      'cu.first_name',
      'cu.last_name',
      'cu.primary_email',
      'cg.category',
      'c.customer_snapshot->>\'numeroDoc\'',
      'c.customer_snapshot->>\'nombres\'',
      'c.customer_snapshot->>\'apellidos\''
    ]);
    
    // Extend whereSql with specialized filters
    let extraWhere = '';
    
    if (query.archived === 'true') {
      extraWhere += ` AND c.deleted_at IS NOT NULL`;
    } else {
      extraWhere += ` AND c.deleted_at IS NULL`;
    }

    if (query.agent) {
      params.push(query.agent);
      extraWhere += ` AND c.assigned_to = $${params.length}`;
    }
    
    if (query.urgency) {
      // SLU urgency filters (SLA)
      if (query.urgency === 'vencido') {
        extraWhere += ` AND c.legal_response_due_at < NOW()`;
      } else if (query.urgency === 'proximo') {
        // En los próximos 5 días hábiles aprox, asumiremos <= 7 días calendario para la query
        extraWhere += ` AND c.legal_response_due_at >= NOW() AND c.legal_response_due_at <= NOW() + INTERVAL '7 days'`;
      } else if (query.urgency === 'en_plazo') {
        extraWhere += ` AND c.legal_response_due_at > NOW() + INTERVAL '7 days'`;
      }
    }
    
    if (query.tipo) {
      if (query.tipo === 'b2b') {
        extraWhere += ` AND (c.customer_snapshot->>'tipoDoc' = 'RUC' OR c.customer_snapshot->>'personType' = 'company')`;
      } else if (query.tipo === 'b2c') {
        extraWhere += ` AND (c.customer_snapshot->>'tipoDoc' != 'RUC' AND (c.customer_snapshot->>'personType' IS NULL OR c.customer_snapshot->>'personType' != 'company'))`;
      } else if (query.tipo === 'reclamo') {
        extraWhere += ` AND ct.name = 'Reclamo'`;
      } else if (query.tipo === 'queja') {
        extraWhere += ` AND ct.name = 'Queja'`;
      }
    }
    
    if (query.origin) {
      if (query.origin === 'nacional') {
        extraWhere += ` AND COALESCE(c.customer_snapshot->>'telefono', cu.primary_phone) LIKE '+51 %'`;
      } else if (query.origin === 'internacional') {
        extraWhere += ` AND COALESCE(c.customer_snapshot->>'telefono', cu.primary_phone) NOT LIKE '+51 %' AND COALESCE(c.customer_snapshot->>'telefono', cu.primary_phone) LIKE '+%'`;
      }
    }
    
    const finalWhereSql = whereSql ? whereSql + extraWhere : 'WHERE 1=1 ' + extraWhere;

    const [result, countResult] = await Promise.all([pool.query(
      `
      SELECT c.id, c.complaint_code as code, c.assigned_to, 
             COALESCE(c.customer_snapshot->>'nombres', cu.first_name) as nombres, 
             COALESCE(c.customer_snapshot->>'apellidos', cu.last_name) as apellidos, 
             COALESCE(c.customer_snapshot->>'email', cu.primary_email) as email, 
             COALESCE(c.customer_snapshot->>'telefono', cu.primary_phone) as telefono, 
             COALESCE(c.customer_snapshot->>'tipoDoc', '') as tipo_doc, 
             COALESCE(c.customer_snapshot->>'personType', '') as person_type, 
             ct.name as claim_type, cg.category as tipo_reclamo, 
             sc.code AS status, sc.name AS status_name, sc.is_terminal as "isTerminal", 
             pc.code as priority, pc.name as priority_name, pc.weight as priority_weight, 
             fa.original_name as attachment_original_name, c.created_at, c.updated_at, c.legal_response_due_at, c.deleted_at
      FROM complaints c
      JOIN customers cu ON c.customer_id = cu.id LEFT JOIN channel_catalog ccat ON c.source_channel_id = ccat.id
      JOIN status_catalog sc ON c.status_id = sc.id
      LEFT JOIN priority_catalog pc ON c.priority_id = pc.id
      JOIN complaint_types ct ON c.complaint_type_id = ct.id
      LEFT JOIN complaint_goods cg ON c.id = cg.complaint_id
      LEFT JOIN complaint_evidences ce ON c.id = ce.complaint_id
      LEFT JOIN file_assets fa ON ce.file_asset_id = fa.id
      ${finalWhereSql}
      ORDER BY pc.weight DESC NULLS LAST, c.created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `,
      [...params, query.limit, query.offset],
    ), pool.query(
      `SELECT count(*)::int AS total FROM (
         SELECT DISTINCT c.id
         FROM complaints c
         JOIN customers cu ON c.customer_id = cu.id LEFT JOIN channel_catalog ccat ON c.source_channel_id = ccat.id
         JOIN status_catalog sc ON c.status_id = sc.id
         LEFT JOIN priority_catalog pc ON c.priority_id = pc.id
         JOIN complaint_types ct ON c.complaint_type_id = ct.id
         LEFT JOIN complaint_goods cg ON c.id = cg.complaint_id
         ${finalWhereSql}
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
      JOIN customers cu ON c.customer_id = cu.id LEFT JOIN channel_catalog ccat ON c.source_channel_id = ccat.id
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
        if (['resolved', 'closed', 'founded', 'unfounded'].includes(body.status)) {
          const hasResponse = await client.query('SELECT id FROM complaint_responses WHERE complaint_id = $1 LIMIT 1', [id]);
          if (hasResponse.rowCount === 0) throw new HttpError(400, 'No se puede cerrar un reclamo sin emitir previamente una respuesta oficial trazable.');
        }

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
         JOIN customers cu ON c.customer_id = cu.id LEFT JOIN channel_catalog ccat ON c.source_channel_id = ccat.id
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
  '/complaints/:id/evidences',
  requirePermission('admin.reclamos.view'),
  asyncHandler(async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const result = await pool.query(
      `
      SELECT fa.id, fa.original_name, fa.mime_type, fa.storage_provider, fa.storage_key, fa.public_url, ce.created_at
      FROM complaints c
      JOIN complaint_evidences ce ON c.id = ce.complaint_id
      JOIN file_assets fa ON ce.file_asset_id = fa.id
      WHERE c.id = $1
      ORDER BY ce.created_at ASC
      `,
      [id],
    );
    res.json({ items: result.rows });
  })
);

casesRouter.get(
  '/complaints/:id/attachment',
  requirePermission('admin.reclamos.view'),
  asyncHandler(async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const fileId = req.query.fileId as string;

    let query = `
      SELECT fa.original_name, fa.mime_type, fa.storage_provider, fa.storage_key, fa.public_url
      FROM complaints c
      JOIN complaint_evidences ce ON c.id = ce.complaint_id
      JOIN file_assets fa ON ce.file_asset_id = fa.id
      WHERE c.id = $1
    `;
    const params: any[] = [id];

    if (fileId) {
      query += ` AND fa.id = $2`;
      params.push(fileId);
    }

    const result = await pool.query(query + " LIMIT 1", params);

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
      entityId: id,
      previousState: item,
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
        JOIN customers cu ON c.customer_id = cu.id LEFT JOIN channel_catalog ccat ON c.source_channel_id = ccat.id
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

casesRouter.post(
  '/complaints/:id/responses',
  requireCsrf,
  requirePermission('admin.reclamos.manage'),
  requireNonTerminalState('complaints'),
  asyncHandler(async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const bodySchema = z.object({
      response_body: z.string().min(10, 'La respuesta debe ser más detallada.'),
      final_status_code: z.enum(['founded', 'unfounded']),
    });
    
    const body = bodySchema.parse(req.body);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      const current = await client.query(`
        SELECT c.id, c.complaint_code, c.status_id, cu.email, cu.nombres, cu.apellidos
        FROM complaints c
        JOIN customers cu ON c.customer_id = cu.id
        WHERE c.id = $1 FOR UPDATE
      `, [id]);
      
      if (current.rowCount === 0) throw new HttpError(404, 'Reclamo no encontrado.');

      const complaint = current.rows[0];

      // Get new status ID
      const statusRes = await client.query(
        "SELECT id, label FROM status_catalog WHERE domain = 'complaint' AND code = $1",
        [body.final_status_code]
      );
      
      if (statusRes.rowCount === 0) throw new HttpError(400, 'Estado final inválido.');
      const newStatusId = statusRes.rows[0].id;
      const resolutionLabel = statusRes.rows[0].label;

      // Insert response
      await client.query(`
        INSERT INTO complaint_responses (complaint_id, admin_user_id, response_body)
        VALUES ($1, $2, $3)
      `, [id, req.admin?.id, body.response_body]);

      // Update complaint status
      await client.query(`
        UPDATE complaints SET status_id = $2, updated_at = NOW() WHERE id = $1
      `, [id, newStatusId]);

      // Record state history
      await client.query(`
        INSERT INTO complaint_status_history (complaint_id, old_status_id, new_status_id, changed_by)
        VALUES ($1, $2, $3, $4)
      `, [id, complaint.status_id, newStatusId, req.admin?.id]);

      // Record time event
      await client.query(`
        INSERT INTO complaint_time_events (complaint_id, event_type, metadata)
        VALUES ($1, 'OFFICIAL_RESPONSE_SENT', $2)
      `, [id, JSON.stringify({
        resolution_type: body.final_status_code,
        admin_id: req.admin?.id,
        sent_at: new Date().toISOString()
      })]);
      
      await client.query('COMMIT');

      // Send email
      const clientName = `${complaint.nombres} ${complaint.apellidos}`.trim();
      const adminName = req.admin?.name || 'Administrador de Bytecode';
        const adminRole = req.admin?.roles?.includes('super_admin') ? 'Super Administrador' : 'Representante de Atención al Cliente';
        const emailHtml = buildComplaintResolution(clientName, complaint.complaint_code, resolutionLabel, body.response_body, adminName, adminRole);
      
      await notifyCustomer(
        complaint.email,
        `Respuesta Oficial a su Reclamación ${complaint.complaint_code}`,
        emailHtml,
        'complaint'
      ).catch(e => console.error("Error enviando correo de respuesta:", e));

      res.json({ success: true, message: 'Respuesta enviada y reclamo cerrado.' });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  })
);

casesRouter.get(
  '/complaints/:id/time-events',
  requirePermission('admin.reclamos.view'),
  asyncHandler(async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const result = await pool.query(
      `
      SELECT id, event_type, metadata, created_at
      FROM complaint_time_events
      WHERE complaint_id = $1
      ORDER BY created_at ASC
      `,
      [id]
    );
    res.json({ items: result.rows });
  })
);

casesRouter.get(
  '/complaints/:id/responses',
  requirePermission('admin.reclamos.view'),
  asyncHandler(async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const result = await pool.query(
      `SELECT r.id, r.response_body, r.created_at, u.name as admin_name
       FROM complaint_responses r
       JOIN admin_users u ON r.admin_user_id = u.id
       WHERE r.complaint_id = $1
       ORDER BY r.created_at DESC`,
      [id]
    );
    res.json({ items: result.rows });
  })
);

casesRouter.post(
  '/complaints/:id/evidences',
  requirePermission('admin.reclamos.manage'),
  upload.array('archivosAdjuntos', 5),
  asyncHandler(async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const files = req.files as Express.Multer.File[] | undefined;
    if (!files || files.length === 0) throw new HttpError(400, 'Debe adjuntar al menos un archivo.');

    const client = await pool.connect();
    const addedFiles = [];

    try {
      await client.query('BEGIN');
      
      const current = await client.query('SELECT id FROM complaints WHERE id = $1 FOR UPDATE', [id]);
      if (current.rowCount === 0) throw new HttpError(404, 'Reclamo no encontrado.');

      for (const f of files) {
        const validatedFile = await validateUpload(f);
        let fileAssetId;

        const fileLookup = await client.query(
          'SELECT id FROM file_assets WHERE checksum_sha256 = $1 LIMIT 1',
          [validatedFile.checksumSha256]
        );

        if ((fileLookup.rowCount ?? 0) > 0) {
          fileAssetId = fileLookup.rows[0].id;
        } else {
          try {
            const cloudinaryAsset = await uploadComplaintEvidenceToCloudinary({
              buffer: f.buffer,
              complaintCode: `INTERNAL-${id}`,
              originalName: validatedFile.originalName,
              mimeType: validatedFile.mimeType,
            });
            const fileRes = await client.query(
              `INSERT INTO file_assets (original_name, storage_provider, storage_key, public_url, mime_type, byte_size, checksum_sha256)
              VALUES ($1, 'cloudinary', $2, $3, $4, $5, $6) RETURNING id`,
              [validatedFile.originalName, cloudinaryAsset.publicId, cloudinaryAsset.secureUrl, validatedFile.mimeType, cloudinaryAsset.bytes || f.size, validatedFile.checksumSha256]
            );
            fileAssetId = fileRes.rows[0].id;
          } catch (err) {
            throw new HttpError(502, 'Error subiendo archivo interno.');
          }
        }

        const evRes = await client.query(
          `INSERT INTO complaint_evidences (complaint_id, file_asset_id) VALUES ($1, $2) RETURNING id`,
          [id, fileAssetId]
        );
        addedFiles.push(evRes.rows[0].id);
      }

      await client.query('COMMIT');
      res.json({ success: true, count: addedFiles.length });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  })
);

casesRouter.get(
  '/complaints/:id/notes',
  requirePermission('admin.reclamos.view'),
  asyncHandler(async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const result = await pool.query(
      `SELECT n.*, u.name as author_name FROM complaint_notes n LEFT JOIN admin_users u ON n.author_id = u.id WHERE n.complaint_id = $1 ORDER BY n.created_at DESC`,
      [id]
    );
    res.json({ items: result.rows });
  })
);

casesRouter.post(
  '/complaints/:id/notes',
  requirePermission('admin.reclamos.manage'),
  asyncHandler(async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const { note_text } = req.body;
    if (!note_text) throw new HttpError(400, 'El texto es requerido.');
    const result = await pool.query(
      `INSERT INTO complaint_notes (complaint_id, author_id, note_text) VALUES ($1, $2, $3) RETURNING *`,
      [id, req.admin?.id, note_text]
    );
    res.json({ item: result.rows[0] });
  })
);

casesRouter.post(
  '/complaints/:id/archive',
  requirePermission('admin.reclamos.manage'),
  asyncHandler(async (req: Request, res: Response) => {
    const id = String(req.params.id);
    // Verificar si cumple los 30 meses (900 días aprox)
    const checkRes = await pool.query(
      `SELECT status_id, created_at, EXTRACT(DAY FROM (NOW() - created_at)) as age_days FROM complaints WHERE id = $1`,
      [id]
    );
    if (checkRes.rowCount === 0) throw new HttpError(404, 'Reclamo no encontrado.');
    
    // Check status terminal and age
    const statusRes = await pool.query(`SELECT is_terminal FROM status_catalog WHERE id = $1`, [checkRes.rows[0].status_id]);
    const isTerminal = statusRes.rows[0]?.is_terminal;
    
    if (!isTerminal || checkRes.rows[0].age_days < 900) {
      throw new HttpError(400, 'El reclamo no cumple las condiciones para ser archivado (Debe estar cerrado y tener más de 30 meses de antigüedad).');
    }

    const result = await pool.query(
      `UPDATE complaints SET deleted_at = NOW(), archived_at = NOW() WHERE id = $1 RETURNING id`,
      [id]
    );
    res.json({ success: true, message: 'Reclamo archivado exitosamente.' });
  })
);

casesRouter.delete(
  '/complaints/:id/purge',
  requirePermission('admin.reclamos.manage'),
  asyncHandler(async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const password = req.body.password;
    if (!password) throw new HttpError(400, 'Se requiere la contraseña de administrador para purgar.');
    const adminId = (req as any).admin?.id;
    if (!adminId) throw new HttpError(401, 'No autorizado.');

    const client = await pool.connect();
    try {
      const adminRes = await client.query('SELECT password_hash FROM admin_users WHERE id = $1', [adminId]);
      if (adminRes.rowCount === 0) throw new HttpError(401, 'Administrador no encontrado.');
      const validPassword = await bcrypt.compare(password, adminRes.rows[0].password_hash);
      if (!validPassword) throw new HttpError(401, 'Contraseña incorrecta.');

      await client.query('BEGIN');
      await client.query("SET LOCAL app.allow_physical_delete = 'true'");
      const result = await client.query('DELETE FROM complaints WHERE id = $1 RETURNING id', [id]);
      if (result.rowCount === 0) throw new HttpError(404, 'Reclamo no encontrado.');
      await client.query('COMMIT');
      res.json({ success: true, message: 'Reclamo destruido físicamente.' });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  })
);

