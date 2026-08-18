# ADR-050 — OAuth Conta Azul e cifração de tokens

## Título

Authorization Code por tenant, tokens AES-256-GCM e refresh com lock

## Status

ACEITA

## Data

2026-08-17

## Contexto

A fase 2.1 precisa conectar cada Empresa/Tenant à sua própria conta Conta Azul.
Não havia tabela `Integration`, nem serviço de cifração reversível (Argon2id
serve só a senhas). `docs/04` documenta URLs OAuth que divergem da documentação
oficial atual.

## Decisão

1. **Contrato oficial vigente** (developers.contaazul.com, 2026-08-17):
   Authorization Code; authorize `https://login.contaazul.com/#/oauth/authorize`;
   token `https://api-v2.contaazul.com/oauth/token`; scope
   `openid profile aws.cognito.signin.user.admin`. Sem PKCE (não documentado
   para cliente confidencial server-side).

2. **Modelo mínimo evolutivo:** `integrations` (1 por `tenant_id+provider`) +
   `integration_credentials` 1:1 com access/refresh cifrados. Sem
   `conta_azul_tokens`. Sem `integration_external_accounts` nesta fase
   (`id_empresa` não vem no token).

3. **AES-256-GCM** com `INTEGRATION_ENCRYPTION_KEY` (32 bytes hex) fora do
   banco. Envelope `v1.{iv}.{ciphertext}.{tag}`.

4. **State** efêmero no Redis (TTL 10 min), single-use, ligado a sessão + ator
   + tenant. Callback não conclui em sessão anônima ou divergente.

5. **Refresh** com `SELECT FOR UPDATE` na linha da integração; persiste o novo
   refresh_token. Skew de 5 minutos. Falha → status `ERROR` (não confundir com
   expiração normal).

6. **Redirect URI** same-origin via rewrite Next (`/integrations/*`), para o
   cookie de sessão acompanhar o callback.

## Alternativas consideradas

| Alternativa | Motivo da rejeição |
|---|---|
| URLs de `docs/04` (`auth.contaazul.com`) | Divergem da documentação oficial atual |
| Tokens plaintext no PostgreSQL | Violação explícita da fase |
| PKCE | Não exigido/documentado para este fluxo |
| N contas Conta Azul por tenant | PRD CA-001: uma autorização por empresa |
| Broadcast/job de cleanup de state | TTL Redis é suficiente |
| Revogação remota | Endpoint não documentado |
| App de Desenvolvimento para callback do Dashboard | Redirect fixa `https://www.contaazul.com`; callback customizado exige App de Produção |

## Consequências

- Próximos módulos financeiros usam só `getValidAccessToken(tenantId)`.
- Rotação do refresh torna refresh concorrente sem lock inaceitável.
- Key rotation de `INTEGRATION_ENCRYPTION_KEY` não está nesta fase.
- Homologação real (18/08/2026) confirmou OAuth, cifração, refresh e rotação;
  a conexão da conta ERP de teste foi desconectada localmente no fechamento.
- Novo OAuth real exige Redirect URI HTTPS válida, idêntica no Portal e no env.
