# Continuidade analítica conversacional (C.2.3 → C.2.7)

## Objetivo

Permitir que o usuário altere uma ou mais dimensões da investigação analítica anterior sem repetir a pergunta completa, preservando métrica, operação, janela temporal e evidência oficial.

Exemplo:

1. `Faturamento de Laranjeiras nos últimos três meses.`
2. `E de Jacaraípe?`

Esperado: mesma métrica BILLING, mesma operação VALUE, mesma MONTH_WINDOW (3 meses), novo `costCenterQuery`.

## Arquitetura LastAnalyticalQuery

Slot no `ADVISOR_CONVERSATION_BAG`:

- `slots.lastAnalyticalQuery`

Contrato (versão 1):

- `version`, `kind`
- `query`: `AnalyticalQuery` tipado (sem tenant/user/IDs internos)
- `capabilityKey`: allowlist coberta
- `executionStatus`: `OK` | `EMPTY`

Parser estrito (`parseLastAnalyticalQuery`):

- rejeita versões desconhecidas, campos extras, IDs, capabilities inexistentes/fora da cobertura, query incompatível com a capability.

## Ciclo de vida

Persistir somente após:

- query tipada válida;
- execução autorizada no registry;
- status `OK` / `EMPTY` / `EMPTY_RESULT`;
- resposta factual sustentada.

Não persistir: `FAILED`, `DENIED`, `AMBIGUOUS`, `NOT_FOUND`, prosa pura do provider, Pending não executado, USER_ASSUMPTION, tool intermediária.

Nova pergunta independente (`NEW_QUERY`) invalida o `lastAnalyticalQuery` **imediatamente**.
Se a nova investigação falhar depois, o contexto antigo **não** é restaurado
(política C.2.7 explícita e testada).

Composição não destrutiva com: `pendingAnalyticalAction`, `userAssumptions`, `costCenterOutflowMovements`, `counterparty`, `dailyCashMovement`.

## Dimension patch (C.2.4)

Classificação determinística: `CONTINUE` | `NEW_QUERY` | `CLARIFY`.

Patches allowlisted:

- período (preserva `MONTH_WINDOW.count`)
- `costCenterQuery` (texto; re-resolução no tenant)
- `limit`
- `direction`
- `metric` (somente se explícita — nunca silenciosa)

Após patch: `validateAnalyticalCapability` → executor oficial → resposta factual → atualiza last.

## Continuidade semântica (C.2.5)

Quando o classificador determinístico retorna `CLARIFY` e há prior + âncora de continuação:

- no máximo **1** chamada ao provider;
- provider só devolve `decision` + patch allowlisted;
- saída passa por parser/validação estrita;
- provider **não** executa, **não** escolhe IDs, **não** cria capabilities.

Follow-ups determinísticos: **0** chamadas extras.

## Precedência

Resolvida por intenção/compatibilidade (não captura cega):

1. PendingAnalyticalAction (ACCEPT inequívoco)
2. USER_ASSUMPTION (cenário ≠ fato)
3. C.1 `costCenterOutflowMovements`
4. `lastAnalyticalQuery` (CONTINUE)
5. planners normais
6. provider

Pending UNRELATED não bloqueia continuidade. Premissa de cenário não vira evidência oficial.

## Segurança multi-tenant

- bag por conversa/tenant;
- sem `tenantId` / `costCenterId` / `integrationId` no slot;
- entidades re-resolvidas no tenant atual na execução;
- SQL livre proibido.

## Cobertura de capabilities

Obrigatória:

| Key | Família |
|---|---|
| `billing.value.month` | BILLING consolidado MONTH |
| `billing.series.months` | BILLING consolidado MONTH_WINDOW |
| `billing.cost_center.month` | BILLING × COST_CENTER MONTH |
| `billing.cost_center.series.months` | BILLING × COST_CENTER MONTH_WINDOW |
| `realized_cash.cost_center.month.movements` | C.1 OUTFLOW MOVEMENTS × COST_CENTER |

Demais famílias: integrar só com contrato seguro; sem mapeamentos inventados.

## Preservação de métricas

- BILLING ≠ REALIZED_CASH INFLOW
- BILLING ≠ RECEIVABLE_STOCK
- CASH_RESULT ≠ lucro contábil
- Patch de métrica exige solicitação explícita

## C.2.7 — estabilização

Correções de release após auditoria B:

- **F** — mudança explícita BILLING → REALIZED_CASH INFLOW via capability
  `realized_cash.cost_center.month.lookup` (sem inventar métrica nova).
- **G** — pergunta composta NEW_QUERY vs continuidade MOVEMENTS (C.1 composite).
- **D** — patch de quantidade no entrypoint (`E os dez maiores?`).
- **H** — Pending ALTERNATIVES: ACCEPT genérico clarifica; SELECT A/B materializa;
  A+B ambíguo clarifica; UNRELATED não bloqueia last.
- Resolução temporal: `"os dez maiores"` não vira dezembro.
- Provas de persistência A–H no entrypoint/builders.

## Limitações

- Continuidade composta ambígua ainda pode cair em CLARIFY.
- Capabilities fora da cobertura inicial → limitação factual.
- Sem LastAnalyticalQuery para comparações multi-tool arbitrárias nesta fase.
- Homologação com dados financeiros reais: **PENDENTE** (não acessada produção).
- Pending ALTERNATIVES permanece WIP misturado em `send-advisor-message.ts`
  (integração segura apenas; arquitetura WIP não reescrita).

## Testes

Suites:

- `backend/tests/advisor-analytical-continuity.unit.test.ts` — C.2.3–C.2.6
- `backend/tests/advisor-c27-stabilization.unit.test.ts` — C.2.7 F/G/D/H + persistência
- `backend/tests/resolve-advisor-period.unit.test.ts` — desambiguação `dez` × dezembro

Cobre parser, bag, casos A–E (classificação/patch), T2/T3/T5/T6/T9/T10/T11/T27/T30,
provider patch inválido, F/G/D/H multi-turno, regressões C.1/C.2.1/C.2.2/Pending/
USER_ASSUMPTION via battery conjunta.

## Arquivos principais

- `last-analytical-query.ts`
- `analytical-dimension-patch.ts`
- `classify-analytical-continuity.ts`
- `run-analytical-continuity-answer.ts`
- `resolve-semantic-analytical-continuity.ts`
- `build-last-analytical-query-from-answer.ts`
- `advisor-conversation-bag.ts`
- `send-advisor-message.ts`
