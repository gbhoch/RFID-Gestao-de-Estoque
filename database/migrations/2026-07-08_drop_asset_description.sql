-- =====================================================================
-- Migração: remove a coluna 'description' de assets (consolidada em 'notes').
-- A tela de Patrimônios passou a ter um único campo de texto ("Observação").
-- Idempotente. Aplicar em bancos já existentes.
--   docker compose exec -T postgres psql -U rfid -d rfid_assets \
--     < database/migrations/2026-07-08_drop_asset_description.sql
-- =====================================================================

ALTER TABLE assets DROP COLUMN IF EXISTS description;
