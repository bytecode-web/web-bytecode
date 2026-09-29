import cron from 'node-cron';
import { pool } from '../db/pool.js';
import { sendDirectInAppNotification } from '../services/notificationService.js';

export function startCronJobs() {
  // Ejecutar en el minuto 0 de cada hora
  cron.schedule('0 * * * *', async () => {
    console.log('[CRON] Ejecutando escalado automático de prioridades...');
    try {
      await escalateCases('contact_cases', 'contacts');
      await escalateCases('complaints', 'complaints');
    } catch (error) {
      console.error('[CRON] Error en escalado automático:', error);
    }
  });
  console.log('[CRON] Motor de escalado de prioridad inicializado (0 * * * *).');
}

async function escalateCases(tableName: string, moduleName: string) {
  const codeCol = tableName === 'contact_cases' ? 'case_code' : 'complaint_code';
  
  const query = `
    WITH next_priority AS (
        SELECT p1.id as current_priority_id, p1.sla_hours, p2.id as next_priority_id, p2.name as next_priority_name
        FROM priority_catalog p1
        LEFT JOIN priority_catalog p2 ON p2.weight > p1.weight
        WHERE p1.is_active = true AND p2.is_active = true
        AND p2.weight = (SELECT min(weight) FROM priority_catalog WHERE weight > p1.weight AND is_active = true)
    ),
    stale_cases AS (
        SELECT c.id, c.${codeCol} as code, c.assigned_to, c.priority_id, np.next_priority_id, np.next_priority_name
        FROM ${tableName} c
        JOIN next_priority np ON c.priority_id = np.current_priority_id
        JOIN status_catalog sc ON c.status_id = sc.id
        WHERE sc.code NOT IN ('resolved', 'closed', 'lost')
        AND c.updated_at < NOW() - (np.sla_hours || ' hours')::interval
    )
    UPDATE ${tableName} cc
    SET priority_id = sc.next_priority_id,
        updated_at = NOW()
    FROM stale_cases sc
    WHERE cc.id = sc.id
    RETURNING cc.id, sc.code as case_code, cc.assigned_to, sc.next_priority_name;
  `;

  try {
    const result = await pool.query(query);
    
    if (result.rowCount && result.rowCount > 0) {
      console.log(`[CRON] ${result.rowCount} casos escalados de prioridad en ${tableName}.`);
      
      for (const row of result.rows) {
        if (row.assigned_to) {
          const codeStr = row.case_code || row.id.split('-')[0];
          await sendDirectInAppNotification(
            row.assigned_to,
            "Prioridad Escalada Automáticamente",
            `El ticket #${codeStr} ha superado su límite de inactividad y el sistema lo ha elevado a prioridad ${row.next_priority_name}.`,
            moduleName as any,
            row.id
          );
        }
      }
    }
  } catch (err) {
    console.error(`[CRON] Error procesando tabla ${tableName}:`, err);
  }
}
