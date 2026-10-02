-- 039_seed_contact_categories.sql
-- Inyectar las categorías de contacto base para que el frontend no esté vacío.

INSERT INTO contact_categories (code, name, description) VALUES
('web_lead', 'Prospecto Web', 'Leads capturados automáticamente desde la Landing Page.'),
('support', 'Soporte Técnico', 'Solicitudes de ayuda técnica o reporte de bugs.'),
('sales_b2b', 'Ventas (Empresa)', 'Prospectos corporativos o de alto valor.'),
('sales_b2c', 'Ventas (Independiente)', 'Prospectos de clientes independientes o emprendedores.'),
('billing', 'Facturación y Cobranza', 'Temas administrativos y pagos.'),
('other', 'Otros', 'Consultas generales.')
ON CONFLICT (code) DO NOTHING;
