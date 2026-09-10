-- =====================================================================
-- Integração do coletor Android (RfidInventory) com o inventário.
-- IDEMPOTENTE.
--
-- 1) client_batch_id  — chave de idempotência do lote enviado pelo coletor.
--    O app reenvia o MESMO lote quando a resposta se perde (timeout depois
--    do commit); sem essa chave o reenvio entraria como leitura duplicada
--    e distorceria a contagem do painel.
-- 2) read_count / tid — o coletor deduplica por EPC antes de enviar; o
--    número de hits é o que dá ao operador a noção de leitura sólida vs
--    leitura de borda, e o TID identifica a etiqueta física (anti-clonagem).
-- 3) sectors:read / categories:read para o perfil 'operator' — sem isso o
--    seletor de setor devolve 403 (na web o sintoma fica mascarado porque
--    o LookupService engole o erro e mostra a lista vazia).
--
-- Aplicar:
--   docker compose exec -T postgres psql -U rfid -d rfid_assets \
--     < database/migrations/2026-08-24_inventory_reads_collector.sql
-- =====================================================================

ALTER TABLE inventory_reads ADD COLUMN IF NOT EXISTS client_batch_id UUID;
ALTER TABLE inventory_reads ADD COLUMN IF NOT EXISTS read_count INT NOT NULL DEFAULT 1;
ALTER TABLE inventory_reads ADD COLUMN IF NOT EXISTS tid VARCHAR(64);

-- Índice PARCIAL: a captura pela web não manda client_batch_id, e vários
-- NULL não podem colidir entre si.
CREATE UNIQUE INDEX IF NOT EXISTS uq_inv_reads_batch_epc
  ON inventory_reads (client_batch_id, epc) WHERE client_batch_id IS NOT NULL;

-- Bancos já criados não são reprocessados pelo seed: concede aqui.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r, permissions p
 WHERE r.name = 'operator'
   AND p.code IN ('sectors:read', 'categories:read')
ON CONFLICT DO NOTHING;
