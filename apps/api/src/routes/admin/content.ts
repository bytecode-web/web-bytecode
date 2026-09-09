import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import {
  deleteCloudinaryAsset,
  uploadPortfolioImageToCloudinary,
  type CloudinaryStoredAsset,
} from '../../lib/cloudinary.js';
import { pool } from '../../db/pool.js';
import { validateUpload } from '../../lib/validateUpload.js';
import { requirePermission } from '../../middleware/auth.js';
import { requireCsrf } from '../../middleware/csrf.js';
import { auditService } from '../../services/audit.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { HttpError } from '../../utils/httpError.js';
import {
  createBusinessCode,
  getProjectStatusInfo,
  paginationQuerySchema,
  upload,
  type Queryable,
} from './shared.js';

export const contentRouter = Router();
const optionalImageUpload = (req: Request, res: Response, next: NextFunction) => {
  if (req.is('multipart/form-data')) {
    upload.single('image')(req, res, next);
    return;
  }

  next();
};
// --- CMS Endpoints ---

const cmsPageUpdateSchema = z.object({
  title: z.string().optional(),
  meta_title: z.string().nullable().optional(),
  meta_description: z.string().nullable().optional(),
  status: z.string().trim().min(1).max(80).optional(),
});

const cmsPageCreateSchema = z.object({
  slug: z.string().trim().min(1).max(160).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: z.string().trim().min(1).max(180),
  meta_title: z.string().nullable().optional(),
  meta_description: z.string().nullable().optional(),
  status: z.string().trim().min(1).max(80),
});

const getCmsStatusId = async (client: Queryable, code: string) => {
  const result = await client.query(
    "SELECT id FROM status_catalog WHERE domain = 'cms' AND code = $1 AND is_active = true LIMIT 1",
    [code],
  );

  if (result.rowCount === 0) {
    throw new HttpError(400, `Estado CMS invalido: ${code}.`);
  }

  return result.rows[0].id as string;
};

const cmsPageSelectSql = `
  SELECT
    cp.id,
    cp.slug,
    cp.title,
    cp.meta_title,
    cp.meta_description,
    sc.code AS status,
    sc.name AS status_name,
    cp.created_at,
    cp.updated_at
  FROM cms_pages cp
  JOIN status_catalog sc ON cp.status_id = sc.id
  WHERE cp.deleted_at IS NULL AND sc.domain = 'cms'
`;

contentRouter.get(
  '/cms/pages',
  requirePermission('admin.cms.view'),
  asyncHandler(async (req: Request, res: Response) => {
    const { limit, offset } = paginationQuerySchema.parse(req.query);
    const [result, countResult] = await Promise.all([pool.query(
      `${cmsPageSelectSql}
       ORDER BY cp.slug
       LIMIT $1 OFFSET $2`,
      [limit, offset],
    ), pool.query('SELECT count(*)::int AS total FROM cms_pages WHERE deleted_at IS NULL')]);
    res.json({ data: result.rows, total: countResult.rows[0].total });
  })
);

contentRouter.post(
  '/cms/pages',
  requireCsrf,
  requirePermission('admin.cms.manage'),
  asyncHandler(async (req: Request, res: Response) => {
    const body = cmsPageCreateSchema.parse(req.body);
    const statusInfo = await getProjectStatusInfo(pool, body.status);
    const statusId = statusInfo.id;
    const result = await pool.query(
      `INSERT INTO cms_pages (slug, title, meta_title, meta_description, status_id, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [body.slug, body.title, body.meta_title ?? null, body.meta_description ?? null, statusId, req.admin?.id ?? null],
    );
    const created = await pool.query(`${cmsPageSelectSql} AND cp.id = $1`, [result.rows[0].id]);
    res.status(201).json({ item: created.rows[0] });
  }),
);

contentRouter.patch(
  '/cms/pages/:id',
  requireCsrf,
  requirePermission('admin.cms.manage'),
  asyncHandler(async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const body = cmsPageUpdateSchema.parse(req.body);
    const statusId = body.status ? await getCmsStatusId(pool, body.status) : null;

    const current = await pool.query('SELECT * FROM cms_pages WHERE id = $1', [id]);
    if (current.rowCount === 0) throw new HttpError(404, 'Página no encontrada.');

    const result = await pool.query(
      `UPDATE cms_pages
       SET title = COALESCE($2, title),
           meta_title = COALESCE($3, meta_title),
           meta_description = COALESCE($4, meta_description),
           status_id = COALESCE($5, status_id),
           updated_at = now()
       WHERE id = $1
       RETURNING id`,
      [id, body.title ?? null, body.meta_title ?? null, body.meta_description ?? null, statusId],
    );
    const updated = await pool.query(`${cmsPageSelectSql} AND cp.id = $1`, [result.rows[0].id]);

    await auditService.logAdminAction({
      userId: req.admin?.id,
      action: 'update',
      entityType: 'cms_page',
      entity: updated.rows[0],
      previousState: current.rows[0],
      req
    });
    res.json({ item: updated.rows[0] });
  })
);

// --- Portfolio Endpoints ---

const normalizeWebsiteUrl = (value: unknown) => {
  if (value === '' || value === null || value === undefined) return undefined;
  if (typeof value !== 'string') return value;

  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^www\./i.test(trimmed)) return `https://${trimmed}`;
  return `https://www.${trimmed}`;
};

const optionalUrl = z.preprocess(
  normalizeWebsiteUrl,
  z.string().url().max(255).optional(),
);

const parseBooleanField = (value: unknown) => {
  if (typeof value !== 'string') return value;
  if (value.toLowerCase() === 'true') return true;
  if (value.toLowerCase() === 'false') return false;
  return value;
};

const parseTechnologyIds = (value: unknown) => {
  if (value === undefined || value === null || value === '') return [];
  if (Array.isArray(value)) return value;

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      return value.split(',').map((item) => item.trim()).filter(Boolean);
    }
  }

  return value;
};

const parseOptionalTechnologyIds = (value: unknown) => {
  if (value === undefined) return undefined;
  return parseTechnologyIds(value);
};

const portfolioBoolean = (defaultValue: boolean) =>
  z.preprocess(parseBooleanField, z.boolean().default(defaultValue));

const technologyIdsSchema = z.preprocess(parseTechnologyIds, z.array(z.string().uuid()));
const optionalTechnologyIdsSchema = z.preprocess(parseOptionalTechnologyIds, z.array(z.string().uuid()).optional());

const portfolioItemSchema = z.object({
  name: z.string().trim().min(2).max(180),
  websiteUrl: optionalUrl,
  sortOrder: z.coerce.number().int().min(0).max(100000).optional(),
  isFeatured: portfolioBoolean(true),
  status: z.string().trim().min(1).max(80),
  technologyIds: technologyIdsSchema,
});

const portfolioItemUpdateSchema = portfolioItemSchema.partial().extend({
  technologyIds: optionalTechnologyIdsSchema,
});

const technologyCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  sortOrder: z.coerce.number().int().min(0).max(100000).optional(),
});

const portfolioImageSchema = z.object({
  altText: z.string().trim().max(180).optional().default(''),
});

const normalizeTechnologyCode = (name: string) =>
  name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');

const selectPortfolioItemsSql = `
  SELECT
    pi.id,
    pi.item_code,
    pi.name,
    pi.website_url,
    pi.sort_order,
    pi.is_featured,
    sc.code AS status,
    sc.name AS status_name,
    pi.created_at,
    pi.updated_at,
    COALESCE(fa.public_url, fa.storage_key) AS image_url,
    pia.alt_text,
    COALESCE(
      jsonb_agg(
        jsonb_build_object('id', tc.id, 'name', tc.name)
        ORDER BY pit.sort_order, tc.sort_order, tc.name
      ) FILTER (WHERE tc.id IS NOT NULL),
      '[]'::jsonb
    ) AS technologies
  FROM portfolio_items pi
  JOIN status_catalog sc
    ON pi.status_id = sc.id
    AND sc.domain = 'cms'
  LEFT JOIN portfolio_item_assets pia
    ON pia.portfolio_item_id = pi.id
    AND pia.asset_role = 'cover'
    AND pia.is_active = true
    AND pia.deleted_at IS NULL
  LEFT JOIN file_assets fa
    ON fa.id = pia.file_asset_id
    AND fa.deleted_at IS NULL
  LEFT JOIN portfolio_item_technologies pit
    ON pit.portfolio_item_id = pi.id
  LEFT JOIN technology_catalog tc
    ON tc.id = pit.technology_id
    AND tc.deleted_at IS NULL
  WHERE pi.deleted_at IS NULL
`;

const portfolioGroupOrderSql = `
  GROUP BY pi.id, sc.id, fa.public_url, fa.storage_key, pia.alt_text
  ORDER BY pi.sort_order ASC, pi.created_at DESC
`;

const replacePortfolioTechnologies = async (client: PoolClient, portfolioItemId: string, technologyIds: string[], adminId?: string) => {
  await client.query('DELETE FROM portfolio_item_technologies WHERE portfolio_item_id = $1', [portfolioItemId]);

  for (const [index, technologyId] of technologyIds.entries()) {
    const technology = await client.query(
      'SELECT id FROM technology_catalog WHERE id = $1 AND deleted_at IS NULL AND is_active = true',
      [technologyId],
    );

    if (technology.rowCount === 0) {
      throw new HttpError(400, 'Tecnologia invalida.');
    }

    await client.query(
      `INSERT INTO portfolio_item_technologies (portfolio_item_id, technology_id, sort_order, created_by)
       VALUES ($1, $2, $3, $4)`,
      [portfolioItemId, technologyId, index, adminId ?? null],
    );
  }
};

contentRouter.get(
  '/portfolio/technologies',
  requirePermission('admin.portafolio.view'),
  asyncHandler(async (_req: Request, res: Response) => {
    const result = await pool.query(
      `SELECT id, code, name, sort_order, is_active, created_at, updated_at
       FROM technology_catalog
       WHERE deleted_at IS NULL
       ORDER BY sort_order ASC, name ASC`,
    );
    res.json({ items: result.rows });
  }),
);

contentRouter.post(
  '/portfolio/technologies',
  requireCsrf,
  requirePermission('admin.portafolio.manage'),
  asyncHandler(async (req: Request, res: Response) => {
    const body = technologyCreateSchema.parse(req.body);
    const code = normalizeTechnologyCode(body.name);

    if (!code) throw new HttpError(400, 'Nombre de tecnologia invalido.');

    const result = await pool.query(
      `INSERT INTO technology_catalog (code, name, sort_order, created_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (code) DO UPDATE
       SET name = EXCLUDED.name,
           sort_order = EXCLUDED.sort_order,
           is_active = true,
           deleted_at = NULL,
           updated_at = now(),
           updated_by = EXCLUDED.created_by
       RETURNING id, code, name, sort_order, is_active, created_at, updated_at`,
      [code, body.name, body.sortOrder, req.admin?.id ?? null],
    );

    await auditService.logAdminAction({
        userId: req.admin?.id,
        action: 'upsert',
        entityType: 'technology_catalog',
        entity: result.rows[0],
        req
      });
    res.status(201).json({ item: result.rows[0] });
  }),
);

contentRouter.get(
  '/portfolio',
  requirePermission('admin.portafolio.view'),
  asyncHandler(async (_req: Request, res: Response) => {
    const result = await pool.query(`${selectPortfolioItemsSql} ${portfolioGroupOrderSql}`);
    res.json({ items: result.rows });
  }),
);

contentRouter.post(
  '/portfolio',
  requireCsrf,
  requirePermission('admin.portafolio.manage'),
  optionalImageUpload,
  asyncHandler(async (req: Request, res: Response) => {
    const body = portfolioItemSchema.parse(req.body);
    const imageBody = portfolioImageSchema.parse(req.body);
    const file = req.file;
    const itemCode = createBusinessCode('PORT');
    let validatedFile: Awaited<ReturnType<typeof validateUpload>> | null = null;
    let cloudinaryAsset: CloudinaryStoredAsset | null = null;
    const client = await pool.connect();

    try {
      if (file) {
        validatedFile = await validateUpload(file);
        if (!validatedFile.mimeType.startsWith('image/')) {
          throw new HttpError(400, 'Solo se permiten imagenes para el portafolio.');
        }
      }
      
      let existingFileId: string | null = null;
      if (file && validatedFile) {
        // Motor de Deduplicación: Buscar si el archivo ya existe por su Hash
        const existing = await pool.query('SELECT id FROM file_assets WHERE checksum_sha256 = $1 AND deleted_at IS NULL LIMIT 1', [validatedFile.checksumSha256]);
        if (existing.rowCount && existing.rowCount > 0) {
           existingFileId = existing.rows[0].id;
        } else {
           cloudinaryAsset = await uploadPortfolioImageToCloudinary({
             buffer: file.buffer,
             itemCode,
             originalName: validatedFile.originalName,
             mimeType: validatedFile.mimeType,
           });
        }
      }

      await client.query('BEGIN');
      const statusId = await getCmsStatusId(client, body.status);
      const result = await client.query(
        `INSERT INTO portfolio_items (
          item_code, name, website_url, sort_order,
          is_featured, status_id, created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id`,
        [
          itemCode,
          body.name,
          body.websiteUrl ?? null,
          body.sortOrder,
          body.isFeatured,
          statusId,
          req.admin?.id ?? null,
        ],
      );
      const id = result.rows[0].id;
      await replacePortfolioTechnologies(client, id, body.technologyIds, req.admin?.id);

      if (file && validatedFile) {
        let fileAssetIdToLink = existingFileId;

        // Si no existía, registrar el nuevo archivo que se acaba de subir
        if (!fileAssetIdToLink && cloudinaryAsset) {
          const fileResult = await client.query(
            `INSERT INTO file_assets (
              original_name, storage_provider, storage_key, public_url,
              mime_type, byte_size, checksum_sha256, uploaded_by, created_by
            )
            VALUES ($1, 'cloudinary', $2, $3, $4, $5, $6, $7, $8)
            RETURNING id`,
            [
              validatedFile.originalName,
              cloudinaryAsset.publicId,
              cloudinaryAsset.secureUrl,
              validatedFile.mimeType,
              cloudinaryAsset.bytes || file.size,
              validatedFile.checksumSha256,
              req.admin?.id ?? null,
              req.admin?.id ?? null,
            ],
          );
          fileAssetIdToLink = fileResult.rows[0].id;
        }

        // Ligar el archivo (existente o nuevo) al portafolio
        if (fileAssetIdToLink) {
          await client.query(
            `INSERT INTO portfolio_item_assets (
              portfolio_item_id, file_asset_id, asset_role, alt_text, sort_order, created_by
            )
            VALUES ($1, $2, 'cover', $3, 0, $4)`,
            [id, fileAssetIdToLink, imageBody.altText || body.name, req.admin?.id ?? null],
          );
        }
      }

      await client.query('COMMIT');

      const created = await pool.query(`${selectPortfolioItemsSql} AND pi.id = $1 ${portfolioGroupOrderSql}`, [id]);
      await auditService.logAdminAction({
        userId: req.admin?.id,
        action: 'create',
        entityType: 'portfolio_item',
        entity: created.rows[0],
        req
      });

      res.status(201).json({ item: created.rows[0] });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      if (cloudinaryAsset) {
        await deleteCloudinaryAsset(cloudinaryAsset.publicId, cloudinaryAsset.resourceType).catch((cleanupError: unknown) => {
          console.error('Cloudinary cleanup failed after portfolio creation rollback:', cleanupError);
        });
      }
      throw error;
    } finally {
      client.release();
    }
  }),
);

contentRouter.patch(
  '/portfolio/reorder',
  requirePermission('admin.portafolio.manage'),
  requireCsrf,
  asyncHandler(async (req, res) => {
    const { items } = req.body;
    if (!Array.isArray(items)) throw new HttpError(400, 'Invalid items array');
    
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (let i = 0; i < items.length; i++) {
        await client.query(
          'UPDATE portfolio_items SET sort_order = $1, updated_at = NOW() WHERE id = $2 AND deleted_at IS NULL',
          [i, items[i]]
        );
      }
      await client.query('COMMIT');
      res.json({ message: 'Reordered successfully' });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  })
);

contentRouter.patch(
  '/portfolio/:id',
  requireCsrf,
  requirePermission('admin.portafolio.manage'),
  asyncHandler(async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const body = portfolioItemUpdateSchema.parse(req.body);
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      const current = await client.query('SELECT * FROM portfolio_items WHERE id = $1 AND deleted_at IS NULL', [id]);
      if (current.rowCount === 0) throw new HttpError(404, 'Proyecto de portafolio no encontrado.');
      const statusId = body.status ? await getCmsStatusId(client, body.status) : null;

      const result = await client.query(
        `UPDATE portfolio_items
         SET name = COALESCE($2, name),
             website_url = COALESCE($3, website_url),
             sort_order = COALESCE($4, sort_order),
             is_featured = COALESCE($5, is_featured),
             status_id = COALESCE($6, status_id),
             updated_by = $7,
             updated_at = now()
         WHERE id = $1 AND deleted_at IS NULL
         RETURNING id`,
        [
          id,
          body.name ?? null,
          body.websiteUrl ?? null,
          body.sortOrder ?? null,
          body.isFeatured ?? null,
          statusId,
          req.admin?.id ?? null,
        ],
      );

      if (result.rowCount === 0) throw new HttpError(404, 'Proyecto de portafolio no encontrado.');

      if (body.technologyIds) {
        await replacePortfolioTechnologies(client, id, body.technologyIds, req.admin?.id);
      }

      await client.query('COMMIT');
      
      const updated = await pool.query(`${selectPortfolioItemsSql} AND pi.id = $1 ${portfolioGroupOrderSql}`, [id]);
      
      await auditService.logAdminAction({
        userId: req.admin?.id,
        action: 'update',
        entityType: 'portfolio_item',
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

contentRouter.delete(
  '/portfolio/:id',
  requireCsrf,
  requirePermission('admin.portafolio.manage'),
  asyncHandler(async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const current = await pool.query('SELECT * FROM portfolio_items WHERE id = $1 AND deleted_at IS NULL', [id]);
    if (current.rowCount === 0) throw new HttpError(404, 'Proyecto de portafolio no encontrado.');

    const result = await pool.query(
      `UPDATE portfolio_items
       SET deleted_at = now(), updated_at = now(), updated_by = $2
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING id`,
      [id, req.admin?.id ?? null],
    );

    if (result.rowCount === 0) throw new HttpError(404, 'Proyecto de portafolio no encontrado.');
    await auditService.logAdminAction({
      userId: req.admin?.id,
      action: 'delete',
      entityType: 'portfolio_item',
      entity: current.rows[0],
      previousState: current.rows[0],
      req
    });
    res.json({ ok: true });
  }),
);

contentRouter.post(
  '/portfolio/:id/image',
  requireCsrf,
  requirePermission('admin.portafolio.manage'),
  upload.single('image'),
  asyncHandler(async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const body = portfolioImageSchema.parse(req.body);
    const file = req.file;

    if (!file) throw new HttpError(400, 'Imagen requerida.');

    const itemResult = await pool.query(
      'SELECT item_code, name FROM portfolio_items WHERE id = $1 AND deleted_at IS NULL',
      [id],
    );
    if (itemResult.rowCount === 0) throw new HttpError(404, 'Proyecto de portafolio no encontrado.');

    const validatedFile = await validateUpload(file);
    if (!validatedFile.mimeType.startsWith('image/')) {
      throw new HttpError(400, 'Solo se permiten imagenes para el portafolio.');
    }

    let cloudinaryAsset: CloudinaryStoredAsset | null = null;
    let existingFileId: string | null = null;
    const client = await pool.connect();

    try {
      // Motor de Deduplicación: Buscar si el archivo ya existe por su Hash
      const existing = await client.query('SELECT id FROM file_assets WHERE checksum_sha256 = $1 AND deleted_at IS NULL LIMIT 1', [validatedFile.checksumSha256]);
      if (existing.rowCount && existing.rowCount > 0) {
        existingFileId = existing.rows[0].id;
      } else {
        cloudinaryAsset = await uploadPortfolioImageToCloudinary({
          buffer: file.buffer,
          itemCode: itemResult.rows[0].item_code,
          originalName: validatedFile.originalName,
          mimeType: validatedFile.mimeType,
        });
      }

      await client.query('BEGIN');
      
      let newFileAssetId = existingFileId;

      if (!newFileAssetId && cloudinaryAsset) {
        const fileResult = await client.query(
          `INSERT INTO file_assets (
            original_name, storage_provider, storage_key, public_url,
            mime_type, byte_size, checksum_sha256, uploaded_by, created_by
          )
          VALUES ($1, 'cloudinary', $2, $3, $4, $5, $6, $7, $8)
          RETURNING id`,
          [
            validatedFile.originalName,
            cloudinaryAsset.publicId,
            cloudinaryAsset.secureUrl,
            validatedFile.mimeType,
            cloudinaryAsset.bytes || file.size,
            validatedFile.checksumSha256,
            req.admin?.id ?? null,
            req.admin?.id ?? null,
          ],
        );
        newFileAssetId = fileResult.rows[0].id;
      }

      // 1. Obtener la imagen anterior para borrarla de cloudinary y file_assets
      const oldCover = await client.query(
        "SELECT fa.id, fa.storage_key, fa.storage_provider FROM portfolio_item_assets pia JOIN file_assets fa ON pia.file_asset_id = fa.id WHERE pia.portfolio_item_id = $1 AND pia.asset_role = 'cover'",
        [id]
      );
      
      // 2. Borrar relación en la tabla puente (portfolio_item_assets)
      await client.query("DELETE FROM portfolio_item_assets WHERE portfolio_item_id = $1 AND asset_role = 'cover'", [id]);
      
      // 3. Borrar el archivo fantasma en file_assets y en Cloudinary si está huérfano
      if ((oldCover.rowCount ?? 0) > 0) {
        const oldFile = oldCover.rows[0];
        
        // Verificar si el archivo es referenciado por otras tablas antes de eliminarlo físicamente
        const otherReferences = await client.query(
          `SELECT COUNT(*) FROM (
            SELECT file_asset_id FROM complaint_evidences WHERE file_asset_id = $1
            UNION ALL
            SELECT file_asset_id FROM banners WHERE file_asset_id = $1
            UNION ALL
            SELECT receipt_file_id FROM milestone_payments WHERE receipt_file_id = $1
            UNION ALL
            SELECT file_asset_id FROM portfolio_item_assets WHERE file_asset_id = $1
          ) AS refs`,
          [oldFile.id]
        );

        if (parseInt(otherReferences.rows[0].count, 10) === 0) {
          await client.query("DELETE FROM file_assets WHERE id = $1", [oldFile.id]);
          if (oldFile.storage_provider === 'cloudinary') {
             await deleteCloudinaryAsset(oldFile.storage_key, 'image').catch(() => {});
          }
        }
      }

      if (newFileAssetId) {
        await client.query(
          `INSERT INTO portfolio_item_assets (
            portfolio_item_id, file_asset_id, asset_role, alt_text, sort_order, created_by
          )
          VALUES ($1, $2, 'cover', $3, 0, $4)`,
          [id, newFileAssetId, body.altText || itemResult.rows[0].name, req.admin?.id ?? null],
        );
      }

      await client.query('COMMIT');
      const updated = await pool.query(`${selectPortfolioItemsSql} AND pi.id = $1 ${portfolioGroupOrderSql}`, [id]);
      
      await auditService.logAdminAction({
        userId: req.admin?.id,
        action: 'upload_image',
        entityType: 'portfolio_item',
        entity: updated.rows[0],
        req
      });
      res.status(201).json({ item: updated.rows[0] });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      if (cloudinaryAsset) {
        await deleteCloudinaryAsset(cloudinaryAsset.publicId, cloudinaryAsset.resourceType).catch((cleanupError: unknown) => {
          console.error('Cloudinary cleanup failed after portfolio image rollback:', cleanupError);
        });
      }
      throw error;
    } finally {
      client.release();
    }
  }),
);

