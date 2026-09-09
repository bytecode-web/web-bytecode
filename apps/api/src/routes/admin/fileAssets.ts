import { Router, Request, Response } from 'express';
import { pool } from '../../db/pool.js';
import { requirePermission } from '../../middleware/auth.js';
import { requireCsrf } from '../../middleware/csrf.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { deleteCloudinaryAsset } from '../../lib/cloudinary.js';
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
        pm.project_id AS payment_project_id,
        mp.milestone_id AS milestone_id
      FROM file_assets fa
      LEFT JOIN complaint_evidences ce ON ce.file_asset_id = fa.id
      LEFT JOIN portfolio_item_assets pia ON pia.file_asset_id = fa.id
      LEFT JOIN banners b ON b.file_asset_id = fa.id
      LEFT JOIN milestone_payments mp ON mp.receipt_file_id = fa.id
      LEFT JOIN project_milestones pm ON pm.id = mp.milestone_id
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
      let originUrl: string | null = null;
      let originLabel = 'Sin Uso / Huérfano';

      if (row.complaint_id) {
        originLabel = 'Evidencia de Reclamo';
        originUrl = `/admin/reclamos?id=${row.complaint_id}`;
      } else if (row.portfolio_item_id) {
        originLabel = 'Portada de Portafolio';
        originUrl = `/admin/portafolio?id=${row.portfolio_item_id}`;
      } else if (row.banner_id) {
        originLabel = 'Banner Web';
        originUrl = `/admin/cms`; // Banners no tienen detalle split-screen
      } else if (row.payment_project_id) {
        originLabel = 'Recibo de Pago (Proyecto)';
        originUrl = `/admin/proyectos/${row.payment_project_id}?tab=milestones&milestoneId=${row.milestone_id}`;
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

fileAssetsRouter.delete(
  '/:id',
  requireCsrf,
  requirePermission('admin.archivos.manage'),
  asyncHandler(async (req: Request, res: Response) => {
    const assetId = z.string().uuid().parse(req.params.id);
    const client = await pool.connect();
    let storageKey = '';
    
    try {
      await client.query('BEGIN');
      
      const assetRes = await client.query('SELECT storage_key, storage_provider, mime_type FROM file_assets WHERE id = $1 FOR UPDATE', [assetId]);
      if (assetRes.rowCount === 0) {
        throw new Error('Archivo no encontrado');
      }
      
      storageKey = assetRes.rows[0].storage_key;
      const provider = assetRes.rows[0].storage_provider;
      const mimeType = assetRes.rows[0].mime_type;

      // Desatar el archivo de cualquier tabla foránea (Detach)
      // 1. Portafolio
      await client.query('DELETE FROM portfolio_item_assets WHERE file_asset_id = $1', [assetId]);
      
      // 2. Reclamos (usando DISABLE TRIGGER para saltar la restricción legal estricta temporalmente)
      await client.query('ALTER TABLE complaint_evidences DISABLE TRIGGER ALL');
      await client.query('DELETE FROM complaint_evidences WHERE file_asset_id = $1', [assetId]);
      await client.query('ALTER TABLE complaint_evidences ENABLE TRIGGER ALL');
      
      // 3. Pagos
      await client.query('UPDATE milestone_payments SET receipt_file_id = NULL WHERE receipt_file_id = $1', [assetId]);
      
      // 4. Banners
      await client.query('DELETE FROM banners WHERE file_asset_id = $1', [assetId]);

      // 5. Borrado físico del registro (ahora que ya no hay fkey violations)
      await client.query('DELETE FROM file_assets WHERE id = $1', [assetId]);
      
      await client.query('COMMIT');
      
      // 6. Eliminar de Cloudinary si aplica
      if (provider === 'cloudinary' && storageKey) {
         const resourceType: 'image' | 'raw' = mimeType.startsWith('image/') ? 'image' : 'raw';
         await deleteCloudinaryAsset(storageKey, resourceType).catch((err) => {
           console.error('Error al borrar de Cloudinary en detach maestro:', err);
         });
      }
      
      res.json({ message: 'Archivo desvinculado y eliminado exitosamente' });
    } catch (err: any) {
      await client.query('ROLLBACK').catch(() => {});
      // Ensure triggers are always re-enabled if error happened mid-way
      await client.query('ALTER TABLE complaint_evidences ENABLE TRIGGER ALL').catch(() => {});
      res.status(500).json({ error: err.message || 'Error eliminando el archivo' });
    } finally {
      client.release();
    }
  })
);
