import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateRemainingBusinessDays, type SystemHoliday } from '../tasks/complaintsSlaCron.js';

test('calculateRemainingBusinessDays correctly computes remaining business days skipping weekends and holidays', () => {
  // Configuración de feriados de prueba: Navidad (25 dic) y Año Nuevo (1 ene)
  const holidays: SystemHoliday[] = [
    { month: 12, day: 25, year: null },
    { month: 1, day: 1, year: null },
  ];

  // Caso 1: Lunes a Viernes de la misma semana (sin feriados)
  // Lunes 2026-10-19 a Viernes 2026-10-23 -> 4 días hábiles restantes
  const nowMonday = new Date('2026-10-19T12:00:00-05:00');
  const dueFriday = new Date('2026-10-23T23:59:59-05:00');
  const days1 = calculateRemainingBusinessDays(dueFriday, nowMonday, holidays);
  assert.equal(days1, 4);

  // Caso 2: Salta fin de semana
  // Viernes 2026-10-16 a Martes 2026-10-20 -> 2 días hábiles (salta Sáb 17 y Dom 18)
  const nowFriday = new Date('2026-10-16T12:00:00-05:00');
  const dueTuesday = new Date('2026-10-20T23:59:59-05:00');
  const days2 = calculateRemainingBusinessDays(dueTuesday, nowFriday, holidays);
  assert.equal(days2, 2);

  // Caso 3: Salta feriado que cae en día de semana
  // 2026-12-24 a 2026-12-28 (25 dic es Navidad, 26 y 27 fin de semana) -> 1 día hábil
  const nowXmasEve = new Date('2026-12-24T12:00:00-05:00');
  const duePostXmas = new Date('2026-12-28T23:59:59-05:00');
  const days3 = calculateRemainingBusinessDays(duePostXmas, nowXmasEve, holidays);
  assert.equal(days3, 1);

  // Caso 4: Vence el mismo día (0 días restantes)
  const nowSameDay = new Date('2026-10-15T10:00:00-05:00');
  const dueSameDay = new Date('2026-10-15T23:59:59-05:00');
  const days4 = calculateRemainingBusinessDays(dueSameDay, nowSameDay, holidays);
  assert.equal(days4, 0);

  // Caso 5: Vencido (retorna valor negativo)
  const nowPast = new Date('2026-10-20T12:00:00-05:00');
  const duePast = new Date('2026-10-16T12:00:00-05:00');
  const days5 = calculateRemainingBusinessDays(duePast, nowPast, holidays);
  assert.equal(days5, -2);
});
