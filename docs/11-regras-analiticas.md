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
MVP financeiro completo: NÃO. Próxima fase: Fase 10 (NÃO INICIADA).

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
   LIMITAÇÃO: `paid` é valor acumulado por parcela, não movimento temporal.
   NÃO é possível calcular "recebido no mês X" com dados atuais.
   Requer endpoint de baixas/movimentos (expansão futura).
   Fora do primeiro recorte.

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

Status: ADIADO DO PRIMEIRO RECORTE. Aprovado em 19/08/2026.

Razão: não existe definição oficial da fonte. As opções possíveis
(vendas emitidas, AR originados, AR recebidos, NF) produzem valores
diferentes e nenhuma equivale automaticamente a "faturamento".

Nenhum KPI chamado "faturamento" deve ser implementado sem definição
funcional explícita neste item. Não buscar vendas/NF por garantia.

⸻

13. Saldo

Status: FORA DO PRIMEIRO RECORTE.

Dado necessário: saldo por conta financeira com timestamp.
Endpoint candidato: `GET /conta-financeira/{id}/saldo` (docs/04 §27,
não homologado, não persistido). Não buscar nesta fase.

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

GRUPO D — Adiado:

  15. Faturamento (sem definição de fonte)
  16. Despesas fixas/variáveis (sem regra determinística)
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
* definição futura de faturamento (§12) — sem fonte oficial;
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

A — Depende de decisão/fonte:
* faturamento (§12)

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
