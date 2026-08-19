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
Próxima fase: Fase 8 detalhada (§12) — Modelo Financeiro Normalizado.
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

Status: Parcialmente concluída (8A CONCLUÍDA; 8B pendente)

Entidades já implementadas e sincronizadas com conta ERP real:
FinancialCategory, FinancialAccount, Party, Receivable, Payable
(schema, mappers, repositório de escrita, idempotência por externalId).

D1–D9 fechadas em docs/11 (19/08/2026). Escopo residual da Fase 8:
* 8A — CONCLUÍDA: repositórios de leitura (AR/AP por tenant, status ativo, dueDate);
  sem calcular KPI;
* 8B — testes residuais de domínio e confirmação de índices.

Fora do escopo da Fase 8 (Fase 9 ou posterior): fórmulas de KPI,
agregação mensal do fluxo, buckets de categoria (D8), taxa null (D9).

Fora do escopo da Fase 8 (pertence à Fase 9 ou posterior):
* transações/movimentações (só se fluxo realizado for KPI do recorte);
* saldo de conta financeira;
* rateio valorado por categoria.

Regras financeiras e recorte do primeiro Dashboard: ver docs/11.

Objetivo

Persistir no domínio interno os dados necessários ao produto.

Escopo

Conforme disponibilidade comprovada e necessidade de produto:

* contas financeiras — concluída;
* categorias — concluída;
* clientes/fornecedores (Party) — concluída;
* contas a receber — concluída;
* contas a pagar — concluída;
* repositórios de leitura analítica — pendente (Fase 8 residual);
* transações/movimentações — adiado (Fase 9 ou posterior, se KPI exigir);
* identificadores externos — concluído;
* normalização de status — concluída.

Critérios de aceite

* dados da API não são expostos diretamente como domínio;
* external IDs são preservados;
* tenant é obrigatório;
* sincronização repetida mantém consistência;
* valores financeiros possuem precisão adequada.

⸻

13. Fase 9 — Motor Analítico

Objetivo

Criar as regras oficiais dos indicadores.

Escopo inicial

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

⸻

14. Fase 10 — Dashboard do Cliente

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

Objetivo

Permitir análise temporal aprofundada.

Escopo

* filtros globais;
* períodos predefinidos;
* período personalizado;
* comparação;
* categoria;
* situação;
* preservação de contexto.

Requisitos relacionados

* FILTER-001 a FILTER-005.

Critérios de aceite

* todos os widgets compatíveis respeitam período;
* comparação é matematicamente consistente;
* filtros não atravessam tenant;
* URL ou estado de navegação não permite acesso indevido.

⸻

16. Fase 12 — Relatórios

Objetivo

Permitir exportação e impressão das informações.

Escopo

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

Requisitos relacionados

* REPORT-001 a REPORT-005.

Critérios de aceite

* valores batem com dashboard;
* filtros são respeitados;
* relatório de tenant A nunca contém tenant B;
* arquivos temporários possuem controle apropriado.

⸻

17. Fase 13 — Consultor Financeiro Reativo

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

⸻

18. Fase 14 — Consultor Proativo e Insights

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
* filtros e comparações estiverem funcionais;
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

