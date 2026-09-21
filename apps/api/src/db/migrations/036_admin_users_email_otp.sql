-- Migración: Preparar tabla admin_users para Email OTP

-- 1. Renombrar la columna MFA general a una específica para el contexto actual
ALTER TABLE public.admin_users 
RENAME COLUMN mfa_enabled TO email_otp_enabled;

-- 2. Añadir las columnas efímeras para gestionar el código
ALTER TABLE public.admin_users 
ADD COLUMN login_otp_code VARCHAR(10) NULL,
ADD COLUMN login_otp_expires_at TIMESTAMP WITH TIME ZONE NULL;
