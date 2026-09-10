-- =====================================================================
-- Sigla do setor (acronym) passa a ser OPCIONAL. IDEMPOTENTE.
-- Remove a obrigatoriedade (NOT NULL) da coluna. A constraint UNIQUE é
-- mantida — no PostgreSQL vários NULL convivem sob UNIQUE, então setores
-- sem sigla não colidem; a unicidade vale apenas para siglas preenchidas.
-- Aplicar:
--   docker compose exec -T postgres psql -U rfid -d rfid_assets \
--     < database/migrations/2026-07-20_sector_acronym_optional.sql
-- =====================================================================

ALTER TABLE sectors ALTER COLUMN acronym DROP NOT NULL;
