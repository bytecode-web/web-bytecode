-- Rellenar la tasa de cambio histórica (Agosto/Septiembre 2026) para mantener coherencia en ediciones

-- PEN siempre vale 1
UPDATE quotes SET exchange_rate = 1.0000 WHERE currency_code = 'PEN' AND exchange_rate IS NULL;

-- Cotización QT-1F7AC666 (Deducida: Web Corp (2600) + DNS (30) = 2630 PEN / 749.91 USD = 3.5071)
UPDATE quotes SET exchange_rate = 3.5071 WHERE id = '1b8e25a2-b5a8-42e4-8e41-05deb54294b3';

-- Cotización QT-C65E9CD4 (Rango personalizado EUR, se asume 4.05 histórico de ese momento)
UPDATE quotes SET exchange_rate = 4.0500 WHERE id = '898205e3-35d1-428c-9d16-0bb143d5a7f1';

-- Cotización QT-C7882C53 (Precio manual USD, se asume 3.75 histórico de Agosto)
UPDATE quotes SET exchange_rate = 3.7500 WHERE id = 'ddac76ed-195b-418c-ad9d-0cd972d2fe4d';

-- Fallback general para las que falten
UPDATE quotes SET exchange_rate = 3.7500 WHERE currency_code = 'USD' AND exchange_rate IS NULL;
UPDATE quotes SET exchange_rate = 4.0500 WHERE currency_code = 'EUR' AND exchange_rate IS NULL;
