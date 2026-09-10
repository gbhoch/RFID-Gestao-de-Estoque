-- =====================================================================
-- Migração aditiva — bancos de memória EPC Gen2 na tabela rfid_tags.
-- Idempotente (pode rodar mais de uma vez). Aplicar em bancos JÁ existentes,
-- pois database/schema.sql só executa na criação de uma base nova.
--
-- Como aplicar (com o Postgres do projeto no Docker):
--   docker compose exec -T postgres psql -U rfid -d rfid_assets \
--     < database/migrations/2026-07-06_add_tag_memory_banks.sql
-- =====================================================================

-- EPC pode ter até 512 bits (128 dígitos hex) — a coluna era VARCHAR(64).
ALTER TABLE rfid_tags ALTER COLUMN epc TYPE VARCHAR(128);

ALTER TABLE rfid_tags
  ADD COLUMN IF NOT EXISTS tid             VARCHAR(128),
  ADD COLUMN IF NOT EXISTS pc_word         VARCHAR(4),
  ADD COLUMN IF NOT EXISTS epc_word_count  INT,
  ADD COLUMN IF NOT EXISTS user_memory     TEXT,
  ADD COLUMN IF NOT EXISTS access_password VARCHAR(8),
  ADD COLUMN IF NOT EXISTS kill_password   VARCHAR(8),
  ADD COLUMN IF NOT EXISTS epc_bits        INT,
  ADD COLUMN IF NOT EXISTS tid_bits        INT,
  ADD COLUMN IF NOT EXISTS user_bits       INT,
  ADD COLUMN IF NOT EXISTS lock_state      JSONB,
  ADD COLUMN IF NOT EXISTS last_read_at    TIMESTAMPTZ;

-- TID único quando presente (ignora NULLs).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'uq_rfid_tags_tid'
  ) THEN
    CREATE UNIQUE INDEX uq_rfid_tags_tid ON rfid_tags(tid) WHERE tid IS NOT NULL;
  END IF;
END $$;
