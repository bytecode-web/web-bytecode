-- Fase 3: Modulo de Localizacion en Panel Admin
BEGIN;

-- 1. Insertar Permisos
INSERT INTO public.permissions (module_code, action_code, code, name, description, created_at, updated_at)
VALUES 
    ('admin.localizacion', 'view', 'admin.localizacion.view', 'Ver Localización', 'Permite ver el listado de países y tipos de documentos', now(), now()),
    ('admin.localizacion', 'manage', 'admin.localizacion.manage', 'Administrar Localización', 'Permite crear, editar y eliminar países y documentos', now(), now())
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    deleted_at = NULL,
    updated_at = now();

-- 2. Registro en el menú
INSERT INTO public.menu_items (label, url, route_name, icon_name, permission_id, sort_order, is_active, created_at, updated_at)
SELECT 
    'Localización', 
    '/admin/localizacion', 
    'admin.localizacion', 
    'Globe', 
    id, 
    26, 
    true, 
    now(), 
    now()
FROM public.permissions WHERE code = 'admin.localizacion.view'
AND NOT EXISTS (
    SELECT 1 FROM public.menu_items WHERE route_name = 'admin.localizacion'
);

UPDATE public.menu_items
SET label = 'Localización',
    url = '/admin/localizacion',
    icon_name = 'Globe',
    permission_id = (SELECT id FROM public.permissions WHERE code = 'admin.localizacion.view'),
    is_active = true,
    deleted_at = NULL,
    updated_at = now()
WHERE route_name = 'admin.localizacion';

-- 3. Asignar permisos al rol 'super_admin' (View y Manage)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.code = 'super_admin' 
  AND p.code IN ('admin.localizacion.view', 'admin.localizacion.manage')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 4. Asignar permisos al rol 'admin' (Solo View)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.code = 'admin' 
  AND p.code IN ('admin.localizacion.view')
ON CONFLICT (role_id, permission_id) DO NOTHING;

COMMIT;
