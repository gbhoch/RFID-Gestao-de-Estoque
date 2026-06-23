# Diagrama Entidade-Relacionamento (DER)

```
                       ┌──────────────┐         ┌────────────────┐
                       │    roles     │◄───────►│  permissions   │
                       └──────┬───────┘  (role_permissions)
                              │ 1
                              │
                              │ N
┌──────────────┐ 1     N ┌────▼─────┐ N     1 ┌──────────────┐
│   sectors    │◄────────┤  users   ├────────►│    roles     │
└──────┬───────┘ manager └────┬─────┘
       │ 1                    │ 1
       │                      │ owner / operator
       │ N                    │
┌──────▼───────────────────────────────────────────┐
│                     assets                        │
│  category_id ─► categories (N:1)                  │
│  sector_id   ─► sectors    (N:1)                  │
│  owner_id    ─► users      (N:1)                  │
│  rfid_tag_id ─► rfid_tags  (1:0..1, UNIQUE)       │
└──┬──────────────┬───────────────┬─────────────────┘
   │1             │1              │1
   │N             │N              │N
┌──▼───────────┐ ┌▼──────────────────────┐ ┌▼──────────────────────────┐
│asset_        │ │ asset_movements       │ │ asset_location_history     │
│location_     │ │ (from/to sector+owner)│ │ (sector, reader, recorded) │
│history       │ └───────────────────────┘ └────────────────────────────┘
└──────────────┘

┌────────────────────┐ 1      N ┌──────────────────┐
│ inventory_sessions │◄─────────┤ inventory_reads  │──► assets / rfid_tags
└────────────────────┘          └──────────────────┘

Transversais (sem FK obrigatória de negócio):
  audit_logs ──► users        integration_logs ──► (erp)
  notifications ──► users      refresh_tokens / password_resets ──► users
```

## Cardinalidades-chave
- **1 patrimônio → 0..1 etiqueta RFID** garantido por `assets.rfid_tag_id UNIQUE`.
- **1 etiqueta → no máximo 1 patrimônio** (mesma constraint).
- Históricos (`movements`, `location_history`, `inventory_reads`, `audit_logs`)
  nunca são apagados fisicamente — preservação total exigida.
