import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  deleteCloudinaryAsset,
  uploadPaymentReceiptToCloudinary,
  type CloudinaryStoredAsset,
} from '../../lib/cloudinary.js';
import { pool } from '../../db/pool.js';
import { validateUpload } from '../../lib/validateUpload.js';
import { requirePermission } from '../../middleware/auth.js';
import { requireProjectOwnership } from '../../middleware/abac.js';
import { requireCsrf } from '../../middleware/csrf.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { HttpError } from '../../utils/httpError.js';
import { auditService } from '../../services/audit.js';
import { upload } from './shared.js';

export const projectMilestonePaymentsRouter = Router();

const milestonePaymentBaseSchema = z.object({
  amountPaid: z.coerce.number().min(0.01),
  paymentMethod: z.enum(['transfer', 'cash', 'credit_card', 'paypal']),
  referenceNumber: z.string().max(180).optional().nullable(),
  paidAt: z.string().date(),
  splitRemaining: z.string().optional().transform(v => v === 'true'),
});

const milestonePaymentSchema = milestonePaymentBaseSchema.superRefine((data, ctx) => {
  if (data.paymentMethod !== 'cash' && (!data.referenceNumber || data.referenceNumber.trim() === '')) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'El número de operación es obligatorio para este método de pago.',
      path: ['referenceNumber'],
    });
  }
});

projectMilestonePaymentsRouter.post(
  '/projects/:id/milestones/:milestone_id/payments',
  requireCsrf,
  requirePermission('admin.proyectos.manage'),
  requireProjectOwnership,
  upload.single('receipt'),
  asyncHandler(async (req: Request, res: Response) => {
    const projectId = z.string().uuid().parse(req.params.id);
    const milestoneId = z.string().uuid().parse(req.params.milestone_id);
    const body = milestonePaymentSchema.parse(req.body);
    const file = req.file;

    if (body.paymentMethod !== 'cash' && !file) {
      throw new HttpError(400, 'El comprobante de pago es obligatorio para este método de pago.');
    }

    const client = await pool.connect();
    let cloudinaryAsset: CloudinaryStoredAsset | null = null;

    try {
      await client.query('BEGIN');

      const projectRes = await client.query(
        'SELECT project_code, currency_code FROM projects WHERE id = $1 AND deleted_at IS NULL',
        [projectId]
      );
      if (!projectRes.rowCount) throw new HttpError(404, 'Proyecto no encontrado.');
      const projectCode = projectRes.rows[0].project_code;
      const currencyCode = projectRes.rows[0].currency_code;

      let fileAssetId: string | null = null;

      if (file) {
        const validatedFile = await validateUpload(file);
        
        // Motor de Deduplicación: Buscar si el archivo ya existe por su Hash
        const existing = await client.query('SELECT id FROM file_assets WHERE checksum_sha256 = $1 AND deleted_at IS NULL LIMIT 1', [validatedFile.checksumSha256]);
        
        if (existing.rowCount && existing.rowCount > 0) {
          fileAssetId = existing.rows[0].id;
        } else {
          cloudinaryAsset = await uploadPaymentReceiptToCloudinary({
            buffer: file.buffer,
            projectCode,
            originalName: validatedFile.originalName,
            mimeType: validatedFile.mimeType,
          });

          const fileResult = await client.query(
            `INSERT INTO file_assets (
              original_name, storage_provider, storage_key, public_url,
              mime_type, byte_size, checksum_sha256, uploaded_by, created_by
            )
            VALUES ($1, 'cloudinary', $2, $3, $4, $5, $6, $7, $7)
            RETURNING id`,
            [
              validatedFile.originalName,
              cloudinaryAsset.publicId,
              cloudinaryAsset.secureUrl,
              validatedFile.mimeType,
              cloudinaryAsset.bytes || file.size,
              validatedFile.checksumSha256,
              req.admin?.id ?? null,
            ]
          );
          fileAssetId = fileResult.rows[0].id;
        }
      }

      const milestoneRes = await client.query(`
        SELECT pm.*,
               q.total_amount, COALESCE(SUM(mp.amount_paid), 0) as total_paid,
               sc.id as completed_status_id,
               q.currency_code as quote_currency_code
        FROM project_milestones pm
        LEFT JOIN quotes q ON q.id = pm.quote_id
        LEFT JOIN milestone_payments mp ON mp.milestone_id = pm.id AND mp.status = 'valid' AND mp.deleted_at IS NULL
        LEFT JOIN status_catalog sc ON sc.domain = 'milestone' AND sc.code = 'completed'
        WHERE pm.id = $1
        GROUP BY pm.id, q.total_amount, sc.id, q.currency_code
      `, [milestoneId]);

      if (!milestoneRes.rowCount) throw new HttpError(404, 'Hito no encontrado.');
      const oldMilestoneState = milestoneRes.rows[0];
      const { payment_percentage, total_amount, total_paid, title, due_date, status_id: original_status_id, completed_status_id, quote_id, quote_currency_code } = oldMilestoneState;
      
      const realCurrencyCode = quote_currency_code || currencyCode;
      
      const amountExpected = Number(total_amount) * (Number(payment_percentage) / 100);
      const amountPaidCurrently = Number(total_paid);
      const maxPaymentAllowed = amountExpected - amountPaidCurrently;

      if (Math.round(body.amountPaid * 100) > Math.round(maxPaymentAllowed * 100)) {
        throw new HttpError(400, `El pago excede el saldo restante del hito. Máximo permitido: ${maxPaymentAllowed.toFixed(2)}`);
      }

      const result = await client.query(
        `INSERT INTO milestone_payments (
          milestone_id, amount_paid, currency_code, payment_method,
          reference_number, receipt_file_id, paid_at, status, created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'valid', $8)
        RETURNING *`,
        [
          milestoneId,
          body.amountPaid,
          realCurrencyCode,
          body.paymentMethod,
          body.referenceNumber || null,
          fileAssetId,
          body.paidAt,
          req.admin?.id ?? null,
        ]
      );
      const paymentRow = result.rows[0];
      const auditLogs: any[] = [];
      auditLogs.push({ userId: req.admin?.id, action: 'create_milestone_payment', entityType: 'milestone_payments', entity: paymentRow, req });

      const isFullPayment = Math.round(body.amountPaid * 100) >= Math.round(maxPaymentAllowed * 100);
      if (isFullPayment && completed_status_id) {
         const updRes = await client.query(`UPDATE project_milestones SET status_id = $1, completed_at = NOW() WHERE id = $2 RETURNING *`, [completed_status_id, milestoneId]);
         auditLogs.push({ userId: req.admin?.id, action: 'update_milestone_status_auto', entityType: 'project_milestones', entity: updRes.rows[0], previousState: oldMilestoneState, req });
      } else if (body.splitRemaining && !isFullPayment) {
         const paidPercentage = ((amountPaidCurrently + body.amountPaid) / Number(total_amount)) * 100;
         const remainingPercentage = Number(payment_percentage) - paidPercentage;
         
         const updRes = await client.query(`UPDATE project_milestones SET payment_percentage = $1, status_id = $2, completed_at = NOW() WHERE id = $3 RETURNING *`, [paidPercentage, completed_status_id, milestoneId]);
         
         const cleanTitle = title.replace(/^Restante del pago de /, '');
         await client.query(
           `INSERT INTO project_milestones (project_id, quote_id, title, due_date, payment_percentage, status_id)
            VALUES ($1, $2, $3, $4, $5, $6)`,
           [projectId, quote_id, `Restante del pago de ${cleanTitle}`, due_date, remainingPercentage, original_status_id]
         );
         auditLogs.push({ userId: req.admin?.id, action: 'split_milestone_auto', entityType: 'project_milestones', entity: updRes.rows[0], previousState: oldMilestoneState, req });
      }

      await client.query('COMMIT');
      
      for (const log of auditLogs) {
        await auditService.logAdminAction(log);
      }
      res.status(201).json({ id: paymentRow.id });
    } catch (error: any) {
      await client.query('ROLLBACK').catch(() => undefined);
      if (cloudinaryAsset) {
        await deleteCloudinaryAsset(cloudinaryAsset.publicId, cloudinaryAsset.resourceType).catch(() => undefined);
      }
      if (error.code === '23505') {
        throw new HttpError(400, 'El número de operación ya ha sido registrado previamente para este método de pago.');
      }
      throw error;
    } finally {
      client.release();
    }
  }),
);
