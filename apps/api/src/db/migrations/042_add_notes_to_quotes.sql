-- Migración 042: Agregar campo de observaciones internas independientes en quotes y separar datos existentes
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS notes TEXT;

DO $$
DECLARE
    r RECORD;
    v_raw TEXT;
    v_notes TEXT;
    v_policy TEXT;
    v_first_kw_pos INT;
    v_last_cat_pos INT;
    v_kw_pattern TEXT := '(Categoria de proyecto:|Nota Legal:|Recurrente mensual:|Recurrente anual:)';
BEGIN
    FOR r IN 
        SELECT id, payment_policy 
        FROM public.quotes 
        WHERE payment_policy IS NOT NULL AND payment_policy <> '' 
    LOOP
        v_raw := r.payment_policy;
        v_notes := NULL;
        v_policy := NULL;

        -- Buscar la primera coincidencia de cualquiera de las palabras clave del sistema
        v_first_kw_pos := regexp_instr(v_raw, v_kw_pattern);

        IF v_first_kw_pos = 0 THEN
            -- No hay palabras clave del sistema: el contenido completo era una observación de usuario
            v_notes := NULLIF(trim(v_raw), '');
            v_policy := NULL;
        ELSE
            -- Si había texto antes de la primera palabra clave, extraerlo como nota del usuario
            IF v_first_kw_pos > 1 THEN
                v_notes := NULLIF(trim(substring(v_raw from 1 for v_first_kw_pos - 1)), '');
            END IF;

            -- Extraer la parte de metadatos del sistema
            v_policy := substring(v_raw from v_first_kw_pos);

            -- Si hay repeticiones acumuladas de 'Categoria de proyecto:', conservar desde la última ocurrencia
            LOOP
                v_last_cat_pos := regexp_instr(v_policy, 'Categoria de proyecto:', 1, 2);
                EXIT WHEN v_last_cat_pos = 0;
                v_policy := substring(v_policy from v_last_cat_pos);
            END LOOP;

            -- Dar formato con saltos de línea limpios entre secciones
            v_policy := regexp_replace(v_policy, '([^\n])\s*(Categoria de proyecto:|Nota Legal:|Recurrente mensual:|Recurrente anual:)', E'\\1\n\\2', 'g');
            v_policy := NULLIF(trim(v_policy), '');
        END IF;

        -- Actualizar la fila en quotes preservando notes si ya estuviese definida
        UPDATE public.quotes
        SET notes = COALESCE(quotes.notes, v_notes),
            payment_policy = v_policy
        WHERE id = r.id;
    END LOOP;
END $$;
