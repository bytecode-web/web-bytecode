-- 040_add_exchange_rate.sql
-- Adición de columna para tasa de cambio en las cotizaciones

ALTER TABLE quotes ADD COLUMN exchange_rate NUMERIC(10,4) DEFAULT 1.0000;
