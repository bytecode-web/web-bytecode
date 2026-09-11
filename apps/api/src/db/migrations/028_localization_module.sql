-- Fase 3: Modulo de Localizacion en Panel Admin
-- 1. Creación de Permisos
INSERT INTO public.permissions (name, description, module)
VALUES 
  ('admin.localizacion.view', 'Ver el listado de países y tipos de documentos', 'localizacion'),
  ('admin.localizacion.manage', 'Crear, editar y eliminar países y documentos', 'localizacion')
ON CONFLICT (name) DO NOTHING;

-- 2. Asignación de Roles
-- super_admin obtiene todo
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r, public.permissions p
WHERE r.name = 'super_admin' AND p.name IN ('admin.localizacion.view', 'admin.localizacion.manage')
ON CONFLICT DO NOTHING;

-- admin obtiene solo view
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r, public.permissions p
WHERE r.name = 'admin' AND p.name = 'admin.localizacion.view'
ON CONFLICT DO NOTHING;

-- 3. Registro en el menú
INSERT INTO public.menu_items (label, url, route_name, icon_name, permission_id, sort_order, is_active, created_at, updated_at)
SELECT 
    'Localización', 
    '/admin/localizacion', 
    'admin.localizacion', 
    'Globe', 
    p.id, 
    26, -- Después de directorio (usualmente 30-40) y antes de Config (99)
    true, 
    NOW(), 
    NOW()
FROM public.permissions p
WHERE p.name = 'admin.localizacion.view'
AND NOT EXISTS (
    SELECT 1 FROM public.menu_items WHERE route_name = 'admin.localizacion'
);
