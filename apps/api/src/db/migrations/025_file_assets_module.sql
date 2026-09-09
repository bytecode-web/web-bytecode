-- Migración 025: Módulo de Gestor Maestro de Archivos
-- Inserta los permisos, el elemento del menú y lo asigna a los roles correspondientes.

BEGIN;

-- 1. Insertar Permisos
INSERT INTO public.permissions (module_code, action_code, code, name, description, created_at, updated_at)
VALUES 
    ('admin.archivos', 'view', 'admin.archivos.view', 'Ver Gestor de Archivos', 'Permite ver la grilla de archivos centralizada.', now(), now()),
    ('admin.archivos', 'manage', 'admin.archivos.manage', 'Administrar Archivos', 'Permite descargar y gestionar operaciones en la librería de archivos.', now(), now())
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    deleted_at = NULL,
    updated_at = now();

-- 2. Insertar Elemento de Menú 
-- Omitimos ON CONFLICT(route_name) porque no tiene restricción UNIQUE explícita en BD
INSERT INTO public.menu_items (label, url, route_name, icon_name, permission_id, sort_order, is_active, created_at, updated_at)
SELECT 
    'Archivos', 
    '/admin/archivos', 
    'admin.archivos', 
    'FolderOpen', 
    id, 
    106, 
    true, 
    now(), 
    now()
FROM public.permissions WHERE code = 'admin.archivos.view'
AND NOT EXISTS (
    SELECT 1 FROM public.menu_items WHERE route_name = 'admin.archivos'
);

-- Actualizar por si ya existía pero estaba obsoleto/eliminado lógicamente
UPDATE public.menu_items
SET label = 'Archivos',
    url = '/admin/archivos',
    icon_name = 'FolderOpen',
    permission_id = (SELECT id FROM public.permissions WHERE code = 'admin.archivos.view'),
    is_active = true,
    deleted_at = NULL,
    updated_at = now()
WHERE route_name = 'admin.archivos';

-- 3. Asignar permisos al rol 'super_admin' (View y Manage)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.code = 'super_admin' 
  AND p.code IN ('admin.archivos.view', 'admin.archivos.manage')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 4. Asignar permisos al rol 'admin' (Solo View)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.code = 'admin' 
  AND p.code IN ('admin.archivos.view')
ON CONFLICT (role_id, permission_id) DO NOTHING;

COMMIT;
