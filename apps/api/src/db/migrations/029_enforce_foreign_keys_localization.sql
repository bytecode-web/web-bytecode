BEGIN;

-- 1. Reforzar la Foreign Key de Documentos -> Países 
-- Esto asegura que NUNCA se puedan borrar documentos accidentalmente al borrar un país
ALTER TABLE public.document_types
    DROP CONSTRAINT IF EXISTS document_types_country_id_fkey;

ALTER TABLE public.document_types
    ADD CONSTRAINT document_types_country_id_fkey
    FOREIGN KEY (country_id)
    REFERENCES public.countries (id)
    ON DELETE RESTRICT;

-- 2. Reforzar la Foreign Key de Clientes (Directorio B2C) -> Países
ALTER TABLE public.customers
    DROP CONSTRAINT IF EXISTS customers_country_id_fkey;

ALTER TABLE public.customers
    ADD CONSTRAINT customers_country_id_fkey
    FOREIGN KEY (country_id)
    REFERENCES public.countries (id)
    ON DELETE RESTRICT;

-- 3. Reforzar la Foreign Key de Organizaciones (Directorio B2B) -> Países
ALTER TABLE public.organizations
    DROP CONSTRAINT IF EXISTS organizations_country_id_fkey;

ALTER TABLE public.organizations
    ADD CONSTRAINT organizations_country_id_fkey
    FOREIGN KEY (country_id)
    REFERENCES public.countries (id)
    ON DELETE RESTRICT;

COMMIT;
