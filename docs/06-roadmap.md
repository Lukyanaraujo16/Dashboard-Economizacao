Dashboard Economização

06 — Roadmap de Desenvolvimento

Status: Em elaboração
Projeto: Dashboard Economização
Tipo: Plano de execução por fases

Nota de alinhamento (19/08/2026): A numeração da Ordem Macro (§3) e a
numeração das seções detalhadas (§§4–23) estão defasadas por um —
a Ordem Macro usa rótulos conceituais e não foi renumerada para evitar
quebra de referências históricas. A sequência detalhada das seções
deste documento prevalece. Fases executadas até o momento:
  - Fase 6 detalhada (§10) — Integração Conta Azul: concluída (2.1–2.4)
  - Fase 7 detalhada (§11) — Motor de Sincronização: concluída (2.3–2.4,
    com ressalvas de observabilidade adiadas para a Fase 17 / §21)
  - Fase 8 detalhada (§12) — Modelo Financeiro Normalizado: concluída
    (recorte orientado à necessidade comprovada de produto; 8A incluída)
  - Fase 9 detalhada (§13) — Motor Analítico: concluída no recorte do
    primeiro Dashboard (Grupo A; 9A/9B/9C)
  - Fase 10A — GET /dashboard/overview: CONCLUÍDA
  - Fase 10B — primeiros números reais na Dashboard: CONCLUÍDA / HOMOLOGADA
  - Fase 10C — upcoming + forecast: IMPLEMENTADA / HOMOLOGADA VISUALMENTE
  - Dashboard Executiva V1 / E1 — Pressão de caixa 7/15/30: HOMOLOGADA VISUALMENTE
  - Dashboard Executiva V1 / E2 — Composição das despesas (D8): HOMOLOGADA
  - Dashboard Executiva V1 — Receitas do mês por competência (M1): HOMOLOGADA
  - Dashboard Executiva V1 — Sidebar sticky desktop: HOMOLOGADA
  - F0-G — Auditoria faturamento gerencial + paridade estoque: CONCLUÍDA
  - P1-UX — Semântica temporal estoque × mês: SUPERSEDED (rejeitada na homologação humana)
  - P1.1 — Monthly context (Home month-scoped): IMPLEMENTADO / AGUARDANDO HOMOLOGAÇÃO
  - P2 — Consolidação Home Executiva Financeira: IMPLEMENTADO / AGUARDANDO HOMOLOGAÇÃO
  - V2 — Redesign executivo (DARK ref. + LIGHT + KPIs/gráficos/expand): IMPLEMENTADO / AGUARDANDO HOMOLOGAÇÃO
  - V2.1 — Fidelity Pass (convergência mockup DARK + mesma geometria LIGHT): IMPLEMENTADO / AGUARDANDO HOMOLOGAÇÃO
  - V2.2 — Visual Fidelity + data visualization pass: IMPLEMENTADO / HOMOLOGADO (superseded pela V2.3.1 como baseline)
  - V2.3 — Home Architecture (categorias separadas + Meta de faturamento UI): HOMOLOGADA
  - V2.3.1 — Final Home Polish (copy Meta + Leitura semântica + Comparativo tooltip): HOMOLOGADA — baseline visual/funcional congelado da Home
  - F1-G — Faturamento Gerencial (monthly-revenue): IMPLEMENTADO / AGUARDANDO HOMOLOGAÇÃO
  - L0 — Spike real de baixas Conta Azul: PARCIAL / SUFICIENTE PARA INFRA L1
  - L1-A / CASH-2 — Persistência/ingestão read-only do ledger: IMPLEMENTADA no HEAD. Stash L1 histórico NÃO aplicar.
  - L1-B / CASH-3A — Semântica oficial do caixa + read model mensal: IMPLEMENTADA.
  - Dashboard Executiva V1 / E3 — Leitura executiva (insights determinísticos): IMPLEMENTADA / AGUARDANDO HOMOLOGAÇÃO
  - F2 — Meta de faturamento (persistência/API/CRUD): HOMOLOGADA (widget funcional na Home; F2.0.1 status temporal)
  - CC1 — Centros de custo + alocação + filtro Home: HOMOLOGADA (catálogo + allocations + filtro Home; CC1.1 normalização EVENT-scoped 1 centro incorporada; Meta F2 permanece company-level)
  - CC1.1 — Normalização rateio EVENT-scoped: HOMOLOGADA / incorporada à baseline CC1
  - CC1.2 — Performance N+1 de detalhes de parcela: HOMOLOGADA TECNICAMENTE (estado por parcela + shouldFetch; segundo dry-run 0 GETs; sem alteração visual; homologação visual NÃO APLICÁVEL)
  - CC1.3 — Cash split por centro (híbrido EXACT) + seletor em tabs: HOMOLOGADA VISUALMENTE
  - CC1.3.1 — Fluidez na troca de centro (soft refresh / sem loading global): HOMOLOGADA VISUALMENTE
  - CC1.3.2 — Séries temporais (sparkline) cash por centro: HOMOLOGADA VISUALMENTE
Fase 11 (filtros e comparações da Home): CONCLUÍDA no recorte mensal (24/08/2026).
  F11-A — Congelamento de escopo: CONCLUÍDA (23/08/2026).
  F11-B — Situação + categoria sobre o mês de competência: CONCLUÍDA
          (recorte mensal aprovado).
    F11-B1 — Contrato / backend: CONCLUÍDA.
    F11-B2 — Frontend: HOMOLOGADA.
    F11-B3 — Homologação F11-B2: CONCLUÍDA (24/08/2026).
  F11-C — Períodos rolantes e range personalizado: ADIADA / RECLASSIFICADA
          (não na Home; não cancelada; pouso oficial = Fase 12 Relatórios / F12-A).
Fase 12 (Relatórios): F12-A CONTRATO CONGELADO (24/08/2026). F12-B IMPLEMENTADA /
HOMOLOGADA TECNICAMENTE (24/08/2026) — Relatório de Receita. F12-C IMPLEMENTADA /
HOMOLOGADA TECNICAMENTE (25/08/2026) — PDF/XLSX da Receita. F12-D IMPLEMENTADA /
HOMOLOGADA TECNICAMENTE (25/08/2026) — Relatório de Despesas + PDF/XLSX.
PRE-IA-4D IMPLEMENTADA (25/08/2026) — PDF profissional de Receita e Despesas
(camada visual compartilhada + logo principal; XLSX inalterado). Homologação humana pendente.
Fase 12 completa: NÃO (recorte V1 Receita+Despesas entregue; itens históricos
do PRD fora da V1).
PRE-IA-1 — Admin shell: HOMOLOGADA HUMANAMENTE (25/08/2026).
PRE-IA-2 — Saúde operacional na lista `/empresas`: IMPLEMENTADA.
  Resumo Conta Azul (`Integration.status`) + `lastSuccessfulSyncAt`.
  Não é dashboard administrativa. Histórico de sync, métricas e auditoria
  permanecem na Fase 17. Sem heurística de “sync atrasada”. Sem migration.
M1 (seletor mensal por competência + `?month=`): HOMOLOGADA — NÃO é pendência F11.
L0 (spike baixas GET-only): PARCIAL (GET + reconciliação de quitação comprovados).
L1-A / CASH-2 (financial_transactions): IMPLEMENTADA no HEAD (persistência).
  Stash L1 histórico NÃO aplicar.
L1-B / CASH-3A: read model `MonthlyCashFlow` IMPLEMENTADO (domínio + loader + testes).
CASH-3B: `GET /dashboard/monthly-cash-flow` IMPLEMENTADO (DTO + tipos frontend).
CASH-4A: infra Home IMPLEMENTADA. CASH-4B: KPIs de caixa na Home HOMOLOGADA (HEAD).
CASH-4C: visualizações da Home em caixa HOMOLOGADA (commit `56269b1`).
CASH-6: Relatórios/PDF/XLSX em regime de caixa HOMOLOGADOS (commit `39e2ab3`).
PRE-F13-CASH-FINAL-AUDIT: PASS — experiência financeira oficial coerente com caixa.
PRE-F13-HOME-POLISH-1/2/3: FECHADO E HOMOLOGADO LOCALMENTE (27/08/2026).
  Expansão, drill-down e detalhamento analítico da Home em regime de caixa;
  homologação humana APROVADA. Produção ainda NÃO com esta versão.
  Sem commit até homologação. F13 NÃO iniciada nesta fase.
PRE-F13-HOME-POLISH-2: cobertura de expansão + drill-down analítico (local;
  homologado). Até o fim do mês / Inadimplência / Fluxo previsto
  expansíveis; Leitura executiva navega para modais CASH existentes (sem
  modal-geral duplicado). Sem lista transacional de vencidos (dívida futura).
  PRE-F13-HOME-POLISH-3: detalhamento analítico dos modais (local;
  homologado). Rankings `realizedByCategory` em Faturamento/Já recebido/
  Despesas/Entradas×Saídas; composição billing−despesas no Resultado; A receber
  honesto sem categoria expected. Sem commit. F13 NÃO iniciada.
F13 (Consultor reativo, F13.1–F13.6): IMPLEMENTADA LOCALMENTE — AGUARDANDO HOMOLOGAÇÃO REAL.
  Motor único; provider/model por tenant (`OPENAI` | `ANTHROPIC`); secrets
  `OPENAI_API_KEY` / `ANTHROPIC_API_KEY`; sem BYOK; sem fallback cruzado;
  sem retry automático de generate. Rate limit Redis 20 msg/10min
  user+tenant e 60/10min tenant. F14 NÃO iniciada.
Produção: AINDA BLOQUEADA (rollout operacional — ver pendências CASH-7/8B abaixo).
  F13 em produção NÃO homologada.
CASH-7: bootstrap/backfill LOCAL do ledger IMPLEMENTADO (Clínica Life).
  Discovery = AR/AP local `paid > 0` + GET `/baixa` nas não cobertas.
  Idempotente; skip se Σ gross ACTIVE = paid (DELETED não impede skip).
  Produção NÃO executada. CASH-8A: política R3/R4 no código; flag default false.
  CASH-8B: aplicar R3 local (e5a3). Sem botão na UI.
  Home e Relatórios oficiais já em regime de caixa (CASH-4 / CASH-6 homologados).
  Produção continua bloqueada até backfill + lifecycle controlado.
CASH-8A: lifecycle R3/R4 IMPLEMENTADO no código (flag default false).
  R3: lista 200 não vazia + GET baixa 404 + parcela viva QUITADO +
  remaining gross = valor_pago → DELETED (sem delete físico; reativa no upsert).
  R4: `/baixa []` HOLD, mesmo flag true. CASH-8B NÃO iniciado.
  Não deployar CASH-4B antes do backfill de produção + CASH-8B.
  Faturamento oficial (Felipe): `realized.inflows + expected.receivables`.
  Despesas oficiais: `realized.outflows + expected.payables`. Vencido AP fora.
  Resultado da Home: `billing − monthlyExpenses`. `realized.result` não substitui.
  Vencido não compõe. Pagamento tardio no mês da baixa. Competência não define.
  Meta: `actual = billing` (CASH-4B). Gráficos / leitura / diário / comparativo = CASH-4C.
CASH-9C: transferências internas IMPLEMENTADAS (código + migration + testes).
  Fonte `GET /v1/financeiro/transferencias`. Tabela `financial_transfers`.
  Fora de faturamento/despesas/resultado. Ghost settlement permanece ACTIVE.
  Match conservador 1:1; AMBIGUOUS não exclui. Ingestão local explícita.
  CASH-4B HOMOLOGADA. CASH-4C HOMOLOGADA (commit `56269b1`).
  CASH-4C-CAT: donuts = caixa realizado (fecha com realized.inflows/outflows).
  CASH-6 HOMOLOGADA (commit `39e2ab3`): Relatórios/PDF/XLSX = MonthlyCashFlow
  (mesmo motor da Home; regime de caixa).
  PRE-F13-CASH-FINAL-AUDIT: PASS. F13 local IMPLEMENTADA — AGUARDANDO HOMOLOGAÇÃO REAL; produção NÃO.
Faturamento Gerencial (F1-G): SUPERSEDED na Home (CASH-4B = caixa / MonthlyCashFlow)
  (fórmula de produto SUPERSEDED pela decisão Felipe acima).
Faturamento Fiscal (NF-e/NFS-e): NÃO IMPLEMENTADO (capacidade futura; F0 fiscal preservado).
F2 meta de faturamento: CASH-4B migrou `actual = billing` (caixa, company-level)
  (`revenue_goals` + `GET`/`PUT /dashboard/revenue-goal`; realizado = billing,
  sem duplicar fórmula; sem histórico de revisões da meta).
  Persistência SIM · por tenant SIM · por competência SIM · cadastro/edição SIM ·
  histórico SIM · Meta × Realizado SIM · falta/excesso SIM · futuro = planejada.
  F2.0.1: status temporal — atual abaixo `IN_PROGRESS`; passado abaixo
  `NOT_ACHIEVED`; futuro com meta `PLANNED` (não julga atingimento antecipado).
  IA / sugestão automática de meta: FUTURA / NÃO IMPLEMENTADA.
  Gráfico histórico Meta × Realizado: melhoria futura (fora da F2 homologada).
D1 drill-down / FV1 fixa×variável: NÃO INICIADOS.
E4: ADIADA.
Histórico de sync (2.5 interna): adiado para Fase 17 (§21).

⸻

1. Objetivo

Este documento transforma a documentação funcional, arquitetural, de dados, integração e UX do Dashboard Economização em uma sequência controlada de desenvolvimento.

Cada fase deverá:

* possuir objetivo claro;
* possuir escopo limitado;
* possuir dependências identificadas;
* possuir critérios de aceite;
* evitar implementação de funcionalidades de fases futuras;
* preservar os contratos já definidos nos documentos anteriores.

O Codex deverá executar uma fase por vez.

Nenhuma fase posterior deverá ser iniciada automaticamente.

⸻

2. Princípio de Execução

O desenvolvimento seguirá a regra:

Planejar
↓
Implementar
↓
Testar
↓
Validar
↓
Documentar resultado
↓
Encerrar fase

Somente depois deverá ser iniciada a fase seguinte.

⸻

3. Ordem Macro

Fase 0 — Fundação do Projeto
Fase 1 — Autenticação
Fase 2 — Multiempresa
Fase 3 — Administração
Fase 4 — Branding
Fase 5 — Integração Conta Azul
Fase 6 — Motor de Sincronização
Fase 7 — Modelo Financeiro
Fase 8 — Motor Analítico
Fase 9 — Dashboard
Fase 10 — Filtros e Comparações
Fase 11 — Relatórios
Fase 12 — Consultor Financeiro
Fase 13 — Proatividade e Insights
Fase 14 — Notificações Internas
Fase 15 — Modo Suporte
Fase 16 — Logs, Auditoria e Observabilidade
Fase 17 — Hardening
Fase 18 — Preparação para Produção

⸻

4. Fase 0 — Fundação do Projeto

Objetivo

Criar a base técnica mínima do projeto sem implementar regras de negócio.

Escopo

* inicializar aplicação;
* definir estrutura de diretórios;
* configurar ambiente de desenvolvimento;
* configurar lint;
* configurar formatação;
* configurar typecheck quando aplicável;
* configurar testes;
* configurar variáveis de ambiente;
* configurar banco;
* configurar mecanismo de migrations;
* definir convenções de código;
* criar README técnico inicial.

Não incluir

* autenticação funcional;
* dashboard;
* integração Conta Azul;
* IA;
* relatórios.

Critérios de aceite

* aplicação inicia localmente;
* build funciona;
* lint funciona;
* testes básicos funcionam;
* banco conecta;
* migration inicial pode ser executada;
* nenhum segredo está versionado.

⸻

5. Fase 1 — Autenticação

Objetivo

Implementar acesso seguro à plataforma.

Escopo

* usuário;
* senha segura;
* login;
* logout;
* sessão;
* rotas protegidas;
* recuperação de senha;
* usuário ativo/inativo.

Requisitos relacionados

* AUTH-001;
* AUTH-002;
* AUTH-003;
* AUTH-004;
* AUTH-005.

Critérios de aceite

* login válido funciona;
* senha inválida falha;
* usuário inativo não entra;
* logout invalida sessão;
* recuperação de senha funciona;
* rotas privadas não ficam acessíveis sem sessão.

⸻

6. Fase 2 — Multiempresa

Objetivo

Estabelecer isolamento por tenant antes da implementação de qualquer dado financeiro.

Escopo

* entidade tenant;
* associação usuário → tenant;
* resolução de tenant autenticado;
* middleware ou mecanismo equivalente;
* proteção de queries;
* testes de isolamento.

Requisitos relacionados

* TENANT-001;
* TENANT-002;
* TENANT-003;
* TENANT-004;
* USER-001;
* USER-002.

Critérios de aceite

* usuário do tenant A não acessa tenant B;
* manipulação de parâmetros não atravessa tenants;
* testes automatizados cobrem isolamento;
* tenant inativo impede acesso normal.

⸻

7. Fase 3 — Administração

Objetivo

Criar o painel administrativo mínimo necessário para operar a plataforma.

Escopo

* perfil admin;
* perfil superadmin;
* listagem de empresas;
* cadastro de empresa;
* edição;
* ativação/desativação;
* usuários por empresa;
* cadastro de administradores quando definido;
* dashboard administrativa básica.

Requisitos relacionados

* ADMIN-001;
* ADMIN-002;
* ADMIN-003;
* SUPPORT-001.

Critérios de aceite

* admin cria empresa;
* admin cria usuário da empresa;
* admin ativa/desativa empresa;
* admin ativa/desativa usuário;
* usuário comum não acessa área administrativa.

⸻

8. Fase 4 — Branding

Objetivo

Permitir identidade visual própria por empresa.

Escopo

* branding da plataforma;
* branding do tenant;
* upload de logo;
* cores configuráveis;
* fallback;
* tema resolvido;
* preview administrativo.

Requisitos relacionados

* BRAND-001;
* BRAND-002;
* BRAND-003;
* ADMIN-004;
* ADMIN-008.

Critérios de aceite

* login utiliza marca da plataforma;
* cliente autenticado recebe identidade do tenant;
* ausência de configuração utiliza fallback;
* empresa A não altera branding da B;
* contraste mínimo não é comprometido de forma óbvia.

⸻

9. Fase 5 — Spike Conta Azul

Objetivo

Validar na prática os pontos pendentes da API antes da integração definitiva.

Escopo

Executar testes na Conta de Desenvolvimento para:

* OAuth;
* refresh token;
* empresa conectada;
* contas a receber;
* contas a pagar;
* categorias;
* rateios;
* centros de custo;
* contas financeiras;
* saldo;
* clientes;
* fornecedores;
* vendas;
* paginação;
* filtros;
* datas;
* alterações;
* cancelamentos;
* rate limits;
* headers relevantes.

Entrega obrigatória

Atualizar docs/04-api-conta-azul.md com os resultados reais.

Não incluir

Integração definitiva de produção.

Critérios de aceite

* endpoints necessários conhecidos;
* payloads principais conhecidos;
* paginação conhecida;
* estratégia incremental definida;
* comportamento OAuth testado;
* custo aproximado de chamadas por tenant conhecido.

⸻

10. Fase 6 — Integração Conta Azul

Objetivo

Implementar a conexão OAuth por empresa.

Escopo

* ContaAzulConnector;
* autorização;
* callback;
* armazenamento seguro de credenciais;
* refresh;
* status da integração;
* desconexão/reconexão;
* identificação da empresa externa.

Requisitos relacionados

* CA-001;
* CA-002;
* CA-003;
* CA-004.

Critérios de aceite

* duas empresas podem possuir conexões independentes;
* tokens não chegam ao frontend;
* refresh funciona;
* autorização revogada gera estado de atenção;
* integração de uma empresa não afeta outra.

⸻

11. Fase 7 — Motor de Sincronização

Status: Concluída (19/08/2026, commit 18593bb)
Ressalva: histórico de sync como produto (UI, retenção, métricas)
adiado para Fase 17. Todos os critérios de aceite abaixo foram
atendidos nas fases 2.3 e 2.4 e homologados com conta ERP real.

Objetivo

Construir o mecanismo automático de importação.

Escopo

* scheduler;
* filas/jobs;
* sincronização por tenant;
* idempotência;
* concorrência;
* retries;
* rate limiting;
* sync_runs;
* sincronização manual administrativa;
* estratégia incremental;
* primeira carga.

Requisitos relacionados

* SYNC-001 a SYNC-007.

Critérios de aceite

* sincronização roda sem usuário conectado;
* tenants são processados de forma isolada;
* mesma informação não duplica;
* 429 é tratado;
* falhas são registradas;
* execução manual utiliza o mesmo motor;
* dashboard futura não precisará chamar Conta Azul diretamente.

⸻

12. Fase 8 — Modelo Financeiro Normalizado

Status: Concluída (19/08/2026, recorte orientado à necessidade comprovada
de produto; commit do read model 8A: d8103e7)

A Fase 8 persiste o domínio interno necessário ao produto. Não é
obrigatório importar todo recurso da Conta Azul. Extensões condicionadas
a KPIs futuros (não requisitos universais desta fase concluída):

* transações/movimentações detalhadas e ledger/baixas;
* saldo de conta financeira;
* rateio valorado;
* vendas / notas fiscais / faturamento (fonte ainda indefinida).

Entidades entregues e sincronizadas com conta ERP real:
FinancialCategory, FinancialAccount, Party, Receivable, Payable
(schema, mappers, repositório de escrita, idempotência por externalId).

Read model tenant-scoped (8A): ReceivableReadRepository,
PayableReadRepository, FinancialCategoryReadRepository
(`backend/src/modules/finance/`). Sem KPI. Sem HTTP.

8B (subdivisão operacional de testes/hardening): DESNECESSÁRIA após
auditoria — sem lacuna estrutural antes do Motor Analítico.

D1–D9 fechadas em docs/11. Fórmulas, overdue derivado, fluxo previsto
e buckets D8 pertencem à Fase 9.

Objetivo

Persistir no domínio interno os dados necessários ao produto.

Escopo

Conforme disponibilidade comprovada e necessidade de produto:

* contas financeiras — concluída;
* categorias — concluída;
* clientes/fornecedores (Party) — concluída;
* contas a receber — concluída;
* contas a pagar — concluída;
* repositórios de leitura (8A) — concluída;
* transações/movimentações — adiado (KPI de fluxo realizado, se houver);
* identificadores externos — concluído;
* normalização de status — concluída.

Critérios de aceite

* dados da API não são expostos diretamente como domínio;
* external IDs são preservados;
* tenant é obrigatório;
* sincronização repetida mantém consistência;
* valores financeiros possuem precisão adequada (Decimal);
* read model tenant-scoped disponível para o Motor Analítico;
* a futura camada analítica não chama a Conta Azul (CAZ-011).

Atendidos no recorte concluído.

⸻

13. Fase 9 — Motor Analítico

Status: CONCLUÍDA NO RECORTE DO PRIMEIRO DASHBOARD (GRUPO A)
(19/08/2026; auditoria residual APPROVE).

"Concluída" neste recorte NÃO significa que todos os KPIs
aspiracionais do escopo inicial abaixo foram implementados.
O MVP financeiro completo permanece no backlog (§13 backlog e docs/11).

9A — snapshots AR/AP: CONCLUÍDA.
9B — inadimplência: CONCLUÍDA.
9C — próximos vencimentos + fluxo previsto 90 dias: CONCLUÍDA.
Grupo A — CONCLUÍDO. Sem 9D.

Entregue (fórmulas em docs/11):

* AR aberto, vencido, a vencer (unpaid; dueDate vs hoje SP);
* AP aberto, vencido, a vencer (simétrico);
* inadimplência snapshot atual (overdue/open × 100; open=0 → null);
* próximos vencimentos parametrizados (`nDays` obrigatório, sem default);
* fluxo previsto 90 dias, buckets mensais YYYY-MM, net não acumulado.

`lastSuccessfulSyncAt` já existe na Integration e será consumido na
Fase 10. Não é fórmula do Motor Analítico.

Fronteira: Fase 9 = regras determinísticas, contratos internos,
tenant isolation, Decimal, sem LLM, sem HTTP obrigatório.
Fase 10 = facade/API, serialização, cards, gráficos, estados,
freshness, responsividade.

Critérios de aceite (§ abaixo) — ATENDIDOS no Grupo A.

Objetivo

Criar as regras oficiais dos indicadores.

Escopo inicial (universo do Motor Analítico / MVP completo — NÃO
apagar; itens não entregues no Grupo A permanecem backlog):

* faturamento;
* contas a receber;
* contas a pagar;
* inadimplência;
* receita por categoria;
* despesa por categoria;
* despesas fixas/variáveis quando possível;
* fluxo de caixa realizado;
* fluxo de caixa previsto;
* receita x despesa;
* saldo quando disponível.

Entrega obrigatória

Documentar fórmula oficial de cada KPI implementado.

Critérios de aceite

* cálculos são determinísticos;
* filtros de tenant são obrigatórios;
* mesma regra pode ser reutilizada por dashboard, relatórios e IA;
* nenhum cálculo financeiro depende do LLM.

Atendidos no Grupo A implementado (9A–9C). Fórmulas oficiais: docs/11.

Backlog explícito (não bloqueia Fase 10):

* faturamento (sem fonte oficial);
* receita/despesa por categoria (D8; extensão analítica);
* rateio valorado (exige GET /parcelas/{id});
* fluxo de caixa realizado / ledger / baixas;
* saldo (endpoint não integrado);
* despesas fixas/variáveis (sem regra determinística);
* Receita × Despesa (D7 adiada).

Fase 11 Home: CONCLUÍDA no recorte mensal (F11-C na Fase 12). Fase 12: F12-A CONGELADA. 10A CONCLUÍDA. 10B CONCLUÍDA / HOMOLOGADA. 10C IMPLEMENTADA / HOMOLOGADA VISUALMENTE. E1 Pressão de caixa HOMOLOGADA VISUALMENTE. E2 composição das despesas HOMOLOGADA. Receitas do mês por competência (M1) HOMOLOGADA. E3 leitura executiva IMPLEMENTADA / AGUARDANDO HOMOLOGAÇÃO. E4 ADIADA. L0 spike baixas: PARCIAL. L1-A/CASH-2: HEAD. L1-B/CASH-3A: IMPLEMENTADA. CASH-7: backfill LOCAL feito; produção NÃO. CASH-8A: política R3/R4 no código; flag false. CASH-8B: NÃO. CASH-9C: transferências internas IMPLEMENTADAS (local). CASH-4B: HOMOLOGADA. CASH-4C: HOMOLOGADA. CASH-6: HOMOLOGADA (Reports/PDF/XLSX caixa). PRE-F13-CASH-FINAL-AUDIT: PASS. F13 local IMPLEMENTADA — AGUARDANDO HOMOLOGAÇÃO REAL; produção AINDA BLOQUEADA.

⸻

14. Fase 10 — Dashboard do Cliente

Status: EM ANDAMENTO (recorte).
10A (API/facade GET /dashboard/overview): CONCLUÍDA.
10B (cards, freshness, empty/loading/error): CONCLUÍDA / HOMOLOGADA.
10C (upcoming HTTP + forecast HTTP): IMPLEMENTADA / HOMOLOGADA VISUALMENTE.
E1 (Pressão de caixa 7/15/30): HOMOLOGADA VISUALMENTE.
E2 (Composição das despesas, D8): HOMOLOGADA.
Receitas do mês por competência (M1): HOMOLOGADA.
E3 (Leitura executiva): SUPERSEDED na Home pelo CASH-4C
  (`buildCashExecutiveSignals` a partir do MonthlyCashFlow).

Homologação humana (19/08/2026): Dashboard `/` em Support Mode — quatro
cards Grupo A com números persistidos, freshness visível, estados
never-sync / zero pós-sync / DISCONNECTED / ERROR. Integração
DISCONNECTED manteve KPIs e aviso; reload estável. 10C (lista 7/15/30
default 15 + fluxo previsto 90 dias) homologada visualmente. E1 adiciona
a síntese executiva da mesma janela (A receber / A pagar / Diferença
prevista). A lista de próximos vencimentos permanece provisória na Home
até a futura área Financeiro. E2 composição das despesas HOMOLOGADA.
Receitas do mês por competência (M1) HOMOLOGADA (PAID permanece no mês;
não é faturamento nem caixa). E3 leitura executiva IMPLEMENTADA / AGUARDANDO HOMOLOGAÇÃO.
E4 ADIADA. Fase 11 Home CONCLUÍDA no recorte mensal (F11-C = Fase 12 / F12-A).
F12-A CONTRATO CONGELADO. Faturamento gerencial / meta F2: ver header.
Fixas×variáveis: NÃO INICIADAS.

Contrato 10A (sem fórmulas; fórmulas em docs/11):
GET /dashboard/overview — autenticado; tenant só da sessão/Support Mode.
ADMIN/SUPER_ADMIN sem Support Mode → 403.
Cache-Control: private, no-store.
Decimais em string; today YYYY-MM-DD (America/Sao_Paulo); lastSuccessfulSyncAt ISO ou null.

O primeiro Dashboard utilizável consome o Grupo A (docs/11 §15).
DASH-001–010 e categorias/receita×despesa deste escopo permanecem
no roadmap do MVP completo; não são pré-requisito do primeiro fio.

Objetivo

Entregar a primeira experiência financeira utilizável.

Escopo

* shell do cliente;
* menu;
* header;
* resumo executivo;
* cards;
* gráficos;
* receita/despesa;
* categorias;
* receber/pagar;
* inadimplência;
* fluxo de caixa;
* última sincronização;
* estados vazios;
* loading;
* erro.

Requisitos relacionados

* DASH-001 a DASH-010;
* UX-001 a UX-015 aplicáveis.

Critérios de aceite

* dados vêm apenas do backend interno;
* branding funciona;
* dashboard não bloqueia por Conta Azul;
* KPIs são consistentes;
* layout é responsivo.

⸻

15. Fase 11 — Filtros e Comparações

Status: CONCLUÍDA no recorte da Home (24/08/2026). F11-C não é trabalho
restante na Home — pouso oficial na Fase 12 / F12-A.

F11-A — Congelamento de escopo: CONCLUÍDA.
F11-B — Filtros mensais por situação e categoria: CONCLUÍDA
        (F11-B1 CONCLUÍDA; F11-B2 HOMOLOGADA; F11-B3 CONCLUÍDA;
        recorte mensal CONCLUÍDO).
F11-C — Períodos rolantes e range personalizado: ADIADA / RECLASSIFICADA
        (não implementado na Home; não cancelado; não é regressão;
        destino oficial: Relatórios / F12-A — intervalo De/Até YYYY-MM
        de competência, não dias soltos).

Objetivo original (histórico)

Permitir análise temporal aprofundada.

Escopo original (PRD FILTER-001 a FILTER-005 — texto histórico preservado)

* filtros globais;
* períodos predefinidos (hoje, ontem, 7d, 30d, mês, 12 meses, ano, …);
* período personalizado;
* comparação;
* categoria;
* situação;
* preservação de contexto.

Decisão oficial F11-A (Home)

A Home NÃO será convertida em dashboard genérica de ranges temporais.
Não misturar, num único filtro global da Home: `competenceDate`,
`dueDate` e data de pagamento/baixa.

Eixo temporal oficial da Home:

* competência mensal civil `YYYY-MM`;
* timezone `America/Sao_Paulo`;
* URL `?month=YYYY-MM` (ausente = mês civil corrente);
* agregação financeira principal por `competenceDate`.

Query params oficiais da Home (código vigente; não inventar nomes):

* `month` — mês civil `YYYY-MM`;
* `costCenter` — UUID do centro (ausente = Todos);
* `situation` — `settled` | `open` | `overdue` (ausente = Todas);
* `category` — UUID de `FinancialCategory.id` (ausente = Todas).

Não são query params da Home: `period`, `comparison`, `costCenterId`, `status`
(`costCenterId` é identificador interno; `status` não é o contrato da Home).

Já homologado — NÃO é item pendente desta fase:

* `?month=` — M1 / P1.1 / V2;
* `?costCenter=` — CC1.x (centro de custo concluído; não reabrir);
* comparação automática mês selecionado × mês civil anterior — V2.1 / V2.2;
* meta de faturamento company-level — F2 (não filtrar por centro, categoria
  nem situação);
* forecast / upcoming / pressão de caixa — P1.1 (âncora hoje + `dueDate`;
  não reinterpretar como competência mensal);
* ledger L1-A / L1-B — FORA da Fase 11 (não usar `financial_transactions`).

Recorte vigente

F11-B1 (contrato / backend — CONCLUÍDA):

* FILTER-003 — `situation=settled|open|overdue` (ausente = Todas; inválido = 400);
  `settled` = `status === PAID` (PARTIALLY_PAID fora);
  `open` = `OPEN | OVERDUE | PARTIALLY_PAID`;
  `overdue` = D1 (`unpaid > 0`, status ativo, `dueDate < hoje civil SP`);
  não é `status === OVERDUE`.
* FILTER-004 — `category=<uuid>` de `FinancialCategory.id` (ausente = Todas;
  UUID malformado = 400; inexistente / outro tenant = 404);
  match preciso D8 (um único `categoryExternalIds`); sem rateio, sem rollup.
* `GET /dashboard/categories` — catálogo `{ items: [{ id, name, type }] }` do tenant.
* monthly-revenue / monthly-expenses / executive-insights: situation + category.
* cash-flow-forecast / month-end-cash-pressure: category sim; situation parseada
  (400 se inválida) mas **não aplicada**.
* revenue-goal: company-level; ignora costCenter, situation e category.
F11-B2 (frontend — HOMOLOGADA):

* URL `situation=settled|open|overdue` e `category=<uuid>`; ausente = Todas;
  inválido é removido da URL (mesmo padrão de `costCenter`).
* Header compacto: [Mês] [Situação] [Categoria]; centro de custo permanece
  em linha própria (tabs). Categoria: combobox com busca, grupos Receita /
  Despesa / Não classificadas.
* Propagação: monthly-revenue, monthly-expenses, executive-insights e
  comparação mês anterior enviam os 4 params. Forecast/pressão: category
  sim, situation fora da query. Meta/overview/upcoming: sem fatia.
* Cache distingue situation e category. Meta continua company-level, com
  copy quando qualquer filtro de fatia está ativo.
* F11-B3 (homologação funcional/visual) CONCLUÍDA (24/08/2026).
  F11-B completa no recorte mensal: SIM. F11-C permanece reclassificada.

F11-C (NÃO implementar na Home nesta fase):

* FILTER-001 no que trata de hoje, ontem, 7 dias, 30 dias, 12 meses,
  ano atual e ano anterior;
* FILTER-005 — intervalo inicial/final personalizado;
* comparação livre, seletor de base, range vs range, período equivalente
  customizado.

FILTER-001 / FILTER-005 NÃO estão implementados na Home e NÃO devem ser
marcados como implementados. Foram reclassificados para superfície futura
(preferencialmente Fase 12 / relatórios), onde o eixo temporal poderá ser
definido por contexto. Não é regressão.

Requisitos relacionados

* FILTER-003 e FILTER-004 — recorte F11-B (Home).
* FILTER-002 — na Home vigente = mês × mês anterior (já entregue);
  comparação livre = F11-C.
* FILTER-001 / FILTER-005 — F11-C (reclassificados; não na Home).

Critérios de aceite (recorte vigente da Home)

* widgets de competência respeitam `month` (já homologado);
* widgets today-anchored continuam P1.1;
* comparação mês × anterior permanece matematicamente consistente (D9);
* filtros não atravessam tenant;
* URL ou estado de navegação não permite acesso indevido.

⸻

16. Fase 12 — Relatórios

Status: F12-A CONTRATO CONGELADO (24/08/2026). F12-B IMPLEMENTADA /
HOMOLOGADA TECNICAMENTE (24/08/2026) — Receita (`GET /reports/revenue`,
`/relatorios`). F12-C IMPLEMENTADA / HOMOLOGADA TECNICAMENTE (25/08/2026)
— PDF/XLSX síncronos do Relatório de Receita (`format=pdf|xlsx`).
F12-D IMPLEMENTADA / HOMOLOGADA TECNICAMENTE (25/08/2026) — Despesas
(`GET /reports/expenses` + PDF/XLSX na mesma `/relatorios`). PRE-IA-4D
IMPLEMENTADA (25/08/2026) — acabamento visual profissional do PDF (Receita
e Despesas; XLSX inalterado). Fase 12 completa: NÃO.

Objetivo

Permitir exportação, impressão e leitura analítica fora da Home, sem
converter a Home em BI de ranges e sem inventar caixa.

Nota F11-C: períodos rolantes diários (hoje/ontem/7d/30d) e range
personalizado **em dias** continuam fora da V1. O pouso oficial de
FILTER-001/005 nesta fase, no recorte V1, é o intervalo **De/Até de
meses civis de competência** (`from`/`to` YYYY-MM, inclusive,
`America/Sao_Paulo`, `competenceDate`). Não misturar competência,
vencimento e caixa num filtro genérico único. Contrato: docs/09.6 §17.

Recorte V1 (F12-A)

* Relatório de Receita (`GET /reports/revenue`) — monthly-revenue.
* Relatório de Despesas (`GET /reports/expenses`) — monthly-expenses.
* Contas vencidas = `situation=overdue` (D1) sobre os tipos acima.
* Visualização na tela na F12-B (Receita) e F12-D (Despesas).
* PDF e Excel da Receita na F12-C; da Despesas na F12-D.
* Print do browser se suficiente.
* Geração síncrona; teto 24 meses; job só depois (REPORT-005).
* Sem link público (REPORT-004). Sem e-mail. Sem agendamento.
* Sem fluxo de caixa realizado (L1-B bloqueado; L1-A fora do HEAD).

Escopo histórico (PRD REPORT-001 a REPORT-005 — texto preservado)

* relatório financeiro;
* contas a receber;
* contas a pagar;
* inadimplência;
* categorias;
* fluxo de caixa;
* PDF;
* Excel;
* impressão;
* jobs quando necessário.

A lista UX (§33 de docs/05) só exibe tipos efetivamente implementados.
Taxa de inadimplência de estoque (overview / D2) **não** varia com De/Até.
Fluxo de caixa realizado permanece no texto histórico e **fora** da V1.

Requisitos relacionados

* REPORT-001 a REPORT-005 (PDF/Excel na Fase 12; V1 visual primeiro).
* FILTER-003 e FILTER-004 — mesmos contratos da Home (situation/category).
* FILTER-001 / FILTER-005 — intervalo mensal de competência na F12 V1.

Critérios de aceite (V1)

* valores batem com dashboard no mesmo mês e nos mesmos filtros;
* intervalo De/Até soma competências sem mudar D1/D8/D9/CC1;
* relatório de tenant A nunca contém tenant B;
* `tenantId` em query é 400;
* Home permanece month-scoped (um `month`).

⸻

17. Fase 13 — Consultor Financeiro Reativo

Status: IMPLEMENTADA LOCALMENTE — AGUARDANDO HOMOLOGAÇÃO REAL (F13.1–F13.6).
F14 NÃO iniciada. Produção NÃO homologada.

Objetivo

Permitir que o usuário converse com a IA sobre seus próprios dados.

Escopo

* configuração por tenant;
* ramo;
* descrição;
* prompt administrativo;
* conhecimento textual;
* botão flutuante;
* conversa;
* histórico;
* composição segura de contexto;
* consultas ao Motor Analítico;
* observabilidade da IA.

Requisitos relacionados

* CONSULTOR-001 a CONSULTOR-005;
* CONSULTOR-009;
* CONSULTOR-011.

Critérios de aceite

* IA nunca recebe múltiplos tenants;
* IA responde com base nos dados;
* falta de dado é reconhecida;
* números não são inventados;
* usuário consegue conversar sem sair da dashboard.

Recorte local entregue (F13.1–F13.6): motor único; provider/model por
tenant (`OPENAI` | `ANTHROPIC`); secrets de plataforma
`OPENAI_API_KEY` / `ANTHROPIC_API_KEY`; sem BYOK; sem fallback cruzado;
sem retry automático de generate; chat reativo; rate limit Redis
20 msg/10 min por user+tenant e 60/10 min por tenant. 429 `RATE_LIMITED`
só do limiter da plataforma; `RATE_LIMIT` do vendor → 503 + `ai_run`
FAILED. `LIMIT_BLOCKED` só do limiter da plataforma. Redis fail-closed
apenas no Consultor (503), sem derrubar Dashboard/Relatórios.

⸻

18. Fase 14 — Consultor Proativo e Insights

Status: NÃO INICIADA.

Objetivo

Transformar o Consultor em um componente ativo.

Escopo

* analytical_events;
* motor de regras;
* regras iniciais do sistema;
* ai_insights;
* severidade;
* deduplicação;
* cooldown;
* mensagens proativas;
* badge.

Requisitos relacionados

* CONSULTOR-006;
* CONSULTOR-007;
* CONSULTOR-008;
* CONSULTOR-012;
* RULE-001 a RULE-004.

Primeiras regras candidatas

Somente após validação analítica:

* inadimplência subiu;
* faturamento caiu;
* despesa aumentou;
* fluxo previsto ficou negativo;
* título relevante está vencendo.

Critérios de aceite

* evento é determinístico;
* insight fica persistido;
* não há repetição excessiva;
* usuário percebe mensagem nova;
* IA interpreta evento sem inventar dados.

⸻

19. Fase 15 — Notificações Internas

Objetivo

Criar uma central persistente de comunicação interna.

Escopo

* notifications;
* não lidas/lidas;
* central;
* mensagens administrativas básicas;
* integração com insights.

Requisitos relacionados

* NOTIF-001;
* NOTIF-002.

Não incluir

* OneSignal;
* push;
* WhatsApp.

Critérios de aceite

* notificação permanece após reload;
* leitura altera estado;
* tenant é respeitado.

⸻

20. Fase 16 — Modo Suporte

Status: ENTREGUE no produto (épico 1.6). ADMIN e SUPER_ADMIN. Overlay de
contexto; identidade `tenantId` de plataforma permanece `null`. Não
reimplementar na F12.

Objetivo

Permitir suporte seguro sem compartilhamento de senha.

Escopo

* support_sessions;
* entrar em modo suporte;
* banner persistente;
* identidade do operador;
* sair;
* auditoria.

Requisitos relacionados

* SUPPORT-002 a SUPPORT-007.

Critérios de aceite

* senha do cliente não é necessária;
* identidade real do operador é preservada;
* entrada e saída são auditadas;
* modo suporte é visível durante toda sessão.

⸻

21. Fase 17 — Logs, Auditoria e Observabilidade

Objetivo

Consolidar capacidade operacional e diagnóstica.

Escopo

* auditoria administrativa;
* logs seguros;
* histórico de sync;
* falhas de jobs;
* métricas operacionais;
* estado das integrações;
* ai_runs;
* visão administrativa de saúde.

PRE-IA-2 cobre apenas o resumo `status` + `lastSuccessfulSyncAt` na lista
`/empresas`. Não substitui esta fase: histórico de sync, auditoria, métricas
SaaS e `ai_runs` continuam aqui.

Requisitos relacionados

* LOG-001 a LOG-006;
* requisitos de observabilidade da arquitetura.

Critérios de aceite

* segredos não aparecem em logs;
* ações críticas são rastreáveis;
* empresa sem sincronizar é identificável;
* erro de integração é diagnosticável.

⸻

22. Fase 18 — Hardening

Objetivo

Realizar auditoria completa antes de produção.

Escopo

* segurança;
* tenant isolation;
* autenticação;
* autorização;
* OAuth;
* uploads;
* rate limiting;
* IA;
* prompt injection;
* relatórios;
* sessões;
* auditoria;
* performance;
* responsividade;
* tratamento de erros.

Testes obrigatórios

* acesso cruzado de tenant;
* manipulação de IDs;
* usuário inativo;
* token expirado;
* integração revogada;
* sincronização duplicada;
* jobs concorrentes;
* 429;
* Conta Azul indisponível;
* IA indisponível;
* tentativa de prompt para acessar outro tenant;
* relatório com filtros;
* modo suporte.

Critérios de aceite

Nenhuma vulnerabilidade crítica ou falha conhecida de isolamento permanece aberta.

⸻

23. Fase 19 — Preparação para Produção

Objetivo

Preparar o sistema para uso real.

Escopo

* infraestrutura;
* deploy;
* domínio;
* HTTPS;
* backup;
* restore;
* variáveis;
* observabilidade;
* política de logs;
* cron/scheduler;
* workers;
* armazenamento;
* credenciais Conta Azul de produção;
* documentação operacional.

Critérios de aceite

* deploy reproduzível;
* backup configurado;
* restore validado;
* segredos externos ao Git;
* HTTPS ativo;
* workers funcionam;
* scheduler funciona;
* logs acessíveis;
* aplicação possui health checks quando aplicável.

O **Ambiente Piloto Felipe** (`docs/19-ambiente-piloto.md`, PILOT-INFRA-1) é um recorte operacional desta fase: instalador híbrido numa VPS. Não marca a Fase 19 como concluída nem homologa produção.

⸻

24. Pós-MVP — Mobile e PWA

Não implementar durante o MVP salvo mudança formal de escopo.

Itens previstos:

* PWA;
* instalação;
* service worker;
* OneSignal;
* push;
* regras de push;
* notificações administrativas push.

⸻

25. Pós-MVP — Novos ERPs

Apenas após estabilização da Conta Azul.

Fluxo esperado:

Novo ERP
↓
Connector
↓
Normalizer
↓
Mesmo domínio financeiro
↓
Mesma dashboard

⸻

26. Pós-MVP — Permissões Avançadas

Possíveis evoluções:

* proprietário;
* gestor;
* financeiro;
* visualizador;
* permissões por recurso;
* administradores limitados a determinados tenants.

Não implementar no MVP.

⸻

27. Dependências Entre Fases

Fase 0
↓
Fase 1
↓
Fase 2
↓
Fase 3
↓
Fase 4
Fase 5
↓
Fase 6
↓
Fase 7
↓
Fase 8
↓
Fase 9
↓
Fase 10
↓
Fase 11
↓
Fase 12
↓
Fase 13
↓
Fase 14
↓
Fase 15
↓
Fase 16
↓
Fase 17
↓
Fase 18
↓
Fase 19

Algumas tarefas poderão ser desenvolvidas paralelamente posteriormente, mas a primeira implementação deverá preferir esta sequência para reduzir retrabalho.

⸻

28. Regra para Prompts do Codex

Todo prompt de implementação deverá informar:

* fase atual;
* objetivo;
* arquivos permitidos;
* arquivos proibidos;
* requisitos relacionados;
* critérios de aceite;
* comandos de validação;
* proibição de implementar próxima fase;
* proibição de commit ou push quando não autorizado.

⸻

29. Relatório Obrigatório por Fase

Ao concluir cada fase, o Codex deverá entregar relatório contendo:

1. fase executada;
2. arquivos criados;
3. arquivos alterados;
4. migrations;
5. testes;
6. comandos executados;
7. resultados;
8. requisitos atendidos;
9. pendências;
10. riscos encontrados;
11. confirmação de que não implementou fase posterior.

⸻

30. Commits

Commit não deverá ser automático.

Depois de validação da fase, poderá ser solicitado commit separado.

Cada commit deverá representar uma unidade coerente de trabalho.

⸻

31. Alterações de Escopo

Se durante o desenvolvimento surgir necessidade de alterar:

* PRD;
* arquitetura;
* banco;
* integração;
* UX;

a implementação deverá parar naquela decisão específica.

A documentação correspondente deverá ser atualizada antes da continuação.

⸻

32. Proibição de Inferência

O Codex não deverá implementar comportamento ausente da documentação simplesmente porque considera uma “boa prática” ou melhoria.

Quando existir lacuna relevante:

* registrar como pendência;
* não inventar funcionalidade;
* aguardar decisão.

⸻

33. Critério Geral de Conclusão do MVP

O MVP estará pronto quando:

* autenticação estiver segura;
* isolamento multiempresa estiver validado;
* administração estiver funcional;
* branding estiver funcional;
* Conta Azul estiver integrada;
* sincronização automática estiver estável;
* dados financeiros estiverem normalizados;
* KPIs principais estiverem implementados;
* dashboard estiver funcional;
* filtros e comparações estiverem funcionais
  (Home: competência mensal + F11-B situação/categoria;
  Relatórios V1: intervalo De/Até YYYY-MM de caixa (CASH-6; F12-A histórico);
  ranges diários FILTER-001/005 continuam fora da V1);
* relatórios estiverem funcionais;
* Consultor reativo estiver funcional;
* ao menos um conjunto inicial de insights proativos estiver funcional;
* notificações internas estiverem funcionais;
* modo suporte estiver funcional;
* auditoria estiver funcional;
* hardening estiver concluído;
* ambiente de produção estiver validado.

⸻

34. Diretriz Final

O roadmap deverá priorizar:

CORREÇÃO
antes de
VELOCIDADE
FUNDAÇÃO
antes de
FUNCIONALIDADE
ISOLAMENTO
antes de
DADOS
DADOS
antes de
IA
REGRAS DETERMINÍSTICAS
antes de
INTERPRETAÇÃO

O objetivo não é simplesmente chegar rápido a uma tela visual.

O objetivo é chegar rápido a um produto confiável.

⸻

