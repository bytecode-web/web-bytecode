import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { pool } from '../../db/pool.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { requirePermission } from '../../middleware/auth.js';
import { requireCsrf } from '../../middleware/csrf.js';
import { HttpError } from '../../utils/httpError.js';
import { auditService } from '../../services/audit.js';

export const localizationRouter = Router();

// Schemas
const countrySchema = z.object({
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres').max(100),
  iso2: z.string().length(2, 'El ISO2 debe tener exactamente 2 caracteres').toUpperCase(),
  dial_code: z.string().max(10).optional().nullable(),
  phone_max_length: z.number().int().min(1).max(20).optional().nullable(),
  phone_regex: z.string().max(255).optional().nullable(),
  phone_format: z.string().max(50).optional().nullable(),
  is_active: z.boolean().default(true),
});

const documentTypeSchema = z.object({
  country_id: z.string().uuid('ID de país inválido'),
  code: z.string().min(1).max(30),
  name: z.string().min(1).max(120),
  validation_regex: z.string().max(255).optional().nullable(),
  min_length: z.number().int().min(1).optional().nullable(),
  max_length: z.number().int().min(1).optional().nullable(),
  is_company_document: z.boolean().default(false),
  placeholder: z.string().max(50).optional().nullable(),
  is_active: z.boolean().default(true),
});

// --- COUNTRIES ---

localizationRouter.get(
  '/countries',
  requirePermission('admin.localizacion.view'),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await pool.query(`
      SELECT * FROM countries 
      ORDER BY name ASC
    `);
    res.json({ items: result.rows });
  })
);

localizationRouter.post(
  '/countries',
  requirePermission('admin.localizacion.manage'),
  requireCsrf,
  asyncHandler(async (req: Request, res: Response) => {
    const body = countrySchema.parse(req.body);
    try {
      const result = await pool.query(
        `INSERT INTO countries (name, iso2, dial_code, phone_max_length, phone_regex, phone_format, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [body.name, body.iso2, body.dial_code, body.phone_max_length, body.phone_regex, body.phone_format, body.is_active]
      );
      await auditService.logAdminAction({ userId: req.admin?.id, action: 'create', entityType: 'countries', entity: result.rows[0], req });
      res.status(201).json(result.rows[0]);
    } catch (err: any) {
      if (err.code === '23505') throw new HttpError(409, 'El código ISO2 ya está registrado.');
      throw err;
    }
  })
);

localizationRouter.put(
  '/countries/:id',
  requirePermission('admin.localizacion.manage'),
  requireCsrf,
  asyncHandler(async (req: Request, res: Response) => {
    const id = z.string().uuid().parse(req.params.id);
    const body = countrySchema.parse(req.body);
    const oldRes = await pool.query('SELECT * FROM countries WHERE id = $1', [id]);
    if (oldRes.rowCount === 0) throw new HttpError(404, 'País no encontrado');
    
    try {
      const result = await pool.query(
        `UPDATE countries 
         SET name=$1, iso2=$2, dial_code=$3, phone_max_length=$4, phone_regex=$5, phone_format=$6, is_active=$7
         WHERE id = $8 RETURNING *`,
        [body.name, body.iso2, body.dial_code, body.phone_max_length, body.phone_regex, body.phone_format, body.is_active, id]
      );
      await auditService.logAdminAction({ userId: req.admin?.id, action: 'update', entityType: 'countries', entity: result.rows[0], previousState: oldRes.rows[0], req });
      res.json(result.rows[0]);
    } catch (err: any) {
      if (err.code === '23505') throw new HttpError(409, 'El código ISO2 ya está registrado.');
      throw err;
    }
  })
);

localizationRouter.delete(
  '/countries/:id',
  requirePermission('admin.localizacion.manage'),
  requireCsrf,
  asyncHandler(async (req: Request, res: Response) => {
    const id = z.string().uuid().parse(req.params.id);
    const result = await pool.query('DELETE FROM countries WHERE id = $1 RETURNING id', [id]);
    if (result.rowCount === 0) throw new HttpError(404, 'País no encontrado');
    await auditService.logAdminAction({ userId: req.admin?.id, action: 'delete', entityType: 'countries', entity: { id }, req });
    res.status(204).end();
  })
);

// --- DOCUMENT TYPES ---

localizationRouter.get(
  '/document-types',
  requirePermission('admin.localizacion.view'),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await pool.query(`
      SELECT dt.*, c.name as country_name
      FROM document_types dt
      LEFT JOIN countries c ON dt.country_id = c.id
      ORDER BY c.name ASC, dt.name ASC
    `);
    res.json({ items: result.rows });
  })
);

localizationRouter.post(
  '/document-types',
  requirePermission('admin.localizacion.manage'),
  requireCsrf,
  asyncHandler(async (req: Request, res: Response) => {
    const body = documentTypeSchema.parse(req.body);
    const result = await pool.query(
      `INSERT INTO document_types (country_id, code, name, validation_regex, min_length, max_length, is_company_document, placeholder, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [body.country_id, body.code, body.name, body.validation_regex, body.min_length, body.max_length, body.is_company_document, body.placeholder, body.is_active]
    );
    await auditService.logAdminAction({ userId: req.admin?.id, action: 'create', entityType: 'document_types', entity: result.rows[0], req });
    res.status(201).json(result.rows[0]);
  })
);

localizationRouter.put(
  '/document-types/:id',
  requirePermission('admin.localizacion.manage'),
  requireCsrf,
  asyncHandler(async (req: Request, res: Response) => {
    const id = z.string().uuid().parse(req.params.id);
    const body = documentTypeSchema.parse(req.body);
    const oldRes = await pool.query('SELECT * FROM document_types WHERE id = $1', [id]);
    if (oldRes.rowCount === 0) throw new HttpError(404, 'Documento no encontrado');
    
    const result = await pool.query(
      `UPDATE document_types 
       SET country_id=$1, code=$2, name=$3, validation_regex=$4, min_length=$5, max_length=$6, is_company_document=$7, placeholder=$8, is_active=$9
       WHERE id = $10 RETURNING *`,
      [body.country_id, body.code, body.name, body.validation_regex, body.min_length, body.max_length, body.is_company_document, body.placeholder, body.is_active, id]
    );
    await auditService.logAdminAction({ userId: req.admin?.id, action: 'update', entityType: 'document_types', entity: result.rows[0], previousState: oldRes.rows[0], req });
    res.json(result.rows[0]);
  })
);

localizationRouter.delete(
  '/document-types/:id',
  requirePermission('admin.localizacion.manage'),
  requireCsrf,
  asyncHandler(async (req: Request, res: Response) => {
    const id = z.string().uuid().parse(req.params.id);
    const result = await pool.query('DELETE FROM document_types WHERE id = $1 RETURNING id', [id]);
    if (result.rowCount === 0) throw new HttpError(404, 'Documento no encontrado');
    await auditService.logAdminAction({ userId: req.admin?.id, action: 'delete', entityType: 'document_types', entity: { id }, req });
    res.status(204).end();
  })
);
