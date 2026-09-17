-- Función para purgar sesiones antiguas automáticamente
CREATE OR REPLACE FUNCTION purge_zombie_sessions()
RETURNS TRIGGER AS $$
BEGIN
    -- Elimina sesiones que expiraron de forma natural o fueron revocadas hace más de 30 días
    DELETE FROM public.admin_sessions 
    WHERE expires_at < NOW() - INTERVAL '30 days'
       OR revoked_at < NOW() - INTERVAL '30 days';
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger que se dispara DESPUÉS de cada bloque de inserciones (Login)
-- Se usa STATEMENT en lugar de ROW por motivos de rendimiento
DROP TRIGGER IF EXISTS trg_purge_zombie_sessions ON public.admin_sessions;
CREATE TRIGGER trg_purge_zombie_sessions
AFTER INSERT ON public.admin_sessions
FOR EACH STATEMENT
EXECUTE FUNCTION purge_zombie_sessions();
