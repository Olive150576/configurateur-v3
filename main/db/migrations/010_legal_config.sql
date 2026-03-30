-- 010_legal_config.sql
-- Champs légaux obligatoires pour les documents commerciaux
INSERT OR IGNORE INTO app_config (key, value) VALUES
  ('company_legal_form',  ''),
  ('company_rcs_city',    ''),
  ('quote_validity_days', '30'),
  ('delivery_weeks',      '8 à 14'),
  ('payment_modes',       'Chèque, virement bancaire, carte bancaire');
