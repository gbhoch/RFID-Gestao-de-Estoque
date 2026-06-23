# Casos de Uso

## Atores
- **Administrador** — acesso total.
- **Gestor** — patrimônios, inventários, relatórios.
- **Operador** — inventários e movimentações.
- **Auditor** — somente leitura.
- **Leitor RFID (sistema externo)** — envia leituras.

## UC-01 Autenticar
Ator: todos. Fluxo: login → valida credenciais (bcrypt) → emite JWT + refresh.
Exceções: senha inválida incrementa `failed_attempts`; ao atingir o limite,
`status=blocked` + `blocked_until`. Refresh rotaciona token e revoga o anterior.

## UC-02 Gerenciar Usuários
Ator: Admin. Criar/editar/excluir(soft)/bloquear/ativar. Toda ação audita.

## UC-03 Gerenciar RBAC
Ator: Admin. Atribui permissões a perfis; usuário herda do perfil.

## UC-04 Cadastrar Patrimônio
Ator: Gestor/Admin. Valida unicidade de `asset_code`. Opcionalmente associa
etiqueta RFID (deve estar `active` e livre). Registra localização inicial.

## UC-05 Associar/Desassociar Etiqueta
Ator: Gestor. Regra: etiqueta livre + ativa. Ao associar, status da tag → `in_use`.
Ao desassociar/baixar, volta a `active`/`retired`. Gera histórico da etiqueta.

## UC-06 Movimentar Ativo
Ator: Operador/Gestor. Transferência de setor, troca de responsável, empréstimo,
baixa, retorno de manutenção. Atualiza `assets` e grava `asset_movements` +
`asset_location_history`. Atualiza `status` conforme tipo.

## UC-07 Inventário RFID
Ator: Operador. Inicia sessão por setor → recebe leituras (REST/WS) → resolve
EPC→asset → marca encontrados → calcula esperados/encontrados/divergentes e
taxa de acuracidade → finaliza. Itens lidos fora do setor marcados
`is_unexpected`.

## UC-08 Rastrear Localização
Ator: Auditor/Gestor. Consulta linha do tempo de `asset_location_history`.

## UC-09 Dashboard
Ator: Gestor/Admin. Cards e gráficos agregados em tempo real.

## UC-10 Relatórios
Ator: Gestor/Auditor. Exporta PDF/Excel com filtros avançados.

## UC-11 Auditoria
Ator: Auditor/Admin. Consulta `audit_logs` com filtros por usuário/operação/data.

## UC-12 Ingestão RFID
Ator: Leitor RFID. `POST /rfid/reads` ou WebSocket. Persiste e loga toda leitura.
