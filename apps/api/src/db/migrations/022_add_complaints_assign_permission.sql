-- Añadir permiso para asignar reclamos
INSERT INTO public.permissions (id, module_code, action_code, code, name, description, created_at, updated_at) 
VALUES 
    (gen_random_uuid(), 'admin.reclamos', 'assign', 'admin.reclamos.assign', 'Asignar Reclamos', 'Permite asignar agentes de soporte a los reclamos', NOW(), NOW())
ON CONFLICT (code) DO UPDATE SET module_code = 'admin.reclamos';

-- Asignar el permiso a los super_admin de forma automática para que no queden bloqueados
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r, public.permissions p
WHERE r.code = 'super_admin' AND p.code = 'admin.reclamos.assign'
ON CONFLICT (role_id, permission_id) DO NOTHING;
