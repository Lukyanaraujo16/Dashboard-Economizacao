Dashboard Economização

11 — Regras Analíticas e Decisões Financeiras

Status: Em elaboração
Projeto: Dashboard Economização
Tipo: Fonte normativa das regras do Motor Analítico

Decisões D1–D9: APROVADAS (19/08/2026). Este arquivo é a fonte
normativa única. Outros documentos referenciam esta fonte; não
duplicar fórmulas completas.
Implementação 9A (estoque AR/AP, timezone America/Sao_Paulo): CONCLUÍDA.
9B (inadimplência, fórmula §4): CONCLUÍDA.
9C (próximos vencimentos + fluxo previsto 90 dias): CONCLUÍDA.
Grupo A (itens 1–9 do motor, §15): IMPLEMENTADO / CONCLUÍDO.
Fase 9: CONCLUÍDA NO RECORTE DO PRIMEIRO DASHBOARD (Grupo A).
P1.1 (20/08/2026): a Home é month-scoped. selectedMonth é contexto global.
Estoque AR/AP permanece no motor e nos endpoints; não alimenta os KPIs principais.
MVP financeiro completo: NÃO.
F11-A (23/08/2026): CONCLUÍDA — congelamento de escopo da Home.
Home = competência mensal civil (`month=YYYY-MM`, `competenceDate`,
`America/Sao_Paulo`). FILTER-001/005 (ranges diários) NÃO na Home.
F11-B1: CONCLUÍDA (contrato backend).
F11-B2: HOMOLOGADA. F11-B3: CONCLUÍDA (24/08/2026).
F11-B completa (recorte mensal): SIM.
F11-C: ADIADA / RECLASSIFICADA — pouso oficial Relatórios / F12-A
(intervalo De/Até YYYY-MM de competência; não dias soltos).
Fase 11 Home: CONCLUÍDA no recorte mensal.
F12-A (24/08/2026): CONTRATO CONGELADO. Paridade com monthly-revenue /
monthly-expenses. Taxa de inadimplência de estoque (D2) não varia com
De/Até. Ledger CASH-2 persistido no HEAD (`financial_transactions`).
KPI de caixa / Home: CASH-4B — cards principais = MonthlyCashFlow (caixa).
CASH-4C — visualizações / leitura / gráficos da Home = caixa (sem competência).
CASH-4A = infra fetch/view-model. CASH-3A: domínio `MonthlyCashFlow`. CASH-3B:
`GET /dashboard/monthly-cash-flow`. CASH-7: backfill LOCAL do ledger
(Clínica Life) executado; produção NÃO. CASH-8A: R3/R4 no código;
Correção 10-C: flag default true no sync contínuo; saneamento histórico
pontual de produção não executado nesta etapa.
Semântica: `netAmount` / `occurredOn`.
Faturamento oficial (Felipe, 26/08/2026): `realized.inflows + expected.receivables`.
Despesas oficiais (Felipe, simétrico): `realized.outflows + expected.payables`.
Resultado da Home: `billing − monthlyExpenses`. Vencidos AR/AP fora dos totais.
Meta (opção A): `actual = billing` (CASH-4B).
Pagamento tardio no mês da baixa. Competência não define Faturamento/Despesas.
F12-B (24/08/2026): IMPLEMENTADA / HOMOLOGADA TECNICAMENTE — Relatório de
Receita reutiliza o motor mensal (D1/D8/D9/CC1). F12-C (25/08/2026):
IMPLEMENTADA / HOMOLOGADA TECNICAMENTE — PDF/XLSX formatam o mesmo
resultado; sem motor financeiro paralelo. F12-D (25/08/2026): IMPLEMENTADA /
HOMOLOGADA TECNICAMENTE — Relatório de Despesas reutiliza
`getMonthlyCompetenceExpenses`; PDF/XLSX formatam o mesmo DTO.

⸻

1. Propósito

Este documento é a fonte normativa única das regras financeiras do
Motor Analítico (Fase 9). Cada KPI oficial do produto deve ter sua
definição, fórmula, campos utilizados e limitações conhecidas registrados
aqui antes de qualquer implementação.

Princípio transversal aprovado (19/08/2026):

"Nenhum KPI deve receber um nome financeiro cuja semântica não seja
sustentada pelos dados e pela fórmula oficial."

Consequências desse princípio:

* não inventar faturamento sem definição de fonte;
* não inventar rateio sem valor por categoria;
* não reconstruir caixa histórico sem movimentos reais (ledger);
* não transformar vencimento em competência;
* não delegar cálculo financeiro ao LLM;
* não simular fotografia histórica (as-of) com o estoque atual.

O Motor Analítico deve ser reutilizável por: Dashboard, Relatórios,
Consultor Financeiro e Insights Proativos, com a mesma fórmula.

D1–D9 são regras ANALÍTICAS (Fase 9 / apresentação Fase 10).
Não alteram schema, persistência, sincronização nem external IDs.

⸻

2. Semânticas temporais aprovadas

O sistema opera com três semânticas temporais distintas.
Não usar uma como substituta das outras:

COMPETÊNCIA
Campo: `competenceDate`
Uso: quando o indicador representar o período em que o fato econômico
ocorreu, independentemente do pagamento. Pode ser nulo; só usar quando
suportado por dados completos.

VENCIMENTO
Campo: `dueDate`
Uso: agenda financeira, títulos a vencer, títulos vencidos, fluxo de
caixa previsto. Sempre presente em AR/AP.

CAIXA REALIZADO
Campo: data efetiva de recebimento/pagamento por movimento individual.
Situação atual: não persistido. Exige ampliação da integração (endpoint
de baixas/movimentos). `paid` acumulado não substitui ledger temporal.

Regra: não usar `dueDate` como proxy universal de competência.
Não usar `paid` acumulado para reconstruir fluxo por período.
Não usar `competenceDate` para fluxo previsto.

Timezone analítico oficial (D1 / D5): `America/Sao_Paulo`.
Não usar timezone do servidor como regra de negócio.

⸻

3. Saldo vencido — definição de OVERDUE (D1, D5, D6)

Aprovado em 19/08/2026.

O Motor Analítico deve derivar o estado "vencido" deterministicamente.

Timezone: `America/Sao_Paulo`.
"Hoje" = dia civil corrente nesse timezone.
Fronteira = início desse dia civil.

Um título está vencido quando:

  unpaid > 0
  AND
  status IN (OPEN, OVERDUE, PARTIALLY_PAID)
  AND
  dueDate < hoje

`dueDate == hoje` NÃO está vencido (pertence a "a vencer" / agenda).

Em data civil: `dueDate < hoje` equivale a `dueDate <= ontem`.
Não usar `dueDate <= hoje`.

O status persistido `OVERDUE` e o `upstreamStatus` da Conta Azul
permanecem para rastreabilidade. NÃO são a fonte primária da decisão
analítica de vencimento.

Razão: o ERP pode não atualizar o status em tempo real; a derivação
interna garante consistência entre tenants e independência do upstream.

Não persistir coluna `isOverdue`. É derivável.

⸻

4. Inadimplência (D1, D2, D9)

Aprovado em 19/08/2026.

Nome oficial: Taxa de Inadimplência

Definição semântica (snapshot do estoque atual):
"Do que ainda está em aberto hoje, quanto já venceu?"

Fórmula conceitual:

  taxa_inadimplência =
    Σ unpaid [título vencido em aberto]
    ÷
    Σ unpaid [todos os títulos em aberto]
    × 100

Onde (D1 / D3 / D6):
  hoje = dia civil corrente em America/Sao_Paulo (início do dia)
  título vencido em aberto = unpaid > 0
    AND status IN (OPEN, OVERDUE, PARTIALLY_PAID)
    AND dueDate < hoje
  título em aberto = unpaid > 0
    AND status IN (OPEN, OVERDUE, PARTIALLY_PAID)
  status excluídos dos valores ativos: PAID, LOST, RENEGOTIATED, UNKNOWN

D2 — Filtro temporal (primeiro recorte):

Inadimplência é SNAPSHOT DO ESTOQUE ATUAL.
Usa sempre a data civil corrente (D1).
Filtro de mês/período NÃO altera a data de referência.
Não recalcular como fotografia histórica (as-of) daquele período.
Não simular estado histórico com o estoque atual.
Comparação histórica / coorte / as-of fica fora deste recorte e
exigirá modelagem própria futura.

NÃO é eficiência de cobrança de coorte. Uma métrica futura baseada em
"valor vencido / valor que venceu no período" poderá existir mas não é
esta definição.

D9 — Denominador zero:

Não dividir. Não retornar Infinity/NaN. Não retornar 0% como se a
taxa tivesse sido calculada.

Contrato analítico: valor da taxa = null.

Representação visual pertence à Fase 10 (poderá usar "—" ou estado
vazio com copy). Não consolidar "N/A" como regra financeira.

Distinguir:
  "não há valores em aberto" (taxa null, há sync)
  de
  "dados ainda não sincronizados" (via lastSuccessfulSyncAt / estado
  dos dados — não transformar null em 0).

Campos necessários: `unpaid` (Decimal), `dueDate` (Date), `status`.
Todos presentes no schema atual.

⸻

5. Contas a receber

Análises suportadas com dados atuais. Status ativos:
OPEN, OVERDUE, PARTIALLY_PAID.
RENEGOTIATED, PAID, LOST e UNKNOWN não entram nos totais ativos (D3).

A. Total em aberto
   Σ unpaid WHERE status IN (OPEN, OVERDUE, PARTIALLY_PAID)
   Campo: `unpaid`

B. Total vencido (em aberto)
   Σ unpaid WHERE status IN (OPEN, OVERDUE, PARTIALLY_PAID)
              AND dueDate < hoje
   Campo: `unpaid`, `dueDate`

C. Total a vencer (em aberto)
   Σ unpaid WHERE status IN (OPEN, OVERDUE, PARTIALLY_PAID)
              AND dueDate >= hoje
   Campo: `unpaid`, `dueDate`

D. Recebido no período
   LIMITAÇÃO da Home F11/F12: `paid` é valor acumulado por parcela, não
   movimento temporal. Não usar `paid` como caixa do mês.

   CASH-2 (26/08/2026): ledger `financial_transactions` persiste cada baixa
   com `occurredOn` = `data_pagamento` e `netAmount` = `valor_liquido`.
   Fórmula observada: líquido = bruto + juros + multa − desconto − taxa.
   CASH-3A (26/08/2026): domínio `MonthlyCashFlow` (sem HTTP/Home).
   REALIZADO = Σ `netAmount` ACTIVE com `occurredOn` no mês.
   PREVISTO = Σ `unpaid` ativo com `dueDate` no mês e `dueDate >= today`.
   VENCIDO = D1 carteira atual (`dueDate < today`), independente do mês.
   FATURAMENTO homologado = realizado.inflows + expected.receivables
   (vencido fora; pagamento tardio no mês da baixa; competência não define).
   Sem as-of. Fluxo ≠ estoque.
   CASH-4 (Home) e CASH-6 (Relatórios/PDF/XLSX) HOMOLOGADOS: superfícies
   financeiras oficiais usam `MonthlyCashFlow` (regime de caixa).
   Competência permanece apenas como dado técnico/legado de API.

E. Próximos vencimentos
   AR WHERE status IN (OPEN, OVERDUE, PARTIALLY_PAID)
     AND unpaid > 0
     AND dueDate BETWEEN hoje AND hoje + N dias (INCLUSIVO nas duas pontas)
   Ordenado por dueDate ASC, id ASC.
   N é parâmetro técnico do Motor Analítico (`nDays` inteiro >= 0).
   Não há default de produto neste recorte: o caller informa N.
   `nDays = 0` seleciona somente o dia civil corrente.
   Janela N não altera persistência nem o horizonte de 90 dias do fluxo.

Nota: todas as análises acima filtram por `tenantId` (fronteira de
segurança) e, quando aplicável, `integrationId`.

⸻

6. Contas a pagar

Análises simétricas às de Contas a Receber (§5), substituindo AR por AP.
Mesmos status ativos e mesmas exclusões (D3).
Mesma fronteira `hoje` (D5 / D6).
Pago no período: mesma limitação de §5D — fora do primeiro recorte.

⸻

7. Fluxo de caixa previsto (D3, D4, D5)

Aprovado em 19/08/2026.

Definição: projeção determinística dos valores a receber e a pagar
com base nos títulos em aberto e seus vencimentos.

Fórmula conceitual por período (agregação sobre dueDate real):

  entradas_previstas(período) = Σ AR.unpaid WHERE dueDate IN período
                                 AND status IN (OPEN, OVERDUE, PARTIALLY_PAID)

  saídas_previstas(período)   = Σ AP.unpaid WHERE dueDate IN período
                                 AND status IN (OPEN, OVERDUE, PARTIALLY_PAID)

  saldo_previsto(período) = entradas_previstas - saídas_previstas

Horizonte inicial (D4): 90 dias à frente a partir de hoje (D5).
Contrato do primeiro recorte (datas civis America/Sao_Paulo):
intervalo [hoje, hoje + 90 dias], INCLUSIVO nas duas pontas.
Hoje entra. Exatamente hoje + 90 entra. Hoje + 91 não entra.

Granularidade padrão de APRESENTAÇÃO (D4): mensal.
Buckets técnicos: chave `YYYY-MM` (ex.: 2026-08).
Todos os meses civis que intersectam o intervalo aparecem, em ordem
crescente. Mês sem movimentos: inflows/outflows/net = Decimal 0.
O primeiro e o último bucket podem ser meses parciais: só entram
títulos com dueDate dentro de [hoje, hoje+90], não o mês civil inteiro.

O Motor Analítico trabalha com dueDate real e agrega ao mês na
apresentação. Não transformar dueDate em mês no banco.

`saldo_previsto` / `net` é o líquido DO BUCKET
(inflows - outflows). Não é saldo acumulado, running balance,
saldo bancário nem abertura de caixa. Não carregar net entre meses.

D3: RENEGOTIATED não entra neste fluxo (nem em aberto, vencido,
a vencer ou inadimplência). Objetivo: evitar dupla contagem do título
renegociado e do que o substituiu. O status persistido permanece para
rastreabilidade.

Limitações conhecidas:
- Títulos com dueDate nulo: impossível (dueDate é NOT NULL no schema).
- Títulos PARTIALLY_PAID: entram com `unpaid` residual — correto.
- Não é fluxo realizado; não usa data de pagamento efetivo.

Granularidades adicionais (dia/semana) pertencem a filtros/UX posteriores.

⸻

8. Fluxo de caixa realizado

Status: FORA DO PRIMEIRO RECORTE.

O campo `paid` de cada parcela é o valor acumulado pago, não um
registro de movimento temporal. Não é possível reconstruir "entrou
no mês X" ou "saiu no mês X" com os dados atuais.

Dado adicional necessário: data efetiva de baixa por movimento
(endpoint de baixas/movimentos da Conta Azul — não consumido).

Não implementar proxy usando `paid` acumulado.

⸻

9. Receita por categoria (D8)

Aprovado em 19/08/2026. KPI de Grupo B: semântica fechada; implementação
analítica na Fase 9. Não exige novo dado da Conta Azul no primeiro recorte.

Regra de classificação (parcela AR):

  Exatamente UMA categoria utilizável do tipo REVENUE:
    → classificada integralmente nessa categoria
      (join com FinancialCategory por externalId + tenant)

  ZERO categorias:
    → bucket analítico "Sem categoria"

  DUAS ou mais categorias (rateio não valorado):
    → bucket "Sem classificação precisa / Rateio não disponível"
    → NÃO atribuir 100% do valor a cada categoria
    → NÃO dividir igualmente
    → NÃO escolher arbitrariamente a primeira

D8 — classificação incompatível com o lado (regra ANALÍTICA):

  AR + categoria EXPENSE → classificação imprecisa
  AR + categoria UNKNOWN → classificação imprecisa
  (simétrico em §10 para AP)

O valor NÃO deve desaparecer, NÃO deve ir a uma categoria nominal
errada, NÃO deve falhar a sincronização e NÃO deve falhar a consulta
analítica inteira.

Não modificar external IDs persistidos.
Não reescrever categorias do ERP.
Não alterar a sync para "corrigir" cadastro do cliente.

O valor continua nos totais financeiros aplicáveis (AR em aberto etc.).
Não é atribuído a uma categoria nominal.
Quando houver KPI de cobertura:

  cobertura = valor classificado com segurança / valor total aplicável

esses valores reduzem a cobertura de forma honesta.

Motivo: o endpoint de listagem retorna apenas IDs, sem percentual/valor
de rateio. Detalhe valorado em `GET /parcelas/{id}` não é consumido.

Rateio valorado é expansão futura.

⸻

10. Despesa por categoria (D8)

Simétrico a §9, usando AP (Payable) e tipo EXPENSE.

  AP + categoria REVENUE → classificação imprecisa
  AP + categoria UNKNOWN → classificação imprecisa
  ZERO categorias → "Sem categoria"
  N categorias sem rateio → "Sem classificação precisa"

A Dashboard (E2 estoque) apresenta a soma do unpaid em aberto por esses buckets.
Não é despesa realizada. Semântica D8 inalterada.
Essa fórmula **não** alimenta a Home após P1.1.

A Home apresenta despesa mensal por competência (`GET /dashboard/monthly-expenses`):
AP com competenceDate no mês civil selecionado, incluindo PAID; D8 sobre o
total do mês. `paid` HTTP = Σ paid do snapshot, não caixa do mês.
Título: “Despesas por categoria”. Não é estoque até 2028.
CASH-4B (HOMOLOGADA): Despesas da Home =
`realized.outflows + expected.payables` (vencido AP fora). CASH-4C =
séries/gráficos/leitura em caixa (Home sem monthly-expenses).

A Home oficial (CASH-4 homologada) usa `GET /dashboard/monthly-cash-flow`
(regime de caixa). Endpoints de competência (`GET /dashboard/monthly-revenue`,
`monthly-expenses`) **permanecem no backend** como legado/compatibilidade;
**não** alimentam KPIs oficiais da Home.
`received` no contrato legado = Σ paid do snapshot, não caixa do mês.
F1-G (Faturamento Gerencial por competência): SUPERSEDED na Home (CASH-4B).
A composição de receitas/despesas por categoria na Home (CASH-4C-CAT) é
caixa realizado: D8 sobre settlements elegíveis (ACTIVE, sem transferência).
SUM(items) = realized.inflows / realized.outflows. Previsto e vencidos fora.
Composições retornam **todas** as categorias nominais; não há fold semântico
em “Outras categorias”. Top N na Home compacta é **somente visual** e não
altera o dataset financeiro (modal, reports, PDF/XLSX usam items completos).
Relatórios (CASH-6 homologado): mesmo motor `MonthlyCashFlow` da Home.
Realizado = `occurredOn`/`netAmount`; previsto = `dueDate`/`unpaid` no prazo;
vencido separado (`ofMonth` no intervalo). Competência não define totais.
PDF/XLSX formatam o mesmo DTO. PRE-F13-CASH-FINAL-AUDIT: PASS.

⸻

11. Receita × Despesa (D7)

Status: ADIADA DO PRIMEIRO RECORTE. Aprovado em 19/08/2026.

NÃO implementar nem exibir o KPI genérico chamado "Receita × Despesa".

Motivos:
- por vencimento duplicaria semanticamente o fluxo previsto;
- realizado exigiria ledger / data efetiva de baixa, indisponível;
- competência depende de cobertura de competenceDate e de semântica
  própria, com rótulo explícito — não este nome genérico.

Não criar proxy usando `paid` acumulado.
Se no futuro houver análise por competência, documentar fórmula e
rótulo neste item antes de implementar.

⸻

12. Faturamento

Status oficial (26/08/2026, decisão humana Felipe / PRE-F13-CASH-3A-HOMOLOG):
nomenclatura permanece FATURAMENTO; NÃO é mais competência.

  Faturamento(month, today) =
    MonthlyCashFlow.realized.inflows
    + MonthlyCashFlow.expected.receivables

  realized.inflows = Σ financial_transactions.netAmount
    WHERE transactionType = RECEIPT, lifecycleStatus = ACTIVE, occurredOn ∈ mês
    AND financial_transfer_id IS NULL
  expected.receivables = Σ receivables.unpaid
    WHERE status ativo, unpaid > 0, dueDate ∈ mês, dueDate >= today (civil SP)

CASH-9C: transferência interna (`financial_transfers`) não entra na soma.
Settlement ghost ACTIVE associado 1:1 é excluído do realizado; não vira DELETED.
AMBIGUOUS não exclui. Não fabricar ponta oposta como despesa.

Vencido (`overdue.receivables`, dueDate < today) NÃO entra.
Pagamento tardio: mês da baixa (`occurredOn`), nunca competenceDate.
Se a baixa ocorrer ainda no mês do vencimento: volta ao Faturamento via realizado
(sem duplicar título: expected/overdue usam unpaid atual; realizado usa ledger).
Helper de domínio: `monthlyBilling(flow)` — composição das peças; não é motor paralelo.
HTTP CASH-3B: `GET /dashboard/monthly-cash-flow` serializa `billing` a partir do helper.
Correção 08-B: `GET /dashboard/cash-movement-history` reutiliza o mesmo
`MonthlyCashFlowService` para 12 meses civis terminando no mês selecionado e
expõe somente `realized.{inflows,outflows,result}` (sem expected / sem saldo bancário).
Cada bucket deve reconciliar com `monthly-cash-flow` do mesmo mês e filtros.
CASH-4A: Home carrega o DTO e o view-model (`toMonthlyCashFlowView`).
CASH-4B: Home visual = caixa / MonthlyCashFlow (F1-G SUPERSEDED nos KPIs).

Despesas oficiais (Felipe, simétrico ao Faturamento):

  monthlyExpenses(month, today) =
    MonthlyCashFlow.realized.outflows
    + MonthlyCashFlow.expected.payables

  realized.outflows = Σ financial_transactions.netAmount
    WHERE transactionType = DISBURSEMENT, lifecycleStatus = ACTIVE, occurredOn ∈ mês
    AND financial_transfer_id IS NULL
  expected.payables = Σ payables.unpaid
    WHERE status ativo, unpaid > 0, dueDate ∈ mês, dueDate >= today (civil SP)

Vencido (`overdue.payables`) NÃO entra. Baixa tardia: mês de `occurredOn`.

Resultado principal da Home (CASH-4B):

  managerialResult = billing − monthlyExpenses

`realized.result` permanece disponível e NÃO substitui o card principal.

Meta (decisão Felipe = opção A; CASH-4B homologada):

  actual = billing = realized.inflows + expected.receivables

Não usar competência / monthly-revenue.total / somente realized.inflows.

Vencidos são estoque separado (D1). PROIBIDO somar billing + overdue.receivables
ou monthlyExpenses + overdue.payables.

Meta usa `loadBillingActual` / `monthlyBilling` (CASH-4B).

Faturamento fiscal (NF-e/NFS-e): capacidade futura separada — NÃO IMPLEMENTADO.

Home legado F1-G — SUPERSEDED nos KPIs (CASH-4B). Endpoints de competência
permanecem no backend como legado/compatibilidade (não alimentam Home/Reports
oficiais após CASH-4/CASH-6):

  Faturamento Gerencial mensal (legado de API) =
    Σ total dos AR com competenceDate no mês civil selecionado
    status ∈ {OPEN, OVERDUE, PARTIALLY_PAID, PAID}
    fora: RENEGOTIATED, LOST, UNKNOWN

Fonte legada: `GET /dashboard/monthly-revenue?month=YYYY-MM` (M1).
Card Home: valor = `receivables.total` do mesmo contrato.

Semântica temporal (America/Sao_Paulo):
  passado  → “Faturamento” · gerado na competência
  atual    → “Faturamento” · gerado até agora
  futuro   → “Faturamento previsto” se houver títulos;
             empty (“—”) se não houver — nunca R$ 0,00 como realizado

`received` / `outstanding` do monthly-revenue NÃO são caixa do mês.

Estoque AP/AR do overview NÃO alimenta os cards principais da Home (P1.1).
Permanece como capacidade reutilizável (carteira / drill-down futuro).

P1.1 — Home month-scoped (20/08/2026):
  A receber (Home) = monthly-revenue.outstanding
  A pagar (Home) = monthly-expenses.outstanding
  Recebíveis vencidos (Home) = monthly-revenue.overdue
  Inadimplência (Home) = overdue ÷ outstanding da competência (empty se outstanding = 0)
  Dimensão AP da Home = competenceDate (despesa do mês), não dueDate
    (vencimentos do mês continuam na pressão/upcoming, só no mês atual).

⸻

13. Saldo bancário (Correção 08-C1 / 08-C2)

Status: FUNDAÇÃO IMPLEMENTADA (captura + read model). Linha no gráfico =
08-C3/C4 (ainda não entregue).

Fonte oficial:

`GET /v1/conta-financeira/{id}/saldo-atual` → `{ saldo_atual }`

Persistência: `financial_account_balance_snapshots` (um ponto por conta +
dia civil `America/Sao_Paulo`). Captura no auto-sync existente após sync de
contas — **somente contas ativas**; falha de uma conta não grava zero e não
apaga snapshots das demais. Conta que fica inativa depois: snapshots
históricos permanecem; sync futuro não captura mais aquela conta.

Read model: `GET /dashboard/cash-balance-history` (sem category/costCenter).

* Não reconstrói saldo pelo ledger / FinancialTransaction.
* Não fabrica histórico retroativo antes do primeiro snapshot.
* Daily: fechamento = último consolidado conhecido do dia; carry-forward
  permitido só após o primeiro snapshot disponível.
* Monthly: último consolidado disponível no mês (mês atual até hoje).
* Consolidado = soma por conta no read model (não snapshot consolidado
  persistido). Dia incompleto (participante sem cobertura) não gera ponto.
* Category / cost center **não** filtram saldo; na UI futura a linha será
  ocultada se esses filtros estiverem ativos.

Lifecycle (Correção 11-B) e cohort histórico:

* `FinancialAccount.active` controla **captura futura** (`saldo-atual` só
  para `active=true`) e o fim da participação aberta.
* Inativação **não** apaga snapshots nem remove contribuição histórica.
* Conta **ativa**: participa desde o primeiro snapshot; carry-forward aberto.
* Conta **inativa**: participa somente em `[firstSnapshot, lastSnapshot]`;
  sem carry após o último snapshot; sem inventar saldo antes do primeiro.
* Sem retroatividade fabricada; sem ledger; gaps ≠ zero.
* Conta cujo `firstSnapshot` é posterior ao dia D **não participa** de D
  e **não** invalida o consolidado daquele dia.
* `availableFrom` = data do primeiro dia consolidado publicado (metadata
  derivada da série); **não** é `max(first)` das ativas atuais nem gate
  prévio de publicação.
* `accountsIncluded` = contas distintas que entraram em ao menos um dia
  consolidado da janela **diária do mês selecionado**.

⸻

14. Despesas fixas e variáveis

Status: FORA DO PRIMEIRO RECORTE.

Não existe classificação upstream confiável confirmada.
Não inferir por nome de categoria.
Só implementar quando a regra determinística estiver neste item.

⸻

15. Recorte do primeiro Dashboard

Definido em 19/08/2026. Fórmulas: seções acima. D1–D9 fechadas.

GRUPO A — Primeiro recorte (dados atuais, regra aprovada):

  1. Contas a receber — total em aberto (§5A)
  2. Contas a receber — total vencido (§5B)
  3. Contas a receber — total a vencer (§5C)
  4. Contas a pagar — total em aberto (§6A)
  5. Contas a pagar — total vencido (§6B)
  6. Contas a pagar — total a vencer (§6C)
  7. Inadimplência — taxa snapshot atual (§4)
  8. Próximos vencimentos — AR e AP (§5E / §6E)
  9. Fluxo de caixa previsto — 90 dias, apresentação mensal (§7)
  10. Última sincronização — `lastSuccessfulSyncAt` da Integration

Itens 1–9 do Motor Analítico: IMPLEMENTADOS (9A–9C). Item 10 já existe
na Integration (consumo na Fase 10; não é fórmula do analytics).
Grupo A: CONCLUÍDO. Fase 9: CONCLUÍDA neste recorte. Sem 9D.

GRUPO B — Sem novo dado da Conta Azul; extensão analítica futura.
Não obrigatório no primeiro recorte. Não bloqueia Fase 10:

  11. Receita por categoria — categoria única segura + buckets (§9)
  12. Despesa por categoria — simétrico (§10)

GRUPO C — Exige novo dado / ampliação da integração:

  13. Fluxo de caixa realizado (exige endpoint de baixas)
  14. Saldo (exige endpoint de saldo)

GRUPO D — Adiado / parcialmente desbloqueado:

  15. Faturamento Gerencial — IMPLEMENTADO / AGUARDANDO HOMOLOGAÇÃO (F1-G;
      fonte = receita por competência / monthly-revenue). Faturamento fiscal
      (NF-e/NFS-e) permanece futuro e separado.
  16. Despesas fixas/variáveis (sem regra determinística) — FV1 NÃO INICIADO
  17. Receita × Despesa (D7 — nome genérico não sustentado)

⸻

16. Decisões D1–D9 — RESOLVIDAS

D1. Data de referência da inadimplência — APROVADA.
    Dia civil corrente, America/Sao_Paulo, início do dia. §3–§4.

D2. Inadimplência com filtro temporal — APROVADA.
    Snapshot do estoque atual. Filtro não muda a referência. Sem as-of.
    §4.

D3. RENEGOTIATED — APROVADA.
    Fora dos valores ativos do primeiro recorte. Status persistido.
    §4–§7.

D4. Granularidade do fluxo previsto — APROVADA.
    Horizonte 90 dias. Apresentação mensal. dueDate persistido intacto.
    §7.

D5. Fronteira de "hoje" — APROVADA.
    Dia civil corrente em America/Sao_Paulo, início do dia. §2–§3.

D6. OVERDUE derivado — APROVADA.
    dueDate < hoje (estrito). dueDate == hoje não está vencido. §3.

D7. "Receita × Despesa" — APROVADA COMO ADIADA.
    Fora do primeiro recorte. §11.

D8. Categoria incompatível com o lado — APROVADA.
    Bucket analítico de classificação imprecisa. Sem mudar sync. §9–§10.

D9. Denominador zero — APROVADA.
    Taxa = null. Visual na Fase 10. Não usar 0%. §4.

⸻

17. Pendências que NÃO são D1–D9

Ainda abertas. Não bloqueiam a Fase 10 nem o primeiro Dashboard
utilizável (Grupo A):

* copy/UX da taxa null e distinção visual "sem aberto" vs "sem sync"
  (Fase 10);
* janela N de "próximos vencimentos" além da regra dueDate >= hoje
  (detalhe de apresentação; horizonte de 90 dias já define o fluxo);
* Faturamento (§12) — fórmula oficial homologada (caixa: inflows + previsto no prazo).
  Home = caixa (CASH-4B KPIs + CASH-4C visualizações). CASH-4A = infra.
  Meta = billing. Relatórios/PDF/XLSX = CASH-6. Fiscal futuro separado;
* ledger / data efetiva de baixa (§8) — `paid` acumulado ≠ ledger;
* saldo de conta (§13);
* fixas/variáveis (§14);
* análise por competência com rótulo próprio (§11);
* rateio valorado (`GET /parcelas/{id}`);
* série histórica / as-of / coorte de inadimplência (§4 D2);
* delete físico no ERP (ausência ≠ tombstone; limitação da sync 2.4);
* hardening futuro: `partyIdsByExternalId` (write) pode passar a filtrar
  `tenantId` (SAFE_BY_INVARIANT hoje; Fase 18).

⸻

18. Backlog analítico após o Grupo A

Não bloqueia Fase 10. Não apagar do MVP completo.

A — Faturamento:
* Faturamento oficial (§12) — HOMOLOGADO Felipe (CASH-3A): inflows + expected.receivables
* Despesas oficiais — HOMOLOGADO Felipe: outflows + expected.payables; vencido AP fora
* Resultado da Home — billing − monthlyExpenses (`realized.result` não substitui)
* Home KPIs = caixa (CASH-4B); F1-G SUPERSEDED na UI dos cards
* Meta — decisão A: actual = billing (CASH-4B)
* Faturamento fiscal (NF-e/NFS-e) — futuro separado (F0 preservado)

B — Extensão analítica com dados parcialmente disponíveis:
* receita por categoria (D8, §9)
* despesa por categoria (D8, §10)

C — Depende de dados adicionais:
* rateio valorado (`GET /parcelas/{id}`)
* fluxo de caixa realizado / ledger / baixas (§8)
* saldo (§13)

D — Depende de regra futura:
* despesas fixas/variáveis (§14)
* Receita × Despesa (D7, §11)
* as-of / coorte histórica (D2)

⸻

⸻
19. Centros de custo (CC1 / CC1.1)

Filtro por centro de custo usa o valor oficial do rateio Conta Azul **já normalizado
para o escopo da parcela**:

* fonte: `installment_cost_center_allocations.amount` (`allocation.amount`);
* nunca duplicar o título inteiro em cada centro;
* nunca ratear igualmente quando o rateio valorado existir;
* **nunca** atribuir `center.valor` cru do EVENTO a cada parcela de uma série
  (CC1.1): em parcelamentos, `GET /parcelas/{id}` pode devolver rateio
  **EVENT-scoped** idêntico nas irmãs;
* regra homologada `EVENT_SCOPED_SINGLE_CENTER`: se Σ rateio > total da parcela
  e há exatamente 1 centro → `allocation.amount = total_parcela`
  (não dividir por quantidade de parcelas);
* multi-centro EVENT-scoped (`Σ > total` e N>1): `MULTI_CENTER_UNRESOLVED` —
  **não** normalizar proporcionalmente nesta versão (capacidade futura);
* PARTIAL (Σ < total): preservar upstream; não completar artificialmente;
* NO_ALLOCATION: upstream sem centro — **não** é erro; não fabricar allocation;
* semântica oficial:
  - **Todos** = universo financeiro da empresa (títulos);
  - **Centro** = somente valor explicitamente atribuído;
  - portanto **Σ centros pode ser < Todos** quando houver NO_ALLOCATION;
* paid/unpaid **por centro** só quando DERIVABLE sem rateio na baixa (CC1.3):
  - 1 centro com allocation ≈ total → received=paid, outstanding=unpaid;
  - multi-centro e título 100% quitado → received=allocation.amount;
  - multi-centro e paid≈0 → outstanding=allocation.amount;
  - multi-centro parcialmente liquidado → UNAVAILABLE (não proporcionalizar);
* se qualquer título do mês for UNAVAILABLE, o cash split do KPI fica null;
* meta de faturamento permanece **consolidada da empresa** (ignora filtro).
* seletor Home: tabs horizontais (Todos | centros), overflow com setas; 0 centros → oculto.

CC1 / CC1.1: HOMOLOGADAS. Controle 2026-08 (0 OVER; Jac+Lar=Todos);
histórico 2026-05 / 2025-06 corrigido via backfill local.
CC1.2: HOMOLOGADA TECNICAMENTE — enrichment incremental por estado da parcela
(UNKNOWN vs NO_ALLOCATION confirmado); segundo dry-run Clinica Life → 0 GETs;
sem redesign visual; homologação visual NÃO APLICÁVEL nesta fase.
CC1.3: HOMOLOGADA VISUALMENTE — cash split híbrido (1 centro / multi quitado ou zerado = EXACT;
multi parcial = UNAVAILABLE; sem proporção inventada; sem ledger). Seletor
Home em tabs horizontais com overflow; Meta permanece company-level.
CC1.3.2: HOMOLOGADA VISUALMENTE — série diária por competência (received/outstanding) no filtro por
centro usa a mesma regra EXACT/UNAVAILABLE; sem fabricar sparkline.

⸻
⸻

20. Home — congelamento temporal (F11-A)

Decisão oficial 23/08/2026. Não reabre D1–D9 nem semântica de caixa.

Home = competência mensal civil.

* timezone: `America/Sao_Paulo`;
* URL: `?month=YYYY-MM` (ausente = mês civil corrente);
* agregação principal: `competenceDate`;
* centro de custo: `?costCenter=<uuid>` (ausente = Todos); CC1.x homologado;
* comparação oficial: mês selecionado × mês civil imediatamente anterior;
* meta de faturamento: company-level — não filtrar por centro, categoria
  nem situação;
* forecast, upcoming e pressão de caixa: P1.1 (âncora hoje + `dueDate`);
  não reinterpretar como competência mensal.

Não misturar num filtro global único da Home:

* `competenceDate`;
* `dueDate`;
* data de pagamento / baixa / settlement.

F11-B1 (contrato backend, 23/08/2026): situação e categoria filtram o
universo do mês de competência já selecionado. Não mudam o eixo temporal.

* `situation=settled|open|overdue` (ausente = Todas). Não usar query `status`.
  `settled` = PAID; `open` = OPEN/OVERDUE/PARTIALLY_PAID; `overdue` = D1
  (unpaid > 0, status ativo, dueDate < hoje civil SP; dueDate == hoje não
  é vencido). PARTIALLY_PAID não entra em settled.
* `category=<uuid>` de FinancialCategory.id (ausente = Todas). Resolução
  tenant → externalId; match preciso D8; sem rateio; sem rollup de pai;
  sem sentinela “sem categoria”. REVENUE filtra AR e zera AP; EXPENSE o
  inverso; UNKNOWN só match preciso D8 (vazio no AR/AP mensal).
* Forecast e pressão: category sim; situation não aplicada (parser comum
  rejeita inválido com 400 e ignora valor válido).
* Meta de faturamento: company-level; ignora os novos filtros.
* F11-B2 (UI): HOMOLOGADA — Home envia
  situation+category aos widgets mensais/insights/comparação; forecast e
  pressão recebem category e não situation; meta permanece company-level.

F11-C: hoje / ontem / 7d / 30d / 12 meses / ano / range **diário**
NÃO entram na Home. Reclassificados (Relatórios / F12-A). Não é
regressão. Não estão implementados na Home.

Na F12 V1 o intervalo oficial é De/Até de **meses civis de competência**
(`from`/`to` YYYY-MM). Soma os snapshots mensais já definidos. Não é
as-of. Não é caixa. Não altera D1: `situation=overdue` continua
`dueDate < hoje` SP sobre o universo de competência filtrado.

Taxa de inadimplência de estoque (`overview.delinquency`, §4 / D2):
filtro temporal **não** muda a data de referência. Relatórios V1 **não**
oferecem essa taxa como métrica do intervalo De/Até.

Ledger (`financial_transactions`): CASH-2 persiste baixas; CASH-3A calcula
`MonthlyCashFlow` no domínio. CASH-3B expõe `GET /dashboard/monthly-cash-flow`
(`billing` = `monthlyBilling`; vencido fora). CASH-4A: Home carrega o DTO
(view-model); F12 V1 / PDF / XLSX continuam competência até CASH-6.
Home = caixa integral (CASH-4B KPIs + CASH-4C visualizações + CASH-4C-CAT
donuts realizados). Séries realizadas por `occurredOn`; previsto por
`dueDate`/unpaid no prazo; comparativo histórico só realized; leitura
executiva = MonthlyCashFlow; competência não alimenta a Home.
`realizedByCategory` = D8 sobre RECEIPT/DISBURSEMENT elegíveis; SUM =
realized.inflows/outflows; previsto e transferências fora. Meta `actual` =
billing. Zoom/expansão = dívida UX futura.
CASH-7 (26/08/2026): bootstrap idempotente por tenant; cobertura
segura = Σ gross ACTIVE = `paid` (DELETED não entra na soma nem bloqueia skip).
Guard fail-closed: LOCAL exige `_dev`/`_test`; produção exige
`NODE_ENV=production` + `--confirm=PRODUCTION` + banco real.
CASH-8A: R3 stale confirmado pode ir a DELETED (Correção 10-C: flag
default true no sync padrão). R4 `/baixa = []` ou parcela 404 = HOLD;
não tombstona. Sem delete físico. Reativação: upsert força ACTIVE.
Saneamento histórico pontual (ex.: Life) fora desta etapa.
autorizado explicitamente (PRE-F13-PROD-BACKFILL-GUARD); execução manual
tenant por tenant; homologação Felipe ainda pendente.
CASH-9C: transferências internas fora de faturamento/despesas/resultado.
Ghost ACTIVE pode ser excluído do analytics sem virar DELETED.
Produção: `--confirm=PRODUCTION`; sem dry-run/report-only no CLI CASH-9C.
CASH-4B HOMOLOGADA. CASH-4C HOMOLOGADA. CASH-6 HOMOLOGADA.
PRE-F13-CASH-FINAL-AUDIT: PASS. F13 local DESBLOQUEADA; produção AINDA BLOQUEADA.
HOME CASH NÃO PODE SER LIBERADA AO FELIPE COM NÚMEROS REAIS ANTES DO
BACKFILL DE PRODUÇÃO + CASH-8B. Sem as-of.

Query params oficiais da Home: `month`, `costCenter`, `situation`, `category`.
`costCenterId` não é query param. `period`, `comparison` e `status` não
existem no contrato da Home.

⸻

21. Relatórios — paridade analítica (F12-A)

Decisão oficial 24/08/2026.

Relatórios de Receita e Despesas reutilizam as fórmulas de
`monthly-revenue` e `monthly-expenses` (competência, timezone
`America/Sao_Paulo`, D8, CC1, F11-B). Intervalo De/Até = união das
competências inclusas; totais = soma dos totais mensais. `coverageRate`
no intervalo usa D9.

Não duplicar regra. Não criar semântica de caixa. Não misturar
`competenceDate`, `dueDate` e data de baixa num único filtro de Relatórios.

F12-B (24/08/2026): o Relatório de Receita chama o mesmo
`getMonthlyCompetenceRevenue` mês a mês no intervalo; totais e `items`
são agregação, não uma segunda fórmula.
F12-D (25/08/2026): o Relatório de Despesas chama o mesmo
`getMonthlyCompetenceExpenses`; HTTP mapeia `received` interno → `paid`.
Cash split mensal indisponível propaga `costCenterCashSplit: false` e
nulos para o intervalo — não somar paid/outstanding silenciosamente.
