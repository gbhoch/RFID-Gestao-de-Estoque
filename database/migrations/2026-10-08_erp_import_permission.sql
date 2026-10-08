-- =====================================================================
-- Permissão erp:import (POST /api/v1/erp/import). IDEMPOTENTE.
--
-- A importação cria/atualiza categorias, setores e ativos a partir do ERP
-- Oracle; é uma operação administrativa, concedida só ao perfil 'admin'.
-- Bancos já criados não são reprocessados pelo seed: concede aqui (o seed
-- também foi atualizado para bancos novos).
--
-- Após aplicar, o usuário precisa fazer login de novo: as permissões vão
-- no token JWT emitido no login.
--
-- Aplicar:
--   docker compose exec -T postgres psql -U rfid -d rfid_assets \
--     -v ON_ERROR_STOP=1 < database/migrations/2026-10-08_erp_import_permission.sql
-- =====================================================================

BEGIN;

INSERT INTO permissions (code, module, description)
SELECT 'erp:import', 'erp', 'import erp'
 WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE code = 'erp:import');

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r
  JOIN permissions p ON p.code = 'erp:import'
 WHERE r.name = 'admin'
   AND NOT EXISTS (
     SELECT 1 FROM role_permissions rp
      WHERE rp.role_id = r.id AND rp.permission_id = p.id
   );

COMMIT;
