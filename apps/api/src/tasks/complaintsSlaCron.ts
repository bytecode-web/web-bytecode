import cron from 'node-cron';
import { pool } from '../db/pool.js';
import { sendInAppNotification, sendDirectInAppNotification } from '../services/notificationService.js';

export interface SystemHoliday {
  month: number;
  day: number;
  year: number | null;
}

/**
 * Calcula los días hábiles oficiales restantes hasta la fecha límite legal
 * anclando el calendario a la zona horaria oficial de Perú (America/Lima)
 * y descontando fines de semana (Sáb-Dom) y feriados de system_holidays.
 */
export function calculateRemainingBusinessDays(dueDate: Date, now: Date, holidays: SystemHoliday[]): number {
  const getLimaCal = (d: Date) => {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Lima',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric'
      }).formatToParts(d).map(p => [p.type, p.value])
    );
    return new Date(Date.UTC(parseInt(parts.year, 10), parseInt(parts.month, 10) - 1, parseInt(parts.day, 10), 12, 0, 0));
  };

  const nowCal = getLimaCal(now);
  const dueCal = getLimaCal(dueDate);

  const isOverdue = nowCal.getTime() > dueCal.getTime();

  let diffDays = 0;
  const startCalc = isOverdue ? new Date(dueCal) : new Date(nowCal);
  const endCalc = isOverdue ? new Date(nowCal) : new Date(dueCal);

  const current = new Date(startCalc);
  while (current < endCalc) {
    current.setUTCDate(current.getUTCDate() + 1);
    const day = current.getUTCDay();
    const y = current.getUTCFullYear();
    const m = current.getUTCMonth() + 1;
    const d = current.getUTCDate();

    const isHoliday = (day !== 0 && day !== 6) && holidays.some(h => h.month === m && h.day === d && (h.year === null || h.year === y));

    if (day !== 0 && day !== 6 && !isHoliday) {
      diffDays++;
    }
  }

  return isOverdue ? -diffDays : diffDays;
}

/**
 * Ejecuta la verificación horaria de SLA para reclamos:
 * 1. Sincroniza la prioridad (Normal > 7d, Alta 3-7d, Urgente <= 2d o vencido).
 * 2. Emite alertas in-app (complaint_sla_warning) con control de idempotencia (solo 1 vez por fase).
 */
export async function checkAndEscalateComplaintsSla(): Promise<{ processed: number; priorityUpdated: number; warningsSent: number }> {
  const stats = { processed: 0, priorityUpdated: 0, warningsSent: 0 };
  const client = await pool.connect();

  try {
    // 1. Obtener catálogo de prioridades
    const prioRes = await client.query('SELECT id, code, name FROM priority_catalog WHERE is_active = true');
    const prioByCode = new Map<string, { id: string; code: string; name: string }>();
    prioRes.rows.forEach(r => prioByCode.set(r.code, r));

    const normalPrio = prioByCode.get('normal');
    const highPrio = prioByCode.get('high');
    const urgentPrio = prioByCode.get('urgent');

    if (!normalPrio || !highPrio || !urgentPrio) {
      console.warn('[CRON-RECLAMOS] Catálogo de prioridades incompleto en BD.');
      return stats;
    }

    // 2. Obtener feriados oficiales de Perú
    const holRes = await client.query('SELECT month, day, year FROM system_holidays');
    const holidays: SystemHoliday[] = holRes.rows;

    // 3. Obtener expedientes abiertos que cuenten con fecha de vencimiento legal
    const casesRes = await client.query(`
      SELECT c.id, c.complaint_code, c.legal_response_due_at, c.priority_id, c.assigned_to,
             sc.code as status_code, sc.name as status_name, sc.is_terminal
      FROM complaints c
      JOIN status_catalog sc ON c.status_id = sc.id
      WHERE c.legal_response_due_at IS NOT NULL
        AND sc.is_terminal = false
        AND sc.code NOT IN ('founded', 'unfounded', 'closed', 'rejected', 'resolved')
    `);

    const now = new Date();
    stats.processed = casesRes.rowCount ?? 0;

    for (const c of casesRes.rows) {
      const dueDate = new Date(c.legal_response_due_at);
      const remainingDays = calculateRemainingBusinessDays(dueDate, now, holidays);
      const complaintCode = c.complaint_code || c.id.split('-')[0];

      // Determinar prioridad según el progreso del semáforo
      let targetPrio = normalPrio;
      if (remainingDays <= 2) {
        targetPrio = urgentPrio;
      } else if (remainingDays <= 7) {
        targetPrio = highPrio;
      } else {
        targetPrio = normalPrio;
      }

      // Sincronizar prioridad si difiere
      if (c.priority_id !== targetPrio.id) {
        await client.query(
          'UPDATE complaints SET priority_id = $1, updated_at = NOW() WHERE id = $2',
          [targetPrio.id, c.id]
        );
        stats.priorityUpdated++;

        if (c.assigned_to) {
          await sendDirectInAppNotification(
            c.assigned_to,
            'Prioridad de Reclamo Actualizada',
            `El reclamo #${complaintCode} fue actualizado a prioridad ${targetPrio.name} según su plazo legal (${remainingDays <= 0 ? 'vencido o por vencer' : `quedan ${remainingDays} días hábiles`}).`,
            'complaints',
            c.id
          );
        }
      }

      // Determinar umbral para alerta de semáforo
      let warningEventType: 'SLA_WARNING_EXPIRED' | 'SLA_WARNING_RED' | 'SLA_WARNING_AMBER' | null = null;
      let alertTitle = '';
      let alertBody = '';

      if (remainingDays < 0) {
        warningEventType = 'SLA_WARNING_EXPIRED';
        alertTitle = `Reclamo ${complaintCode}: Plazo Legal Vencido`;
        alertBody = `El reclamo #${complaintCode} ha superado su plazo legal de respuesta (${Math.abs(remainingDays)} días hábiles de retraso).`;
      } else if (remainingDays <= 2) {
        warningEventType = 'SLA_WARNING_RED';
        alertTitle = `Reclamo ${complaintCode}: Plazo Crítico (Rojo)`;
        alertBody = `Al reclamo #${complaintCode} le restan solo ${remainingDays === 0 ? '¡menos de 1 día hábil (vence hoy)!' : `${remainingDays} ${remainingDays === 1 ? 'día hábil' : 'días hábiles'}`} antes de superar el plazo legal.`;
      } else if (remainingDays <= 7) {
        warningEventType = 'SLA_WARNING_AMBER';
        alertTitle = `Reclamo ${complaintCode}: Atención Requerida (Ámbar)`;
        alertBody = `Al reclamo #${complaintCode} le quedan ${remainingDays} días hábiles para su vencimiento legal.`;
      }

      // Control anti-spam: verificar si esta fase ya fue notificada previamente en complaint_time_events
      if (warningEventType) {
        const eventCheck = await client.query(
          'SELECT id FROM complaint_time_events WHERE complaint_id = $1 AND event_type = $2 LIMIT 1',
          [c.id, warningEventType]
        );

        if ((eventCheck.rowCount ?? 0) === 0) {
          // Registrar evento para no repetir en futuras ejecuciones horarias
          await client.query(
            `INSERT INTO complaint_time_events (complaint_id, event_type, metadata)
             VALUES ($1, $2, $3)`,
            [
              c.id,
              warningEventType,
              JSON.stringify({
                remaining_business_days: remainingDays,
                recorded_at: now.toISOString(),
                priority_assigned: targetPrio.name,
              })
            ]
          );

          // Notificar a los roles suscritos en la campanita
          await sendInAppNotification(
            'complaint_sla_warning',
            alertTitle,
            alertBody,
            'complaints',
            c.id
          );

          // Si tiene agente asignado, garantizar que reciba también notificación directa
          if (c.assigned_to) {
            await sendDirectInAppNotification(
              c.assigned_to,
              alertTitle,
              alertBody,
              'complaints',
              c.id
            );
          }

          stats.warningsSent++;
        }
      }
    }
  } catch (error) {
    console.error('[CRON-RECLAMOS] Error ejecutando verificación de SLA:', error);
  } finally {
    client.release();
  }

  return stats;
}

export function startComplaintsSlaCron() {
  // Ejecutar en el minuto 0 de cada hora
  cron.schedule('0 * * * *', async () => {
    console.log('[CRON-RECLAMOS] Ejecutando sincronización de SLA y semáforo...');
    try {
      const stats = await checkAndEscalateComplaintsSla();
      console.log(`[CRON-RECLAMOS] Completado: ${stats.processed} evaluados, ${stats.priorityUpdated} prioridades actualizadas, ${stats.warningsSent} alertas emitidas.`);
    } catch (error) {
      console.error('[CRON-RECLAMOS] Error en tarea periódica:', error);
    }
  });
  console.log('[CRON-RECLAMOS] Motor de SLA y semáforo para reclamaciones inicializado (0 * * * *).');
}
