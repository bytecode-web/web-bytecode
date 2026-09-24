-- Migración: Enriquecimiento UI del Catálogo de Canales
-- Descripción: Agrega metadatos visuales y de orden a los canales de adquisición

ALTER TABLE public.channel_catalog 
ADD COLUMN IF NOT EXISTS icon_name character varying(50),
ADD COLUMN IF NOT EXISTS color_hex character varying(7),
ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 0;

-- Actualización de datos existentes
UPDATE public.channel_catalog SET icon_name = 'Globe', color_hex = '#3b82f6', sort_order = 1 WHERE code = 'web';
UPDATE public.channel_catalog SET icon_name = 'MessageCircle', color_hex = '#25D366', sort_order = 2 WHERE code = 'whatsapp';
UPDATE public.channel_catalog SET icon_name = 'Mail', color_hex = '#ef4444', sort_order = 3 WHERE code = 'email';
UPDATE public.channel_catalog SET icon_name = 'Linkedin', color_hex = '#0a66c2', sort_order = 4 WHERE code = 'linkedin';
UPDATE public.channel_catalog SET icon_name = 'Phone', color_hex = '#8b5cf6', sort_order = 5 WHERE code = 'phone';
UPDATE public.channel_catalog SET icon_name = 'Facebook', color_hex = '#1877f2', sort_order = 6 WHERE code = 'facebook';
UPDATE public.channel_catalog SET icon_name = 'Instagram', color_hex = '#e1306c', sort_order = 7 WHERE code = 'instagram';
UPDATE public.channel_catalog SET icon_name = 'Shield', color_hex = '#64748b', sort_order = 8 WHERE code = 'admin';
