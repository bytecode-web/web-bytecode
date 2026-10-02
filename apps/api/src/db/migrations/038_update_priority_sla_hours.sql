-- 038_update_priority_sla_hours.sql
-- Ampliación de la tolerancia SLA (horas) para las prioridades

UPDATE priority_catalog SET sla_hours = 120 WHERE code = 'low';
UPDATE priority_catalog SET sla_hours = 72 WHERE code = 'normal';
UPDATE priority_catalog SET sla_hours = 48 WHERE code = 'high';
UPDATE priority_catalog SET sla_hours = 24 WHERE code = 'urgent';
