-- Migración 024: Limpieza de Archivos Huérfanos
-- Este script marca como eliminados los registros en file_assets que NO están siendo utilizados por ninguna otra tabla del sistema.

UPDATE public.file_assets
SET deleted_at = NOW()
WHERE id NOT IN (SELECT file_asset_id FROM public.banners WHERE file_asset_id IS NOT NULL)
  AND id NOT IN (SELECT file_asset_id FROM public.complaint_evidences WHERE file_asset_id IS NOT NULL)
  AND id NOT IN (SELECT receipt_file_id FROM public.milestone_payments WHERE receipt_file_id IS NOT NULL)
  AND id NOT IN (SELECT file_asset_id FROM public.portfolio_item_assets WHERE file_asset_id IS NOT NULL)
  AND deleted_at IS NULL;
