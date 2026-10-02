-- Migración 042: Agregar campo de observaciones internas independientes en quotes
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS notes TEXT;
