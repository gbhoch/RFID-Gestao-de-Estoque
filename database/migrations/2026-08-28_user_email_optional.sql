-- =====================================================================
-- E-mail do usuário passa a ser OPCIONAL. IDEMPOTENTE.
--
-- Nem todo operador de galpão tem e-mail corporativo, e exigir um obrigava
-- a inventar endereços falsos só para criar a conta.
--
-- A constraint UNIQUE é mantida: no PostgreSQL vários NULL convivem sob
-- UNIQUE, então usuários sem e-mail não colidem entre si — a unicidade
-- continua valendo apenas para os endereços preenchidos. Mesmo padrão já
-- usado em sectors.acronym.
--
-- Aplicar:
--   psql -U postgres -h localhost -d rfid_assets \
--     -f database/migrations/2026-08-28_user_email_optional.sql
-- =====================================================================

ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
