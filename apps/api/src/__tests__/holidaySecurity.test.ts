import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';

// Schema under test (matching apps/api/src/routes/admin/system.ts)
const systemHolidaySchema = z
  .object({
    country_id: z.string().uuid('ID de país inválido.'),
    month: z
      .number()
      .int('El mes debe ser un número entero.')
      .min(1, 'El mes debe estar entre 1 y 12.')
      .max(12, 'El mes debe estar entre 1 y 12.'),
    day: z
      .number()
      .int('El día debe ser un número entero.')
      .min(1, 'El día debe ser al menos 1.')
      .max(31, 'El día no puede exceder 31.'),
    year: z
      .number()
      .int('El año debe ser un número entero.')
      .min(2020, 'El año debe ser a partir de 2020.')
      .max(2100, 'El año no puede exceder 2100.')
      .nullable(),
    description: z
      .string()
      .trim()
      .min(2, 'La descripción debe tener al menos 2 caracteres.')
      .max(100, 'La descripción no puede exceder 100 caracteres.')
      .regex(
        /^[a-zA-Z0-9áéíóúÁÉÍÓÚñÑüÜ\s\-\.\,\(\)\/]+$/,
        'La descripción contiene caracteres o símbolos no permitidos.'
      ),
  })
  .refine(
    (data) => {
      const testYear = data.year ?? 2024;
      const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
      const daysInMonth = [31, isLeap(testYear) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
      return data.day <= daysInMonth[data.month - 1];
    },
    {
      message: 'El día seleccionado no existe en el calendario para el mes especificado.',
      path: ['day'],
    }
  );

const validCountryId = 'b1a0c3e9-c491-46b3-a5d9-dbd85c08961f';

test('systemHolidaySchema accepts valid recurring holiday', () => {
  const result = systemHolidaySchema.safeParse({
    country_id: validCountryId,
    month: 12,
    day: 25,
    year: null,
    description: 'Navidad',
  });
  assert.equal(result.success, true);
});

test('systemHolidaySchema accepts valid single-year holiday', () => {
  const result = systemHolidaySchema.safeParse({
    country_id: validCountryId,
    month: 7,
    day: 23,
    year: 2026,
    description: 'Día de la Fuerza Aérea del Perú',
  });
  assert.equal(result.success, true);
});

test('systemHolidaySchema rejects invalid calendar day (Feb 31, Apr 31, Feb 29 on non-leap year)', () => {
  // Febrero 31
  const feb31 = systemHolidaySchema.safeParse({
    country_id: validCountryId,
    month: 2,
    day: 31,
    year: null,
    description: 'Feriado Inválido',
  });
  assert.equal(feb31.success, false);

  // Abril 31
  const apr31 = systemHolidaySchema.safeParse({
    country_id: validCountryId,
    month: 4,
    day: 31,
    year: 2026,
    description: 'Feriado Inválido',
  });
  assert.equal(apr31.success, false);

  // Febrero 29 en 2025 (no bisiesto)
  const feb29NonLeap = systemHolidaySchema.safeParse({
    country_id: validCountryId,
    month: 2,
    day: 29,
    year: 2025,
    description: 'Feriado Inválido',
  });
  assert.equal(feb29NonLeap.success, false);

  // Febrero 29 en 2024 (bisiesto) -> debe pasar
  const feb29Leap = systemHolidaySchema.safeParse({
    country_id: validCountryId,
    month: 2,
    day: 29,
    year: 2024,
    description: 'Año Bisiesto',
  });
  assert.equal(feb29Leap.success, true);
});

test('systemHolidaySchema rejects XSS injection and malicious characters in description', () => {
  const xssPayloads = [
    '<script>alert("xss")</script>',
    '<img src=x onerror=alert(1)>',
    'Feriado"; DROP TABLE system_holidays;--',
    'Feriado {admin: true}',
    'Feriado <style>body{display:none}</style>',
  ];

  for (const payload of xssPayloads) {
    const res = systemHolidaySchema.safeParse({
      country_id: validCountryId,
      month: 5,
      day: 15,
      year: null,
      description: payload,
    });
    assert.equal(res.success, false, `Payload "${payload}" should have been rejected`);
  }
});

test('systemHolidaySchema rejects out-of-range years and negative numbers', () => {
  const invalidYears = [-1, 0, 1990, 2019, 2101, 99999];
  for (const y of invalidYears) {
    const res = systemHolidaySchema.safeParse({
      country_id: validCountryId,
      month: 5,
      day: 15,
      year: y,
      description: 'Feriado Test',
    });
    assert.equal(res.success, false, `Year ${y} should have been rejected`);
  }
});

test('systemHolidaySchema rejects empty or whitespace-only descriptions', () => {
  const invalidDescriptions = ['', ' ', '   ', '\t', '\n'];
  for (const d of invalidDescriptions) {
    const res = systemHolidaySchema.safeParse({
      country_id: validCountryId,
      month: 5,
      day: 15,
      year: null,
      description: d,
    });
    assert.equal(res.success, false);
  }
});

test('systemHolidaySchema rejects descriptions longer than 100 characters', () => {
  const longDesc = 'A'.repeat(101);
  const res = systemHolidaySchema.safeParse({
    country_id: validCountryId,
    month: 5,
    day: 15,
    year: null,
    description: longDesc,
  });
  assert.equal(res.success, false);
});
