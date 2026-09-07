import { pool } from '../db/pool.js';
import { notificationEmitter, EVENTS } from './notificationEmitter.js';

export async function sendInAppNotification(
  eventType: string,
  title: string,
  body: string,
  entityType?: string,
  entityId?: string
) {
  try {
    const res = await pool.query(`
      SELECT DISTINCT au.id as admin_user_id
      FROM admin_users au
      JOIN admin_user_roles aur ON au.id = aur.admin_user_id
      JOIN notification_rules nr ON aur.role_id = nr.role_id
      WHERE nr.event_type = $1 AND nr.is_active = true AND au.is_active = true
    `, [eventType]);

    const adminUserIds = res.rows.map(r => r.admin_user_id);

    if (adminUserIds.length === 0) {
      console.log(`No active users subscribed to event: ${eventType}`);
      return;
    }

    const values: any[] = [];
    let queryArgs = '';
    let argIndex = 1;

    adminUserIds.forEach(userId => {
      queryArgs += `($${argIndex++}, $${argIndex++}, $${argIndex++}, $${argIndex++}, $${argIndex++}),`;
      values.push(userId, title, body, entityType || null, entityId || null);
    });

    queryArgs = queryArgs.slice(0, -1);

    await pool.query(`
      INSERT INTO admin_notifications (admin_user_id, title, body, entity_type, entity_id)
      VALUES ${queryArgs}
    `, values);

    // Emitir eventos a los túneles SSE
    adminUserIds.forEach(userId => {
      notificationEmitter.emit(EVENTS.NEW_NOTIFICATION, userId);
    });
  } catch (error) {
    console.error(`Failed to send in-app notification for event ${eventType}:`, error);
  }
}

export async function sendDirectInAppNotification(
  targetUserId: string,
  title: string,
  body: string,
  entityType?: string,
  entityId?: string
) {
  try {
    await pool.query(`
      INSERT INTO admin_notifications (admin_user_id, title, body, entity_type, entity_id)
      VALUES ($1, $2, $3, $4, $5)
    `, [targetUserId, title, body, entityType || null, entityId || null]);
    
    // Emitir al túnel SSE del usuario directo
    notificationEmitter.emit(EVENTS.NEW_NOTIFICATION, targetUserId);
  } catch (error) {
    console.error(`Failed to send direct notification to user ${targetUserId}:`, error);
  }
}

export async function enqueueEmail(
  templateCode: string,
  recipientEmail: string,
  payload: Record<string, unknown>,
  entityType?: string,
  entityId?: string
) {
  try {
    const res = await pool.query('SELECT id FROM notification_templates WHERE code = $1 AND is_active = true', [templateCode]);
    if (res.rowCount === 0) {
      console.warn(`Template ${templateCode} not found or inactive. Cannot enqueue email.`);
      return;
    }
    const templateId = res.rows[0].id;

    // Guardaremos el payload de variables en la columna 'payload_json' recién creada.
    await pool.query(`
      INSERT INTO notification_events (template_id, recipient_email, channel, status, payload_json, entity_type, entity_id)
      VALUES ($1, $2, 'email', 'pending', $3, $4, $5)
    `, [templateId, recipientEmail, payload, entityType || null, entityId || null]);

  } catch (error) {
    console.error(`Failed to enqueue email for ${recipientEmail}:`, error);
  }
}
