Dashboard Economização

05 — UI/UX Blueprint

Status: Em elaboração
Projeto: Dashboard Economização
Tipo: Contrato de experiência, navegação e interface
Observação: Este documento não define framework, biblioteca de componentes ou tecnologia de gráficos.

⸻

1. Objetivo

Este documento define a experiência funcional e visual do Dashboard Economização.

Seu objetivo é estabelecer:

* estrutura de navegação;
* mapa de telas;
* hierarquia das informações;
* comportamento dos filtros;
* organização da dashboard;
* comportamento do Consultor Financeiro;
* painel administrativo;
* modo suporte;
* branding;
* responsividade;
* estados de loading, erro e ausência de dados.

A implementação visual deverá seguir este documento sem criar novos fluxos por conta própria.

⸻

2. Direção Geral da Experiência

O Dashboard Economização deverá transmitir uma percepção de:

* tecnologia;
* confiança;
* clareza;
* inteligência;
* modernidade;
* organização;
* controle financeiro.

A interface não deverá parecer um sistema contábil antigo.

Também não deverá parecer excessivamente lúdica.

O objetivo visual será combinar:

tecnologia + sofisticação + leitura financeira simples.

⸻

3. Princípio Principal da UX

O usuário não deverá precisar interpretar dezenas de tabelas para descobrir a situação financeira da empresa.

A interface deverá priorizar a sequência:

Resumo
↓
Comparação
↓
Tendência
↓
Detalhamento
↓
Ação

Primeiro o usuário entende o que está acontecendo.

Depois, caso queira, aprofunda a análise.

⸻

4. Estrutura Geral da Aplicação

A aplicação será dividida conceitualmente em três experiências principais:

1. Área pública/autenticação.
2. Painel do cliente.
3. Painel administrativo.

Existe ainda um quarto contexto especial:

4. Modo suporte.

⸻

5. Área Pública

5.1 Tela de Login

A tela de login deverá conter:

* logo principal da plataforma (área de destaque acima de “Bem-vindo de volta.”; proporção livre, sem distorção);
* ícone compacto da plataforma no bloco institucional esquerdo (ícone + nome + subtítulo);
* identificação visual da plataforma;
* campo de e-mail;
* campo de senha;
* ação de entrar;
* ação de recuperação de senha;
* mensagens de erro;
* loading durante autenticação.

A experiência deverá ser simples, limpa e profissional.

⸻

5.2 Branding no Login

A tela de login utilizará a identidade principal da plataforma.

A **logo principal** aparece no card de autenticação, com área visual suficiente para reconhecimento. O **ícone compacto** aparece apenas no lockup institucional esquerdo e nas regiões 1:1 da aplicação.

Logo principal e ícone compacto são papéis visuais distintos: a logo horizontal não é forçada no quadrado compacto.

Não será necessário identificar previamente o tenant antes do login.

Após autenticação, o sistema carrega a identidade visual da empresa correspondente.

⸻

5.3 Recuperação de Senha

Fluxo:

Login
↓
Esqueci minha senha
↓
Informar e-mail
↓
Confirmação de solicitação
↓
Link seguro
↓
Nova senha
↓
Retorno ao login

Mensagens não deverão revelar desnecessariamente se determinado e-mail existe na plataforma.

⸻

6. Shell do Painel do Cliente

Após login, o usuário deverá entrar em uma estrutura persistente de navegação.

Elementos principais:

* menu lateral;
* cabeçalho superior;
* conteúdo principal;
* Consultor Financeiro flutuante;
* área de notificações;
* menu do usuário.

⸻

7. Menu Lateral

Itens iniciais previstos (contexto de tenant):

* Dashboard;
* Relatórios;
* Consultor;
* Notificações;
* Minha Conta.

Itens que não possuírem funcionalidade no MVP não deverão ser exibidos apenas como placeholders.

PRE-IA-1 — contexto de navegação (25/08/2026):

* USER (tenant): landing `/`; Dashboard e Relatórios visíveis.
* ADMIN / SUPER_ADMIN sem Support Mode: landing `/empresas`; Dashboard e Relatórios financeiros ocultos. Acesso direto a `/` ou `/relatorios` redireciona para `/empresas`.
* ADMIN / SUPER_ADMIN com Support Mode ativo: Dashboard e Relatórios visíveis; enter continua indo para `/`; exit retorna a `/empresas`.
* Não criar dashboard administrativa nesta fase. `/empresas` é a landing operacional da plataforma.

Helper oficial: `canUseTenantSurfaces` (USER **ou** operador de plataforma com `support.active`).

PRE-IA-2 — saúde operacional na lista `/empresas` (25/08/2026):

A listagem de empresas exibe o estado da **conexão** Conta Azul (`Integration.status`)
e a **última sincronização com sucesso** (`lastSuccessfulSyncAt`).
`CONNECTED` não significa “sync saudável”. Sem heurística de atraso.
Não é dashboard administrativa. Histórico de sync permanece na Fase 17.

⸻

8. Cabeçalho

O cabeçalho deverá possuir, quando aplicável:

* identificação da empresa;
* logo;
* período ativo;
* última atualização dos dados;
* notificações;
* menu do usuário.

Não deverá ficar visualmente sobrecarregado.

⸻

9. Última Atualização

O usuário deverá conseguir identificar quando os dados foram atualizados pela última vez.

Exemplo conceitual:

Atualizado há 8 minutos

ou equivalente.

Esse dado representa a última sincronização bem-sucedida relevante.

⸻

10. Estado de Sincronização

Quando houver atualização em background, a interface poderá indicar discretamente:

Atualizando dados...

A dashboard não deverá bloquear o uso durante sincronização.

Quando novos dados estiverem disponíveis, os componentes poderão ser atualizados de forma controlada.

⸻

11. Dashboard Principal

A dashboard será a principal experiência do cliente.

Estrutura conceitual:

Cabeçalho da Dashboard
↓
Filtros Globais
↓
Resumo Executivo
↓
Indicadores Principais
↓
Gráficos de Evolução
↓
Receitas e Despesas
↓
Contas a Receber / Pagar
↓
Fluxo de Caixa
↓
Insights

A composição final poderá ser refinada durante design visual, desde que preserve a hierarquia funcional.

⸻

12. Resumo Executivo

A parte superior da dashboard deverá responder rapidamente:

Como está minha empresa agora?

Deverá priorizar os indicadores mais importantes.

KPIs iniciais:

* faturamento;
* contas a receber;
* contas a pagar;
* inadimplência;
* saldo ou posição financeira quando confirmado;
* resultado do período quando confirmado.

O primeiro Dashboard utilizável segue o recorte vigente em docs/11;
os demais itens desta lista permanecem no roadmap do MVP completo.

Composição 10B (CONCLUÍDA / HOMOLOGADA; reorientada em P1.1 — 20/08/2026):

A Home é **month-scoped**. `selectedMonth` é o contexto global.
A pergunta da tela é “Como está {mês}?”, não um misto mensal + estoque.

* Faturamento Gerencial (F1-G) — `monthly-revenue.total` (competência AR);
* A receber — `monthly-revenue.outstanding` (saldo da competência);
* A pagar — `monthly-expenses.outstanding` (saldo da competência AP);
* Recebíveis vencidos — `monthly-revenue.overdue` (D1 sobre unpaid da competência);
* Inadimplência — `overdue ÷ outstanding` da competência AR (não o estoque global).

KPIs de estoque (`GET /dashboard/overview` open/overdue/rate) permanecem
como capacidade reutilizável; **não** alimentam os cards principais da Home.
Não usar Saldo ou Resultado neste recorte.
Taxa null → "—" e “Sem valores em aberto.” (nunca 0%).
Taxa "0" → "0%".
`lastSuccessfulSyncAt` null → “Aguardando a primeira sincronização”
(não exibir zeros como fato).
Pós-sync com estoque zero → R$ 0,00.
DISCONNECTED/ERROR com baseline: KPIs visíveis + aviso; sem botão conectar nesta fase.
Freshness absoluta: “Última sincronização: {data/hora}”. Sem timer relativo.

Composição V2.3 — Home Architecture (HOMOLOGADA):

Delta de arquitetura da Home sobre V2.2; semântica financeira intocada
(competência ≠ caixa). Widget de meta **funcional** (F2 HOMOLOGADA / F2.0.1
status temporal): CTA “Definir meta” / “Editar meta” com `data-stop-expand`,
diálogo de valor (decimal-string, sem `parseFloat` como fonte), progresso
Meta × Realizado, falta/excesso, histórico compacto e diálogo expandido.
Status na UI: mês atual abaixo → “Em andamento”; mês passado abaixo → “Meta não
atingida”; mês futuro com meta → “Meta planejada”; atingida → “Meta atingida”;
superada → “Meta superada”. Sem meta cadastrada, o empty state “Meta ainda não
definida” permanece — nenhum número inventado. Layout da Home inalterado.
Gráfico histórico Meta × Realizado: melhoria futura (fora da F2 homologada).
IA / sugestão automática de meta: FUTURA / NÃO IMPLEMENTADA.

V2.3.1 — Final Home Polish (HOMOLOGADA): baseline visual/funcional **congelado**
da Home (copy comercial da Meta, ícones semânticos da Leitura, Comparativo sem
colisão de labels + hover/tooltip). Não redesenhar a Home sem nova fase.

CASH-4B (KPIs de caixa na Home): IMPLEMENTADA (local, aguarda homologação humana).
KPIs principais = `MonthlyCashFlow` (regime de caixa):
* Faturamento = `billing` = realized.inflows + expected.receivables;
* Já recebido = realized.inflows; A receber = expected.receivables;
* Despesas = realized.outflows + expected.payables (Pago / A pagar no rodapé);
* Resultado = billing − monthlyExpenses (não `realized.result`);
* Meta `actual` = billing (company-level); Inadimplência = D1 global
  (`overdue.receivables` + taxa do overview);
* Vencidos fora de Faturamento/Despesas; transferências neutras na API;
* `costCenterCashSplit=false` → “—” (nunca R$ 0,00); erro de cash-flow
  sem fallback silencioso para competência;
* Filtro Situação oculto na Home (sem semântica coerente no realizado);
* Sparklines honestas só em Já recebido / A receber; gráficos de competência
  (Receitas×Despesas, comparativo, barras diárias) ocultos até CASH-4C.
Competência permanece em Relatórios/PDF/XLSX e endpoints legados (CASH-6).

CASH-4A (infra Home / caixa): a Home **carrega** `GET /dashboard/monthly-cash-flow`
(`month`, `costCenter`, `category`). Infra mantida; números oficiais = CASH-4B.
Faturamento = `realized.inflows + expected.receivables`.
Despesas = `realized.outflows + expected.payables`.
Resultado = Faturamento − Despesas. Vencidos AR/AP fora dos totais.
Meta: `actual = billing`. `costCenterCashSplit=false` → métricas null
(“—”), nunca R$ 0,00.

Grade principal (`mainGrid`):
* Despesas por categoria (`sectionId` `despesas-mes`, `id` `despesas-categoria`)
  — ainda competência (CASH-4C);
* Receitas por categoria (`sectionId` `receitas-categoria`, `id` `receitas-categoria`)
  — ainda competência (CASH-4C).
* Receitas × Despesas: oculto temporariamente (CASH-4C).

Removidos da Home:
* widget independente “Top 5 despesas”;
* card dual “Composição por categoria” (dois anéis no mesmo card);
* diálogo dual `categories`; botões “Abrir receitas/despesas por categoria”
  no donut.

Interação: `CategoryDonutChart` sem `onActivate`/botão próprio — o card
inteiro (`WidgetShell`) é clicável (e Enter/Espaço) e abre
`categories-expense` ou `categories-revenue` com ranking de TODAS as categorias.

Grade secundária (`secondaryGrid`):
* Meta de faturamento (`sectionId` `meta-faturamento`) — empty comercial
  V2.3.1 (título “Meta ainda não definida” + apoio “Defina uma meta mensal
  para acompanhar o desempenho do faturamento.”) enquanto sem meta; com meta,
  card funcional F2/F2.0.1 (status temporal por competência);
* Até o fim do mês (só mês civil atual);
* Leitura executiva;
* Inadimplência.

Composição V2.2 — Visual Fidelity Pass (IMPLEMENTADA / SUPERSEDED pela V2.3.1 como baseline da Home):

Delta visual sobre V2.1; semântica financeira intocada (competência ≠ caixa).

Chrome:
* seletor mensal + freshness formam um único agrupamento de controles;
  freshness virou pílula (ícone + “Última atualização” + data/hora absoluta);
* rótulo do mês centralizado com largura fixa — não desliza ao navegar.

KPIs executivos (os 5 continuam os mesmos):
* todos ganham microvisualização diária quando há competência carregada:
  - Faturamento / Despesas → `daily.amount` (Σ total do dia);
  - Já recebido → `daily.received`; A receber → `daily.outstanding`;
    copy obrigatória de snapshot (“valor atualmente recebido/em aberto dos
    títulos com competência neste dia”) — nunca “recebido neste dia”;
  - Resultado gerencial → receitas − despesas do mesmo dia de competência,
    série assinada com zero no meio do eixo;
* área de microvisualização com altura mínima fixa: cards da faixa alinhados;
* rodapés: Faturamento (Recebido | A receber), Despesas (Pago | A pagar),
  Já recebido / A receber (participação no total), Resultado (Margem = resultado
  ÷ receitas da competência, com sinal; omitida quando não há receita).

Composição por categoria:
* o toggle Despesas|Receitas deixa de ser o controle primário — os dois anéis
  aparecem juntos no mesmo card (Receitas e Despesas);
* cada anel é acionável e abre o detalhe do próprio lado (todas as categorias);
  o card inteiro abre a visão dupla no diálogo;
* total no furo do anel em rótulo compacto, uma linha, sem quebrar no meio do
  número; legenda “competência” com elipse apenas na legenda;
* paleta categórica derivada só das séries protegidas (sem `accent`), com
  misturas em `oklch` para matizes vizinhos distinguíveis.

Grade e superfícies:
* grade principal rebalanceada (composição recebe a coluna mais larga);
* terceira faixa com cards de altura igual (`stretch` + corpo elástico);
* elevação discreta no hover de WidgetShell e ExecutiveKpiCard (tokens);
* CTA “Ver todas as categorias” centralizada no rodapé do card.

Comparativo mensal: barras agrupadas verticais (uma barra por competência em
cada métrica), valores e variação abaixo, zero no meio quando há negativo.
Aceita lista de competências — pronto para histórico de 6 meses.

Composição V2.1 — Fidelity Pass (baseline visual da V2.2):

Convergência visual com mockup DARK (referência canônica), mesma geometria no LIGHT.
Semântica financeira da V2/P2 preservada.

Chrome:
* cabeçalho compacto: “Dashboard financeiro” + “Visão executiva · Competência selecionada”;
* seletor mensal compacto `< AGO 2026 >` (+ Hoje / popover de 12 meses);
* filtros compactos no header: **Mês**, **Situação**, **Categoria** (F11-B2);
  centro de custo permanece em linha própria (tabs);
  URL: `?month=YYYY-MM&costCenter=<uuid>&situation=settled|open|overdue&category=<uuid>`;
  ausente = Todas / consolidado; inválido é removido (não grava default);
* Situação: select Todas / Quitado / Em aberto / Vencido;
  Categoria: combobox com busca, grupos Receita / Despesa / Não classificadas;
* com qualquer filtro de fatia ativo (centro, situação ou categoria), nota no
  widget de Meta: “Meta consolidada da empresa — não é afetada pelos filtros da Home.”;
* freshness “Última atualização” ao lado; sem saudação/hero/régua anual de meses.

Widgets (títulos DENTRO dos cards — WidgetShell):
* 5 KPIs: Faturamento, Já recebido, A receber, Despesas, Resultado gerencial;
  sparklines só em Faturamento/Despesas (`daily` por competenceDate);
  Já recebido/A receber usam RatioMeter (snapshot received|outstanding ÷ total);
* Receitas × Despesas (acumulado competência) + totais no card;
* Composição por categoria com toggle Despesas|Receitas; Top 5 + Outras;
  expand mostra TODAS as categorias;
* Top 5 despesas + Ver todas;
* Até o fim do mês (só mês atual);
* Leitura executiva em sinais compactos (tom só onde seguro);
* Inadimplência compacta;
* Comparativo mensal (mês selecionado × imediatamente anterior via 2× endpoints);
* Movimentação diária da competência (barras diárias ≠ caixa);
* Forecast 90d densificado (só mês atual).

Interações: card inteiro expansível; ESC/X; focus restore; donut hover sync.
Próximos vencimentos: continuam FORA da Home (upcoming preservado no backend).

Composição V2 — Redesign executivo (baseline; visual supersedido por V2.1):

Referência canônica: mockup DARK anexado (linguagem visual, não especificação matemática).
Light mode deriva do mesmo sistema de tokens (série financeira protegida).

Layout modular denso (não relatório A4):

1. Header + seletor mensal + freshness;
2. Faixa de 5 KPIs executivos: Faturamento, Já recebido, A receber, Despesas,
   Resultado gerencial (receitas − despesas da competência; NÃO saldo bancário);
3. Tira compacta: Recebíveis vencidos + Inadimplência;
4. Grid: Receitas × Despesas (acumulado por competenceDate) | Donut despesas |
   Top despesas;
5. Grid: Até o fim do mês (só mês atual) | Leitura executiva | Qualidade recebíveis;
6. Fluxo previsto 90d (só mês atual) — painel denso, sem tabela espremida.

Interações: sparklines/tooltips (séries de competência), hover donut↔legenda,
cards expansíveis (modal ESC/X), ranking Top 5.

Série diária: `receivables.daily` / `payables.daily` — dia = competenceDate;
valor = Σ total. Não inventar caixa diário (L1-B bloqueado).
“Já recebido” / “A receber” sem sparkline de evolução de caixa.

Composição P2 — Home Executiva (baseline semântico preservado; visual supersedido por V2):

Ordem final da Home:

1. Saudação + seletor mensal (`/?month=YYYY-MM`);
2. Resumo Financeiro (KPIs por competência — §10B/P1.1);
3. **Até o fim do mês** — somente no mês civil atual;
4. Leitura executiva mensal;
5. Receitas por categoria | Despesas por categoria (lado a lado no desktop);
6. Fluxo previsto — somente no mês civil atual;
7. fim da Home.

**Removidos da Home (capacidade preservada no backend):**

* Próximos vencimentos (`GET /dashboard/upcoming`) — reservado para futura área Financeiro / D1;
* Alertas placeholder;
* seletor 7/15/30 da antiga Pressão de caixa.

**Até o fim do mês** (`GET /dashboard/month-end-cash-pressure`):

* título: “Até o fim do mês”; subtítulo: compromissos restantes da competência civil atual;
* recorte: `from = hoje civil`, `to = último dia do mês civil`, timezone America/Sao_Paulo;
* títulos ACTIVE unpaid com `dueDate` no intervalo; exclui vencidos antes de hoje;
* três KPIs: A receber, A pagar, Diferença prevista (`receivable − payable`);
* não usar saldo/resultado/lucro/prejuízo/caixa disponível;
* mês passado/futuro selecionado: bloco oculto (não fingir histórico).

**Fluxo previsto** (90 dias a partir de hoje — inalterado):

* barras CSS Entradas × Saídas + tabela compacta;
* líquido = `net` do bucket, não saldo acumulado;
* visível apenas no mês civil atual nesta fase.

Composição E2 — Despesas por categoria na Home (P2):

* `GET /dashboard/monthly-expenses?month=` (competência);
* título: “Despesas por categoria”; subtítulo: “Competência do mês selecionado.”;
* mini-resumo: Total / Já pago / A pagar (sem Vencido — já no Resumo);
* visual: donut compacto Top 5 + “Outras” (soma exata; percentuais do backend);
* `GET /dashboard/expense-composition` permanece como estoque AP (fora da Home).

Composição — Receitas por categoria na Home (P2):

* `GET /dashboard/monthly-revenue?month=` (competência);
* título: “Receitas por categoria”; subtítulo: “Competência do mês selecionado.”;
* mini-resumo: Total / Já recebido / A receber;
* visual: donut compacto Top 5 + “Outras”;
* Faturamento Gerencial = `total` deste contrato; NÃO é caixa do mês;
* `GET /dashboard/receivable-composition` permanece como estoque (fora da Home).

Composição E3 — Leitura executiva mensal (P2):

* `GET /dashboard/executive-insights?month=` (month opcional, espelha monthly-revenue);
* insights determinísticos da competência selecionada (máx. 4); não é IA;
* fatos: totais receita/despesa, balanço, top categoria receita/despesa, gap de classificação;
* sem 30d/90d/estoque; sem semáforo; frontend não calcula diferença nem escolhe categoria;
* mês vazio: empty honesto; mês futuro: apenas dados já lançados por competência.

Estoque total (`GET /dashboard/overview`) permanece capacidade operacional,
mas saiu da narrativa principal da Home.

Composição 10C legado (capacidade preservada, fora da Home P2):

* `GET /dashboard/upcoming?days=7|15|30` — detalhamento por vencimento;
* não aparece na Home executiva P2.

Cada card deverá apresentar, quando aplicável:

* valor;
* título;
* comparação;
* direção da variação;
* período;
* contexto visual.

⸻

13. Cards de KPI

Um card de KPI deverá evitar exibir apenas um número isolado.

Exemplo conceitual:

Faturamento
R$ 186.420
↑ 12,4%
vs. mês anterior

A comparação deve possuir significado claro.

⸻

14. Cores de Indicadores

Cores de crescimento ou queda não deverão assumir automaticamente que:

verde = aumento bom

vermelho = queda ruim.

Exemplo:

Aumento de despesa pode ser negativo.

Queda de inadimplência pode ser positiva.

Portanto, o sistema deverá considerar o significado do indicador antes de definir semântica visual.

⸻

15. Filtros Globais

A dashboard deverá possuir área clara de filtros.

Filtro principal:

Período

Opções iniciais:

* Hoje;
* Ontem;
* Últimos 7 dias;
* Últimos 30 dias;
* Mês atual;
* Mês anterior;
* Últimos 12 meses;
* Ano atual;
* Ano anterior;
* Personalizado.

Evolução F11-A (23/08/2026): a lista acima permanece como requisito
histórico. Na Home vigente o filtro temporal é o seletor de mês civil
de competência (`?month=YYYY-MM`, `America/Sao_Paulo`). Hoje / ontem /
7d / 30d / 12 meses / ano / personalizado diário NÃO serão implementados
na Home (F11-C). F12-A: Relatórios V1 usam De/Até de meses (`from`/`to`).
Não é regressão. Não marcar esses presets diários como disponíveis na Home.

Filtros oficiais da Home hoje:

* mês — `month` (YYYY-MM; omitido = mês corrente);
* centro de custo — `costCenter` (UUID; omitido = Todos);
* situação — `situation` (`settled` | `open` | `overdue`; omitido = Todas);
* categoria — `category` (UUID de `FinancialCategory.id`; omitido = Todas).

Não usar `costCenterId`, `period`, `comparison`, `status`, `categoryId`
nem CSV/array de categorias na URL.
Filtros são cumulativos (AND). A URL é fonte de verdade.

⸻

16. Período Personalizado

Ao selecionar Personalizado, deverá ser possível escolher:

* data inicial;
* data final.

Evolução F11-A: período personalizado (FILTER-005) NÃO entra na Home
nesta fase. Reclassificado (F11-C / relatórios). Texto original
preservado como requisito histórico.

A interface deverá validar intervalos inválidos.

⸻

17. Persistência Temporária dos Filtros

Durante a navegação normal dentro de uma mesma sessão, a aplicação deverá evitar resetar filtros desnecessariamente.

Ao abrir detalhes relacionados a um indicador, o contexto temporal deverá ser preservado quando aplicável.

⸻

18. Comparação Temporal

Indicadores compatíveis deverão mostrar comparação.

Exemplos:

* vs. mês anterior;
* vs. mesmo período anterior;
* vs. ano anterior.

A comparação deverá estar claramente identificada para evitar interpretação incorreta.

Evolução F11-A: na Home, a comparação oficial é mês selecionado × mês
civil imediatamente anterior (automática). vs. mesmo período / vs. ano
e seletor de base NÃO entram nesta fase (F11-C). F11-B só aplica
situação/categoria sobre essa comparação quando couber.

⸻

19. Gráfico de Faturamento

Deverá existir visualização de evolução do faturamento.

Objetivos:

* identificar crescimento;
* identificar queda;
* identificar sazonalidade;
* comparar períodos.

O tipo de gráfico será escolhido durante design visual.

⸻

20. Receita x Despesa

Quando os dados permitirem, deverá existir gráfico comparativo entre:

* receitas;
* despesas.

O usuário deverá conseguir compreender rapidamente a relação entre entrada e saída financeira.

⸻

21. Receita por Categoria

Deverá existir visualização da composição das receitas.

A interface deverá permitir:

* identificar principais categorias;
* visualizar valor;
* visualizar participação percentual quando adequado;
* aprofundar dados quando aplicável.

⸻

22. Despesas por Categoria

Deverá existir visualização equivalente para despesas.

Objetivo:

responder rapidamente:

Onde a empresa está gastando mais?

⸻

23. Despesas Fixas e Variáveis

Quando essa classificação estiver disponível de maneira confiável, deverá existir visualização da relação entre:

* despesas fixas;
* despesas variáveis.

Caso a classificação ainda não esteja disponível, o componente não deverá inventar valores nem ser exibido com dados fictícios.

⸻

24. Contas a Receber

A dashboard deverá permitir visão resumida e detalhamento.

Resumo poderá apresentar:

* total em aberto;
* vencido;
* a vencer;
* recebido no período.

⸻

25. Detalhamento de Contas a Receber

O usuário deverá poder aprofundar a análise.

Informações candidatas:

* cliente;
* descrição;
* vencimento;
* valor original;
* valor aberto;
* situação;
* categoria.

Campos finais dependem da API.

⸻

26. Contas a Pagar

Estrutura equivalente às contas a receber.

Resumo:

* total em aberto;
* vencido;
* a vencer;
* pago no período.

⸻

27. Inadimplência

A interface deverá tratar inadimplência como indicador de atenção.

Deverá permitir:

* valor atual;
* percentual quando definido;
* evolução;
* comparação;
* detalhamento por cliente;
* títulos vencidos.

⸻

28. Fluxo de Caixa

O fluxo de caixa deverá ser uma das principais visualizações do produto.

A interface deverá diferenciar claramente:

* realizado;
* previsto.

⸻

29. Fluxo de Caixa Realizado

Representa movimentações efetivamente ocorridas.

A visualização deverá permitir compreender:

* entradas;
* saídas;
* saldo/resultante;
* evolução.

⸻

30. Fluxo de Caixa Previsto

Representa expectativa futura baseada nos dados financeiros disponíveis.

Deverá diferenciar visualmente projeção de valores efetivamente realizados.

O usuário nunca deverá interpretar projeção como fato ocorrido.

⸻

31. Detalhamento

Gráficos e cards relevantes poderão possuir ação equivalente a:

Ver detalhes

Essa ação deverá abrir:

* drawer;
* modal;
* página específica;

conforme decisão posterior de UX.

O comportamento deverá ser consistente entre componentes.

⸻

32. Tabelas

Tabelas deverão ser utilizadas para detalhamento, não como elemento dominante da dashboard principal.

Devem permitir, quando aplicável:

* ordenação;
* paginação;
* filtros;
* busca;
* estados vazios.

⸻

33. Relatórios

O menu Relatórios só aparece quando a página existir (F12-B). Não usar
placeholder no sidebar (regra §7). Superfície de tenant: visível para USER
e para operador de plataforma somente com Support Mode ativo (`canUseTenantSurfaces`).
Rota: `/relatorios`. Título: Relatórios.

F12-B (24/08/2026): IMPLEMENTADA / HOMOLOGADA TECNICAMENTE — tipo Receita
com visualização na tela. F12-C (25/08/2026): IMPLEMENTADA / HOMOLOGADA
TECNICAMENTE — exportação PDF e Excel do Relatório de Receita. F12-D
(25/08/2026): IMPLEMENTADA / HOMOLOGADA TECNICAMENTE — Relatório de
Despesas na mesma `/relatorios` (tipo funcional) + PDF/XLSX. Fase 12
completa: NÃO (itens históricos do PRD — caixa realizado, inadimplência
de estoque ranged, listagens AR/AP — permanecem fora da V1).

Estrutura V1 (F12-A):

Estrutura V1 (F12-A):

Relatórios
├── Receita
└── Despesas

Lista final = somente tipos implementados. Contas vencidas = filtro
`situation=overdue`, não um terceiro tipo. Financeiro / Fluxo de caixa /
Inadimplência de estoque: fora da V1.

Área de seleção:

* Tipo de relatório
* De (YYYY-MM)
* Até (YYYY-MM)
* Centro de custo
* Situação
* Categoria

URL: `from`, `to`, `costCenter`, `situation`, `category`, `type` (ou o tipo
na rota). Não usar `tenantId`, `costCenterId`, `status`.

Ações: Visualizar. Quando o relatório estiver visualizado (resultado ou
vazio), Exportar PDF e Exportar Excel. Se o usuário alterar um filtro
depois de visualizar, a exportação fica desabilitada até clicar de novo
em Visualizar (snapshot dos filtros da tela). Loading/erro de exportação
são por formato e não bloqueiam a página.
Resultado abaixo dos filtros.

Estados: inicial · loading · vazio · erro · resultado.
Mobile: filtros empilham; resultado sem overflow destrutivo.

⸻

34. Construção de Relatório

Fluxo V1:

Escolher relatório
↓
Definir De / Até (meses de competência)
↓
Aplicar filtros (centro, situação, categoria)
↓
Visualizar
↓
Exportar PDF / Exportar Excel (F12-C: síncrono; mesmos filtros
visualizados; sem job/202)

Eixo: `competenceDate`, timezone `America/Sao_Paulo`. Inclusive.

Formatos da Fase 12:

* PDF (`GET /reports/revenue|expenses?format=pdf`);
* Excel/XLSX (`GET /reports/revenue|expenses?format=xlsx`);
* impressão do browser se suficiente.

Padrão visual do PDF (PRE-IA-4D, 25/08/2026): Receita e Despesas compartilham
a mesma apresentação (margens, paleta clara, Helvetica, header institucional,
KPIs em cards, tabela com header repetido, footer com página). A **logo
principal** da empresa assistida (ou da plataforma, se a empresa não tiver)
entra no topo quando o asset local estiver disponível; ícone compacto **não**
substitui a logo em área institucional larga. Sem logo ou com asset
indisponível/corrompido, o PDF usa o wordmark “Dashboard Economização” e
permanece válido. Cobertura nula continua “—” (nunca 0% inventado). XLSX
não entra neste recorte visual.

Sem link público, e-mail ou agendamento.

⸻

35. Estado de Geração

Quando um relatório exigir processamento assíncrono:

Gerando relatório...

A interface deverá informar:

* processamento;
* sucesso;
* falha.

Não deverá parecer que a tela travou.

⸻

36. Consultor Financeiro — Botão Flutuante

O Consultor Financeiro deverá possuir botão flutuante persistente no canto inferior direito.

O componente deverá permanecer disponível nas principais telas do painel do cliente.

⸻

37. Estados do Botão do Consultor

Estados previstos:

* normal;
* nova mensagem;
* insight importante;
* aberto;
* indisponível temporariamente.

⸻

38. Nova Mensagem

Quando existir mensagem proativa não lida, o botão deverá possuir indicação clara.

Exemplo:

* badge;
* ponto;
* contador;
* animação discreta.

Não deverá utilizar animação excessiva ou invasiva.

⸻

39. Abertura do Consultor

Ao clicar no botão, deverá abrir uma área de conversa.

Em desktop, a preferência conceitual é um painel lateral ou janela sobreposta que permita manter contexto da dashboard.

Em mobile, o Consultor poderá ocupar maior parte ou toda a tela.

A decisão visual final será feita posteriormente.

⸻

40. Primeira Experiência do Consultor

Quando não houver conversa ativa, o Consultor poderá apresentar:

* saudação;
* resumo curto;
* sugestões de perguntas;
* insights recentes.

Exemplo conceitual:

Olá.
Analisei os dados atualizados da sua empresa.
Sua inadimplência caiu neste mês, mas as despesas aumentaram.
O que você gostaria de entender melhor?

O texto real deverá ser produzido conforme regras da IA e dados existentes.

⸻

41. Sugestões de Perguntas

A interface poderá sugerir perguntas contextuais.

Exemplos:

* Como está minha empresa?
* Por que minhas despesas aumentaram?
* Como está minha inadimplência?
* Meu fluxo de caixa está saudável?
* O que merece minha atenção?

Essas sugestões não deverão limitar a conversa.

⸻

42. Consultor Proativo

Quando um insight relevante for detectado:

Insight criado
↓
Consultor possui nova mensagem
↓
Badge no botão
↓
Usuário abre
↓
Consultor apresenta contexto

Exemplo:

Identifiquei um aumento relevante nas despesas deste mês.

⸻

43. Severidade Visual de Insights

Insights poderão possuir diferenças visuais de prioridade.

Categorias conceituais:

* informativo;
* atenção;
* importante;
* crítico.

A interface não deverá alarmar excessivamente o usuário.

⸻

44. Origem dos Insights

Quando útil, o usuário deverá conseguir compreender por que determinado insight foi gerado.

Exemplo:

Baseado em:
Despesas de julho x agosto

Não será necessário expor detalhes técnicos da IA.

⸻

45. Histórico do Consultor

O usuário deverá conseguir recuperar conversas anteriores quando essa funcionalidade estiver implementada.

Estrutura possível:

* conversa atual;
* histórico;
* insights.

A experiência final será refinada posteriormente.

⸻

46. Notificações Internas

A interface deverá possuir mecanismo de notificações.

Acesso preferencial no cabeçalho.

⸻

47. Central de Notificações

A central deverá permitir visualizar:

* notificações não lidas;
* notificações lidas;
* alertas;
* mensagens administrativas;
* insights quando apropriado.

⸻

48. Tipos de Notificação

Categorias visuais poderão incluir:

* sistema;
* financeiro;
* Consultor;
* administrativo.

⸻

49. Branding por Empresa

Após login, o sistema deverá aplicar a identidade visual do tenant.

Variáveis conceituais:

* logo principal (destaque);
* ícone compacto (menu lateral e regiões 1:1);
* cor principal;
* cor secundária;
* fundo;
* texto;
* botões;
* destaques.

⸻

50. Preservação da Legibilidade

O administrador poderá configurar cores, mas a interface deverá possuir proteções contra combinações que comprometam seriamente a leitura.

A estratégia técnica será definida posteriormente.

⸻

51. Fallback de Branding

Quando uma configuração não estiver presente:

Tenant Branding
↓
valor ausente
↓
Platform Branding
↓
Theme Default / placeholder Economização

Assets visuais (PRE-IA-4C):

* Logo principal: logo configurada → logo legado (`logoUrl`) → placeholder.
* Ícone compacto: ícone configurado → ícone da plataforma → placeholder. A logo principal **não** preenche o slot compacto.
* Ausência de asset nunca renderiza `<img>` quebrada nem colapsa o layout.

A interface nunca deverá ficar sem estilo.

⸻

52. Painel Administrativo

A administração deverá possuir navegação própria.

Itens iniciais:

Visão Geral
Empresas
Usuários
Integrações
Consultor
Logs
Auditoria
Configurações

Itens poderão ser agrupados posteriormente para simplificar navegação.

⸻

53. Dashboard Administrativo

O painel admin deverá oferecer visão operacional da plataforma.

Indicadores candidatos:

* empresas ativas;
* usuários;
* empresas conectadas;
* empresas com erro de integração;
* sincronizações com falha;
* empresas necessitando atenção.

Não deverá expor dados financeiros agregados de clientes sem necessidade operacional.

⸻

54. Gestão de Empresas

Tela de empresas deverá permitir:

* listar;
* buscar;
* filtrar;
* criar;
* editar;
* ativar;
* desativar;
* acessar detalhes;
* entrar em modo suporte.

⸻

55. Detalhe da Empresa

A empresa deverá possuir área própria de administração.

Estrutura conceitual:

Empresa
├── Geral
├── Usuários
├── Branding
├── Conta Azul
├── Consultor
├── Sincronizações
├── Regras
├── Notificações
└── Auditoria

Somente abas implementadas deverão ser exibidas.

⸻

56. Configuração de Branding

A tela deverá permitir:

* upload de logo;
* definição das cores;
* preview;
* salvar;
* restaurar padrão.

A experiência deverá mostrar visualmente o resultado antes de salvar quando viável.

⸻

57. Gestão de Usuários

O administrador deverá conseguir:

* listar usuários;
* criar;
* editar informações permitidas;
* ativar;
* desativar;
* solicitar ou permitir redefinição de acesso conforme fluxo definido.

⸻

58. Integração Conta Azul no Admin

A área deverá mostrar:

* status da conexão;
* empresa Conta Azul identificada;
* última sincronização;
* último erro;
* ação de conectar;
* ação de reconectar;
* ação de desconectar quando permitido;
* sincronização manual administrativa.

Tokens nunca deverão ser exibidos.

⸻

59. Sincronizações

A empresa deverá possuir histórico operacional de sincronização acessível aos administradores autorizados.

Colunas candidatas:

* início;
* fim;
* status;
* duração;
* registros;
* origem;
* erro resumido.

Usuário cliente não precisa visualizar o histórico técnico completo.

⸻

60. Configuração do Consultor

Dentro da empresa, o administrador deverá conseguir configurar o Consultor.

Campos iniciais:

* ramo;
* descrição da empresa;
* prompt administrativo;
* tom;
* conhecimento adicional;
* status.

⸻

61. Base de Conhecimento

A área de conhecimento deverá permitir adicionar entradas de forma organizada.

MVP inicial poderá utilizar:

* título;
* conteúdo textual;
* status.

Evoluções futuras poderão incluir arquivos.

⸻

62. Regras do Consultor

A administração deverá possuir local reservado para regras de comportamento proativo.

O MVP poderá começar com regras disponibilizadas pelo sistema.

Editor avançado de regras poderá ser implementado depois.

⸻

63. Modo Suporte

Na lista ou detalhe de uma empresa deverá existir ação:

Acessar em modo suporte

⸻

64. Entrada no Modo Suporte

Ao entrar, a interface deverá apresentar sinalização persistente.

Exemplo conceitual:

MODO SUPORTE
Você está visualizando:
Empresa XYZ
Sair do modo suporte

⸻

65. Segurança Visual do Modo Suporte

A sinalização não deverá desaparecer durante navegação interna.

O objetivo é evitar que o operador esqueça que está agindo dentro do ambiente de um cliente.

⸻

66. Saída do Modo Suporte

A ação para sair deverá ser facilmente acessível.

Após sair, o administrador retorna ao contexto administrativo original
(`/empresas`). Dashboard e Relatórios financeiros deixam de aparecer na
sidebar até nova entrada em Support Mode.

⸻

67. Superadmin

O superadmin poderá possuir elementos administrativos adicionais quando necessário.

A interface comum não deverá exibir controles de superadmin para outros perfis.

⸻

68. Estados de Loading

Toda área que depende de carregamento deverá possuir estado visual apropriado.

Evitar:

* tela branca;
* layout pulando excessivamente;
* ausência de feedback.

Preferir skeletons ou mecanismos equivalentes quando adequados.

⸻

69. Estados Vazios

Ausência de dados deverá ser tratada como estado válido.

Exemplos:

* nenhum título vencido;
* nenhuma notificação;
* nenhum relatório;
* nenhuma conversa.

O sistema não deverá tratar ausência de dado como erro.

⸻

70. Estados de Erro

Erros deverão informar:

* que algo não funcionou;
* o que o usuário pode fazer;
* quando tentar novamente, quando aplicável.

Mensagens técnicas não deverão ser mostradas diretamente ao cliente.

⸻

71. Dados Desatualizados

Se a última sincronização estiver além do limite considerado saudável, a dashboard deverá indicar que os dados podem estar desatualizados.

Exemplo:

Dados atualizados pela última vez há 3 horas.

Isso não deverá impedir acesso aos dados existentes.

⸻

72. Responsividade

Todas as telas do MVP deverão ser desenvolvidas com comportamento responsivo desde sua criação.

Breakpoints específicos serão definidos na implementação.

⸻

73. Dashboard em Telas Menores

Em larguras menores:

* cards poderão empilhar;
* gráficos ocuparão largura maior;
* tabelas deverão utilizar estratégia adequada;
* filtros poderão ser recolhidos;
* menu lateral poderá virar drawer;
* Consultor poderá abrir em tela cheia.

⸻

74. Mobile Futuro

A versão responsiva deverá servir de base futura para PWA.

Não deverá existir dependência estrutural de hover ou mouse para funções essenciais.

⸻

75. Acessibilidade

A interface deverá considerar:

* contraste;
* navegação por teclado quando aplicável;
* labels;
* foco visível;
* semântica de elementos;
* não depender exclusivamente de cor para comunicar informação.

⸻

76. Formatação Financeira

Valores deverão ser apresentados de forma consistente.

No contexto inicial brasileiro:

R$ 123.456,78

A estratégia de internacionalização poderá ser expandida futuramente.

⸻

77. Datas

Datas deverão possuir padrão consistente na interface.

Exemplo inicial:

11/08/2026

Períodos e gráficos poderão utilizar formatos mais compactos quando apropriado.

⸻

78. Percentuais

Percentuais deverão apresentar quantidade de casas adequada ao indicador.

Evitar precisão visual desnecessária.

⸻

79. Gráficos

Todos os gráficos deverão:

* possuir título;
* possuir contexto temporal;
* possuir tooltip quando necessário;
* possuir legenda quando necessário;
* evitar excesso de informação;
* funcionar em telas menores;
* tratar ausência de dados.

⸻

80. Animações

Animações deverão ser discretas.

Poderão ser utilizadas para:

* transições;
* atualização de valores;
* abertura do Consultor;
* feedback.

Não deverão comprometer performance nem tornar o sistema cansativo.

⸻

81. Densidade de Informação

A dashboard deverá apresentar informação suficiente para tomada de decisão sem transformar a tela em uma grade excessivamente densa.

Detalhamento deverá existir sob demanda.

⸻

82. Consistência

Componentes equivalentes deverão possuir comportamento equivalente.

Exemplos:

* filtros;
* dropdowns;
* tabelas;
* modais;
* estados vazios;
* mensagens;
* ações destrutivas.

⸻

83. Confirmações

Ações destrutivas ou sensíveis deverão solicitar confirmação adequada.

Exemplos:

* desativar empresa;
* desconectar Conta Azul;
* desativar usuário.

⸻

84. Feedback de Operações

Após alterações administrativas:

* sucesso deverá ser indicado;
* falha deverá ser indicada;
* usuário deverá saber se operação foi salva.

⸻

85. Diretrizes para Tema

A implementação deverá utilizar sistema de tema centralizado.

Não deverão existir cores de tenant espalhadas manualmente em componentes.

Fluxo:

Platform Theme
+
Tenant Overrides
↓
Resolved Theme
↓
Componentes

Preferência de interface (UI), independente do branding do tenant:

* valores oficiais: `light`, `dark`, `system`;
* default para quem nunca escolheu: `system`;
* `light` força o tema claro; `dark` força o tema escuro;
* `system` acompanha `prefers-color-scheme` do sistema operacional (inclusive mudanças enquanto a app está aberta);
* a escolha é persistida localmente no navegador/dispositivo atual;
* logout, novo login e refresh não resetam a preferência;
* a tela de login aplica a preferência salva antes da autenticação.

O preview Claro/Escuro em Aparência (empresa/plataforma) é prévia de branding, não a preferência de tema da interface.

⸻

86. Não Permitido na Interface

A implementação não deverá:

* inventar dados para preencher gráficos;
* mostrar valores fictícios em produção;
* misturar dados de tenants;
* mostrar token Conta Azul;
* mostrar prompts internos sensíveis ao usuário comum;
* permitir que branding quebre completamente a legibilidade;
* esconder modo suporte;
* bloquear dashboard aguardando sincronização externa;
* exibir funcionalidades futuras como se estivessem disponíveis.

⸻

87. Mapa de Rotas Conceitual

A nomenclatura final poderá mudar durante implementação, mas o mapa funcional previsto é:

/login
/forgot-password
/reset-password
/app
/app/dashboard
/app/reports
/app/consultant
/app/notifications
/app/account
/admin
/admin/dashboard
/admin/companies
/admin/companies/:id
/admin/companies/:id/users
/admin/companies/:id/branding
/admin/companies/:id/integration
/admin/companies/:id/consultant
/admin/companies/:id/syncs
/admin/companies/:id/rules
/admin/companies/:id/notifications
/admin/companies/:id/audit
/admin/users
/admin/logs
/admin/audit
/admin/settings

Rotas não implementadas não deverão ser criadas apenas para satisfazer este mapa antecipadamente.

⸻

88. Fluxo Principal do Cliente

Login
↓
Dashboard
↓
Analisa KPIs
↓
Aplica período
↓
Identifica variação
↓
Abre detalhe
↓
Consulta Consultor
↓
Recebe interpretação
↓
Gera relatório se necessário

⸻

89. Fluxo Proativo

Sincronização
↓
Motor Analítico
↓
Regra identifica situação
↓
Insight
↓
Nova mensagem no Consultor
↓
Badge
↓
Usuário abre
↓
Recebe contexto e recomendação

⸻

90. Fluxo Administrativo de Nova Empresa

Administrador
↓
Cadastrar empresa
↓
Configurar usuários
↓
Configurar branding
↓
Conectar Conta Azul
↓
Primeira sincronização
↓
Configurar Consultor
↓
Empresa disponível

⸻

91. Fluxo de Suporte

Admin/Superadmin
↓
Seleciona empresa
↓
Acessar em modo suporte
↓
Banner persistente
↓
Visualiza painel do cliente
↓
Realiza suporte
↓
Sai do modo suporte
↓
Retorna ao admin

⸻

92. Critérios de Aceite de UX

Uma tela somente poderá ser considerada concluída quando:

1. possuir loading quando aplicável;
2. possuir erro quando aplicável;
3. possuir estado vazio quando aplicável;
4. respeitar tenant;
5. respeitar branding;
6. funcionar em desktop;
7. funcionar em largura mobile compatível;
8. não depender de dados fictícios;
9. possuir feedback de ações;
10. manter consistência com demais telas.

⸻

93. Decisões Consolidadas de UX

UX-001 — Login utiliza branding da plataforma.

UX-002 — Após login, branding do tenant é aplicado.

UX-003 — Dashboard é a primeira tela do cliente.

UX-003.1 — ADMIN/SUPER_ADMIN sem Support Mode aterrissam em `/empresas`. Dashboard financeira não é a home da plataforma.

UX-004 — Período funciona como filtro global.

Evolução F11-A: na Home, o período global vigente é o mês de competência
(`?month=`). Ranges rolantes não são filtro da Home.

UX-005 — Cards principais deverão mostrar contexto e comparação quando aplicável.

UX-006 — Tabelas serão utilizadas principalmente para detalhamento.

UX-007 — Consultor ficará disponível por botão flutuante.

UX-008 — Consultor poderá sinalizar mensagens proativas.

UX-009 — Modo suporte terá sinalização persistente.

UX-010 — Sincronização não bloqueará a dashboard.

UX-011 — Usuário poderá visualizar idade dos dados.

UX-012 — Painel administrativo terá navegação própria.

UX-013 — Branding será baseado em sistema central de tema.

UX-014 — Interface será responsiva desde o MVP.

UX-015 — Funcionalidades futuras não serão exibidas como disponíveis.

⸻

94. Itens Pendentes para Design Visual

Ainda deverão ser definidos posteriormente:

* referência visual final;
* paleta padrão;
* tipografia;
* grid;
* espaçamentos;
* bordas;
* sombras;
* estilo de cards;
* estilo dos gráficos;
* ícones;
* navegação desktop;
* navegação mobile;
* comportamento exato do painel do Consultor;
* sistema visual de severidade;
* estilo da tela de login;
* dark mode, caso venha a existir.

Essas decisões não alteram o contrato funcional definido neste documento.

⸻

95. Diretriz Final

A interface do Dashboard Economização deverá reduzir a distância entre:

DADO
↓
ENTENDIMENTO
↓
DECISÃO

O usuário não deverá precisar ser especialista em finanças para compreender o que o sistema está mostrando.

⸻

