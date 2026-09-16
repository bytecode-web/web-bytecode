-- 1. Eliminar la tabla de Banners de raiz
-- Esto incluye sus triggers y sus constraints (foreign keys)
-- por causa del CASCADE
DROP TABLE IF EXISTS public.banners CASCADE;
