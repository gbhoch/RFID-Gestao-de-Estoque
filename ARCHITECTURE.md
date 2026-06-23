# Sistema Corporativo de Gestão Patrimonial com RFID

Documento de arquitetura, modelagem e guia de implementação.

---

## 1. Visão Geral

Aplicação web corporativa para controle e rastreamento de ativos patrimoniais
via etiquetas RFID passivas, lidas por handhelds móveis. Stack: **Angular 20 +
DevExtreme** (front), **NestJS + TypeORM + PostgreSQL** (back), **Docker** (infra).

A solução é modular e segue Clean Architecture / DDD, deixando a porta aberta
para os módulos futuros de **estoque** e **integração ERP** sem reescrita.

---

## 2. Arquitetura da Solução (alto nível)

```
                       ┌────────────────────────────────────────────┐
   Handheld RFID  ───► │  Gateway de Leitura (REST / WebSocket / TCP)│
   (leitor móvel)      └───────────────────┬────────────────────────┘
                                           │ EPC, RSSI, deviceId, ts
                                           ▼
  ┌──────────────┐   HTTPS   ┌──────────────────────────────────────┐
  │  Angular SPA │ ◄───────► │            NestJS  API (v1)           │
  │  DevExtreme  │   JWT     │  ┌─────────────────────────────────┐  │
  └──────────────┘           │  │ Presentation (Controllers/DTO)  │  │
                             │  ├─────────────────────────────────┤  │
                             │  │ Application (Use Cases/Services) │  │
                             │  ├─────────────────────────────────┤  │
                             │  │ Domain (Entities/Rules/Ports)   │  │
                             │  ├─────────────────────────────────┤  │
                             │  │ Infrastructure (TypeORM/Repos)  │  │
                             │  └─────────────────────────────────┘  │
                             └───────────────────┬──────────────────┘
                                                 ▼
                                       ┌──────────────────┐
                                       │   PostgreSQL     │
                                       └──────────────────┘

  Nginx reverse-proxy + TLS na borda. Tudo orquestrado por Docker Compose.
```

### Camadas (Clean Architecture)

| Camada | Responsabilidade | Depende de |
|---|---|---|
| **Domain** | Entidades, value objects, regras de negócio, *ports* (interfaces de repositório) | nada |
| **Application** | Casos de uso, orquestração, DTOs de entrada/saída | Domain |
| **Infrastructure** | TypeORM entities, repositórios concretos, adapters (RFID, ERP, e-mail) | Application + Domain |
| **Presentation** | Controllers HTTP, validação, Swagger, guards | Application |

Regra de dependência: as setas apontam sempre para dentro. Domain nunca importa
NestJS nem TypeORM.

---

## 3. Modelo de Domínio (entidades e relacionamentos)

- `User` N..1 `Role`; `Role` N..N `Permission`.
- `User` N..1 `Sector`.
- `Asset` N..1 `Category`, N..1 `Sector` (setor atual), N..1 `User` (responsável).
- `Asset` 1..0..1 `RfidTag` (um patrimônio possui no máximo uma etiqueta ativa).
- `AssetMovement` N..1 `Asset` (origem/destino de setor e responsável).
- `InventorySession` 1..N `InventoryRead`; cada read referencia um `RfidTag`/`Asset`.
- `AssetLocationHistory` N..1 `Asset`.
- `AuditLog`, `IntegrationLog`, `Notification`: transversais.

Diagrama textual em `database/DER.md`; DDL em `database/schema.sql`.

---

## 4. Segurança (OWASP + LGPD)

- Senhas com **bcrypt** (cost 12).
- **JWT** de acesso curto (15 min) + **refresh token** rotacionado e persistido
  com hash, permitindo revogação por sessão.
- **RBAC**: guard checa `permissions` resolvidas do perfil; decorator
  `@RequirePermission('assets:write')`.
- Rate limiting e bloqueio de conta após N falhas de login.
- Helmet, CORS restrito, validação estrita de payload (`class-validator`,
  `whitelist + forbidNonWhitelisted`).
- **Soft delete** em todas as entidades de negócio (`deletedAt`).
- **Auditoria** via interceptor + tabela `audit_logs` (usuário, IP, operação,
  diff de dados). Nenhuma ação crítica sem trilha.
- LGPD: minimização de dados pessoais, base legal documentada, suporte a
  exportação/anonimização do titular.

---

## 5. Integração RFID

`RfidIngestionService` aceita leituras por três canais que convergem para o
mesmo caso de uso `RegisterRfidReadUseCase`:

1. **REST** `POST /api/v1/rfid/reads` (handheld envia lote).
2. **WebSocket** `/ws/rfid` (streaming em tempo real durante inventário).
3. **TCP/SDK** adapter na infraestrutura (porta de integração isolada).

Payload normalizado: `{ epc, timestamp, deviceId, rssi, operatorId }`.
Toda leitura é persistida em `inventory_reads` e logada. A resolução EPC→Asset
é feita pela `RfidTagRepository`.

---

## 6. Integração ERP (preparação)

Camada `integration/erp` com porta `ErpSyncPort` e implementação *stub*. Cada
sincronização grava em `integration_logs` (`erpAssetId`, `syncedAt`, `status`).
Eventos de domínio (asset criado/baixado) publicam mensagens que o adapter ERP
consome — desacoplado via event emitter, pronto para fila (BullMQ/Rabbit) depois.

---

## 7. Entregáveis e estado

Esta entrega contém os fundamentos executáveis. Itens marcados ◑ têm base de
referência funcional pronta para expansão módulo a módulo.

| # | Entregável | Estado |
|---|---|---|
| 1 | Documentação funcional | ✅ (este doc + README) |
| 2 | Casos de uso | ✅ `docs/USE_CASES.md` |
| 3 | Arquitetura | ✅ |
| 4 | Estrutura Angular | ✅ `frontend/` |
| 5 | Estrutura NestJS | ✅ `backend/` |
| 6 | Modelagem PostgreSQL | ✅ `database/schema.sql` |
| 7 | DER | ✅ `database/DER.md` |
| 8 | APIs REST + Swagger | ✅ auth, users, sectors, categories, assets, rfid-tags, rfid-ingestion, movements, inventory, audit |
| 9 | Protótipos de tela | ✅ login, shell, dashboard, e grids/fluxos dos módulos acima |
| 10 | Backend completo | ✅ núcleo + 10 módulos; pendentes: reports (PDF/Excel), dashboard-metrics, ERP adapter |
| 11 | Frontend completo | ✅ shell + 8 telas; pendentes: relatórios e auditoria-UI |
| 12 | Dockerização | ✅ `docker-compose.yml` |
| 13 | Scripts de implantação | ✅ `deploy/` |
| 14 | Testes | ◑ unit: assets + inventário (regra de acuracidade) |
| 15 | Guia instalação/operação | ✅ `README.md` |

> **Pendentes** (mesmo molde, baixo custo): `ReportsModule` (exportação PDF/Excel
> com filtros — usar pdfmake/exceljs), `DashboardModule` (endpoints de métricas
> agregadas que substituem os dados mock do dashboard), `IntegrationModule`
> (adapter ERP gravando em `integration_logs`), e as telas de Relatórios e
> Auditoria no front (grid de `audit_logs` via o mesmo `RestStoreFactory`).

---

## 8. Padrão de um módulo vertical (replicar para cada CRUD)

```
backend/src/modules/<feature>/
  domain/        entity, repository.port.ts
  application/   dtos/, use-cases/, <feature>.service.ts
  infrastructure/ <feature>.orm-entity.ts, <feature>.repository.ts
  presentation/  <feature>.controller.ts
  <feature>.module.ts

frontend/src/app/features/<feature>/
  <feature>.routes.ts
  data/ <feature>.service.ts (DevExtreme CustomStore -> API)
  pages/ <feature>-list/  <feature>-form/
```

Cada novo módulo: 1 ORM entity + 1 repo + DTOs + use cases + controller no back;
1 CustomStore + DataGrid/Form no front. O módulo de Patrimônios entregue serve
de gabarito copiável.
