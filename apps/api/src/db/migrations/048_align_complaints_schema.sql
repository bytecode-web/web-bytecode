-- Migración 048: Alineación de columnas para tablas pre-existentes de Reclamos
-- Garantiza retrocompatibilidad total con entornos efímeros, staging y producción

-- 1. complaint_time_events: asegurar columna metadata y timestamps
ALTER TABLE complaint_time_events ADD COLUMN IF NOT EXISTS metadata JSONB;
ALTER TABLE complaint_time_events ADD COLUMN IF NOT EXISTS event_date TIMESTAMP WITH TIME ZONE DEFAULT now();
ALTER TABLE complaint_time_events ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT now();

-- 2. complaint_responses: asegurar columnas admin_user_id y response_body
ALTER TABLE complaint_responses ADD COLUMN IF NOT EXISTS admin_user_id UUID REFERENCES admin_users(id);
ALTER TABLE complaint_responses ADD COLUMN IF NOT EXISTS response_body TEXT;
ALTER TABLE complaint_responses ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT now();

-- 3. Mapear datos legados si la tabla ya contenía registros con esquema anterior (sent_by, body)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'complaint_responses' AND column_name = 'sent_by') THEN
    UPDATE complaint_responses SET admin_user_id = sent_by WHERE admin_user_id IS NULL AND sent_by IS NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'complaint_responses' AND column_name = 'body') THEN
    UPDATE complaint_responses SET response_body = body WHERE response_body IS NULL AND body IS NOT NULL;
  END IF;
END $$;
