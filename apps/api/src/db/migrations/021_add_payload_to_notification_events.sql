-- Añade la columna 'payload_json' a la tabla de notification_events
-- para solucionar la deuda técnica de haber usado 'error_message' para guardar JSON temporalmente.

ALTER TABLE public.notification_events
ADD COLUMN IF NOT EXISTS payload_json jsonb;
