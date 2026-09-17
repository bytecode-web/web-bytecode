-- Agregar columna de expiración a nivel de cuenta (admin_users)
ALTER TABLE public.admin_users 
ADD COLUMN expires_at timestamp with time zone NULL;

-- Migrar de forma segura las expiraciones existentes de la tabla de roles a la de usuarios
-- Se toma la fecha de expiración más lejana si un usuario tuviese varios roles
UPDATE public.admin_users u
SET expires_at = (
    SELECT MAX(aur.expires_at)
    FROM public.admin_user_roles aur
    WHERE aur.admin_user_id = u.id
)
WHERE EXISTS (
    SELECT 1 
    FROM public.admin_user_roles aur 
    WHERE aur.admin_user_id = u.id AND aur.expires_at IS NOT NULL
);

-- Limpiar la antigua lógica de roles para evitar confusiones futuras
ALTER TABLE public.admin_user_roles 
DROP CONSTRAINT IF EXISTS ck_admin_user_roles_dates,
DROP COLUMN IF EXISTS expires_at;

-- Re-crear constraint opcional para asegurar que la expiración de la cuenta sea en el futuro respecto a su creación
ALTER TABLE public.admin_users
ADD CONSTRAINT ck_admin_users_expiration_date CHECK (expires_at IS NULL OR expires_at > created_at);
