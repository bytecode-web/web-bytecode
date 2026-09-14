-- 1. Actualizar la funcion para limitar con precision milimetrica a 450 registros
-- El bot de GitHub sugirió usar fechas pero generaba un 'off-by-one' quedando 451 registros.
-- El enfoque seguro usando IN con OFFSET es igual de eficiente y exacto a 450 filas.
CREATE OR REPLACE FUNCTION public.trg_limit_audit_logs()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM public.admin_audit_logs 
  WHERE id IN (
    SELECT id FROM public.admin_audit_logs 
    ORDER BY created_at DESC 
    OFFSET 450
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
