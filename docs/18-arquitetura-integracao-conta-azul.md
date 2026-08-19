# 18 — Arquitetura da Integração Conta Azul

Status: 2.1 concluída (homologada em 18/08/2026). 2.2 concluída (homologada em
18/08/2026 — identidade/health). 2.3 concluída (homologada em 18/08/2026 —
sync manual real, idempotência real, disconnect preserva dados financeiros).
2.4 concluída (homologada em 18–19/08/2026 — planner SCHEDULED incremental
real). 2.5 adiada para Fase 17 (histórico visual/retenção/métricas).
Projeto: Dashboard Economização

## 1. Decisão de contrato

A documentação interna (`docs/04`) cita endpoints OAuth antigos
(`auth.contaazul.com`). A documentação **oficial vigente** (consultada em
2026-08-17) prevalece:

| Peça | Valor oficial |
|---|---|
| Fluxo | OAuth 2.0 Authorization Code |
| Authorization URL | `https://login.contaazul.com/#/oauth/authorize` |
| Token URL | `https://api-v2.contaazul.com/oauth/token` |
| Scope | `openid profile aws.cognito.signin.user.admin` |
| Access token | `expires_in` ≈ 3600s |
| Refresh | retorna **novo** `refresh_token` (rotação obrigatória) |
| Authorization Code | validade de 3 minutos (`docs/04` §8, ainda válida) |
| PKCE | **não** documentado para este cliente confidencial |

Não há endpoint de revogação documentado. Disconnect é local: remove
`IntegrationCredential` e marca a Integration como `DISCONNECTED`.

### App de Desenvolvimento vs Produção

A documentação oficial (developers.contaazul.com) distingue:

- **App de Desenvolvimento:** redirect de testes fixa em `https://www.contaazul.com`.
  Não aceita callback customizado do Dashboard. Serve ao onboarding do Portal
  (ERP fictício / token de tutorial). Não usar esse token no produto.
- **App de Produção:** o titular cadastra a Redirect URI. Essa URI tem de ser
  **idêntica** em Portal, `CONTA_AZUL_REDIRECT_URI` e authorize/token exchange.
  Callback customizado (incluindo HTTPS de homologação) exige este tipo de app.

Homologação real 2.1 usou App de Produção e HTTPS temporário. Para um novo OAuth
real: URL HTTPS válida, atualizar Portal e `CONTA_AZUL_REDIRECT_URI` de forma
idêntica. Não persistir hostname de túnel temporário em código ou docs.

`id_empresa` **não** vem na resposta OAuth. A fase 2.2 obtém a identidade via
`GET /v1/pessoas/conta-conectada` e persiste `IntegrationExternalAccount`.

## 2. Modelo

```
Tenant 1 ──< Integration (provider=CONTA_AZUL, unique tenant+provider)
                 │ 1:1
                 ├── IntegrationCredential  (AES-256-GCM)
                 └── IntegrationExternalAccount  (id_empresa; 2.2)
```

Status: `DISCONNECTED` | `CONNECTED` | `ERROR`.

Expiração normal do access token **não** é ERROR. ERROR = falha de refresh
(reconectar).

Cardinalidade MVP: **uma** autorização Conta Azul por tenant.

## 3. Credenciais

| Segredo | Onde |
|---|---|
| `CONTA_AZUL_CLIENT_ID/SECRET` | env da aplicação (não por tenant) |
| `CONTA_AZUL_REDIRECT_URI` | env; mesma URI no authorize e no exchange |
| Tokens do tenant | `integration_credentials`, AES-256-GCM |
| `INTEGRATION_ENCRYPTION_KEY` | env, 32 bytes hex; nunca no banco |

## 4. State OAuth

Redis, TTL 10 minutos, single-use (`GETDEL`), bound a:

- tenantId
- actorUserId
- sessionId

Callback exige a **mesma sessão** administrativa que iniciou o fluxo.
Tenant do callback vem só do state, nunca da query.

## 5. Refresh

`getValidAccessToken(tenantId)`:

1. se access fresco (skew 5 min) → devolve
2. senão `SELECT … FOR UPDATE` na integração
3. revalida; se outro request já renovou, reutiliza
4. senão refresh; persiste access + **novo** refresh atomicamente

URLs do provider são constantes (allowlist). Timeout 15s. Sem retry agressivo.

## 6. API interna

- `GET /admin/tenants/:tenantId/integrations/conta-azul`
- `POST …/connect` → `{ authorizationUrl }`
- `POST …/verify` → DTO público (identity probe; não é sync)
- `POST …/sync` → 202 `{ syncRunId, status }`
- `GET …/sync/current` → `{ run }`
- `POST …/disconnect`
- `GET /integrations/conta-azul/callback` → redirect sanitizado para
  `/empresas/:id/integracoes?contaAzul=`

DTO público: `provider`, `status`, `connectedAt`, `disconnectedAt`,
`externalAccountId`, `externalCompanyName`, `lastSuccessfulSyncAt` (preenchido
só no SUCCESS total da 2.3; o identity probe não o altera),
`lastErrorAt`, `lastErrorCode` sanitizado.

Nunca inclui tokens, credenciais nem metadata completa.

Connect/verify bloqueados em tenant DISABLED e em Modo Suporte.
USER: 403. ADMIN/SUPER_ADMIN: gerenciam.

Identity probe (2.2): após callback OAuth e via `POST …/verify`.
Falha transitória (429/5xx/timeout) não apaga tokens nem marca ERROR.
401 persistente → `ERROR` / `identity_unauthorized`.
Colisão de `id_empresa` em outra Integration `CONNECTED` → `ERROR` /
`external_account_conflict` sem compartilhar credencial.

Disconnect remove `IntegrationCredential` e `IntegrationExternalAccount`.
A linha `Integration` permanece. Dados financeiros sincronizados (2.3) **não**
são apagados no disconnect.

## 7. UI

Hub da empresa → aba **Integrações**. Redirect completo (sem popup).
Confirm de desconexão pelo Design System (não `window.confirm`).
Card exibe empresa conectada, identificador externo, data de conexão,
“Nunca sincronizado” enquanto `lastSuccessfulSyncAt` é nulo, diagnóstico
amigável de `lastErrorCode` e ação **Verificar conexão**.
Quando `CONNECTED`: botão **Sincronizar agora**, estados de andamento via
`GET …/sync/current` (polling 2,5s, não é o scheduler 2.4), resumo de counts
após sucesso e mensagem amigável em falha.

## 8. Sincronização manual (2.3)

Job único `conta-azul-manual-sync` (BullMQ, uma fila, processo worker separado).
Payload: `syncRunId`, `tenantId`, `integrationId`. **Sem token.**
O worker chama `getValidAccessToken`. Rate limit local ≈ 8 req/s.

`SyncRun` é lock/status técnico, não histórico de produto. A fase 2.5
(histórico visual, retenção, métricas, listagem admin) foi adiada para
a Fase 17 — Logs, Auditoria e Observabilidade (decisão aprovada em
19/08/2026). O `SyncRun` existente suporta plenamente o Motor de
Sincronização, o diagnóstico mínimo e o primeiro Dashboard.
`lastSuccessfulSyncAt` só avança no sucesso total. Falha de sync não altera
`Integration.status` para ERROR.

Horizonte MVP default configurável: 5 anos anteriores + 2 anos futuros.
Homologação real 18/08/2026: ~33 s nesta conta (48 categorias, 1 conta,
0 pessoas, 12 a receber, 1266 a pagar); horizonte 5+2 classificado como
**adequado**. `CONTA_AZUL_CATEGORIES_ONLY_CHILDREN=false` foi o valor da
carga real. Incremental `data_alteracao_*` e o scheduler estão na 2.4
(homologada). A 2.3 permanece a carga FULL manual.

`GET /v1/pessoas` sem cadastro retornou `items: null`. Tolerância
homologada: **somente** `items === null` → `[]`. Demais divergências
(items de outro tipo, item/`id`/`nome` inválidos) continuam fail-fast.
Instrumentação sanitizada `conta_azul_sync_payload_invalid` permanece.

AR/AP exigem janela de vencimento; a primeira carga pagina 90 dias no horizonte
configurado (UTC civil, `from`/`to` inclusive, próxima janela no dia seguinte).

Rotas: `POST …/sync` (202) e `GET …/sync/current`.
API sem worker aceita o POST (202 + PENDING); o job espera no Redis até o
worker subir. O frontend não trata PENDING como sucesso.

Disconnect com SyncRun ativo: 409 `SYNC_IN_PROGRESS`.

`jobId` BullMQ = `syncRunId`. Timeout operacional:
`CONTA_AZUL_SYNC_JOB_TIMEOUT_MS` (30 min). Heartbeat por página, no mínimo a
cada 5s. Anos civis usam clamp (2024-02-29 − 5 anos = 2019-02-28).

### Recuperação de worker / run órfão

O processor tem `attempts: 1`. Enquanto o processo vive, o BullMQ renova o
lock (`lockDuration` 60s). Se o processo cai:

1. O lock expira. O próximo worker detecta stall (`stalledInterval` 30s,
   `maxStalledCount` 1) e reexecuta o mesmo job do início. A persistência é
   upsert por `(integration_id, external_id)`; não duplica. `engine.execute`
   ignora run já `SUCCESS`/`FAILED`.
2. Segundo stall no mesmo job → BullMQ falha o job; o handler `failed` marca
   o `SyncRun` como `FAILED`. `lastSuccessfulSyncAt` não avança.
3. Reconciliação **oportunística** (sem cron/scheduler), no `POST …/sync`,
   no `GET …/sync/current`, no disconnect e no startup do worker:

   Um run `PENDING`/`RUNNING` só é órfão se o job BullMQ **não** está vivo
   (`waiting`/`active`/`delayed`/…) **e** `heartbeatAt ?? startedAt` passou
   de `CONTA_AZUL_SYNC_JOB_TIMEOUT_MS`. Job waiting sem worker **não** é
   órfão. Job/heartbeat recentes **não** são órfãos.

   Órfão → `FAILED` `sync_stale_run`, lock liberado, novo POST pode devolver
   202. Sem SQL no fluxo normal.

Break-glass (só incidente fora desses sinais):

```sql
UPDATE sync_runs
SET status = 'FAILED',
    error_code = 'sync_stale_run',
    finished_at = NOW()
WHERE status IN ('PENDING', 'RUNNING');
```

Homologação real 2.3: sync GET-only; nenhuma mutação financeira no ERP.
Disconnect remove tokens e identidade; dados financeiros permanecem.

## 9. Sincronização automática incremental (2.4)

Homologada contra a Conta Azul real em 18–19/08/2026 (GET-only).
2.5 (histórico de produto / UI) **adiada para Fase 17** (decisão
aprovada 19/08/2026; não bloqueia Fases 8, 9 ou 10).

- Um Job Scheduler global (`conta-azul-plan-syncs`), `upsertJobScheduler`
  no boot, BullMQ 6.1.2. Sem scheduler por tenant. Sem cron. Sem
  `QueueScheduler` legado. Planner só fala com Postgres + Redis.
- Frequência default 60 min (`CONTA_AZUL_AUTO_SYNC_INTERVAL_MINUTES`,
  inteiro 5–1440). Jitter determinístico no delay do job de trabalho.
  Tick do planner: 1 min. Worker concurrency 1.
- Elegível: tenant ACTIVE, Integration CONNECTED, credential + identidade,
  `lastSuccessfulSyncAt` (baseline manual), sem run ativa, cursores com a
  mesma `externalAccountId`. `DISCONNECTED` / cursor sem identidade válida
  → skip (`disconnected` / `external_account_missing` / `identity_changed`).
- Scheduled = incremental. Manual = FULL. Categorias e contas = full barato
  também no automático. Pessoas = `data_alteracao_de/ate`. AR/AP = vencimento
  90d + `data_alteracao_de/ate` em `America/Sao_Paulo`, chunks ≤ 365d,
  overlap 2h. Sem FULL automática silenciosa.
- Cursor = upper bound da janela processada (`windowTo`). Janela vazia
  avança. Avanço por recurso após sucesso daquele recurso. Não usa
  `lastSuccessfulSyncAt` como watermark.
- AR/AP: janelas de vencimento 90d (como 2.3) + filtro de alteração
  (homologado: API aceitou a combinação; sem fallback silencioso).
- Downtime coalescido: um incremental cobre o gap; não há replay de ticks.
  Manual e scheduled compartilham o lock; planner skipa se já há run ativa.
- Identity change: `sync_identity_changed`; não mistura ERP; não apaga
  financeiro; não reseta cursor. Disconnect preserva cursor e não o usa.
  Reconnect no mesmo ERP reutiliza o cursor.
- 401 durante sync: um `forceRefresh` + retry; segundo 401 → run FAILED e
  Integration ERROR `identity_unauthorized`. Cobertura automatizada; não
  forçada na conta real.
- Deletes: ausência ≠ remoção física. Sem tombstone. Limitação conhecida.
- UI: card existente; frequência somente leitura; sem próxima execução;
  sem histórico. DTO: `autoSyncEligible`, `autoSyncIntervalMinutes`.

Observação de homologação (não é produção): a segunda `SCHEDULED` real
simulou due avançando o relógio da avaliação do planner.
`SyncRun.startedAt` refletiu esse relógio; engine/cursor/`finishedAt`
usaram wall-clock. Produção usa `Date` real.

