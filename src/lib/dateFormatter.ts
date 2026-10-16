export type DateFormatStyle = 
  | 'datetime-medium' 
  | 'datetime-short' 
  | 'datetime-precise' 
  | 'datetime-12h' 
  | 'datetime-12h-seconds' 
  | 'date-medium' 
  | 'date-numeric';

/**
 * Convierte un string de fecha (ISO-8601, UTC) a la zona horaria y locale nativo del navegador.
 * Este archivo maestro se irá expandiendo con nuevos estilos conforme refactoricemos otros módulos.
 *
 * @param value - La fecha en formato string, Date o timestamp enviada por la API.
 * @param style - El estilo visual deseado.
 * @returns El string formateado, o un string vacío si el valor es nulo/inválido.
 */
export const formatLocalDate = (value?: string | number | Date | null, style: DateFormatStyle = 'datetime-medium'): string => {
  if (value === undefined || value === null || value === '') return '';

  let options: Intl.DateTimeFormatOptions = {};

  switch (style) {
    case 'datetime-medium':
      // Usado en: Detalles de Contactos.tsx, Tooltip del Timeline
      // Salida esperada: "30 sept 2026, 5:00 p. m." (dependiendo del idioma del navegador)
      options = {
        dateStyle: 'medium',
        timeStyle: 'short',
        hour12: true,
      };
      break;
    case 'datetime-short':
      // Usado en: Dashboard.tsx, Cotizador.tsx, modal de Pagos
      // Salida esperada: "30/09/26, 1:48 a. m."
      options = {
        dateStyle: 'short',
        timeStyle: 'short',
        hour12: true,
      };
      break;
    case 'datetime-precise':
      // Usado en: Auditoria.tsx (Logs)
      // Salida esperada: "30/09/26, 3:26:08 a. m." (con segundos y año corto)
      options = {
        dateStyle: 'short',
        timeStyle: 'medium',
        hour12: true,
      };
      break;
    case 'datetime-12h':
      // Usado en: Evidencias y adjuntos, notas internas, listas legibles
      // Salida esperada: "30/09/2026, 1:48 a. m." (año a 4 dígitos, formato 12 horas)
      options = {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      };
      break;
    case 'datetime-12h-seconds':
      // Usado en: Trazabilidad forense y auditoría con segundos completos en 12 horas
      // Salida esperada: "30/09/2026, 1:48:36 a. m." (año a 4 dígitos con segundos)
      options = {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      };
      break;
    case 'date-medium':
      // Usado en: Tarjetas de lista, Fichas de Proyecto
      // Salida esperada: "30 sept 2026"
      options = {
        dateStyle: 'medium'
      };
      break;
    case 'date-numeric':
      // Usado en: Círculos del Timeline
      // Salida esperada: "30/09/26" (numérico corto)
      options = {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
      };
      break;
  }

  try {
    const d = typeof value === 'string' || typeof value === 'number' ? new Date(value) : value;
    if (isNaN(d.getTime())) return '';
    // Pasar "undefined" delega la elección del locale al navegador del usuario
    return new Intl.DateTimeFormat(undefined, options).format(d);
  } catch (error) {
    console.error('Error formateando fecha:', error);
    return String(value); // Fallback al valor crudo en caso de parseo inválido
  }
};

/**
 * Formatea una fecha estrictamente en la zona horaria oficial de Perú (America/Lima, UTC-5).
 */
export const formatPeruDate = (
  value?: string | number | Date | null,
  includeSeconds = true,
  style: 'short' | 'medium' | 'numeric' = 'short'
): string => {
  if (value === undefined || value === null || value === '') return '';
  try {
    const d = typeof value === 'string' || typeof value === 'number' ? new Date(value) : value;
    if (isNaN(d.getTime())) return '';

    if (style === 'numeric') {
      return new Intl.DateTimeFormat('es-PE', {
        timeZone: 'America/Lima',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        ...(includeSeconds ? { second: '2-digit' } : {}),
        hour12: true,
      }).format(d);
    }

    return new Intl.DateTimeFormat('es-PE', {
      timeZone: 'America/Lima',
      dateStyle: style,
      timeStyle: includeSeconds ? 'medium' : 'short',
      hour12: true,
    }).format(d);
  } catch (error) {
    console.error('Error formateando fecha Perú:', error);
    return String(value);
  }
};

/**
 * Retorna true si la zona horaria del navegador es distinta a la oficial de Perú (America/Lima).
 */
export const isNonPeruTimezone = (): boolean => {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return tz !== 'America/Lima';
  } catch {
    return false;
  }
};

/**
 * Normaliza una fecha de vencimiento legal para que ancle con precisión jurídica
 * al término del día hábil (23:59:59 en hora oficial de Perú, America/Lima, UTC-5).
 */
export const alignLegalDueDate = (value?: string | number | Date | null): Date | null => {
  if (value === undefined || value === null || value === '') return null;
  const d = typeof value === 'string' || typeof value === 'number' ? new Date(value) : value;
  if (isNaN(d.getTime())) return null;

  try {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Lima',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
      }).formatToParts(d).map((p) => [p.type, p.value])
    );
    const y = parseInt(parts.year, 10);
    const m = parseInt(parts.month, 10) - 1;
    const day = parseInt(parts.day, 10);
    // 23:59:59 PET equivale a 28:59:59 UTC (UTC-5)
    return new Date(Date.UTC(y, m, day, 23 + 5, 59, 59));
  } catch {
    return d;
  }
};

/**
 * Formatea una fecha legalmente en Hora de Perú (PET / UTC-5) y, si el agente o usuario está en otro país,
 * provee también la hora local de su navegador para evitar discrepancias operativas.
 */
export const formatLegalDualDate = (
  value?: string | number | Date | null,
  includeSeconds = true,
  isLegalDueDate = false
): { peruText: string; localText?: string; isDifferentTimezone: boolean } => {
  if (value === undefined || value === null || value === '') return { peruText: '', isDifferentTimezone: false };
  let d = typeof value === 'string' || typeof value === 'number' ? new Date(value) : value;
  if (isNaN(d.getTime())) return { peruText: '', isDifferentTimezone: false };

  if (isLegalDueDate) {
    const aligned = alignLegalDueDate(d);
    if (aligned) d = aligned;
  }

  try {
    const timeOptions: Intl.DateTimeFormatOptions = {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      ...(includeSeconds ? { second: '2-digit' } : {}),
      hour12: true,
    };

    const peruFormatted = new Intl.DateTimeFormat('es-PE', {
      ...timeOptions,
      timeZone: 'America/Lima',
    }).format(d);

    const peruText = `${peruFormatted} (PET / Hora Perú)`;
    const different = isNonPeruTimezone();

    if (different) {
      const localFormatted = new Intl.DateTimeFormat(undefined, timeOptions).format(d);
      return {
        peruText,
        localText: `${localFormatted} (Tu hora local)`,
        isDifferentTimezone: true,
      };
    }

    return { peruText, isDifferentTimezone: false };
  } catch (error) {
    console.error('Error formateando dual date:', error);
    return { peruText: String(value), isDifferentTimezone: false };
  }
};
