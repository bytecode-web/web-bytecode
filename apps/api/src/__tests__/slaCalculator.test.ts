import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateLegalDueDate,
  calculateRemainingBusinessDays,
  getLimaDateComponents,
  type SystemHoliday,
} from '../lib/slaCalculator.js';

test('calculateLegalDueDate accurately projects 15 business days anchored to America/Lima', () => {
  // Caso 1: Reclamo registrado el viernes 16 de octubre de 2026 sin feriados entre semana
  // Feriado de Todos los Santos: 1 de noviembre (domingo)
  const baseDate = new Date('2026-10-16T11:51:52.000Z'); // 06:51:52 a.m. PET
  const holidays: SystemHoliday[] = [
    { month: 11, day: 1, year: null, description: 'Día de Todos los Santos' },
  ];

  const result1 = calculateLegalDueDate(baseDate, holidays, 15);

  // 15 días hábiles a partir del lunes 19 de octubre:
  // Sem 1 (19-23 oct): 5 días
  // Sem 2 (26-30 oct): 5 días
  // Sem 3 (2-6 nov): 5 días -> Finaliza el viernes 6 de noviembre de 2026
  assert.equal(result1.finalYear, 2026);
  assert.equal(result1.finalMonth, 11);
  assert.equal(result1.finalDay, 6);
  assert.equal(result1.skippedWeekends, 6);
  assert.ok(result1.skippedHolidays.includes('Día de Todos los Santos (1/11)'));

  // Verificar hora oficial de vencimiento (23:59:59 PET -> 04:59:59 UTC del día siguiente)
  const limaDue = getLimaDateComponents(result1.dueDate);
  assert.equal(limaDue.year, 2026);
  assert.equal(limaDue.month, 11);
  assert.equal(limaDue.day, 6);
  assert.equal(limaDue.hour, 23);
  assert.equal(limaDue.minute, 59);
  assert.equal(limaDue.second, 59);
});

test('calculateLegalDueDate pushes due date when weekday holidays are registered (User test case)', () => {
  // Caso 2: Reclamo registrado el 16 de octubre de 2026 con feriados sobrevenidos el 19 y 20 de octubre
  const baseDate = new Date('2026-10-16T11:54:57.000Z');
  const holidays: SystemHoliday[] = [
    { month: 10, day: 19, year: 2026, description: 'Testettoooo' },
    { month: 10, day: 20, year: null, description: 'Otrotestetetoooo' },
    { month: 11, day: 1, year: null, description: 'Día de Todos los Santos' },
  ];

  const result2 = calculateLegalDueDate(baseDate, holidays, 15);

  // Al saltar lunes 19 y martes 20:
  // Sem 1 (21-23 oct): 3 días
  // Sem 2 (26-30 oct): 5 días (acum 8)
  // Sem 3 (2-6 nov): 5 días (acum 13)
  // Sem 4 (9-10 nov): 2 días (acum 15) -> Finaliza el martes 10 de noviembre de 2026
  assert.equal(result2.finalYear, 2026);
  assert.equal(result2.finalMonth, 11);
  assert.equal(result2.finalDay, 10);
  assert.equal(result2.skippedWeekends, 8);
  assert.deepEqual(result2.skippedHolidays, [
    'Testettoooo (19/10)',
    'Otrotestetetoooo (20/10)',
    'Día de Todos los Santos (1/11)',
  ]);
});

test('calculateLegalDueDate ignores single-year holidays from different years', () => {
  const baseDate = new Date('2026-10-16T11:54:57.000Z');
  const holidays: SystemHoliday[] = [
    // Feriado para el año 2025 únicamente -> no debe aplicar en 2026
    { month: 10, day: 19, year: 2025, description: 'Feriado Pasado 2025' },
  ];

  const result = calculateLegalDueDate(baseDate, holidays, 15);
  // Debe terminar el 6 de noviembre de 2026 porque el 19 de octubre de 2025 no aplica a 2026
  assert.equal(result.finalDay, 6);
  assert.equal(result.finalMonth, 11);
  assert.equal(result.skippedHolidays.length, 0);
});

test('Adding an October holiday does NOT change the due date of a May complaint', () => {
  // Reclamo registrado el 11 de mayo de 2026
  const mayComplaintDate = new Date('2026-05-11T14:00:00.000Z');
  
  const holidaysWithoutOctober: SystemHoliday[] = [
    { month: 5, day: 1, year: null, description: 'Día del Trabajo' },
    { month: 11, day: 1, year: null, description: 'Día de Todos los Santos' },
  ];

  const holidaysWithOctober: SystemHoliday[] = [
    ...holidaysWithoutOctober,
    { month: 10, day: 19, year: null, description: 'Nuevo Feriado Octubre' },
  ];

  const calcBefore = calculateLegalDueDate(mayComplaintDate, holidaysWithoutOctober, 15);
  const calcAfter = calculateLegalDueDate(mayComplaintDate, holidaysWithOctober, 15);

  // La fecha debe ser exactamente la misma (el feriado de octubre no cae en mayo)
  assert.equal(calcBefore.dueDate.getTime(), calcAfter.dueDate.getTime());
  assert.equal(calcAfter.finalMonth, 6);
  assert.equal(calcAfter.finalDay, 1); // 1 de junio de 2026
});
