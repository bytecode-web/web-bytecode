-- 050_complaint_notification_rules.sql
-- Preactivar reglas de notificación para el módulo de Libro de Reclamaciones
-- para los roles directivos y operativos: super_admin, admin y legal_reviewer.

INSERT INTO notification_rules (event_type, role_id, is_active)
SELECT 
    e.event_type,
    r.id AS role_id,
    true AS is_active
FROM (
    VALUES 
        ('complaint_status_changed'),
        ('complaint_note_added'),
        ('complaint_response_sent'),
        ('complaint_evidence_added'),
        ('complaint_sla_warning')
) AS e(event_type)
CROSS JOIN roles r
WHERE r.code IN ('super_admin', 'admin', 'legal_reviewer')
ON CONFLICT (event_type, role_id) 
DO UPDATE SET is_active = true, updated_at = NOW();
