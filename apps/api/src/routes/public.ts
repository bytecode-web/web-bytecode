import crypto from 'node:crypto';
import { Router } from 'express';
import type { Request, Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { env } from '../config/env.js';
import { MAX_UPLOAD_MB } from '../config/constants.js';
import { pool } from '../db/pool.js';
import { deleteCloudinaryAsset, uploadComplaintEvidenceToCloudinary, type CloudinaryStoredAsset, } from '../lib/cloudinary.js';
import { allowedUploadMimeTypeList, validateUpload, type ValidatedUpload } from '../lib/validateUpload.js';
import { publicFormLimiter } from '../middleware/rateLimiters.js';
import { notifyAdmins } from '../services/email.js';
import { capitalize } from '../services/emailTemplates.js';
import { sendInAppNotification, enqueueEmail } from '../services/notificationService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { HttpError } from '../utils/httpError.js';

const router = Router();

router.get('/health', async (req: Request, res: Response) => {
  try {
    // Verificar que la base de datos responda correctamente
    await pool.query('SELECT 1 AS status'); 
    res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
  } catch (error) {
    console.error("Health check failed:", error);
    res.status(500).json({ status: 'error', message: 'Database connection failure' });
  }
});

router.get('/internal/config', (req: Request, res: Response) => {
  res.status(200).json({
    dbUrl: env.databaseUrl ? env.databaseUrl.replace(/:[^:@]+@/, ':****@') : '',
    isStaticOnly: false
  });
});

router.get('/settings', asyncHandler(async (req: Request, res: Response) => {
  const result = await pool.query('SELECT setting_key, setting_value FROM system_settings WHERE is_sensitive = false');
  const settings = result.rows.reduce((acc: Record<string, unknown>, row) => {
    acc[row.setting_key] = row.setting_value;
    return acc;
  }, {});
  res.json({ data: settings });
}));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_UPLOAD_MB * 1024 * 1024,
  },
  fileFilter: (_req: Request, file: Express.Multer.File, callback: (error: Error | null, acceptFile?: boolean) => void) => {
    if (!allowedUploadMimeTypeList.includes(file.mimetype)) {
      callback(new HttpError(400, 'Tipo MIME no permitido.'));
      return;
    }

    callback(null, true);
  },
});

const noDigitsText = z.string().trim().regex(/^[^\d]+$/, 'No debe contener números.');
const digitsOnly = z.string().trim().regex(/^[\d\s+-]+$/, 'Solo se permiten números y símbolos de teléfono (+, -).');
const alphanumericId = z.string().trim().regex(/^[\w-]{4,40}$/, 'Formato de identificación inválido (alfanumérico, guiones o guiones bajos).');
const lettersNumbersSpaces = z.string().trim().regex(/^[\p{L}\p{N}\s.\-&]+$/u, 'Solo se permiten letras, números, espacios y caracteres básicos de empresa.');

const contactSchemaBase = z.object({
  countryId: z.preprocess((value) => value === '' ? undefined : value, z.string().uuid().optional()),
  nombre: noDigitsText.min(2).max(120),
  apellido: noDigitsText.min(2).max(120),
  email: z.string().trim().email().max(180),
  celular: digitsOnly.min(4).max(20),
  servicio: z.string().trim().min(2).max(120),
  mensaje: z.string().trim().min(10).max(1200),
  aceptaTerminos: z.coerce.boolean().refine((val) => val, 'Debe aceptar los términos.'),
  aceptaMarketing: z.coerce.boolean().default(false),
});

const contactSchema = z.discriminatedUnion('personType', [
  contactSchemaBase.extend({
    personType: z.literal('company'),
    cargo: noDigitsText.min(2).max(160),
    empresa: lettersNumbersSpaces.min(2).max(180),
    ruc: alphanumericId,
  }),
  contactSchemaBase.extend({
    personType: z.literal('individual'),
    documentType: z.string().trim().min(1).max(50),
    documentNumber: alphanumericId,
  }),
]);

const complaintSchema = z.object({
  nombres: z.string().trim().min(2).max(160),
  apellidos: z.string().trim().min(2).max(160),
  domicilio: z.string().trim().min(4).max(240),
  tipoDoc: z.string().trim().min(1).max(50),
  numeroDoc: alphanumericId,
  prefijoTelefono: z.string().trim().min(1).max(10).default('+51'),
  telefono: digitsOnly.min(6).max(40),
  email: z.string().trim().email().max(180),
  personType: z.string().trim().min(1).max(50),
  goodType: z.string().trim().min(1).max(50),
  montoCuantificable: z.string().trim().max(80).optional().default(''),
  descripcion: z.string().trim().min(2).max(240),
  nombreUnidad: z.string().trim().max(160).optional().default(''),
  opcionBien: z.string().trim().max(120).optional().default(''),
  claimType: z.string().trim().min(1).max(50),
  tipoReclamo: z.string().trim().min(2).max(160),
  detalle: z.string().trim().min(10).max(3000),
  pedido: z.string().trim().min(5).max(2000),
  aceptaTerminos: z.coerce.boolean().refine((value) => value, 'Debe aceptar la declaración.'),
});

const createComplaintCode = () => {
  const date = new Date();
  const datePart = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  return `REC-${datePart}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
};

const normalizeGoodType = (value: string) => {
  const normalized = value.trim().toLowerCase();
  if (['producto', 'product'].includes(normalized)) return 'product';
  if (['servicio', 'service'].includes(normalized)) return 'service';
  throw new HttpError(400, 'Tipo de bien no permitido.');
};

const parseClaimedAmount = (value: string) => {
  const normalized = value.replace(/[^\d.,-]/g, '').replace(',', '.').trim();
  if (!normalized) return null;

  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new HttpError(400, 'Monto reclamado invalido.');
  }

  return amount;
};

// --- ENDPOINTS PARA CATÁLOGOS ---
let normalizedContactSchema: boolean | null = null;

router.get('/catalog/countries', asyncHandler(async (_req: Request, res: Response) => {
  const result = await pool.query('SELECT id, iso2, name, dial_code as "dialCode", phone_max_length as "maxLength", tax_id_regex, tax_id_format, phone_regex, phone_format FROM countries WHERE is_active = true ORDER BY name ASC');
  // Aseguramos iso2 en vez de iso por compatibilidad con el front
  const mapped = result.rows.map(r => ({ ...r, iso: r.iso2 }));
  res.json({ items: mapped });
}));

router.get('/catalog/services', asyncHandler(async (_req: Request, res: Response) => {
  const result = await pool.query('SELECT id, code, name FROM service_catalog WHERE is_active = true ORDER BY name ASC');
  res.json({ items: result.rows });
}));

router.get('/catalog/document-types', asyncHandler(async (_req: Request, res: Response) => {
  const result = await pool.query('SELECT id, code, name, country_id, validation_regex, min_length, max_length, is_company_document, placeholder FROM document_types WHERE is_active = true ORDER BY name ASC');
  res.json({ items: result.rows });
}));

router.get('/catalog/complaint-types', asyncHandler(async (_req: Request, res: Response) => {
  const result = await pool.query('SELECT id, code, name FROM complaint_types WHERE is_active = true ORDER BY name ASC');
  res.json({ items: result.rows });
}));

router.get('/catalog/statuses', asyncHandler(async (req: Request, res: Response) => {
  const domain = req.query.domain as string;
  const result = await pool.query('SELECT id, code, name, is_terminal as "isTerminal" FROM status_catalog WHERE domain = $1 AND is_active = true ORDER BY sort_order ASC', [domain]);
  res.json({ items: result.rows });
}));

router.get('/catalog/priorities', asyncHandler(async (_req: Request, res: Response) => {
  const result = await pool.query('SELECT id, code, name FROM priority_catalog WHERE is_active = true ORDER BY weight DESC');
  res.json({ items: result.rows });
}));

router.get('/cms/pages', asyncHandler(async (_req: Request, res: Response) => {
  const result = await pool.query(`
    SELECT cp.id, cp.slug, cp.title, cp.meta_title, cp.meta_description,
           sc.code AS status, sc.name AS status_name,
           cp.created_at, cp.updated_at
    FROM cms_pages cp
    JOIN status_catalog sc ON cp.status_id = sc.id
    WHERE cp.deleted_at IS NULL
      AND sc.domain = 'cms'
      AND sc.code = 'published'
    ORDER BY cp.created_at ASC
  `);
  res.json({ items: result.rows });
}));

router.get('/cms/:slug', asyncHandler(async (req: Request, res: Response) => {
  const slug = z.string().trim().min(1).max(160).parse(req.params.slug);
  const result = await pool.query(
    `SELECT cp.id, cp.slug, cp.title, cp.meta_title, cp.meta_description,
            sc.code AS status, sc.name AS status_name,
            cp.created_at, cp.updated_at
     FROM cms_pages cp
     JOIN status_catalog sc ON cp.status_id = sc.id
     WHERE cp.slug = $1
       AND cp.deleted_at IS NULL
       AND sc.domain = 'cms'
       AND sc.code = 'published'
     LIMIT 1`,
    [slug],
  );
  if (!result.rowCount) throw new HttpError(404, 'Seccion CMS no disponible.');
  res.json({ item: result.rows[0] });
}));

router.get('/catalog/pricing', asyncHandler(async (req: Request, res: Response) => {
  const userRole = (req as any).admin?.roles?.[0] || (req as any).user?.role || 'guest';
  const result = await pool.query(
    `SELECT pc.id, pc.item_code, pc.name, pc.description, pc.pricing_model, 
            CASE WHEN pro.id IS NOT NULL THEN pro.base_price ELSE pc.base_price END AS base_price, 
            CASE WHEN pro.id IS NOT NULL THEN pro.max_price ELSE pc.max_price END AS max_price 
     FROM pricing_catalog pc
     LEFT JOIN pricing_role_overrides pro 
       ON pc.id = pro.pricing_catalog_id AND pro.role_name = $1
     WHERE pc.is_active = true 
     ORDER BY pc.name ASC`,
    [userRole]
  );
  res.json({ items: result.rows });
}));

router.get('/portfolio', asyncHandler(async (_req: Request, res: Response) => {
  const result = await pool.query(`
    SELECT
      pi.id,
      pi.name,
      
      pi.website_url,
      sc.code AS status,
      sc.name AS status_name,
      COALESCE(fa.public_url, fa.storage_key) AS image_url,
      COALESCE(
        array_agg(tc.name ORDER BY pit.sort_order, tc.sort_order, tc.name)
          FILTER (WHERE tc.id IS NOT NULL),
        ARRAY[]::text[]
      ) AS tags
    FROM portfolio_items pi
    JOIN status_catalog sc
      ON pi.status_id = sc.id
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
      AND tc.is_active = true
      AND tc.deleted_at IS NULL
    WHERE pi.deleted_at IS NULL
      AND sc.domain = 'cms'
      AND sc.code = 'published'
    GROUP BY pi.id, sc.id, fa.public_url, fa.storage_key
    ORDER BY pi.sort_order ASC, pi.created_at DESC
  `);

  res.json({
    items: result.rows.map((item) => ({
      id: item.id,
      name: item.name,
      clientName: item.client_name,
      description: item.description,
      url: item.website_url,
      img: item.image_url,
      tags: item.tags,
    })),
  });
}));

router.post(
  '/contact-submissions',
  publicFormLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const body = contactSchema.parse(req.body);
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      if (body.countryId) {
        const countryRes = await client.query(
          `
          SELECT phone_max_length, dial_code
          FROM countries
          WHERE id = $1 AND is_active = true
          LIMIT 1
          `,
          [body.countryId],
        );

        if (countryRes.rowCount === 0) {
          throw new HttpError(400, 'País no válido.');
        }

        const country = countryRes.rows[0] as {
          phone_max_length: number | null;
          dial_code: string | null;
        };

        if (country.phone_max_length) {
          // Extraemos el dial_code del principio y limpiamos espacios/símbolos extras para contar solo dígitos puros ingresados
          let rawPhone = body.celular;
          if (country.dial_code && rawPhone.startsWith(country.dial_code)) {
             rawPhone = rawPhone.substring(country.dial_code.length);
          }
          rawPhone = rawPhone.replace(/\D/g, ''); // Deja solo los dígitos

          if (rawPhone.length !== Number(country.phone_max_length)) {
            throw new HttpError(400, `El celular debe tener ${country.phone_max_length} dígitos.`);
          }
        }

        // Fetch validation regex from document_types based on personType
        if (body.personType === 'company') {
          const docTypeRes = await client.query(
            `SELECT validation_regex, name FROM document_types WHERE country_id = $1 AND is_company_document = true LIMIT 1`,
            [body.countryId]
          );
          
          if ((docTypeRes.rowCount ?? 0) > 0) {
             const docType = docTypeRes.rows[0];
             if (docType.validation_regex && body.ruc) {
                 const taxRegex = new RegExp(docType.validation_regex);
                 if (!taxRegex.test(body.ruc)) {
                     throw new HttpError(400, `Formato inválido para ${docType.name ?? 'identificación corporativa'}.`);
                 }
             }
          }
        } else if (body.personType === 'individual' && body.documentType) {
          const docTypeRes = await client.query(
            `SELECT validation_regex, name FROM document_types WHERE code = $1 LIMIT 1`,
            [body.documentType]
          );
          
          if ((docTypeRes.rowCount ?? 0) > 0) {
             const docType = docTypeRes.rows[0];
             if (docType.validation_regex && body.documentNumber) {
                 const taxRegex = new RegExp(docType.validation_regex);
                 if (!taxRegex.test(body.documentNumber)) {
                     throw new HttpError(400, `Formato inválido para ${docType.name ?? 'documento'}.`);
                 }
             }
          }
        }
      }

      let customerId: string;
      const personTypeVal = body.personType === 'company' ? 'company_contact' : 'natural';

      if (body.personType === 'individual') {
        const docTypeRes = await client.query(
          "SELECT id FROM document_types WHERE code = $1 LIMIT 1",
          [body.documentType]
        );
        const docTypeId = (docTypeRes.rowCount ?? 0) > 0 ? docTypeRes.rows[0].id : null;

        if (docTypeId) {
          const existingDoc = await client.query(
            "SELECT customer_id FROM customer_documents WHERE document_type_id = $1 AND document_number = $2 AND deleted_at IS NULL LIMIT 1",
            [docTypeId, body.documentNumber]
          );

          if ((existingDoc.rowCount ?? 0) > 0) {
            customerId = existingDoc.rows[0].customer_id;
            await client.query(
              "UPDATE customers SET primary_email = $1, primary_phone = $2, first_name = $3, last_name = $4, country_id = $5, consent_terms = $6, consent_marketing = $7, updated_at = NOW() WHERE id = $8",
              [body.email.toLowerCase(), body.celular, body.nombre, body.apellido, body.countryId ?? null, body.aceptaTerminos, body.aceptaMarketing, customerId]
            );
          } else {
            const customerRes = await client.query(
              `
              INSERT INTO customers (customer_code, first_name, last_name, person_type, primary_email, primary_phone, country_id, consent_terms, consent_marketing)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
              RETURNING id
              `,
              [`CUS-${crypto.randomBytes(4).toString('hex').toUpperCase()}`, body.nombre, body.apellido, personTypeVal, body.email.toLowerCase(), body.celular, body.countryId ?? null, body.aceptaTerminos, body.aceptaMarketing]
            );
            customerId = customerRes.rows[0].id;
            
            await client.query(
              `INSERT INTO customer_documents (customer_id, document_type_id, document_number, is_primary)
               VALUES ($1, $2, $3, true)
               ON CONFLICT (document_type_id, document_number) WHERE deleted_at IS NULL
               DO NOTHING`,
              [customerId, docTypeId, body.documentNumber]
            );
          }
        } else {
          const customerRes = await client.query(
            `
            INSERT INTO customers (customer_code, first_name, last_name, person_type, primary_email, primary_phone, country_id, consent_terms, consent_marketing)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING id
            `,
            [`CUS-${crypto.randomBytes(4).toString('hex').toUpperCase()}`, body.nombre, body.apellido, personTypeVal, body.email.toLowerCase(), body.celular, body.countryId ?? null, body.aceptaTerminos, body.aceptaMarketing]
          );
          customerId = customerRes.rows[0].id;
        }
      } else {
        const customerRes = await client.query(
          `
          INSERT INTO customers (customer_code, first_name, last_name, person_type, primary_email, primary_phone, country_id, consent_terms, consent_marketing)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          RETURNING id
          `,
          [`CUS-${crypto.randomBytes(4).toString('hex').toUpperCase()}`, body.nombre, body.apellido, personTypeVal, body.email.toLowerCase(), body.celular, body.countryId ?? null, body.aceptaTerminos, body.aceptaMarketing]
        );
        customerId = customerRes.rows[0].id;
      }

      const statusRes = await client.query("SELECT id FROM status_catalog WHERE domain = 'case' AND code = 'new' AND is_active = true LIMIT 1");
      if (statusRes.rowCount === 0) throw new HttpError(400, 'Estado inicial de contacto no configurado.');
      const statusId = statusRes.rows[0].id;

      const caseCode = `CAS-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

      const serviceRes = await client.query(
        'SELECT id, name FROM service_catalog WHERE code = $1 AND is_active = true LIMIT 1',
        [body.servicio],
      );
      const serviceId = serviceRes.rows[0]?.id ?? null;
      const serviceName = serviceRes.rows[0]?.name ?? body.servicio;

      let result;

      if (body.personType === 'company') {
        const existingOrganization = await client.query(
          'SELECT id FROM organizations WHERE ruc = $1 AND deleted_at IS NULL LIMIT 1',
          [body.ruc],
        );
        const organizationId = existingOrganization.rowCount
          ? existingOrganization.rows[0].id
          : (await client.query(
              'INSERT INTO organizations (legal_name, trade_name, ruc) VALUES ($1, $1, $2) RETURNING id',
              [body.empresa, body.ruc],
            )).rows[0].id;

        if (existingOrganization.rowCount) {
          await client.query(
            'UPDATE organizations SET legal_name = $2, trade_name = $2, updated_at = now() WHERE id = $1',
            [organizationId, body.empresa],
          );
        }

        await client.query(
          `
          INSERT INTO customer_organizations (customer_id, organization_id, position_title, is_primary)
          VALUES ($1, $2, $3, true)
          ON CONFLICT (customer_id, organization_id)
          DO UPDATE SET
            position_title = EXCLUDED.position_title,
            is_primary = true,
            deleted_at = NULL,
            updated_at = now()
          `,
          [customerId, organizationId, body.cargo],
        );

        result = await client.query(
          `
          INSERT INTO contact_cases (
            case_code, customer_id, organization_id, service_id, status_id, subject, message, internal_notes, priority_id
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, (SELECT id FROM priority_catalog WHERE code = 'normal'))
          RETURNING id, created_at
          `,
          [
            caseCode,
            customerId,
            organizationId,
            serviceId,
            statusId,
            serviceName,
            body.mensaje,
            '',
          ],
        );
      } else {
        result = await client.query(
          `
          INSERT INTO contact_cases (
            case_code, customer_id, service_id, status_id, subject, message, internal_notes, priority_id
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, (SELECT id FROM priority_catalog WHERE code = 'normal'))
          RETURNING id, created_at
          `,
          [
            caseCode,
            customerId,
            serviceId,
            statusId,
            serviceName,
            body.mensaje,
            '',
          ],
        );
      }

      await client.query('COMMIT');

      let contactNotificationPayload: Record<string, unknown> = {
        Código: caseCode,
      };

      if (body.personType === 'company') {
        contactNotificationPayload = {
          ...contactNotificationPayload,
          'Tipo de Cliente': 'Empresa',
          Empresa: body.empresa,
          RUC: body.ruc,
        };
      } else {
        contactNotificationPayload = {
          ...contactNotificationPayload,
          'Tipo de Cliente': 'Independiente',
          'Tipo de Documento': body.documentType,
          'Número de Documento': body.documentNumber,
        };
      }

      contactNotificationPayload = {
        ...contactNotificationPayload,
        Nombre: body.nombre,
        Apellido: body.apellido,
        Email: body.email,
        Celular: body.celular,
        Servicio: capitalize(body.servicio),
        Mensaje: body.mensaje,
      };

      if (body.personType === 'company') {
        contactNotificationPayload.Cargo = body.cargo;
      }

      notifyAdmins('Nueva solicitud de contacto web', contactNotificationPayload, ['support_agent', 'super_admin'], 'contact').catch(console.error);
      sendInAppNotification('contact_created', 'Nuevo Lead de Contacto', `El prospecto ${body.nombre} ${body.apellido} ha dejado un mensaje.`, 'contact_cases', result.rows[0].id);
      enqueueEmail('contact_receipt', body.email, {
        name: body.nombre,
        lastName: body.apellido,
        caseCode: caseCode,
        service: capitalize(body.servicio),
        message: body.mensaje
      }, 'contact_cases', result.rows[0].id).catch(console.error);

      res.status(201).json({ id: result.rows[0].id, createdAt: result.rows[0].created_at });
    } catch (e: unknown) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }),
);

router.post(
  '/complaints',
  publicFormLimiter,
  upload.single('archivoAdjunto'),
  asyncHandler(async (req: Request, res: Response) => {
    const body = complaintSchema.parse(req.body);
    const file: Express.Multer.File | undefined = req.file;
    const code = createComplaintCode();
    let validatedFile: ValidatedUpload | null = null;
    let cloudinaryAsset: CloudinaryStoredAsset | null = null;

    if (file) {
      validatedFile = await validateUpload(file);

      try {
        cloudinaryAsset = await uploadComplaintEvidenceToCloudinary({
          buffer: file.buffer,
          complaintCode: code,
          originalName: validatedFile.originalName,
          mimeType: validatedFile.mimeType,
        });
      } catch (error: unknown) {
        console.error('Cloudinary complaint evidence upload failed:', error);
        throw new HttpError(502, 'No se pudo almacenar el archivo adjunto.');
      }
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      let customerId: string;
      
      const docTypeRes = await client.query(
        "SELECT id FROM document_types WHERE code = $1 LIMIT 1",
        [body.tipoDoc]
      );
      const docTypeId = (docTypeRes.rowCount ?? 0) > 0 ? docTypeRes.rows[0].id : null;

      if (docTypeId) {
        const existingDoc = await client.query(
          "SELECT customer_id FROM customer_documents WHERE document_type_id = $1 AND document_number = $2 AND deleted_at IS NULL LIMIT 1",
          [docTypeId, body.numeroDoc]
        );

        if ((existingDoc.rowCount ?? 0) > 0) {
          customerId = existingDoc.rows[0].customer_id;
          await client.query(
            "UPDATE customers SET primary_email = $1, primary_phone = $2, first_name = $3, last_name = $4, updated_at = NOW() WHERE id = $5",
            [body.email.toLowerCase(), `${body.prefijoTelefono} ${body.telefono}`, body.nombres, body.apellidos, customerId]
          );
        } else {
          const customerRes = await client.query(
            `
            INSERT INTO customers (customer_code, first_name, last_name, primary_email, primary_phone)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id
            `,
            [`CUS-${crypto.randomBytes(4).toString('hex').toUpperCase()}`, body.nombres, body.apellidos, body.email.toLowerCase(), `${body.prefijoTelefono} ${body.telefono}`]
          );
          customerId = customerRes.rows[0].id;
          
          await client.query(
            `INSERT INTO customer_documents (customer_id, document_type_id, document_number, is_primary)
             VALUES ($1, $2, $3, true)
             ON CONFLICT (document_type_id, document_number) WHERE deleted_at IS NULL
             DO NOTHING`,
            [customerId, docTypeId, body.numeroDoc]
          );
        }
      } else {
        const customerRes = await client.query(
          `
          INSERT INTO customers (customer_code, first_name, last_name, primary_email, primary_phone)
          VALUES ($1, $2, $3, $4, $5)
          RETURNING id
          `,
          [`CUS-${crypto.randomBytes(4).toString('hex').toUpperCase()}`, body.nombres, body.apellidos, body.email.toLowerCase(), `${body.prefijoTelefono} ${body.telefono}`]
        );
        customerId = customerRes.rows[0].id;
      }

      const statusRes = await client.query("SELECT id FROM status_catalog WHERE domain = 'complaint' AND code = 'registered' AND is_active = true LIMIT 1");
      if (statusRes.rowCount === 0) throw new HttpError(400, 'Estado inicial de reclamo no configurado.');
      const statusId = statusRes.rows[0].id;

      // Handle complaint_type_id mapping from string code (claimType = queja/reclamo)
      const typeRes = await client.query("SELECT id FROM complaint_types WHERE code = $1 LIMIT 1", [body.claimType.toLowerCase()]);
      const complaintTypeId = (typeRes.rowCount ?? 0) > 0 ? typeRes.rows[0].id : null;
      if (!complaintTypeId) throw new Error('Tipo de reclamo inválido.');

      let fileAssetId = null;
      if (file && validatedFile && cloudinaryAsset) {
        const fileRes = await client.query(
          `
          INSERT INTO file_assets (
            original_name, storage_provider, storage_key, public_url,
            mime_type, byte_size, checksum_sha256
          )
          VALUES ($1, 'cloudinary', $2, $3, $4, $5, $6)
          RETURNING id
          `,
          [
            validatedFile.originalName,
            cloudinaryAsset.publicId,
            cloudinaryAsset.secureUrl,
            validatedFile.mimeType,
            cloudinaryAsset.bytes || file.size,
            validatedFile.checksumSha256,
          ],
        );
        fileAssetId = fileRes.rows[0].id;
      }

      const result = await client.query(
        `
        INSERT INTO complaints (
          complaint_code, customer_id, complaint_type_id, status_id, 
          legal_acceptance, legal_acceptance_at, legal_response_due_at, internal_notes, priority_id
        )
        VALUES ($1, $2, $3, $4, $5, now(), now() + interval '15 days', '', (SELECT id FROM priority_catalog WHERE code = 'normal'))
        RETURNING id, complaint_code, created_at
        `,
        [code, customerId, complaintTypeId, statusId, body.aceptaTerminos],
      );

      const complaintId = result.rows[0].id;

      await client.query(
        `
        INSERT INTO complaint_details (complaint_id, incident_detail, requested_solution, customer_ip, customer_user_agent)
        VALUES ($1, $2, $3, $4, $5)
        `,
        [complaintId, body.detalle, body.pedido, req.ip, req.headers['user-agent']]
      );

      await client.query(
        `
        INSERT INTO complaint_goods (complaint_id, good_type, description, category, claimed_amount)
        VALUES ($1, $2, $3, $4, $5)
        `,
        [complaintId, normalizeGoodType(body.goodType), body.descripcion, body.tipoReclamo, parseClaimedAmount(body.montoCuantificable)]
      );

      if (fileAssetId) {
        await client.query(
          `INSERT INTO complaint_evidences (complaint_id, file_asset_id) VALUES ($1, $2)`,
          [complaintId, fileAssetId]
        );
      }

      await client.query('COMMIT');

      const displayPersonType = (body.personType === 'company' || body.personType === 'company_contact') 
        ? 'Empresa' 
        : 'Persona natural';

      const complaintNotificationPayload = {
        Código: code,
        'Tipo de cliente': displayPersonType,
        Nombres: body.nombres,
        'Representante Legal': body.apellidos,
        'Tipo de Documento': body.tipoDoc,
        'Número de Documento': body.numeroDoc,
        Domicilio: body.domicilio,
        Email: body.email,
        Teléfono: `${body.prefijoTelefono} ${body.telefono}`,
        'Tipo de Trámite': capitalize(body.claimType),
        'Bien Contratado': capitalize(body.goodType),
        'Monto Reclamado': body.montoCuantificable ? `S/ ${body.montoCuantificable}` : 'No especificado',
        'Detalle del Incidente': body.detalle,
        'Pedido del Cliente': body.pedido,
        Adjunto: validatedFile?.originalName ?? 'Sin adjunto',
      };

      const customerReceiptPayload = {
        Cliente: body.personType === 'company' ? body.nombres : `${body.nombres} ${body.apellidos}`,
        Nombres: body.nombres,
        'Representante Legal': body.apellidos,
        'Tipo de Documento': body.tipoDoc,
        'Número de Documento': body.numeroDoc,
        Domicilio: body.domicilio,
        Email: body.email,
        Teléfono: `${body.prefijoTelefono} ${body.telefono}`,
        'Tipo de Trámite': capitalize(body.claimType),
        'Bien Contratado': capitalize(body.goodType),
        'Monto Reclamado': body.montoCuantificable ? `S/ ${body.montoCuantificable}` : 'No especificado',
        'Detalle del Incidente': body.detalle,
        'Pedido del Cliente': body.pedido,
      };

      notifyAdmins(`Alerta: Nuevo Reclamo ${code}`, complaintNotificationPayload, ['legal_reviewer', 'admin', 'super_admin'], 'complaint').catch(console.error);
      sendInAppNotification('complaint_created', `Nuevo Reclamo ${code}`, `El usuario ${body.nombres} ${body.apellidos} ha registrado un nuevo reclamo/queja.`, 'complaints', complaintId);
      const rowsHtml = Object.entries(customerReceiptPayload)
        .map(([key, value]) => `<tr><td style="padding: 10px; border-bottom: 1px solid rgba(255,255,255,0.1);"><strong style="color: #06CFD6;">${key}</strong></td><td style="padding: 10px; border-bottom: 1px solid rgba(255,255,255,0.1);">${value}</td></tr>`)
        .join('');
      
      enqueueEmail('complaint_receipt', body.email, {
        clientName: body.personType === 'company' ? body.nombres : `${body.nombres} ${body.apellidos}`,
        complaintCode: code,
        rowsHtml: rowsHtml
      }, 'complaints', complaintId).catch(console.error);

      res.status(201).json({ id: complaintId, code: result.rows[0].complaint_code, createdAt: result.rows[0].created_at });
    } catch (error: unknown) {
      await client.query('ROLLBACK');
      if (cloudinaryAsset) {
        await deleteCloudinaryAsset(cloudinaryAsset.publicId, cloudinaryAsset.resourceType).catch((cleanupError: unknown) => {
          console.error('Cloudinary cleanup failed after database rollback:', cleanupError);
        });
      }
      throw error;
    } finally {
      client.release();
    }
  }),
);
export default router;
