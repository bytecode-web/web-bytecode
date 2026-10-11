-- Migración 047: Tabla de secuencias atómicas para el Libro de Reclamaciones
-- Evita condiciones de carrera en la generación del correlativo anual REC-YYYY-NNNNN

CREATE TABLE IF NOT EXISTS complaint_sequences (
  year INT PRIMARY KEY,
  last_value INT NOT NULL DEFAULT 0
);

-- Inicializar con el valor máximo actual existente para el año en curso si existen registros
INSERT INTO complaint_sequences (year, last_value)
SELECT 
  extract(year from created_at)::int as year,
  MAX(COALESCE(NULLIF(regexp_replace(complaint_code, '^REC-\\d{4}-', ''), '')::int, 0)) as last_value
FROM complaints
WHERE complaint_code ~ '^REC-\\d{4}-\\d+$'
GROUP BY extract(year from created_at)::int
ON CONFLICT (year) DO UPDATE 
SET last_value = GREATEST(complaint_sequences.last_value, EXCLUDED.last_value);
