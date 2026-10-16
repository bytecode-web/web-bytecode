-- 1. Add archived_at for Soft-Delete
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP WITH TIME ZONE;

-- 2. Create function to prevent legal delete
CREATE OR REPLACE FUNCTION prevent_legal_delete()
RETURNS TRIGGER AS $$
BEGIN
    IF current_setting('app.allow_physical_delete', true) IS DISTINCT FROM 'true' THEN
        RAISE EXCEPTION 'Eliminación física denegada por protocolo de retención legal.';
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- 3. Attach trigger to complaints
DROP TRIGGER IF EXISTS trg_prevent_legal_delete ON complaints;
CREATE TRIGGER trg_prevent_legal_delete
BEFORE DELETE ON complaints
FOR EACH ROW
EXECUTE FUNCTION prevent_legal_delete();
