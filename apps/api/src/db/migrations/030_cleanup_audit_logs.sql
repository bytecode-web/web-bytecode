-- 1. Eliminar la tabla no utilizada
DROP TABLE IF EXISTS public.data_change_history CASCADE;

-- 2. Eliminar las columnas obsoletas de admin_audit_logs
ALTER TABLE public.admin_audit_logs
DROP COLUMN IF EXISTS before_data,
DROP COLUMN IF EXISTS after_data;

-- 3. Crear funcion para limitar a 450 registros
CREATE OR REPLACE FUNCTION public.trg_limit_audit_logs()
RETURNS TRIGGER AS $$
BEGIN
  -- Borra los registros mas viejos si exceden los 450
  DELETE FROM public.admin_audit_logs
  WHERE id NOT IN (
    SELECT id FROM public.admin_audit_logs
    ORDER BY created_at DESC
    LIMIT 450
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Aplicar el trigger
DROP TRIGGER IF EXISTS enforce_audit_logs_limit ON public.admin_audit_logs;
CREATE TRIGGER enforce_audit_logs_limit
AFTER INSERT ON public.admin_audit_logs
FOR EACH STATEMENT EXECUTE FUNCTION public.trg_limit_audit_logs();
