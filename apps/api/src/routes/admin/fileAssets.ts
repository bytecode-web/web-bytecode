import { Router, Request, Response } from 'express';
import { pool } from '../../db/pool.js';
import { requirePermission } from '../../middleware/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { z } from 'zod';

export const fileAssetsRouter = Router();

const querySchema = z.object({
  page: z.string().regex(/^\d+$/).transform(Number).default(1),
  limit: z.string().regex(/^\d+$/).transform(Number).default(20),
  search: z.string().optional(),
  mimeType: z.string().optional(), // ej. "image", "application/pdf"
  minSize: z.string().regex(/^\d+$/).transform(Number).optional(), // En Bytes
});

fileAssetsRouter.get(
  '/',
  requirePermission('admin.archivos.view'),
  asyncHandler(async (req: Request, res: Response) => {
    const q = querySchema.parse(req.query);
    const offset = (q.page - 1) * q.limit;

    let whereClauses: string[] = ['fa.deleted_at IS NULL'];
    const values: any[] = [];
    let paramIndex = 1;

    if (q.search) {
      whereClauses.push(`fa.original_name ILIKE $${paramIndex}`);
      values.push(`%${q.search}%`);
      paramIndex++;
    }

    if (q.mimeType) {
      whereClauses.push(`fa.mime_type ILIKE $${paramIndex}`);
      values.push(`%${q.mimeType}%`);
      paramIndex++;
    }

    if (q.minSize) {
      whereClauses.push(`fa.byte_size >= $${paramIndex}`);
      values.push(q.minSize);
      paramIndex++;
    }

    const whereString = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // Consulta con LEFT JOIN para Trazabilidad
    const sql = `
      SELECT 
        fa.id,
        fa.original_name,
        fa.storage_provider,
        fa.public_url,
        fa.mime_type,
        fa.byte_size,
        fa.created_at,
        ce.complaint_id AS complaint_id,
        pia.portfolio_item_id AS portfolio_item_id,
        b.id AS banner_id,
        mp.project_id AS payment_project_id
      FROM file_assets fa
      LEFT JOIN complaint_evidences ce ON ce.file_asset_id = fa.id
      LEFT JOIN portfolio_item_assets pia ON pia.file_asset_id = fa.id
      LEFT JOIN banners b ON b.file_asset_id = fa.id
      LEFT JOIN milestone_payments mp ON mp.receipt_file_id = fa.id
      ${whereString}
      ORDER BY fa.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    const countSql = `
      SELECT COUNT(*) 
      FROM file_assets fa
      ${whereString}
    `;

    const [dataResult, countResult] = await Promise.all([
      pool.query(sql, [...values, q.limit, offset]),
      pool.query(countSql, values),
    ]);

    const total = parseInt(countResult.rows[0].count, 10);

    // Mapeo mágico: Construimos las etiquetas y enlaces para el frontend
    const items = dataResult.rows.map((row: any) => {
      let originLabel = 'Sin Uso / Huérfano';
      let originUrl = null;

      if (row.complaint_id) {
        originLabel = 'Evidencia de Reclamo';
        originUrl = `/admin/reclamos?id=${row.complaint_id}`;
      } else if (row.portfolio_item_id) {
        originLabel = 'Portada de Portafolio';
        originUrl = `/admin/portafolio?id=${row.portfolio_item_id}`;
      } else if (row.banner_id) {
        originLabel = 'Banner del CMS';
        originUrl = `/admin/cms`;
      } else if (row.payment_project_id) {
        originLabel = 'Recibo de Pago';
        originUrl = `/admin/proyectos/${row.payment_project_id}`;
      }

      return {
        id: row.id,
        original_name: row.original_name,
        storage_provider: row.storage_provider,
        public_url: row.public_url,
        mime_type: row.mime_type,
        byte_size: row.byte_size,
        created_at: row.created_at,
        origin: {
          label: originLabel,
          url: originUrl
        }
      };
    });

    res.json({
      items,
      total,
      page: q.page,
      limit: q.limit,
      totalPages: Math.ceil(total / q.limit)
    });
  })
);
