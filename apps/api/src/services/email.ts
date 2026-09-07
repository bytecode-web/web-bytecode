import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import { pool } from '../db/pool.js';
import { buildAdminNotification } from './emailTemplates.js';
import { getSmtpConfig } from './settings.js';

const SMTP_MAX_RETRIES = Number(process.env.SMTP_MAX_RETRIES ?? 2);

// 1. DEFINICIÓN DE MÓDULOS Y REMITENTES DINÁMICOS
export type EmailModuleType = 'complaint' | 'quote' | 'contact' | 'system';

export const getSenderConfig = (moduleType: EmailModuleType) => {
  switch (moduleType) {
    case 'complaint':
      return '"Libro de Reclamaciones - Bytecode" <reclamos@bytecode.com.pe>';
    case 'quote':
      return '"Ventas Bytecode" <cotizaciones@bytecode.com.pe>';
    case 'contact':
      return '"Contacto Bytecode" <contacto@bytecode.com.pe>';
    case 'system':
    default:
      return '"Sistema Bytecode" <no-reply@bytecode.com.pe>';
  }
};

export async function getTransporter() {
  const config = await getSmtpConfig();
  const isEmailEnabled = Boolean(config.host && config.user && config.pass);

  if (!isEmailEnabled) return null;

  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass,
    },
  });
}

const wait = (ms: number) => new Promise((resolve) => {
  setTimeout(resolve, ms);
});

export async function verifyEmailTransport() {
  const transporter = await getTransporter();
  if (!transporter) return { enabled: false, ok: true };

  try {
    await transporter.verify();
    return { enabled: true, ok: true };
  } catch (error) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      subsystem: 'smtp',
      message: error instanceof Error ? error.message : 'SMTP verification failed.',
    }));
    return { enabled: true, ok: false };
  }
}

export async function getAdminNotificationEmails(roles: string[]): Promise<string[]> {
  const result = await pool.query(
    `
    SELECT DISTINCT u.email 
    FROM admin_users u
    JOIN admin_user_roles aur ON u.id = aur.admin_user_id
    JOIN roles r ON aur.role_id = r.id
    WHERE u.is_active = true 
    AND r.code = ANY($1)
    `,
    [roles]
  );
  return result.rows.map((row) => row.email);
}

// 2. ACTUALIZACIÓN: NOTIFICACIONES INTERNAS (Usa el alias del módulo)
export async function notifyAdmins(
  subject: string,
  payload: Record<string, unknown>,
  roles: string[] = ['super_admin', 'support_agent'],
  moduleType: EmailModuleType = 'system',
) {
  const transporter = await getTransporter();
  if (!transporter) {
    console.log(`Email skipped: ${subject}`);
    return;
  }

  const to = await getAdminNotificationEmails(roles);
  if (to.length === 0) {
    console.log(`Email skipped (no active admins found for roles: ${roles.join(', ')}): ${subject}`);
    return;
  }

  const message = {
    from: getSenderConfig(moduleType),
    to,
    subject,
    html: buildAdminNotification(subject, payload),
  };

  let lastError: unknown;
  for (let attempt = 0; attempt <= SMTP_MAX_RETRIES; attempt += 1) {
    try {
      await transporter.sendMail(message);
      return;
    } catch (error) {
      lastError = error;
      if (attempt < SMTP_MAX_RETRIES) {
        await wait(500 * (attempt + 1));
      }
    }
  }

  console.error(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'error',
    subsystem: 'smtp',
    subject,
    message: lastError instanceof Error ? lastError.message : 'SMTP send failed.',
  }));
}

// 3. NUEVA FUNCIÓN: NOTIFICACIONES A CLIENTES (Lista para usar los alias de Zoho)
export async function sendCustomerAcknowledgement(
  toEmail: string,
  subject: string,
  htmlBody: string,
  moduleType: EmailModuleType,
) {
  const transporter = await getTransporter();
  if (!transporter) {
    console.log(`Customer email skipped: ${subject} to ${toEmail}`);
    return;
  }

  const sender = getSenderConfig(moduleType);
  const message = {
    from: sender,
    to: toEmail,
    bcc: sender,
    subject,
    html: htmlBody,
  };

  let lastError: unknown;
  for (let attempt = 0; attempt <= SMTP_MAX_RETRIES; attempt += 1) {
    try {
      await transporter.sendMail(message);
      return;
    } catch (error) {
      lastError = error;
      if (attempt < SMTP_MAX_RETRIES) {
        await wait(500 * (attempt + 1));
      }
    }
  }

  console.error(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'error',
    subsystem: 'smtp',
    subject,
    message: lastError instanceof Error ? lastError.message : 'SMTP customer send failed.',
  }));
}

export const notifyCustomer = sendCustomerAcknowledgement;