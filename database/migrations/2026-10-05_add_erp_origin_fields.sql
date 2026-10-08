-- =====================================================================
-- Referência de origem no ERP Oracle (preparação para importação/sync).
-- IDEMPOTENTE. Só estrutura — nenhum dado existente é alterado.
--
-- A identidade no ERP é COMPOSTA:
--   assets     ← patbem       (EMPRESA, SEQUENCIAL)
--   categories ← patgrpbem    (EMPRESA, CODIGO)    CODIGO = NUMBER(6,0)
--   sectors    ← patlocalbem  (EMPRESA, CODIGO)    CODIGO = NUMBER(6,0)
--
-- 1) Remove assets.erp_asset_id (VARCHAR livre, nunca usado pelo código),
--    substituído pelos campos estruturados abaixo.
-- 2) Chave de origem em duas colunas tipadas por tabela + CHECK de
--    coerência (ambas preenchidas ou ambas NULL).
-- 3) erp_synced_at / erp_hash — última sincronização e hash do payload de
--    origem, para detectar mudança sem comparar campo a campo.
-- 4) Índice único PARCIAL: registros manuais (sem origem) e soft-deleted
--    ficam fora, então reimportar um item excluído não colide.
--
-- Aplicar:
--   docker compose exec -T postgres psql -U rfid -d rfid_assets \
--     -v ON_ERROR_STOP=1 < database/migrations/2026-10-05_add_erp_origin_fields.sql
--
-- Reverter (manual):
--   DROP INDEX IF EXISTS uq_assets_erp, uq_categories_erp, uq_sectors_erp;
--   ALTER TABLE assets     DROP CONSTRAINT IF EXISTS ck_assets_erp_key,
--     DROP COLUMN IF EXISTS erp_empresa, DROP COLUMN IF EXISTS erp_sequencial,
--     DROP COLUMN IF EXISTS erp_synced_at, DROP COLUMN IF EXISTS erp_hash,
--     ADD COLUMN IF NOT EXISTS erp_asset_id VARCHAR(60);
--   ALTER TABLE categories DROP CONSTRAINT IF EXISTS ck_categories_erp_key,
--     DROP COLUMN IF EXISTS erp_empresa, DROP COLUMN IF EXISTS erp_codigo,
--     DROP COLUMN IF EXISTS erp_synced_at, DROP COLUMN IF EXISTS erp_hash;
--   ALTER TABLE sectors    DROP CONSTRAINT IF EXISTS ck_sectors_erp_key,
--     DROP COLUMN IF EXISTS erp_empresa, DROP COLUMN IF EXISTS erp_codigo,
--     DROP COLUMN IF EXISTS erp_synced_at, DROP COLUMN IF EXISTS erp_hash;
-- =====================================================================

BEGIN;

-- ---------- assets ----------
ALTER TABLE assets DROP COLUMN IF EXISTS erp_asset_id;
ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS erp_empresa    INTEGER,
  ADD COLUMN IF NOT EXISTS erp_sequencial BIGINT,
  ADD COLUMN IF NOT EXISTS erp_synced_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS erp_hash       VARCHAR(64);

-- ---------- categories ----------
ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS erp_empresa   INTEGER,
  ADD COLUMN IF NOT EXISTS erp_codigo    INTEGER,
  ADD COLUMN IF NOT EXISTS erp_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS erp_hash      VARCHAR(64);

-- ---------- sectors ----------
ALTER TABLE sectors
  ADD COLUMN IF NOT EXISTS erp_empresa   INTEGER,
  ADD COLUMN IF NOT EXISTS erp_codigo    INTEGER,
  ADD COLUMN IF NOT EXISTS erp_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS erp_hash      VARCHAR(64);

-- ---------- CHECK de coerência (Postgres não tem ADD CONSTRAINT IF NOT EXISTS) ----------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_assets_erp_key') THEN
    ALTER TABLE assets ADD CONSTRAINT ck_assets_erp_key
      CHECK ((erp_empresa IS NULL) = (erp_sequencial IS NULL));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_categories_erp_key') THEN
    ALTER TABLE categories ADD CONSTRAINT ck_categories_erp_key
      CHECK ((erp_empresa IS NULL) = (erp_codigo IS NULL));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_sectors_erp_key') THEN
    ALTER TABLE sectors ADD CONSTRAINT ck_sectors_erp_key
      CHECK ((erp_empresa IS NULL) = (erp_codigo IS NULL));
  END IF;
END
$$;

-- ---------- Unicidade da chave de origem (só importados e vivos) ----------
CREATE UNIQUE INDEX IF NOT EXISTS uq_assets_erp
  ON assets (erp_empresa, erp_sequencial)
  WHERE erp_empresa IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_categories_erp
  ON categories (erp_empresa, erp_codigo)
  WHERE erp_empresa IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_sectors_erp
  ON sectors (erp_empresa, erp_codigo)
  WHERE erp_empresa IS NOT NULL AND deleted_at IS NULL;

COMMIT;
