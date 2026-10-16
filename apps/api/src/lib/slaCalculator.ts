/**
 * Motor Centralizado de Cálculo de SLA para Reclamos y Quejas
 * Cumplimiento normativo:
 * - Ley N° 29571 (Código de Protección y Defensa del Consumidor)
 * - Ley N° 31435 (Plazo improrrogable de 15 días hábiles para atención de reclamos)
 * - D.S. N° 011-2011-PCM (Reglamento del Libro de Reclamaciones)
 * - Ley N° 27444 (Ley del Procedimiento Administrativo General, Arts. 145 y 146 - Cómputo de plazos y días inhábiles)
 */

export interface SystemHoliday {
  month: number;
  day: number;
  year: number | null;
  description?: string;
}

export interface LegalDueDateCalculationResult {
  dueDate: Date;
  skippedWeekends: number;
  skippedHolidays: string[];
  finalYear: number;
  finalMonth: number;
  finalDay: number;
  businessDaysAllotted: number;
}

/**
 * Extrae los componentes de fecha y hora anclados estrictamente a la zona horaria oficial del Perú (America/Lima / UTC-5)
 */
export function getLimaDateComponents(d: Date): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Lima',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hour12: false,
    }).formatToParts(d).map(p => [p.type, p.value])
  );

  return {
    year: parseInt(parts.year, 10),
    month: parseInt(parts.month, 10),
    day: parseInt(parts.day, 10),
    hour: parseInt(parts.hour, 10),
    minute: parseInt(parts.minute, 10),
    second: parseInt(parts.second, 10),
  };
}

/**
 * Calcula la fecha de vencimiento legal sumando N días hábiles a partir del día siguiente a la fecha de registro,
 * saltando sábados, domingos y feriados oficiales de system_holidays.
 * La fecha resultante se fija a las 23:59:59 PET (Hora Oficial del Perú - UTC-5).
 */
export function calculateLegalDueDate(
  baseDate: Date,
  holidays: SystemHoliday[],
  businessDays = 15
): LegalDueDateCalculationResult {
  const lima = getLimaDateComponents(baseDate);
  const baseYear = lima.year;
  const startMonth = lima.month;
  const startDay = lima.day;

  const findHoliday = (y: number, m: number, d: number) => {
    return holidays.find(h => {
      if (h.month !== m || h.day !== d) return false;
      return h.year === null || h.year === undefined || h.year === y;
    });
  };

  let currentCal = new Date(Date.UTC(baseYear, startMonth - 1, startDay, 12, 0, 0));
  let businessDaysAdded = 0;
  let skippedWeekends = 0;
  const skippedHolidaysList: string[] = [];

  while (businessDaysAdded < businessDays) {
    currentCal.setUTCDate(currentCal.getUTCDate() + 1);
    const dayOfWeek = currentCal.getUTCDay();
    const curYear = currentCal.getUTCFullYear();
    const curMonth = currentCal.getUTCMonth() + 1;
    const curDay = currentCal.getUTCDate();

    const holiday = findHoliday(curYear, curMonth, curDay);

    if (dayOfWeek === 0 || dayOfWeek === 6) {
      skippedWeekends++;
      if (holiday) {
        const label = `${holiday.description || 'Feriado'} (${curDay}/${curMonth})`;
        if (!skippedHolidaysList.includes(label)) {
          skippedHolidaysList.push(label);
        }
      }
      continue;
    }

    if (holiday) {
      const label = `${holiday.description || 'Feriado'} (${curDay}/${curMonth})`;
      if (!skippedHolidaysList.includes(label)) {
        skippedHolidaysList.push(label);
      }
      continue;
    }

    businessDaysAdded++;
  }

  const finalYear = currentCal.getUTCFullYear();
  const finalMonthIndex = currentCal.getUTCMonth();
  const finalDayNum = currentCal.getUTCDate();

  // Calcular dueDate al término del último día hábil (23:59:59 en Hora Oficial de Perú - UTC-5)
  // En UTC (PET + 5h): 23:59:59 PET equivale a 04:59:59 UTC del día siguiente
  let dueDate = new Date(Date.UTC(finalYear, finalMonthIndex, finalDayNum, 23 + 5, 59, 59));
  if (isNaN(dueDate.getTime())) {
    dueDate = new Date(baseDate.getTime() + businessDays * 24 * 60 * 60 * 1000);
  }

  return {
    dueDate,
    skippedWeekends,
    skippedHolidays: skippedHolidaysList,
    finalYear,
    finalMonth: finalMonthIndex + 1,
    finalDay: finalDayNum,
    businessDaysAllotted: businessDays,
  };
}

/**
 * Calcula los días hábiles oficiales restantes hasta la fecha límite legal
 * anclando el calendario a la zona horaria oficial de Perú (America/Lima)
 * y descontando fines de semana (Sáb-Dom) y feriados de system_holidays.
 */
export function calculateRemainingBusinessDays(
  dueDate: Date,
  now: Date,
  holidays: SystemHoliday[]
): number {
  const getLimaCal = (d: Date) => {
    const parts = getLimaDateComponents(d);
    return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12, 0, 0));
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

    const isHoliday =
      day !== 0 &&
      day !== 6 &&
      holidays.some(h => h.month === m && h.day === d && (h.year === null || h.year === y));

    if (day !== 0 && day !== 6 && !isHoliday) {
      diffDays++;
    }
  }

  return isOverdue ? -diffDays : diffDays;
}
