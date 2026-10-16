-- Migración 052: Asegurar ON DELETE CASCADE en tablas dependientes de Reclamos
-- Permite que la purga física autorizada por Super Administrador destruya limpiamente todas las dependencias

DO $$
DECLARE
    tbl text;
    c_name text;
BEGIN
    FOR tbl IN SELECT unnest(ARRAY[
        'complaint_details',
        'complaint_goods',
        'complaint_evidences',
        'complaint_status_history',
        'complaint_assignments',
        'complaint_time_events',
        'complaint_responses',
        'complaint_notes'
    ]) LOOP
        -- Verificar si la tabla existe en la base de datos
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = tbl) THEN
            -- Buscar y eliminar cualquier constraint previa de foreign key que apunte a complaints
            FOR c_name IN 
                SELECT conname 
                FROM pg_constraint 
                WHERE conrelid = tbl::regclass 
                  AND contype = 'f' 
                  AND confrelid = 'complaints'::regclass
            LOOP
                EXECUTE format('ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I', tbl, c_name);
            END LOOP;

            -- Recrear la foreign key garantizando ON DELETE CASCADE
            IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = tbl AND column_name = 'complaint_id') THEN
                EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (complaint_id) REFERENCES complaints(id) ON DELETE CASCADE', tbl, tbl || '_complaint_id_fkey');
            END IF;
        END IF;
    END LOOP;
END $$;
