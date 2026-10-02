import crypto from 'node:crypto';
import multer from 'multer';
import type { Request } from 'express';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { allowedUploadMimeTypeList } from '../../lib/validateUpload.js';
import { HttpError } from '../../utils/httpError.js';

export const paginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(9),
  offset: z.coerce.number().int().min(0).default(0),
});

export const listQuerySchema = z.object({
  status: z.string().optional(),
  search: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(9),
  offset: z.coerce.number().int().min(0).default(0),
});

export const createBusinessCode = (prefix: string) =>
  `${prefix}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

export type Queryable = Pick<PoolClient, 'query'>;

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 8 * 1024 * 1024,
  },
  fileFilter: (_req: Request, file: Express.Multer.File, callback: (error: Error | null, acceptFile?: boolean) => void) => {
    if (!allowedUploadMimeTypeList.includes(file.mimetype)) {
      callback(new HttpError(400, 'Tipo MIME no permitido.'));
      return;
    }

    callback(null, true);
  },
});

export const statusHistorySelect = (historyTable: string, entityColumn: string) => `
  SELECT h.changed_at AS timestamp,
         u.name AS user_name,
         u.email AS user_email,
         old_sc.code AS old_status,
         old_sc.name AS old_status_name,
         new_sc.code AS new_status,
         new_sc.name AS new_status_name
         ${historyTable === 'contact_case_status_history' ? ', h.reason' : ''}
  FROM ${historyTable} h
  LEFT JOIN status_catalog old_sc ON h.old_status_id = old_sc.id
  LEFT JOIN status_catalog new_sc ON h.new_status_id = new_sc.id
  LEFT JOIN admin_users u ON h.changed_by = u.id
  WHERE h.${entityColumn} = $1
  ORDER BY h.changed_at DESC
`;

export const getProjectStatusInfo = async (client: Queryable, code: string) => {
  const result = await client.query(
    "SELECT id, name, code, is_terminal FROM status_catalog WHERE domain = 'project' AND code = $1 AND is_active = true LIMIT 1",
    [code],
  );
  if (!result.rowCount) throw new HttpError(400, 'Estado de proyecto invalido.');
  return { id: result.rows[0].id as string, name: result.rows[0].name as string, code: result.rows[0].code as string, is_terminal: result.rows[0].is_terminal ?? false };
};
