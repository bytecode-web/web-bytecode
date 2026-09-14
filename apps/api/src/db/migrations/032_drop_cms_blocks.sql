-- 1. Elimina la tabla de CMS Blocks de raiz
-- Esto incluye sus triggers (trg_cms_blocks_updated_at) y sus constraints (foreign keys a cms_pages)
-- por causa del CASCADE
DROP TABLE IF EXISTS public.cms_blocks CASCADE;
