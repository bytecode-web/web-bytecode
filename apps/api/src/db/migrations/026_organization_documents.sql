-- Fase 3.1: Expansión de Base de Datos para Organizaciones
-- Creación de la tabla puente que centraliza los documentos B2B

CREATE TABLE IF NOT EXISTS public.organization_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    document_type_id uuid NOT NULL,
    document_number character varying(50) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT pk_organization_documents PRIMARY KEY (id),
    CONSTRAINT uq_organization_documents UNIQUE (organization_id, document_type_id),
    CONSTRAINT fk_org_docs_organization FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
    CONSTRAINT fk_org_docs_document_type FOREIGN KEY (document_type_id) REFERENCES public.document_types(id) ON DELETE RESTRICT
);

-- Trigger de updated_at si no existía el binding
DROP TRIGGER IF EXISTS trg_organization_documents_updated_at ON public.organization_documents;
CREATE TRIGGER trg_organization_documents_updated_at 
    BEFORE UPDATE ON public.organization_documents 
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Data Seeding (Migración en caliente de los datos existentes sin perder rucs)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'organizations'
          AND column_name = 'ruc'
    ) THEN
        EXECUTE '
            WITH CompanyDocs AS (
                SELECT id as dt_id, country_id,
                ROW_NUMBER() OVER (PARTITION BY country_id ORDER BY created_at ASC) as rn
                FROM document_types
                WHERE is_company_document = true
            )
            INSERT INTO organization_documents (organization_id, document_type_id, document_number)
            SELECT o.id, cd.dt_id, o.ruc
            FROM organizations o
            JOIN CompanyDocs cd ON cd.country_id = o.country_id AND cd.rn = 1
            WHERE o.ruc IS NOT NULL AND o.ruc != ''''
            ON CONFLICT (organization_id, document_type_id) DO NOTHING;
        ';
    END IF;
END $$;

-- Nota: NO borramos la columna organizations.ruc todavía. Eso ocurrirá en la Fase 3.4.
