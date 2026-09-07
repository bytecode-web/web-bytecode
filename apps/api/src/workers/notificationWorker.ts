import { pool } from '../db/pool.js';
import { getTransporter, getSenderConfig } from '../services/email.js';
import { masterLayout } from '../services/emailTemplates.js';

// Tiempo en milisegundos entre cada chequeo de cola
const POLLING_INTERVAL = 10000; 

let lastCleanup = 0;

export async function startNotificationWorker() {
  console.log('Notification Worker started. Polling every 10 seconds...');
  
  setInterval(async () => {
    try {
      await processPendingEvents();

      // Ejecutar Garbage Collection 1 vez al día
      const now = Date.now();
      if (now - lastCleanup > 24 * 60 * 60 * 1000) {
        lastCleanup = now;
        await performGarbageCollection();
      }
    } catch (error) {
      console.error('Error in Notification Worker:', error);
    }
  }, POLLING_INTERVAL);
}

async function performGarbageCollection() {
  try {
    // Elimina notificaciones in-app leídas con más de 30 días de antigüedad
    const res = await pool.query(`
      DELETE FROM admin_notifications 
      WHERE read_at IS NOT NULL 
      AND created_at < NOW() - INTERVAL '30 days'
    `);
    if (res.rowCount && res.rowCount > 0) {
      console.log(`[Garbage Collection] Removed ${res.rowCount} old read in-app notifications.`);
    }

    // Opcional: También limpia eventos de email fallidos o exitosos de más de 30 días para no llenar notification_events
    const resEvents = await pool.query(`
      DELETE FROM notification_events
      WHERE status IN ('sent', 'failed')
      AND created_at < NOW() - INTERVAL '30 days'
    `);
    if (resEvents.rowCount && resEvents.rowCount > 0) {
      console.log(`[Garbage Collection] Removed ${resEvents.rowCount} old email events.`);
    }
  } catch (err) {
    console.error('Failed to run Notification Garbage Collection:', err);
  }
}

async function processPendingEvents() {
  // 1. Obtener eventos pendientes
  // Solo los que tienen status 'pending' y scheduled_at sea nulo o en el pasado
  const { rows: events } = await pool.query(`
    SELECT ne.*, nt.code as template_code, nt.subject, nt.body_template
    FROM notification_events ne
    JOIN notification_templates nt ON ne.template_id = nt.id
    WHERE ne.status = 'pending' 
      AND (ne.scheduled_at IS NULL OR ne.scheduled_at <= NOW())
    ORDER BY ne.created_at ASC
    LIMIT 10
  `);

  if (events.length === 0) return;

  const transporter = await getTransporter();
  if (!transporter) {
    console.warn('Notification Worker: Email transporter not available. Skipping batch.');
    return;
  }

  for (const event of events) {
    if (event.channel !== 'email') continue; // Por ahora solo manejamos emails

    try {
      // 2. Construir el cuerpo del correo con el HTML de la BD + Layout Seguro
      // Nota: El reemplazo de variables (ej. {{name}}) se hace ANTES de guardar en notification_events, 
      // o se guarda JSON en provider_message_id/error_message de forma temporal. 
      // Lo más seguro es que el servicio que insertó el evento ya compiló el body_template con las variables,
      // pero si asume que lo guardó en la tabla crudo, necesitamos las variables.
      // Para este caso, quien hizo INSERT debió haber reemplazado el {{texto}} y guardarlo 
      // compilado, O el worker lo toma. 
      // Asumiremos que el frontend backend insertó el HTML final en error_message (como payload JSON) 
      // o lo compila antes de enviarlo, pero para hacerlo más sencillo:
      // Vamos a asumir que "body_template" trae el contenido FINAL o que el servicio de envio 
      // guarda un 'body' temporal, o el HTML está pre-procesado.
      
      // Como esto es un worker genérico, usamos 'payload_json'
      // para hacer los reemplazos.
      let finalHtml = event.body_template;
      let finalSubject = event.subject;
      
      if (event.payload_json) {
        const payload = typeof event.payload_json === 'string' ? JSON.parse(event.payload_json) : event.payload_json;
        for (const [key, value] of Object.entries(payload)) {
          finalHtml = finalHtml.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
          finalSubject = finalSubject.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
        }
      }

      // Proteger con el layout
      const secureHtml = masterLayout(finalHtml);
      const secureSubject = finalSubject; // Ya fue interpolado arriba

      const message = {
        from: getSenderConfig('system'),
        to: event.recipient_email,
        subject: secureSubject,
        html: secureHtml,
      };

      await transporter.sendMail(message);

      // 3. Marcar como enviado
      await pool.query(
        `UPDATE notification_events SET status = 'sent', sent_at = NOW() WHERE id = $1`, 
        [event.id]
      );
    } catch (err: any) {
      console.error(`Failed to send event ${event.id}:`, err);
      // Marcar como fallido para no atascar la cola
      await pool.query(
        `UPDATE notification_events SET status = 'failed', error_message = $1 WHERE id = $2`,
        [err.message || 'SMTP Error', event.id]
      );
    }
  }
}
