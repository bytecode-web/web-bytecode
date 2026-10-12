export type DateFormatStyle = 'datetime-medium' | 'datetime-short' | 'datetime-precise' | 'date-medium' | 'date-numeric';

/**
 * Convierte un string de fecha (ISO-8601, UTC) a la zona horaria y locale nativo del navegador.
 * Este archivo maestro se irá expandiendo con nuevos estilos conforme refactoricemos otros módulos.
 *
 * @param value - La fecha en formato string enviada por la API.
 * @param style - El estilo visual deseado.
 * @returns El string formateado, o un string vacío si el valor es nulo/inválido.
 */
export const formatLocalDate = (value?: string | null, style: DateFormatStyle = 'datetime-medium'): string => {
  if (!value) return '';

  let options: Intl.DateTimeFormatOptions = {};

  switch (style) {
    case 'datetime-medium':
      // Usado en: Detalles de Contactos.tsx, Tooltip del Timeline
      // Salida esperada: "30 sept 2026, 5:00 p.m." (dependiendo del idioma del navegador)
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
      // Salida esperada: "30/09/26, 3:26:08 a. m." (con segundos)
      options = {
        dateStyle: 'short',
        timeStyle: 'medium',
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
    // Pasar "undefined" delega la elección del locale al navegador del usuario
    return new Intl.DateTimeFormat(undefined, options).format(new Date(value));
  } catch (error) {
    console.error('Error formateando fecha:', error);
    return value; // Fallback al valor crudo en caso de parseo inválido
  }
};

/**
 * Formatea una fecha estrictamente en la zona horaria oficial de Perú (America/Lima, UTC-5).
 */
export const formatPeruDate = (
  value?: string | number | Date | null,
  includeSeconds = true,
  style: 'short' | 'medium' = 'short'
): string => {
  if (value === undefined || value === null || value === '') return '';
  try {
    const d = typeof value === 'string' || typeof value === 'number' ? new Date(value) : value;
    if (isNaN(d.getTime())) return '';
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
 * Formatea una fecha legalmente en Hora de Perú (PET / UTC-5) y, si el agente o usuario está en otro país,
 * provee también la hora local de su navegador para evitar discrepancias operativas.
 */
export const formatLegalDualDate = (
  value?: string | number | Date | null,
  includeSeconds = true
): { peruText: string; localText?: string; isDifferentTimezone: boolean } => {
  if (value === undefined || value === null || value === '') return { peruText: '', isDifferentTimezone: false };
  const d = typeof value === 'string' || typeof value === 'number' ? new Date(value) : value;
  if (isNaN(d.getTime())) return { peruText: '', isDifferentTimezone: false };

  const peruFormatted = new Intl.DateTimeFormat('es-PE', {
    timeZone: 'America/Lima',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeStyle: includeSeconds ? 'medium' : 'short',
    hour12: true,
  }).format(d);

  const peruText = `${peruFormatted} (PET / Hora Perú)`;
  const different = isNonPeruTimezone();

  if (different) {
    const localFormatted = new Intl.DateTimeFormat(undefined, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeStyle: includeSeconds ? 'medium' : 'short',
      hour12: true,
    }).format(d);
    return {
      peruText,
      localText: `${localFormatted} (Tu hora local)`,
      isDifferentTimezone: true,
    };
  }

  return { peruText, isDifferentTimezone: false };
};
