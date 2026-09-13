import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { pool } from '../../db/pool.js';
import { requirePermission } from '../../middleware/auth.js';
import { requireCsrf } from '../../middleware/csrf.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { auditService } from '../../services/audit.js';
import { HttpError } from '../../utils/httpError.js';

const directoryRouter = Router();

// --- RUTAS DE ORGANIZACIONES (B2B) ---

directoryRouter.get(
  '/organizations',
  requirePermission('admin.directorio.view'),
  asyncHandler(async (req: Request, res: Response) => {
    const limit = parseInt(req.query.limit as string) || 9;
    const offset = parseInt(req.query.offset as string) || 0;
    const search = req.query.search ? `%${req.query.search}%` : '%';
    const status = (req.query.status as string) || 'active';
    
    let statusFilter = '';
    if (status === 'active') statusFilter = 'AND o.deleted_at IS NULL';
    else if (status === 'inactive') statusFilter = 'AND o.deleted_at IS NOT NULL';
    
    const countResult = await pool.query(`
      SELECT COUNT(*) as total
      FROM organizations o
      WHERE (o.legal_name ILIKE $1 OR o.trade_name ILIKE $1 OR EXISTS (SELECT 1 FROM organization_documents od WHERE od.organization_id = o.id AND od.document_number ILIKE $1))
      ${statusFilter}
    `, [search]);
    
    const total = parseInt(countResult.rows[0].total, 10);

    const result = await pool.query(`
      SELECT 
        o.id, 
        o.legal_name, 
        o.trade_name, 
        o.industry,
        o.country_id,
        o.created_at,
        c.iso2 AS country_iso,
        c.name AS country_name,
        o.deleted_at IS NULL as is_active,
        COUNT(co.customer_id) as contacts_count,
        (
          SELECT json_build_object('document_type_id', od.document_type_id, 'document_number', od.document_number)
          FROM organization_documents od
          WHERE od.organization_id = o.id AND od.is_active = true
          LIMIT 1
        ) as primary_document
      FROM organizations o
      LEFT JOIN customer_organizations co ON o.id = co.organization_id AND co.deleted_at IS NULL
      LEFT JOIN countries c ON o.country_id = c.id
      WHERE (o.legal_name ILIKE $3 OR o.trade_name ILIKE $3 OR EXISTS (SELECT 1 FROM organization_documents od WHERE od.organization_id = o.id AND od.document_number ILIKE $3))
      ${statusFilter}
      GROUP BY o.id, c.iso2, c.name
      ORDER BY o.created_at DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset, search]);
    
    res.json({ items: result.rows, total });
  })
);

// --- RUTAS DE CUSTOMERS (B2C y B2B) ---

directoryRouter.get(
  '/customers',
  requirePermission('admin.directorio.view'),
  asyncHandler(async (req: Request, res: Response) => {
    const limit = Number(req.query.limit) || 9;
    const offset = Number(req.query.offset) || 0;
    const search = req.query.search ? `%${req.query.search}%` : '%';
    const status = (req.query.status as string) || 'active';
    
    let statusFilter = '';
    if (status === 'active') statusFilter = 'AND c.deleted_at IS NULL';
    else if (status === 'inactive') statusFilter = 'AND c.deleted_at IS NOT NULL';

    const countResult = await pool.query(`
      SELECT COUNT(*) as total
      FROM customers c
      WHERE (c.first_name ILIKE $1 OR c.last_name ILIKE $1 OR c.primary_email ILIKE $1)
      ${statusFilter}
    `, [search]);

    const total = parseInt(countResult.rows[0].total, 10);

    const result = await pool.query(`
      SELECT 
        c.id,
        c.customer_code,
        c.first_name,
        c.last_name,
        c.display_name,
        c.person_type,
        c.primary_email,
        c.primary_phone,
        c.created_at,
        c.country_id,
        cou.iso2 AS country_iso,
        cou.name AS country_name,
        cd.document_type_id,
        dt.name AS document_type_name,
        cd.document_number,
        c.deleted_at IS NULL as is_active,
        coalesce(
          json_agg(
            json_build_object('id', o.id, 'name', coalesce(o.trade_name, o.legal_name), 'position', co.position_title)
          ) FILTER (WHERE o.id IS NOT NULL), 
          '[]'
        ) as organizations
      FROM customers c
      LEFT JOIN countries cou ON c.country_id = cou.id
      LEFT JOIN customer_documents cd ON c.id = cd.customer_id AND cd.deleted_at IS NULL AND cd.is_primary = true
      LEFT JOIN document_types dt ON cd.document_type_id = dt.id
      LEFT JOIN customer_organizations co ON c.id = co.customer_id AND co.deleted_at IS NULL
      LEFT JOIN organizations o ON co.organization_id = o.id AND o.deleted_at IS NULL
      WHERE (c.first_name ILIKE $3 OR c.last_name ILIKE $3 OR c.primary_email ILIKE $3)
      ${statusFilter}
      GROUP BY c.id, c.country_id, cou.iso2, cou.name, cd.document_type_id, dt.name, cd.document_number
      ORDER BY c.created_at DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset, search]);
    
    res.json({ items: result.rows, total });
  })
);

// --- ESQUEMAS DE VALIDACIÓN ZOD ---
const organizationSchema = z.object({
  legal_name: z.string().min(2, 'La Razón Social debe tener al menos 2 caracteres').max(200),
  trade_name: z.string().max(200).optional().nullable(),
  document_type_id: z.string().uuid('ID de documento inválido').optional().nullable(),
  document_number: z.string().max(50).optional().nullable(),
  industry: z.string().max(100).optional().nullable(),
  country_id: z.string().uuid('ID de país inválido').optional().nullable(),
});

const customerSchema = z.object({
  first_name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres').max(100),
  last_name: z.string().min(2, 'El apellido debe tener al menos 2 caracteres').max(100),
  primary_email: z.string().email('Email inválido').max(150),
  primary_phone: z.string().max(50).optional().nullable(),
  person_type: z.enum(['natural', 'company_contact']).default('natural'),
  country_id: z.string().uuid('ID de país inválido').optional().nullable(),
  document_type_id: z.string().uuid('ID de documento inválido').optional().nullable(),
  document_number: z.string().max(50).optional().nullable(),
  organization_id: z.string().uuid('ID de empresa inválido').optional().nullable(),
  position_title: z.string().max(100).optional().nullable(),
});

// --- MUTACIONES DE ORGANIZACIONES ---
directoryRouter.post(
  '/organizations',
  requirePermission('admin.directorio.edit'),
  requireCsrf,
  asyncHandler(async (req: Request, res: Response) => {
    const body = organizationSchema.parse(req.body);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const finalDocNumber = body.document_number || null;

      const orgRes = await client.query(
        `INSERT INTO organizations (legal_name, trade_name, industry, country_id) 
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [body.legal_name, body.trade_name || body.legal_name, body.industry, body.country_id]
      );
      
      const orgId = orgRes.rows[0].id;

      if (finalDocNumber) {
        let docTypeId = body.document_type_id;
        if (!docTypeId && body.country_id) {
           const dtRes = await client.query("SELECT id FROM document_types WHERE country_id = $1 AND is_company_document = true LIMIT 1", [body.country_id]);
           if ((dtRes.rowCount ?? 0) > 0) docTypeId = dtRes.rows[0].id;
        }

        if (docTypeId) {
           await client.query(
             `INSERT INTO organization_documents (organization_id, document_type_id, document_number)
              VALUES ($1, $2, $3)`,
             [orgId, docTypeId, finalDocNumber]
           );
        }
      }

      await client.query('COMMIT');
      await auditService.logAdminAction({ userId: req.admin?.id, action: 'create', entityType: 'organizations', entity: orgRes.rows[0], req });
      res.status(201).json(orgRes.rows[0]);
    } catch (err: any) {
      await client.query('ROLLBACK');
      if (err.code === '23505') {
        throw new HttpError(409, 'El documento de la empresa ya se encuentra registrado.');
      }
      throw err;
    } finally {
      client.release();
    }
  })
);

directoryRouter.put(
  '/organizations/:id',
  requirePermission('admin.directorio.edit'),
  requireCsrf,
  asyncHandler(async (req: Request, res: Response) => {
    const id = z.string().uuid().parse(req.params.id);
    const body = organizationSchema.parse(req.body);
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      const oldRes = await client.query('SELECT * FROM organizations WHERE id = $1', [id]);
      if (oldRes.rowCount === 0) {
         await client.query('ROLLBACK');
         return res.status(404).json({ message: 'Organización no encontrada' });
      }
      const previousState = oldRes.rows[0];
      const finalDocNumber = body.document_number || null;

      const result = await client.query(
        `UPDATE organizations 
         SET legal_name = $1, trade_name = $2, industry = $3, country_id = $4, updated_at = NOW() 
         WHERE id = $5 AND deleted_at IS NULL RETURNING *`,
        [body.legal_name, body.trade_name || body.legal_name, body.industry, body.country_id, id]
      );
      
      if (finalDocNumber) {
        let docTypeId = body.document_type_id;
        if (!docTypeId && body.country_id) {
           const dtRes = await client.query("SELECT id FROM document_types WHERE country_id = $1 AND is_company_document = true LIMIT 1", [body.country_id]);
           if ((dtRes.rowCount ?? 0) > 0) docTypeId = dtRes.rows[0].id;
        }

        if (docTypeId) {
           // En update o insertamos si no existia
           await client.query(
             `INSERT INTO organization_documents (organization_id, document_type_id, document_number)
              VALUES ($1, $2, $3)
              ON CONFLICT (organization_id, document_type_id) 
              DO UPDATE SET document_number = EXCLUDED.document_number, is_active = true, updated_at = NOW()`,
             [id, docTypeId, finalDocNumber]
           );
        }
      }

      await client.query('COMMIT');
      await auditService.logAdminAction({ userId: req.admin?.id, action: 'update', entityType: 'organizations', entity: result.rows[0], previousState, req });
      res.json(result.rows[0]);
    } catch (err: any) {
      await client.query('ROLLBACK');
      if (err.code === '23505') {
        throw new HttpError(409, 'El documento de la empresa ya se encuentra registrado por otra.');
      }
      throw err;
    } finally {
      client.release();
    }
  })
);

directoryRouter.delete(
  '/organizations/:id',
  requirePermission('admin.directorio.edit'),
  requireCsrf,
  asyncHandler(async (req: Request, res: Response) => {
    const id = z.string().uuid().parse(req.params.id);
    const oldRes = await pool.query('SELECT * FROM organizations WHERE id = $1', [id]);
    const previousState = oldRes.rows[0];
    const result = await pool.query(
      `UPDATE organizations SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING *`,
      [id]
    );
    if (result.rowCount === 0) return res.status(404).json({ message: 'Organización no encontrada' });
    await auditService.logAdminAction({ userId: req.admin?.id, action: 'delete', entityType: 'organizations', entity: result.rows[0], previousState, req });
    res.json({ message: 'Organización eliminada (Soft Delete)' });
  })
);

directoryRouter.patch(
  '/organizations/:id/restore',
  requirePermission('admin.directorio.edit'),
  requireCsrf,
  asyncHandler(async (req: Request, res: Response) => {
    const id = z.string().uuid().parse(req.params.id);
    const oldRes = await pool.query('SELECT * FROM organizations WHERE id = $1', [id]);
    const previousState = oldRes.rows[0];
    const result = await pool.query(
      `UPDATE organizations SET deleted_at = NULL WHERE id = $1 RETURNING *`,
      [id]
    );
    if (result.rowCount === 0) return res.status(404).json({ message: 'Organización no encontrada' });
    await auditService.logAdminAction({ userId: req.admin?.id, action: 'restore', entityType: 'organizations', entity: result.rows[0], previousState, req });
    res.json({ message: 'Organización restaurada' });
  })
);

directoryRouter.get(
  '/organizations/:id/customers',
  requirePermission('admin.directorio.view'),
  asyncHandler(async (req: Request, res: Response) => {
    const orgId = z.string().uuid().parse(req.params.id);
    const result = await pool.query(`
      SELECT 
        c.id as customer_id,
        c.first_name,
        c.last_name,
        c.display_name,
        c.primary_email,
        co.position_title,
        co.created_at
      FROM customer_organizations co
      JOIN customers c ON co.customer_id = c.id
      WHERE co.organization_id = $1 AND co.deleted_at IS NULL AND c.deleted_at IS NULL
      ORDER BY co.created_at DESC
    `, [orgId]);
    res.json(result.rows);
  })
);

directoryRouter.delete(
  '/organizations/:id/customers/:customerId',
  requirePermission('admin.directorio.edit'),
  requireCsrf,
  asyncHandler(async (req: Request, res: Response) => {
    const orgId = z.string().uuid().parse(req.params.id);
    const customerId = z.string().uuid().parse(req.params.customerId);
    
    // Check old state for audit
    const oldRes = await pool.query('SELECT * FROM customer_organizations WHERE organization_id = $1 AND customer_id = $2 AND deleted_at IS NULL', [orgId, customerId]);
    
    const result = await pool.query(
      `UPDATE customer_organizations SET deleted_at = NOW() WHERE organization_id = $1 AND customer_id = $2 AND deleted_at IS NULL RETURNING *`,
      [orgId, customerId]
    );

    if (result.rowCount === 0) return res.status(404).json({ message: 'Relación no encontrada' });
    
    // Registrar auditoria
    if (oldRes.rowCount && oldRes.rowCount > 0) {
       await auditService.logAdminAction({ userId: req.admin?.id, action: 'delete_relationship', entityType: 'customer_organizations', entity: result.rows[0], previousState: oldRes.rows[0], req });
    }

    res.json({ message: 'Contacto desvinculado de la empresa' });
  })
);

// --- MUTACIONES DE CUSTOMERS ---
directoryRouter.post(
  '/customers',
  requirePermission('admin.directorio.edit'),
  requireCsrf,
  asyncHandler(async (req: Request, res: Response) => {
    const body = customerSchema.parse(req.body);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      const { randomBytes } = await import('crypto');
      const customerCode = `CUS-${randomBytes(4).toString('hex').toUpperCase()}`;

      const customerRes = await client.query(
        `INSERT INTO customers (customer_code, first_name, last_name, person_type, primary_email, primary_phone, country_id) 
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [customerCode, body.first_name, body.last_name, body.person_type, body.primary_email.toLowerCase(), body.primary_phone, body.country_id]
      );
      const customerId = customerRes.rows[0].id;

      if (body.document_type_id && body.document_number) {
        await client.query(
          `INSERT INTO customer_documents (customer_id, document_type_id, document_number, is_primary) VALUES ($1, $2, $3, true)`,
          [customerId, body.document_type_id, body.document_number]
        );
      }

      if (body.organization_id) {
        await client.query(
          `INSERT INTO customer_organizations (customer_id, organization_id, position_title, is_primary) VALUES ($1, $2, $3, true)`,
          [customerId, body.organization_id, body.position_title]
        );
      }

      await client.query('COMMIT');
      await auditService.logAdminAction({ userId: req.admin?.id, action: 'create', entityType: 'customers', entity: customerRes.rows[0], req });
      res.status(201).json({ id: customerId, message: 'Contacto creado exitosamente' });
    } catch (err: any) {
      await client.query('ROLLBACK');
      if (err.code === '23505') {
        throw new HttpError(409, 'El documento o correo electrónico ya se encuentra registrado.');
      }
      throw err;
    } finally {
      client.release();
    }
  })
);

directoryRouter.put(
  '/customers/:id',
  requirePermission('admin.directorio.edit'),
  requireCsrf,
  asyncHandler(async (req: Request, res: Response) => {
    const id = z.string().uuid().parse(req.params.id);
    const body = customerSchema.parse(req.body);
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      const oldRes = await client.query('SELECT * FROM customers WHERE id = $1', [id]);
      const previousState = oldRes.rows[0];
      
      const updateRes = await client.query(
        `UPDATE customers 
         SET first_name = $1, last_name = $2, person_type = $3, primary_email = $4, primary_phone = $5, country_id = $6, updated_at = NOW() 
         WHERE id = $7 AND deleted_at IS NULL RETURNING *`,
        [body.first_name, body.last_name, body.person_type, body.primary_email.toLowerCase(), body.primary_phone, body.country_id, id]
      );
      
      if (updateRes.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'Contacto no encontrado' });
      }

      // Actualizar documento primario
      if (body.document_type_id && body.document_number) {
        const docExist = await client.query(`SELECT customer_id FROM customer_documents WHERE customer_id = $1 AND is_primary = true AND deleted_at IS NULL`, [id]);
        if (docExist.rowCount && docExist.rowCount > 0) {
          await client.query(`UPDATE customer_documents SET document_type_id = $1, document_number = $2 WHERE customer_id = $3 AND is_primary = true`, [body.document_type_id, body.document_number, id]);
        } else {
          await client.query(`INSERT INTO customer_documents (customer_id, document_type_id, document_number, is_primary) VALUES ($1, $2, $3, true)`, [id, body.document_type_id, body.document_number]);
        }
      } else {
        await client.query(`UPDATE customer_documents SET deleted_at = NOW() WHERE customer_id = $1 AND is_primary = true`, [id]);
      }

      // Actualizar organización primaria
      if (body.organization_id) {
        const orgExist = await client.query(`SELECT customer_id FROM customer_organizations WHERE customer_id = $1 AND is_primary = true AND deleted_at IS NULL`, [id]);
        if (orgExist.rowCount && orgExist.rowCount > 0) {
          await client.query(`UPDATE customer_organizations SET organization_id = $1, position_title = $2 WHERE customer_id = $3 AND is_primary = true`, [body.organization_id, body.position_title, id]);
        } else {
          await client.query(`INSERT INTO customer_organizations (customer_id, organization_id, position_title, is_primary) VALUES ($1, $2, $3, true)`, [id, body.organization_id, body.position_title]);
        }
      } else {
        await client.query(`UPDATE customer_organizations SET deleted_at = NOW() WHERE customer_id = $1 AND is_primary = true`, [id]);
      }

      await client.query('COMMIT');
      await auditService.logAdminAction({ userId: req.admin?.id, action: 'update', entityType: 'customers', entity: updateRes.rows[0], previousState, req });
      res.json({ id, message: 'Contacto actualizado exitosamente' });
    } catch (err: any) {
      await client.query('ROLLBACK');
      if (err.code === '23505') {
        throw new HttpError(409, 'El documento o correo electrónico ya se encuentra registrado por otro contacto.');
      }
      throw err;
    } finally {
      client.release();
    }
  })
);

directoryRouter.delete(
  '/customers/:id',
  requirePermission('admin.directorio.edit'),
  requireCsrf,
  asyncHandler(async (req: Request, res: Response) => {
    const id = z.string().uuid().parse(req.params.id);
    const oldRes = await pool.query('SELECT * FROM customers WHERE id = $1', [id]);
    const previousState = oldRes.rows[0];
    const result = await pool.query(
      `UPDATE customers SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING *`,
      [id]
    );
    if (result.rowCount === 0) return res.status(404).json({ message: 'Contacto no encontrado' });
    await auditService.logAdminAction({ userId: req.admin?.id, action: 'delete', entityType: 'customers', entity: result.rows[0], previousState, req });
    res.json({ message: 'Contacto eliminado (Soft Delete)' });
  })
);

directoryRouter.patch(
  '/customers/:id/restore',
  requirePermission('admin.directorio.edit'),
  requireCsrf,
  asyncHandler(async (req: Request, res: Response) => {
    const id = z.string().uuid().parse(req.params.id);
    const oldRes = await pool.query('SELECT * FROM customers WHERE id = $1', [id]);
    const previousState = oldRes.rows[0];
    const result = await pool.query(
      `UPDATE customers SET deleted_at = NULL WHERE id = $1 RETURNING *`,
      [id]
    );
    if (result.rowCount === 0) return res.status(404).json({ message: 'Contacto no encontrado' });
    await auditService.logAdminAction({ userId: req.admin?.id, action: 'restore', entityType: 'customers', entity: result.rows[0], previousState, req });
    res.json({ message: 'Contacto restaurado' });
  })
);

export default directoryRouter;
