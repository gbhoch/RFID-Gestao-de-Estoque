-- =====================================================================
-- Reformulação do Inventário (coleta × julgamento). IDEMPOTENTE.
-- Substitui o modelo antigo (uma sessão por setor) pelo novo: um inventário
-- cobre vários setores visitados e a CONCILIAÇÃO é adiada para o fechamento.
-- Decisão do usuário: descartar os dados antigos (fase TCC).
-- Aplicar:
--   docker compose exec -T postgres psql -U rfid -d rfid_assets \
--     < database/migrations/2026-07-08_inventory_rework.sql
-- =====================================================================

-- 1) Descartar as tabelas antigas do inventário.
DROP TABLE IF EXISTS inventory_reads CASCADE;
DROP TABLE IF EXISTS inventory_sessions CASCADE;

-- 2) Origem do cadastro da etiqueta (para o desfecho register_tag gravar 'reader').
ALTER TABLE rfid_tags ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'manual';

-- 3) Novas tabelas (status/tipo como VARCHAR + CHECK).
CREATE TABLE IF NOT EXISTS inventories (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code               VARCHAR(40) NOT NULL UNIQUE,
  description        TEXT,
  status             VARCHAR(20) NOT NULL DEFAULT 'in_progress'
                     CHECK (status IN ('in_progress','paused','finished','cancelled')),
  started_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at        TIMESTAMPTZ,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  expected_count     INT,
  conform_count      INT,
  out_of_scope_count INT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inventory_sector_visits (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  inventory_id UUID NOT NULL REFERENCES inventories(id) ON DELETE CASCADE,
  sector_id    UUID NOT NULL REFERENCES sectors(id) ON DELETE RESTRICT,
  status       VARCHAR(20) NOT NULL DEFAULT 'in_progress'
               CHECK (status IN ('in_progress','completed')),
  started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (inventory_id, sector_id)
);

CREATE TABLE IF NOT EXISTS inventory_reads (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  inventory_id    UUID NOT NULL REFERENCES inventories(id) ON DELETE CASCADE,
  sector_visit_id UUID NOT NULL REFERENCES inventory_sector_visits(id) ON DELETE CASCADE,
  epc             VARCHAR(128) NOT NULL,
  asset_id        UUID REFERENCES assets(id) ON DELETE SET NULL,
  rfid_tag_id     UUID REFERENCES rfid_tags(id) ON DELETE SET NULL,
  device_id       VARCHAR(60),
  rssi            INT,
  operator_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  read_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inventory_discrepancies (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  inventory_id        UUID NOT NULL REFERENCES inventories(id) ON DELETE CASCADE,
  type                VARCHAR(20) NOT NULL
                      CHECK (type IN ('location_mismatch','not_found','unknown_tag')),
  asset_id            UUID REFERENCES assets(id) ON DELETE SET NULL,
  epc                 VARCHAR(128),
  expected_sector_id  UUID REFERENCES sectors(id) ON DELETE SET NULL,
  found_sector_id     UUID REFERENCES sectors(id) ON DELETE SET NULL,
  resolution          VARCHAR(20)
                      CHECK (resolution IN ('accept_location','justified','mark_missing','register_tag')),
  resolution_notes    TEXT,
  resolved_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  resolved_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4) Índices (inventory_id, sector_visit_id, epc).
CREATE INDEX IF NOT EXISTS idx_inv_visits_inventory ON inventory_sector_visits(inventory_id);
CREATE INDEX IF NOT EXISTS idx_inv_reads_inventory  ON inventory_reads(inventory_id);
CREATE INDEX IF NOT EXISTS idx_inv_reads_visit      ON inventory_reads(sector_visit_id);
CREATE INDEX IF NOT EXISTS idx_inv_reads_epc        ON inventory_reads(epc);
CREATE INDEX IF NOT EXISTS idx_inv_disc_inventory   ON inventory_discrepancies(inventory_id);
