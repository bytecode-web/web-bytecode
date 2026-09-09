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
INSERT INTO public.menu_items (label, url, route_name, icon_name, permission_id, sort_order, is_active, created_at, updated_at)
SELECT 
    'Archivos', 
    '/admin/archivos', 
    'admin.archivos', 
    'FolderOpen', 
    id, 
    115, 
    true, 
    now(), 
    now()
FROM public.permissions WHERE code = 'admin.archivos.view'
ON CONFLICT (route_name) DO UPDATE
SET label = EXCLUDED.label,
    url = EXCLUDED.url,
    icon_name = EXCLUDED.icon_name,
    permission_id = EXCLUDED.permission_id,
    is_active = true,
    deleted_at = NULL,
    updated_at = now();

-- 3. Asignar permisos al rol 'super_admin' (View y Manage)
INSERT INTO public.role_permissions (role_id, permission_id, created_at)
SELECT r.id, p.id, now()
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.code = 'super_admin' 
  AND p.code IN ('admin.archivos.view', 'admin.archivos.manage')
ON CONFLICT DO NOTHING;

-- 4. Asignar permisos al rol 'admin' (Solo View)
-- NOTA: El usuario pidio "al admin solo ver". 
-- (Si deseas que el admin tambien gestione, agrega 'admin.archivos.manage' abajo)
INSERT INTO public.role_permissions (role_id, permission_id, created_at)
SELECT r.id, p.id, now()
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.code = 'admin' 
  AND p.code IN ('admin.archivos.view')
ON CONFLICT DO NOTHING;

COMMIT;
