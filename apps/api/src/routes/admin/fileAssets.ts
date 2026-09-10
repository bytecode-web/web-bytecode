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

    // Consulta con subqueries para evitar producto cartesiano (1 fila por file_asset)
    const sql = `
      SELECT 
        fa.id,
        fa.original_name,
        fa.storage_provider,
        fa.public_url,
        fa.mime_type,
        fa.byte_size,
        fa.created_at,
        (SELECT array_agg(complaint_id) FROM complaint_evidences WHERE file_asset_id = fa.id) AS complaint_ids,
        (SELECT array_agg(portfolio_item_id) FROM portfolio_item_assets WHERE file_asset_id = fa.id) AS portfolio_item_ids,
        (SELECT array_agg(id) FROM banners WHERE file_asset_id = fa.id) AS banner_ids,
        (SELECT json_agg(json_build_object('project_id', pm.project_id, 'milestone_id', mp.milestone_id)) 
         FROM milestone_payments mp 
         JOIN project_milestones pm ON pm.id = mp.milestone_id 
         WHERE mp.receipt_file_id = fa.id) AS payment_projects
      FROM file_assets fa
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
      const origins: { label: string; url: string | null; module: string; recordId: string | null }[] = [];

      if (row.complaint_ids && row.complaint_ids.length > 0) {
        row.complaint_ids.forEach((cId: string) => {
          origins.push({ label: 'Evidencia de Reclamo', url: `/admin/reclamos?id=${cId}`, module: 'complaint', recordId: cId });
        });
      } 
      if (row.portfolio_item_ids && row.portfolio_item_ids.length > 0) {
        row.portfolio_item_ids.forEach((pId: string) => {
          origins.push({ label: 'Portada de Portafolio', url: `/admin/portafolio?id=${pId}`, module: 'portfolio', recordId: pId });
        });
      } 
      if (row.banner_ids && row.banner_ids.length > 0) {
        row.banner_ids.forEach((bId: string) => {
          origins.push({ label: 'Banner Web', url: `/admin/cms`, module: 'banner', recordId: bId });
        });
      } 
      if (row.payment_projects && row.payment_projects.length > 0) {
        row.payment_projects.forEach((pp: { project_id: string, milestone_id: string }) => {
          origins.push({ label: 'Recibo de Pago', url: `/admin/proyectos/${pp.project_id}?tab=milestones&milestoneId=${pp.milestone_id}`, module: 'milestone_payment', recordId: pp.milestone_id });
        });
      }

      const originLabels = origins.length > 0 ? origins.map(o => o.label).join(', ') : 'Sin Uso / Huérfano';
      const mainUrl = origins.length > 0 ? origins[0].url : null;
      const allUrls = origins.length > 0 ? origins.map(o => o.url).filter(u => u !== null) : [];

      return {
        id: row.id,
        original_name: row.original_name,
        storage_provider: row.storage_provider,
        public_url: row.public_url,
        mime_type: row.mime_type,
        byte_size: row.byte_size,
        created_at: row.created_at,
        origin: {
          label: originLabels,
          url: mainUrl,
          allUrls: allUrls,
          details: origins
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

fileAssetsRouter.delete(
  '/:id/detach',
  requireCsrf,
  requirePermission('admin.archivos.manage'),
  asyncHandler(async (req: Request, res: Response) => {
    const assetId = String(req.params.id);
    const { module, recordId } = req.body;
    
    if (!module || !recordId) {
       res.status(400).json({ error: 'Módulo y recordId son requeridos' });
       return;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const assetRes = await client.query('SELECT storage_key, storage_provider, mime_type FROM file_assets WHERE id = $1 FOR UPDATE', [assetId]);
      if (assetRes.rowCount === 0) {
        throw new Error('Archivo no encontrado');
      }

      if (module === 'complaint') {
        await client.query('ALTER TABLE complaint_evidences DISABLE TRIGGER ALL');
        await client.query('DELETE FROM complaint_evidences WHERE file_asset_id = $1 AND complaint_id = $2', [assetId, recordId]);
        await client.query('ALTER TABLE complaint_evidences ENABLE TRIGGER ALL');
      } else if (module === 'portfolio') {
        await client.query('DELETE FROM portfolio_item_assets WHERE file_asset_id = $1 AND portfolio_item_id = $2', [assetId, recordId]);
      } else if (module === 'banner') {
        await client.query('UPDATE banners SET file_asset_id = NULL WHERE file_asset_id = $1 AND id = $2', [assetId, recordId]);
      } else if (module === 'milestone_payment') {
        await client.query('UPDATE milestone_payments SET receipt_file_id = NULL WHERE receipt_file_id = $1 AND milestone_id = $2', [assetId, recordId]);
      }

      // Check if orphan
      const orphanCheck = await client.query(`
        SELECT COUNT(*) as refs FROM (
          SELECT 1 FROM complaint_evidences WHERE file_asset_id = $1
          UNION ALL
          SELECT 1 FROM portfolio_item_assets WHERE file_asset_id = $1
          UNION ALL
          SELECT 1 FROM banners WHERE file_asset_id = $1
          UNION ALL
          SELECT 1 FROM milestone_payments WHERE receipt_file_id = $1
        ) as sub
      `, [assetId]);

      if (parseInt(orphanCheck.rows[0].refs) === 0) {
        await client.query('DELETE FROM file_assets WHERE id = $1', [assetId]);
        
        const storageKey = assetRes.rows[0].storage_key;
        const provider = assetRes.rows[0].storage_provider;
        const mimeType = assetRes.rows[0].mime_type;
        
        if (provider === 'cloudinary' && storageKey) {
           const resourceType: 'image' | 'raw' = mimeType.startsWith('image/') ? 'image' : 'raw';
           await deleteCloudinaryAsset(storageKey, resourceType).catch(() => {});
        }
      }

      await client.query('COMMIT');
      res.json({ success: true });
    } catch (err: any) {
      await client.query('ROLLBACK').catch(() => {});
      await client.query('ALTER TABLE complaint_evidences ENABLE TRIGGER ALL').catch(() => {});
      res.status(500).json({ error: err.message || 'Error desvinculando' });
    } finally {
      client.release();
    }
  })
);
