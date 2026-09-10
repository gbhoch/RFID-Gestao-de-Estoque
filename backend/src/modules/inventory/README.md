# Módulo Inventory — coleta × julgamento

## O modelo

O inventário **não** julga nada durante o levantamento. Ele separa duas fases:

1. **COLETA (fato bruto).** Enquanto o operador varre os setores, o sistema só grava
   `InventoryRead`: "o EPC X foi lido no setor Y em Z". Nenhuma inconsistência é calculada.
2. **JULGAMENTO (conciliação).** Só acontece **quando o inventário inteiro é finalizado**,
   com todas as leituras de todos os setores visitados disponíveis.

### Por que adiar a conciliação?

Porque "faltar em TI" e "sobrar em Marketing" são o **mesmo fato** (o ativo se moveu) — e só dá
para reconhecê-los como um só com a visão completa. Calcular na hora produziria divergências
duplicadas e falsos positivos de setores vizinhos. Adiando, os cenários se resolvem sozinhos,
sem lógica de "desfazer":

- **A** — ativo de TI lido em Marketing → **1** `location_mismatch` (não dois).
- **B** — tag de Marketing capturada por engano na TI e depois lida no Marketing → **nenhuma**
  divergência (o setor de cadastro está entre os setores onde foi lida).
- **C** — ativo da Gerência em manutenção lido na TI → `location_mismatch` (resolvido com
  `justified`).

## Hierarquia

```
Inventory (1)  ──►  InventorySectorVisit (N)  ──►  InventoryRead (N)
     │
     └──►  InventoryDiscrepancy (N, geradas no finish)
```

- Só existe **um** inventário aberto (`in_progress`/`paused`) por vez.
- Escopo **aberto**: setores entram conforme são visitados; um setor `completed` pode ser
  reaberto para leituras adicionais.
- Conciliação considera apenas setores `completed`. Ativos de setores não visitados ficam
  **fora do escopo** (não viram `not_found`).

## Tipos de divergência e desfechos

| Tipo | Quando | Desfechos |
|------|--------|-----------|
| `location_mismatch` | esperado, mas lido só em outro(s) setor(es) visitado(s) | `accept_location`, `justified` |
| `not_found` | esperado e não lido em nenhum setor visitado | `mark_missing`, `justified` |
| `unknown_tag` | EPC lido sem asset correspondente | `register_tag`, `justified` |

Efeitos (transacionais, auditados): `accept_location` move o ativo e cria um `AssetMovement`
`sector_transfer`; `mark_missing` marca `asset.status='missing'`; `register_tag` cria a etiqueta
(`source='reader'`); `justified` só registra a nota (obrigatória).

## Conciliação como função pura

O algoritmo vive em `domain/reconciliation.ts` como função **pura** (`reconcile(input)`), sem
dependência de banco — é o núcleo e está coberto por `test/inventory.reconciliation.spec.ts`
(cenários A, B, C, fora do escopo, `unknown_tag`, `not_found`).

## Aplicar a migração

```bash
# Docker:
docker compose exec -T postgres psql -U rfid -d rfid_assets \
  < database/migrations/2026-07-08_inventory_rework.sql
```

A migração **descarta** as tabelas antigas (`inventory_sessions`, `inventory_reads`) e cria
`inventories`, `inventory_sector_visits`, `inventory_reads` (novo formato) e
`inventory_discrepancies`, além de `rfid_tags.source`. É idempotente (`IF NOT EXISTS`).
