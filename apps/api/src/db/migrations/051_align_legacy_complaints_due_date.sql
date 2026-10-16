-- Migración 051: Alinear vencimiento legal de reclamos legacy al término del día hábil (23:59:59 PET)
-- Asegura que todos los expedientes pre-existentes tengan su vencimiento legal al final del 15° día hábil en hora oficial de Perú (America/Lima)

UPDATE complaints
SET legal_response_due_at = (
  date_trunc('day', legal_response_due_at AT TIME ZONE 'America/Lima') + INTERVAL '23 hours 59 minutes 59 seconds'
) AT TIME ZONE 'America/Lima'
WHERE legal_response_due_at IS NOT NULL
  AND (
    EXTRACT(HOUR FROM (legal_response_due_at AT TIME ZONE 'America/Lima')) != 23
    OR EXTRACT(MINUTE FROM (legal_response_due_at AT TIME ZONE 'America/Lima')) != 59
  );
