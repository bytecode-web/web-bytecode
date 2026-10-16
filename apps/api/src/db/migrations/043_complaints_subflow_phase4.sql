-- 1. Snapshot de datos inmutables y organización
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS customer_snapshot JSONB;
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL;

-- 2. Persistencia Completa del Bien/Servicio
ALTER TABLE complaint_goods ADD COLUMN IF NOT EXISTS invoice_number VARCHAR(50);
ALTER TABLE complaint_goods ADD COLUMN IF NOT EXISTS project_or_unit_name VARCHAR(255);
ALTER TABLE complaint_goods ADD COLUMN IF NOT EXISTS currency_code VARCHAR(3) DEFAULT 'PEN' CHECK (currency_code = upper(currency_code));

-- 3. Motor de Plazo Legal - Feriados
CREATE TABLE IF NOT EXISTS system_holidays (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    country_id UUID NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
    month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
    day INTEGER NOT NULL CHECK (day >= 1 AND day <= 31),
    year INTEGER, -- Null means recurring annually
    description VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Seed feriados oficiales peruanos (Fijos / Recurrentes)
INSERT INTO system_holidays (country_id, month, day, year, description) VALUES
((SELECT id FROM countries WHERE iso2 = 'PE'), 1, 1, null, 'Año Nuevo'),
((SELECT id FROM countries WHERE iso2 = 'PE'), 5, 1, null, 'Día del Trabajador'),
((SELECT id FROM countries WHERE iso2 = 'PE'), 6, 7, null, 'Día de la Bandera'),
((SELECT id FROM countries WHERE iso2 = 'PE'), 6, 29, null, 'San Pedro y San Pablo'),
((SELECT id FROM countries WHERE iso2 = 'PE'), 7, 23, null, 'Día de la Fuerza Aérea'),
((SELECT id FROM countries WHERE iso2 = 'PE'), 7, 28, null, 'Fiestas Patrias'),
((SELECT id FROM countries WHERE iso2 = 'PE'), 7, 29, null, 'Fiestas Patrias'),
((SELECT id FROM countries WHERE iso2 = 'PE'), 8, 6, null, 'Batalla de Junín'),
((SELECT id FROM countries WHERE iso2 = 'PE'), 8, 30, null, 'Santa Rosa de Lima'),
((SELECT id FROM countries WHERE iso2 = 'PE'), 10, 8, null, 'Combate de Angamos'),
((SELECT id FROM countries WHERE iso2 = 'PE'), 11, 1, null, 'Día de Todos los Santos'),
((SELECT id FROM countries WHERE iso2 = 'PE'), 12, 8, null, 'Inmaculada Concepción'),
((SELECT id FROM countries WHERE iso2 = 'PE'), 12, 9, null, 'Batalla de Ayacucho'),
((SELECT id FROM countries WHERE iso2 = 'PE'), 12, 25, null, 'Navidad');

-- Días no laborables excepcionales 2026 (Sector Público / Puentes)
INSERT INTO system_holidays (country_id, month, day, year, description) VALUES 
((SELECT id FROM countries WHERE iso2 = 'PE'), 1, 2, 2026, 'Día no laborable (Sector Público)'), 
((SELECT id FROM countries WHERE iso2 = 'PE'), 7, 27, 2026, 'Día no laborable puente');

-- Jueves y Viernes Santo (dinámicos)
INSERT INTO system_holidays (country_id, month, day, year, description) VALUES
((SELECT id FROM countries WHERE iso2 = 'PE'), 4, 2, 2026, 'Jueves Santo'),
((SELECT id FROM countries WHERE iso2 = 'PE'), 4, 3, 2026, 'Viernes Santo'),
((SELECT id FROM countries WHERE iso2 = 'PE'), 3, 25, 2027, 'Jueves Santo'),
((SELECT id FROM countries WHERE iso2 = 'PE'), 3, 26, 2027, 'Viernes Santo');

-- 4. Audit Table para Eventos de Tiempo
CREATE TABLE IF NOT EXISTS complaint_time_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    complaint_id UUID NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL,
    event_date TIMESTAMP WITH TIME ZONE DEFAULT now(),
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 5. Purga de Prórrogas Ilegales (Ley N° 31435)
ALTER TABLE complaints DROP COLUMN IF EXISTS extension_requested_at;
ALTER TABLE complaints DROP COLUMN IF EXISTS extension_reason;
ALTER TABLE complaints DROP COLUMN IF EXISTS extended_response_due_at;

