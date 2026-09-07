-- 1. Tabla de Configuración de Reglas (Para asociar eventos con roles)
CREATE TABLE IF NOT EXISTS public.notification_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    event_type character varying(100) NOT NULL,
    role_id uuid NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT notification_rules_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE CASCADE,
    CONSTRAINT uq_notification_rules UNIQUE (event_type, role_id)
);

ALTER TABLE public.notification_rules OWNER TO bytecode_user;

CREATE TRIGGER trg_notification_rules_updated_at BEFORE UPDATE ON public.notification_rules FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. Permisos para gestionar notificaciones (Si no existen, se crean)
INSERT INTO public.permissions (id, module_code, action_code, code, name, description, created_at, updated_at) 
VALUES 
    (gen_random_uuid(), 'notificaciones', 'view', 'admin.notificaciones.view', 'Ver Notificaciones', 'Permite ver las preferencias de notificaciones', NOW(), NOW()),
    (gen_random_uuid(), 'notificaciones', 'manage', 'admin.notificaciones.manage', 'Gestionar Notificaciones', 'Permite editar las preferencias de notificaciones', NOW(), NOW())
ON CONFLICT (code) DO NOTHING;

-- 3. Asignar estos permisos estrictamente al rol Super Admin
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id 
FROM public.roles r, public.permissions p
WHERE r.name = 'super_admin' AND p.code IN ('admin.notificaciones.view', 'admin.notificaciones.manage')
ON CONFLICT DO NOTHING;

-- 4. Inserción del menú item en la base de datos (con ícono BellRing y sort_order 105)
INSERT INTO public.menu_items (id, parent_id, label, url, route_name, icon_name, permission_id, sort_order, is_active, created_at, updated_at)
SELECT 
    gen_random_uuid(), 
    NULL, 
    'Notificaciones', 
    '/admin/notificaciones', 
    'admin.notificaciones', 
    'BellRing', 
    p.id, 
    105, 
    true, 
    NOW(), 
    NOW()
FROM public.permissions p 
WHERE p.code = 'admin.notificaciones.view'
LIMIT 1;
