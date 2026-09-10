-- =====================================================================
-- Sistema de Gestão Patrimonial RFID — Schema PostgreSQL
-- Convenções: snake_case, UUID PK, soft delete (deleted_at),
-- auditoria temporal (created_at/updated_at), FKs com ON DELETE RESTRICT.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------- ENUM types ----------
CREATE TYPE user_status        AS ENUM ('active','blocked','inactive');
CREATE TYPE rfid_status        AS ENUM ('active','inactive','in_use','damaged','lost','retired','blocked');
CREATE TYPE asset_status       AS ENUM ('available','in_use','maintenance','reserved','missing','loaned','written_off','scrapped');
CREATE TYPE movement_type      AS ENUM ('sector_transfer','owner_change','write_off','maintenance_return','loan');
CREATE TYPE inventory_status   AS ENUM ('open','in_progress','finished','cancelled');
CREATE TYPE sync_status        AS ENUM ('pending','success','error');

-- ---------- RBAC ----------
CREATE TABLE roles (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        VARCHAR(60) NOT NULL UNIQUE,        -- admin, manager, operator, auditor
  description VARCHAR(255),
  is_system   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at  TIMESTAMPTZ
);

CREATE TABLE permissions (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code        VARCHAR(80) NOT NULL UNIQUE,        -- ex: assets:read, assets:write
  module      VARCHAR(40) NOT NULL,
  description VARCHAR(255),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE role_permissions (
  role_id       UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

-- ---------- Sectors ----------
CREATE TABLE sectors (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name         VARCHAR(80) NOT NULL,
  acronym      VARCHAR(10) UNIQUE,
  manager_id   UUID,
  location     VARCHAR(120),
  status       user_status NOT NULL DEFAULT 'active',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at   TIMESTAMPTZ
);

-- ---------- Users ----------
CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            VARCHAR(120) NOT NULL,
  registration    VARCHAR(30) UNIQUE,             -- matrícula
  email           VARCHAR(160) UNIQUE,             -- opcional (varios NULL convivem sob UNIQUE)
  phone           VARCHAR(30),
  position        VARCHAR(80),                    -- cargo
  sector_id       UUID REFERENCES sectors(id) ON DELETE SET NULL,
  login           VARCHAR(60) NOT NULL UNIQUE,
  password_hash   VARCHAR(120) NOT NULL,
  role_id         UUID NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
  status          user_status NOT NULL DEFAULT 'active',
  failed_attempts SMALLINT NOT NULL DEFAULT 0,
  blocked_until   TIMESTAMPTZ,
  last_login_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ
);
ALTER TABLE sectors ADD CONSTRAINT fk_sector_manager
  FOREIGN KEY (manager_id) REFERENCES users(id) ON DELETE SET NULL;

CREATE TABLE refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  VARCHAR(120) NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked     BOOLEAN NOT NULL DEFAULT FALSE,
  ip          VARCHAR(60),
  user_agent  VARCHAR(255),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE password_resets (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  VARCHAR(120) NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  used        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- Categories ----------
CREATE TABLE categories (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        VARCHAR(80) NOT NULL UNIQUE,
  description VARCHAR(255),
  status      user_status NOT NULL DEFAULT 'active',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at  TIMESTAMPTZ
);

-- ---------- RFID tags ----------
-- Modelo de memória EPC Gen2 (ISO/IEC 18000-6C). Valores hex armazenados em
-- MAIÚSCULO, alinhados a word de 16 bits. EPC até 512 bits (128 dígitos hex).
CREATE TABLE rfid_tags (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  epc             VARCHAR(128) NOT NULL UNIQUE,    -- banco EPC (0x01), até 512 bits
  rfid_code       VARCHAR(64) UNIQUE,
  serial_number   VARCHAR(80),
  manufacturer    VARCHAR(80),
  tag_type        VARCHAR(20) NOT NULL DEFAULT 'passive',
  source          VARCHAR(20) NOT NULL DEFAULT 'manual',  -- manual | reader | import
  -- ---- Bancos de memória Gen2 ----
  tid             VARCHAR(128) UNIQUE,             -- banco TID (0x10), read-only
  pc_word         VARCHAR(4),                      -- Protocol Control (1 word do EPC)
  epc_word_count  INT,
  user_memory     TEXT,                            -- banco User (0x11), tamanho variável
  access_password VARCHAR(8),                      -- banco Reservado (0x00), 32 bits
  kill_password   VARCHAR(8),                      -- banco Reservado (0x00), 32 bits
  epc_bits        INT,                             -- tamanhos reportados pelo leitor
  tid_bits        INT,
  user_bits       INT,
  lock_state      JSONB,                           -- estado de lock por banco
  last_read_at    TIMESTAMPTZ,
  status          rfid_status NOT NULL DEFAULT 'active',
  notes           TEXT,
  registered_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ
);

-- ---------- Assets ----------
CREATE TABLE assets (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  asset_code        VARCHAR(40) NOT NULL UNIQUE,  -- código patrimonial
  name              VARCHAR(160) NOT NULL,
  category_id       UUID NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  brand             VARCHAR(80),
  model             VARCHAR(80),
  serial_number     VARCHAR(80),
  acquisition_date  DATE,
  acquisition_value NUMERIC(14,2),
  invoice_number    VARCHAR(60),                  -- nota fiscal
  cost_center       VARCHAR(40),
  sector_id         UUID REFERENCES sectors(id) ON DELETE SET NULL,
  owner_id          UUID REFERENCES users(id) ON DELETE SET NULL,
  warranty_until    DATE,
  rfid_tag_id       UUID UNIQUE REFERENCES rfid_tags(id) ON DELETE SET NULL, -- 1:0..1
  status            asset_status NOT NULL DEFAULT 'available',
  erp_asset_id      VARCHAR(60),
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ
);

-- ---------- Movements ----------
CREATE TABLE asset_movements (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  asset_id           UUID NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
  type               movement_type NOT NULL,
  user_id            UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  from_sector_id     UUID REFERENCES sectors(id) ON DELETE SET NULL,
  to_sector_id       UUID REFERENCES sectors(id) ON DELETE SET NULL,
  from_owner_id      UUID REFERENCES users(id) ON DELETE SET NULL,
  to_owner_id        UUID REFERENCES users(id) ON DELETE SET NULL,
  notes              TEXT,
  occurred_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- Inventory (modelo coleta × julgamento) ----------
-- Um inventário cobre VÁRIOS setores visitados; a conciliação é ADIADA para o
-- fechamento (ver backend/src/modules/inventory/README.md). status/tipo como
-- VARCHAR+CHECK (não enum) para simplificar migrações idempotentes.
CREATE TABLE inventories (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code               VARCHAR(40) NOT NULL UNIQUE,        -- ex.: INV-2026-001
  description        TEXT,
  status             VARCHAR(20) NOT NULL DEFAULT 'in_progress'
                     CHECK (status IN ('in_progress','paused','finished','cancelled')),
  started_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at        TIMESTAMPTZ,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  expected_count     INT,                                -- snapshot da conciliação
  conform_count      INT,
  out_of_scope_count INT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE inventory_sector_visits (
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

CREATE TABLE inventory_reads (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  inventory_id    UUID NOT NULL REFERENCES inventories(id) ON DELETE CASCADE,
  sector_visit_id UUID NOT NULL REFERENCES inventory_sector_visits(id) ON DELETE CASCADE,
  epc             VARCHAR(128) NOT NULL,                 -- FATO BRUTO (sem julgamento)
  asset_id        UUID REFERENCES assets(id) ON DELETE SET NULL,
  rfid_tag_id     UUID REFERENCES rfid_tags(id) ON DELETE SET NULL,
  device_id       VARCHAR(60),
  rssi            INT,
  operator_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  read_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Coletor Android: chave de idempotencia do lote (o app reenvia o mesmo
  -- lote quando a resposta se perde), hits deduplicados e TID da etiqueta.
  client_batch_id UUID,
  read_count      INT NOT NULL DEFAULT 1,
  tid             VARCHAR(64)
);

-- Indice PARCIAL: a captura pela web nao manda client_batch_id.
CREATE UNIQUE INDEX uq_inv_reads_batch_epc
  ON inventory_reads (client_batch_id, epc) WHERE client_batch_id IS NOT NULL;

CREATE TABLE inventory_discrepancies (
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

-- ---------- Location history ----------
CREATE TABLE asset_location_history (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  asset_id    UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  sector_id   UUID REFERENCES sectors(id) ON DELETE SET NULL,
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  reader_id   VARCHAR(60),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- Audit ----------
CREATE TABLE audit_logs (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  operation   VARCHAR(40) NOT NULL,             -- login, create, update, delete...
  entity      VARCHAR(60),
  entity_id   VARCHAR(60),
  ip          VARCHAR(60),
  changes     JSONB,                            -- diff antes/depois
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- Integration ----------
CREATE TABLE integration_logs (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  target        VARCHAR(40) NOT NULL DEFAULT 'erp',
  erp_asset_id  VARCHAR(60),
  payload       JSONB,
  status        sync_status NOT NULL DEFAULT 'pending',
  message       TEXT,
  synced_at     TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- Notifications ----------
CREATE TABLE notifications (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  title       VARCHAR(160) NOT NULL,
  body        TEXT,
  read        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================================
-- Índices
-- =====================================================================
CREATE INDEX idx_users_sector       ON users(sector_id);
CREATE INDEX idx_users_role         ON users(role_id);
CREATE INDEX idx_assets_category    ON assets(category_id);
CREATE INDEX idx_assets_sector      ON assets(sector_id);
CREATE INDEX idx_assets_status      ON assets(status);
CREATE INDEX idx_assets_code        ON assets(asset_code);
CREATE INDEX idx_rfid_epc           ON rfid_tags(epc);
CREATE INDEX idx_rfid_status        ON rfid_tags(status);
CREATE INDEX idx_mov_asset          ON asset_movements(asset_id);
CREATE INDEX idx_mov_occurred       ON asset_movements(occurred_at);
CREATE INDEX idx_inv_visits_inventory ON inventory_sector_visits(inventory_id);
CREATE INDEX idx_inv_reads_inventory  ON inventory_reads(inventory_id);
CREATE INDEX idx_inv_reads_visit      ON inventory_reads(sector_visit_id);
CREATE INDEX idx_inv_reads_epc        ON inventory_reads(epc);
CREATE INDEX idx_inv_disc_inventory   ON inventory_discrepancies(inventory_id);
CREATE INDEX idx_loc_asset          ON asset_location_history(asset_id);
CREATE INDEX idx_audit_user         ON audit_logs(user_id);
CREATE INDEX idx_audit_occurred     ON audit_logs(occurred_at);
CREATE INDEX idx_refresh_user       ON refresh_tokens(user_id);

-- Soft-delete partial indexes (consultas só de registros vivos)
CREATE INDEX idx_assets_alive       ON assets(id) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_alive        ON users(id)  WHERE deleted_at IS NULL;
