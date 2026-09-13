-- Fase 3.4: Contracción y Limpieza Final
-- Borrado de columnas obsoletas (Deuda técnica eliminada)

ALTER TABLE public.organizations 
DROP COLUMN IF EXISTS ruc;

ALTER TABLE public.countries 
DROP COLUMN IF EXISTS tax_id_regex,
DROP COLUMN IF EXISTS tax_id_format;
