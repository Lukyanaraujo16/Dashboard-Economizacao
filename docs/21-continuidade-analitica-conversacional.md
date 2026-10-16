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
| `realized_cash.cost_center.window.movements` | OUTFLOW MOVEMENTS × COST_CENTER × MONTH_WINDOW (A2) |

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

## Marco A2 — interpretação estruturada compartilhada

Incidente: "Qual o maior gasto de X nos últimos três meses?" respondia "Não encontrei
esse centro de custo." O planner C.1 reextraía o centro por regex (a menção levava o
período junto), "três meses" virava `limit=3` e a janela virava o mês corrente.

Contrato único (`advisor-question-interpretation.ts`), calculado uma vez no orquestrador:

- **período**: `MONTH` | `MONTH_WINDOW` ("últimos N meses", "de agosto a outubro") |
  anáfora ("nesse período", herda o período da investigação anterior) | `UNSUPPORTED`
  (trimestre, semestre, ano, "último mês", janela > 24). "Últimos N meses" = N meses
  civis inclusivos terminando no mês de referência — a mesma regra de
  `billing.series.months` (`listAdvisorMonthWindowKeys`);
- **spans de período mascarados** antes de qualquer extração de entidade ou cardinalidade;
- **cardinalidade**: `TOP_1` ("maior gasto", "gasto mais alto") | `TOP_N`; número de
  período nunca vira limite;
- **entidade**: centro resolvido no catálogo do tenant (`detectExplicitCostCenterScope`)
  é usado pelo nome oficial; handlers não reextraem. Menção textual só quando o catálogo
  não decidiu; a tool continua sendo a verificação final.

Precedência: depois do Pending gate, uma `NEW_QUERY` explícita invalida o `last` de forma
central (antes dos handlers de família). Uma falha posterior não deixa contexto antigo vivo.

Capability nova (deny by default continua): `realized_cash.cost_center.window.movements`
(REALIZED_CASH × OUTFLOW × COST_CENTER × MONTH_WINDOW × MOVEMENTS). É o mesmo motor mensal
de `cash_cost_center_movement_lines` (rateio CC1, deduplicação por baixa) chamado mês a
mês; a janela só ordena a união pelo valor atribuído ao centro. Mês sem atribuição oficial
fica fora com aviso (`PARTIAL`, sem promover `last`). Não há janela para outras métricas:
caixa realizado em janela fora dessa capability recebe limitação explícita, nunca mês
silencioso. Troca de métrica a partir de uma janela também não converte para mês.

Desfechos distintos: centro inexistente (só quando o catálogo não reconhece), ambíguo
(lista candidatos), centro herdado que saiu do cadastro, período sem regra oficial,
ausência de lançamentos e mês indisponível.

A2.1 — escopo de centro sem regra de cliente: um token identifica um centro só se for
exclusivo dele no catálogo do próprio tenant; token presente em todos os centros (prefixo
de marca) não discrimina; token comum a parte dos centros gera AMBIGUOUS com candidatos;
nome completo mais longo vence nome contido nele. "Maior despesa" segue a família de
saída realizada (homologada) e a resposta diz a métrica; "maior movimentação" sem direção
pede esclarecimento.

Testes de contrato: `backend/tests/advisor-a2-interpretation-contract.unit.test.ts`.

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
