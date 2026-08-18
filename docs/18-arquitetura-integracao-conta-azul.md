# 18 — Arquitetura da Integração Conta Azul (OAuth 2.1)

Status: Concluída (fase 2.1 — homologada em 18/08/2026)
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

`id_empresa` **não** vem na resposta OAuth. `IntegrationExternalAccount`
fica para fase posterior, quando houver chamada autenticada à API de negócio.

## 2. Modelo

```
Tenant 1 ──< Integration (provider=CONTA_AZUL, unique tenant+provider)
                 │ 1:1
                 └── IntegrationCredential  (AES-256-GCM)
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

- `GET/POST /admin/tenants/:tenantId/integrations/conta-azul`
- `POST …/connect` → `{ authorizationUrl }`
- `POST …/disconnect`
- `GET /integrations/conta-azul/callback` → redirect sanitizado para
  `/empresas/:id/integracoes?contaAzul=`

DTOs nunca incluem tokens.

Connect bloqueado em tenant DISABLED e em Modo Suporte.
USER: 403. ADMIN/SUPER_ADMIN: gerenciam.

## 7. UI

Hub da empresa → aba **Integrações**. Redirect completo (sem popup).
Confirm de desconexão pelo Design System (não `window.confirm`).
