# Gestão Patrimonial RFID — Guia de Instalação e Operação

Sistema corporativo full-stack para controle e rastreamento de ativos via RFID.
Angular 20 + DevExtreme · NestJS + TypeORM · PostgreSQL · Docker.

## Estrutura do repositório

```
rfid-asset/
├── ARCHITECTURE.md        # Arquitetura, segurança, integrações, roadmap
├── docker-compose.yml     # Orquestração completa
├── database/
│   ├── schema.sql         # DDL completo (tabelas, enums, índices, FKs)
│   └── DER.md             # Diagrama entidade-relacionamento
├── docs/USE_CASES.md      # Casos de uso por ator
├── backend/               # API NestJS (Clean Architecture / DDD)
│   └── src/modules/{auth,assets,rfid,...}
├── frontend/              # SPA Angular + DevExtreme
└── deploy/deploy.sh       # Script de implantação Linux
```

## Pré-requisitos
- Docker + Docker Compose, **ou** para desenvolvimento local: Node 22+, PostgreSQL 16.

## Subir tudo com Docker (recomendado)

```bash
# defina segredos JWT antes (produção)
export JWT_ACCESS_SECRET=$(openssl rand -hex 32)
export JWT_REFRESH_SECRET=$(openssl rand -hex 32)

./deploy/deploy.sh
```

- Frontend: http://localhost:8080
- API + Swagger: http://localhost:3000/api/docs
- Login inicial: **admin / Admin@123** (troque imediatamente)

O `schema.sql` é aplicado automaticamente na criação do banco. O seed cria
perfis (admin/manager/operator/auditor), todas as permissões e o usuário admin.

## Desenvolvimento local

Backend:
```bash
cd backend
cp .env.example .env
npm install
npm run seed        # popula perfis/permissões/admin
npm run start:dev   # http://localhost:3000
npm test            # testes unitários
```

Frontend:
```bash
cd frontend
npm install
npm start           # http://localhost:4200
```

## Fluxo de autenticação
1. `POST /api/v1/auth/login` → `{ accessToken, refreshToken }`.
2. Front guarda os tokens e injeta `Authorization: Bearer` em toda requisição.
3. Em 401, o interceptor chama `POST /api/v1/auth/refresh` (rotação) e repete a
   chamada original; falhando, faz logout.
4. RBAC: cada rota protegida exige uma permissão (`assets:read`, `assets:write`...).

## Integração com o coletor Android (`../RfidInventory`)

O coletor TSL é **cliente do inventário**, não um canal de ingestão paralelo. Faz
pela API o mesmo fluxo da tela web:

1. `POST /api/v1/auth/login` — operador (perfil `operator`).
2. `GET /api/v1/inventory/current` e `GET /api/v1/sectors` — contexto, cacheado no
   aparelho para o operador trabalhar sem rede.
3. `POST /api/v1/inventory/:id/sectors` — abre/retoma a visita (idempotente).
4. `POST /api/v1/inventory/:id/reads` — leituras, com **`clientBatchId`** como chave
   de idempotência (índice único parcial `(client_batch_id, epc)`): o app reenvia o
   mesmo lote quando a resposta se perde, e o servidor ignora a repetição.

Três regras existem por causa do modo offline:

- Coleta que chega com o setor já `completed` **reabre a visita** em vez de recusar.
- Inventário `in_progress` **ou `paused`** aceita leitura — leitura é fato bruto.
- Inventário encerrado responde **409 `INVENTORY_FINISHED`** (não 400): o app segura a
  coleta em vez de descartá-la. O gestor usa `PATCH /api/v1/inventory/:id/reopen`, que
  só é permitido enquanto nenhuma divergência tiver sido resolvida.

Aplicar a migração antes de usar o coletor:

```bash
docker compose exec -T postgres psql -U rfid -d rfid_assets \
  < database/migrations/2026-08-24_inventory_reads_collector.sql
```

### Outros canais de leitura (avulsa, não inventário)
- `POST /api/v1/rfid/reads` — resolve EPC → ativo e loga; exige `rfid:read`.
- Tempo real: WebSocket em `/ws/rfid`, evento `rfid:read`; o servidor faz broadcast
  de `rfid:resolved`.
- Leitor de mesa para comissionar etiqueta: agente `reader-bridge/` no Windows.
## O que está pronto e como expandir
Veja a seção 7 e 8 de `ARCHITECTURE.md`. Núcleo de segurança, módulo de
Patrimônios (vertical completa de referência) e ingestão RFID estão
implementados. Os demais CRUDs (usuários, setores, categorias, movimentações,
inventário, relatórios, auditoria) replicam o **molde vertical** do módulo de
Patrimônios — cada um é ~5 arquivos no backend e 2 componentes no frontend.

## Operação e manutenção
- **Backups**: `docker compose exec postgres pg_dump -U rfid rfid_assets > backup.sql`.
- **Logs**: `docker compose logs -f backend`.
- **Migrations** (após estabilizar entidades): `npm run migration:generate` / `migration:run`.
- **Auditoria**: toda ação crítica grava em `audit_logs`; nada é apagado
  fisicamente (soft delete via `deleted_at`).
- **LGPD**: dados pessoais minimizados; suporte a exportação/anonimização do titular.

## Segurança em produção (checklist)
- [ ] Trocar `JWT_*` por segredos fortes e a senha do admin.
- [ ] Terminar TLS no Nginx de borda.
- [ ] Restringir `CORS_ORIGIN`.
- [ ] Ativar rate limiting e monitoramento.
- [ ] Rotacionar credenciais do PostgreSQL e restringir a porta 5432.
