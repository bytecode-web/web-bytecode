-- Migración 049: Asegurar compatibilidad y relajar restricciones en complaint_responses
ALTER TABLE complaint_responses ADD COLUMN IF NOT EXISTS admin_user_id UUID REFERENCES admin_users(id);
ALTER TABLE complaint_responses ADD COLUMN IF NOT EXISTS response_body TEXT;
ALTER TABLE complaint_responses ADD COLUMN IF NOT EXISTS sent_by UUID REFERENCES admin_users(id);
ALTER TABLE complaint_responses ADD COLUMN IF NOT EXISTS body TEXT;
ALTER TABLE complaint_responses ADD COLUMN IF NOT EXISTS response_type VARCHAR(40) DEFAULT 'final_response';
ALTER TABLE complaint_responses ADD COLUMN IF NOT EXISTS sent_to_email VARCHAR(180);
ALTER TABLE complaint_responses ADD COLUMN IF NOT EXISTS sent_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE complaint_responses ADD COLUMN IF NOT EXISTS is_final BOOLEAN DEFAULT true;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'complaint_responses' AND column_name = 'response_type') THEN
    ALTER TABLE complaint_responses ALTER COLUMN response_type DROP NOT NULL;
    ALTER TABLE complaint_responses ALTER COLUMN response_type SET DEFAULT 'final_response';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'complaint_responses' AND column_name = 'body') THEN
    ALTER TABLE complaint_responses ALTER COLUMN body DROP NOT NULL;
  END IF;
END $$;
