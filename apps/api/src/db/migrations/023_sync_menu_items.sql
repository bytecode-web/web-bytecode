-- Migración 020: Sincronización de íconos del menú (Fase 4)
-- Corrige el ícono de Directorio en base de datos para alinearlo con el parche histórico de React
UPDATE public.menu_items 
SET icon_name = 'BookUser', 
    updated_at = NOW() 
WHERE label = 'Directorio';
