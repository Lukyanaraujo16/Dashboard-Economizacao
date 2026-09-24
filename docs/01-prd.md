Dashboard Economização

01 — Product Requirements Document (PRD)

Status: Em elaboração
Projeto: Dashboard Economização
Tipo: Plataforma SaaS multiempresa de inteligência financeira
Fonte de dados inicial: Conta Azul

⸻

1. Objetivo

Este documento define os requisitos funcionais, regras gerais e critérios de aceite do Dashboard Economização.

A Visão do Produto define o propósito da plataforma.

A Arquitetura define os contratos técnicos e estruturais.

Este PRD define como o produto deverá se comportar do ponto de vista funcional.

Nenhuma implementação poderá contradizer:

* docs/00-visao-do-produto.md;
* docs/01-prd.md;
* docs/02-arquitetura.md.

Quando houver conflito entre implementação e documentação, a implementação deverá ser considerada incorreta até que exista decisão formal atualizando a documentação.

⸻

2. Escopo Funcional do MVP

O MVP deverá permitir:

* autenticação na plataforma;
* administração de múltiplas empresas;
* múltiplos usuários por empresa;
* personalização visual por empresa;
* conexão individual de cada empresa com Conta Azul;
* sincronização automática de dados;
* armazenamento interno dos dados sincronizados;
* visualização de indicadores financeiros;
* análise por períodos;
* comparação entre períodos;
* filtros;
* geração de relatórios;
* Consultor Financeiro Inteligente;
* interação em linguagem natural;
* geração de insights;
* comportamento proativo do Consultor;
* alertas internos;
* painel administrativo;
* superadmin;
* modo suporte;
* logs operacionais;
* auditoria.

Nota F11-A (23/08/2026): na Home, “período” vigente = competência mensal
civil (`?month=YYYY-MM`). Ranges rolantes e personalizados em dias
permanecem fora da Home. F12-A (24/08/2026): Relatórios V1 usam intervalo
De/Até de meses civis de competência (`from`/`to`). Contrato: docs/09.6 §17.

⸻

3. Fora do Escopo Inicial

Não fazem parte do MVP inicial:

* lançamento manual de dados financeiros;
* edição de dados financeiros do Conta Azul;
* emissão de notas fiscais;
* escrita financeira no Conta Azul;
* integração financeira com outros ERPs;
* aplicativo mobile nativo;
* notificações push via OneSignal;
* envio de notificações por WhatsApp;
* compartilhamento público de relatórios por link;
* níveis diferentes de permissão entre usuários da mesma empresa;
* criação visual avançada de regras pelo cliente final;
* execução autônoma de operações financeiras pela IA.

Esses itens poderão fazer parte de fases futuras mediante decisão formal.

⸻

4. Glossário

Tenant

Empresa cliente cadastrada no Dashboard Economização.

Cada tenant representa um ambiente lógico independente.

⸻

Usuário da Empresa

Usuário pertencente a uma empresa cliente e autorizado a acessar os dados daquele tenant.

⸻

Administrador

Usuário com acesso à área administrativa da plataforma.

Inicialmente, Fellipe e outros administradores por ele cadastrados.

⸻

Superadmin

Usuário com autoridade técnica superior para administração, suporte e manutenção da plataforma.

⸻

Modo Suporte

Acesso administrativo ao ambiente de uma empresa sem utilização da senha de um usuário cliente.

⸻

Conta Azul

ERP financeiro utilizado como fonte externa inicial dos dados da plataforma.

⸻

Sincronização

Processo de obtenção, normalização e persistência dos dados provenientes do Conta Azul.

⸻

Motor Analítico

Camada responsável por calcular indicadores, comparativos, agregações, tendências e demais informações derivadas.

⸻

Consultor Financeiro

Componente de inteligência artificial responsável por interpretar dados financeiros, responder perguntas, gerar análises e atuar proativamente.

⸻

Insight

Informação relevante detectada pelo sistema ou pelo Consultor Financeiro e persistida para posterior apresentação ao usuário.

⸻

5. Requisitos Funcionais

5.1 AUTH — Autenticação

AUTH-001 — Login

Requisito

O sistema deverá permitir autenticação através de credencial de usuário e senha.

Critérios de aceite

* usuário válido consegue autenticar;
* usuário inválido não consegue autenticar;
* senha incorreta não permite acesso;
* usuário inativo não consegue acessar;
* a aplicação não informa detalhes excessivos que facilitem descoberta de usuários válidos;
* após autenticação, o sistema identifica o perfil e o tenant autorizado quando aplicável.

⸻

AUTH-002 — Sessão autenticada

Requisito

O sistema deverá manter uma sessão autenticada segura para o usuário.

Critérios de aceite

* rotas protegidas exigem autenticação;
* sessão inválida ou expirada impede acesso;
* logout encerra a sessão;
* dados de outro usuário não permanecem acessíveis após logout.

⸻

AUTH-003 — Logout

Requisito

O usuário deverá conseguir encerrar sua sessão explicitamente.

Critérios de aceite

* sessão atual é invalidada;
* rotas protegidas deixam de ser acessíveis;
* nenhuma credencial sensível permanece exposta no frontend.

⸻

AUTH-004 — Recuperação de senha

Requisito

O sistema deverá prever fluxo seguro de recuperação de senha.

Critérios de aceite

* usuário poderá solicitar redefinição;
* redefinição deverá utilizar mecanismo temporário e seguro;
* token expirado ou inválido não poderá redefinir senha;
* senha anterior deixará de ser válida após alteração.

⸻

AUTH-005 — Separação entre login e OAuth Conta Azul

Requisito

A autenticação do Dashboard Economização deverá ser independente da autorização OAuth do Conta Azul.

Critérios de aceite

* usuário pode fazer login na plataforma mesmo que a conexão com Conta Azul esteja temporariamente indisponível;
* token do Conta Azul não é utilizado como credencial de login da plataforma;
* credenciais da plataforma não são utilizadas como credenciais do Conta Azul.

⸻

5.2 TENANT — Empresas

TENANT-001 — Cadastro de empresa

Requisito

O administrador deverá conseguir cadastrar uma empresa cliente.

Dados mínimos esperados

* nome da empresa;
* nome de exibição;
* status;
* identificação interna;
* dados de contato quando definidos posteriormente.

Critérios de aceite

* empresa criada recebe identificador próprio;
* empresa é criada sem acesso a dados de outros tenants;
* criação gera auditoria;
* empresa pode ser posteriormente editada.

⸻

TENANT-002 — Isolamento entre empresas

Requisito

Cada empresa deverá acessar exclusivamente seus próprios dados.

Critérios de aceite

* usuário do tenant A não acessa dados do tenant B;
* alteração de parâmetros de URL ou requisição não permite atravessar tenants;
* regras de isolamento são aplicadas no backend;
* dashboard, relatórios, IA, notificações e histórico respeitam tenant.

⸻

TENANT-003 — Status da empresa

Requisito

O administrador deverá conseguir ativar ou desativar uma empresa.

Critérios de aceite

* empresa inativa não permite acesso normal de seus usuários;
* dados permanecem preservados;
* alteração de status gera auditoria.

⸻

TENANT-004 — Edição de empresa

Requisito

O administrador deverá conseguir editar informações cadastrais da empresa.

Critérios de aceite

* alterações persistem;
* não afetam dados de outros tenants;
* operação gera auditoria.

⸻

5.3 USER — Usuários

USER-001 — Múltiplos usuários por empresa

Requisito

Uma empresa poderá possuir múltiplos usuários.

Critérios de aceite

* todos os usuários permanecem vinculados ao mesmo tenant;
* usuários de uma empresa não podem acessar outra empresa;
* múltiplos usuários podem acessar o mesmo painel da empresa.

⸻

USER-002 — Permissões internas no MVP

Requisito

No MVP, usuários pertencentes à mesma empresa possuirão o mesmo nível funcional de acesso ao painel do cliente.

Critérios de aceite

* não existe diferenciação obrigatória entre financeiro, gestor, vendedor ou proprietário no MVP;
* arquitetura permanece preparada para permissões futuras.

⸻

USER-003 — Cadastro de usuário da empresa

Requisito

O administrador deverá conseguir cadastrar usuários vinculados a uma empresa.

Critérios de aceite

* todo usuário possui vínculo explícito com tenant;
* cadastro exige dados mínimos definidos pela implementação;
* criação gera auditoria.

⸻

USER-004 — Ativação e desativação de usuário

Requisito

O administrador deverá conseguir ativar ou desativar usuários.

Critérios de aceite

* usuário desativado não consegue autenticar;
* histórico do usuário permanece preservado;
* operação gera auditoria.

⸻

5.4 BRAND — Identidade Visual

BRAND-001 — Branding por empresa

Requisito

Cada empresa deverá possuir configuração visual própria.

Configurações mínimas

* logotipo;
* cor principal;
* cor secundária;
* cor dos botões;
* cor de fundo;
* cor de textos;
* cores de destaque.

Critérios de aceite

* identidade da empresa é aplicada após autenticação;
* alterações realizadas pelo administrador são refletidas no painel;
* uma empresa não altera branding de outra.

⸻

BRAND-002 — Branding da plataforma

Requisito

A plataforma deverá possuir identidade visual própria.

Critérios de aceite

* logo da plataforma pode ser utilizada na tela de login;
* identidade padrão existe mesmo sem configuração de tenant;
* branding da plataforma funciona como fallback quando aplicável.

⸻

BRAND-003 — Fallback visual

Requisito

Quando determinada configuração visual da empresa estiver ausente, o sistema deverá utilizar valores padrão.

Critérios de aceite

* ausência de logo não quebra layout;
* ausência de cor específica não quebra tema;
* fallback utiliza identidade padrão definida pela plataforma.

⸻

5.5 CA — Integração Conta Azul

CA-001 — Uma conexão por empresa

Requisito

Cada tenant deverá possuir sua própria autorização para acessar o Conta Azul correspondente.

Critérios de aceite

* credencial de uma empresa não é utilizada por outra;
* conexão é vinculada explicitamente ao tenant;
* revogação afeta apenas a empresa correspondente.

⸻

CA-002 — OAuth

Requisito

A conexão com Conta Azul deverá utilizar o mecanismo oficial de autorização disponibilizado pelo fornecedor.

Critérios de aceite

* fluxo adotado respeita documentação oficial vigente;
* segredos não são expostos ao frontend;
* tokens são armazenados com segurança;
* expiração e renovação são tratadas conforme documentação oficial.

⸻

CA-003 — Status da integração

Requisito

O administrador deverá conseguir visualizar o estado da conexão de cada empresa.

Estados deverão contemplar conceito equivalente a:

* conectada;
* pendente;
* erro;
* atenção necessária;
* sincronizando.

Critérios de aceite

* estado atual é visível;
* falhas relevantes podem ser diagnosticadas;
* status não expõe tokens ou segredos.

⸻

CA-004 — Última sincronização

Requisito

O sistema deverá registrar e permitir consulta da última sincronização bem-sucedida da empresa.

Critérios de aceite

* horário é persistido;
* empresa correta é identificada;
* informação pode ser utilizada por administração e observabilidade.

⸻

5.6 SYNC — Sincronização

SYNC-001 — Sincronização automática

Requisito

Os dados do Conta Azul deverão ser sincronizados automaticamente.

Critérios de aceite

* sincronização não depende de o usuário abrir a dashboard;
* mecanismo funciona em background;
* frequência respeita limites oficiais da API;
* falha de uma empresa não interrompe sincronização das demais.

⸻

SYNC-002 — Menor intervalo seguro

Requisito

A frequência de sincronização deverá buscar o menor intervalo tecnicamente seguro e sustentável.

Deve considerar

* rate limits;
* volume de tenants;
* volume de registros;
* custo computacional;
* disponibilidade de webhooks;
* estabilidade.

Critérios de aceite

* intervalo final é documentado após estudo da API;
* sistema não realiza polling excessivo sem justificativa.

⸻

SYNC-003 — Persistência local

Requisito

Dados sincronizados deverão ser persistidos internamente antes de serem utilizados pela dashboard.

Critérios de aceite

* dashboard não depende de chamada direta ao Conta Azul;
* dados previamente sincronizados continuam disponíveis durante indisponibilidade temporária do ERP.

⸻

SYNC-004 — Idempotência

Requisito

Reprocessar a mesma informação externa não deverá gerar duplicidade.

Critérios de aceite

* registros externos possuem identificação rastreável;
* atualizações substituem ou atualizam registros correspondentes;
* sincronização repetida mantém consistência.

⸻

SYNC-005 — Sincronização incremental

Requisito

Sempre que suportado pela API, a plataforma deverá priorizar sincronização incremental.

Critérios de aceite

* alterações recentes podem ser obtidas sem carga completa quando houver suporte confiável;
* carga completa permanece disponível para primeira sincronização e reconciliação.

⸻

SYNC-006 — Registro de execução

Requisito

Toda sincronização deverá produzir registro operacional.

Campos conceituais

* tenant;
* início;
* fim;
* status;
* duração;
* quantidade processada;
* quantidade criada;
* quantidade atualizada;
* erro;
* tentativa;
* origem.

Critérios de aceite

* histórico permite diagnóstico;
* falhas ficam registradas;
* dados não são expostos ao usuário final sem necessidade.

⸻

SYNC-007 — Sincronização manual administrativa

Requisito

O administrador poderá solicitar sincronização manual quando necessário.

Critérios de aceite

* ação não ignora regras de concorrência;
* ação entra no mesmo fluxo seguro da sincronização automática;
* execução gera log.

⸻

5.7 DASH — Dashboard

Recorte incremental do primeiro Dashboard utilizável: `docs/11-regras-analiticas.md` §15.
O primeiro Dashboard utilizável segue o recorte vigente definido em
docs/11; os demais requisitos desta seção permanecem no roadmap do
MVP completo. DASH-001 (faturamento) permanece requisito do MVP
completo e está adiado nesse primeiro recorte até haver fonte oficial.
Fórmulas: docs/11.

DASH-001 — Faturamento

Requisito

O painel deverá exibir faturamento da empresa.

Critérios de aceite

* utiliza dados do tenant atual;
* respeita período selecionado;
* valor corresponde à regra analítica oficial;
* permite comparação quando aplicável;
* ausência de dados apresenta estado vazio.

⸻

DASH-002 — Contas a receber

Requisito

O painel deverá exibir informações de contas a receber.

Deve permitir distinguir, quando aplicável:

* vencidas;
* atuais;
* futuras;
* recebidas;
* abertas.

Critérios de aceite

* filtros temporais alteram resultado;
* títulos de outro tenant nunca aparecem.

⸻

DASH-003 — Contas a pagar

Requisito

O painel deverá exibir informações de contas a pagar.

Critérios de aceite

* permite análise temporal;
* respeita situação do título;
* valores utilizam regra analítica central.

⸻

DASH-004 — Inadimplência

Requisito

O painel deverá apresentar indicador de inadimplência.

Critérios de aceite

* regra de cálculo é única para dashboard, relatórios e IA;
* suporta comparação entre períodos;
* usuário consegue visualizar evolução temporal.

⸻

DASH-005 — Receita por categoria

Requisito

O sistema deverá apresentar distribuição de receitas por categoria.

Critérios de aceite

* categorias são provenientes ou derivadas dos dados sincronizados;
* gráfico respeita filtros ativos;
* total das categorias deve ser consistente com a visão correspondente.

⸻

DASH-006 — Despesas por categoria

Requisito

O sistema deverá apresentar distribuição de despesas por categoria.

Critérios de aceite

* filtros são respeitados;
* comparação entre períodos poderá ser aplicada;
* dados da mesma categoria são agregados de forma consistente.

⸻

DASH-007 — Despesas fixas

Requisito

O painel deverá apresentar despesas fixas quando houver informação suficiente para classificação confiável.

Critérios de aceite

* classificação possui regra documentada;
* IA não inventa classificação ausente;
* indicador respeita período.

⸻

DASH-008 — Despesas variáveis

Requisito

O painel deverá apresentar despesas variáveis quando houver informação suficiente para classificação confiável.

Critérios de aceite

* regra é consistente com despesas fixas;
* valores respeitam filtros;
* ausência de classificação confiável é tratada explicitamente.

⸻

DASH-009 — Fluxo de caixa

Requisito

O painel deverá apresentar visão de fluxo de caixa.

Critérios de aceite

* permite análise histórica;
* permite visão atual;
* permite visão futura quando os dados suportarem projeção por títulos;
* metodologia de projeção não depende de invenção da IA.

⸻

DASH-010 — Indicadores adicionais

Requisito

Indicadores adicionais poderão ser incluídos quando forem suportados de forma confiável pelos dados.

Exemplos candidatos

* saldo;
* resultado do período;
* receita versus despesa;
* evolução de faturamento;
* ticket médio;
* principais clientes;
* maiores despesas;
* projeções.

Critérios de aceite

* inclusão depende de dados reais disponíveis;
* não deverá ser implementada por suposição.

⸻

5.8 FILTER — Filtros

Nota de evolução (F11-A, 23/08/2026): o texto original dos FILTER-001
a FILTER-005 permanece como requisito histórico do MVP. Não foi apagado.
A Home homologada NÃO é dashboard de ranges livres. Decisão vigente:
docs/06 §15, docs/11 (Home = competência mensal civil).

FILTER-001 — Filtro global de período

Requisito

A dashboard deverá possuir filtro de período aplicável aos widgets compatíveis.

Períodos previstos

* hoje;
* ontem;
* últimos 7 dias;
* últimos 30 dias;
* mês atual;
* mês anterior;
* últimos 12 meses;
* ano atual;
* ano anterior;
* período personalizado.

Critérios de aceite

* mudança de período atualiza os componentes compatíveis;
* período ativo permanece visível para o usuário.

Evolução posterior (F11-A / F12-A): na Home, o filtro temporal vigente é o mês
civil de competência (`?month=YYYY-MM`, timezone `America/Sao_Paulo`,
agregação por `competenceDate`). Hoje, ontem, 7 dias, 30 dias, 12 meses,
ano atual, ano anterior e range **diário** NÃO serão implementados
na Home. Não estão cancelados. F12-A congela o pouso V1 como intervalo
De/Até de **meses** (`from`/`to` YYYY-MM) em Relatórios — não como
presets diários. Não marcar FILTER-001 como implementado na Home.

⸻

FILTER-002 — Comparação entre períodos

Requisito

Indicadores compatíveis deverão permitir comparação com período anterior ou equivalente.

Critérios de aceite

* comparação utiliza períodos coerentes;
* percentual positivo ou negativo é calculado deterministicamente;
* ausência de base comparável é informada.

Evolução posterior (F11-A): na Home, a comparação oficial é mês
selecionado × mês civil anterior (automática; já homologada).
Comparação livre, seletor de base e range vs range NÃO nesta fase
(F11-C). F11-B apenas faz a comparação existente respeitar situação e
categoria quando semanticamente aplicável.

⸻

FILTER-003 — Filtro por situação

Requisito

Dados financeiros compatíveis deverão permitir filtragem por situação.

Exemplos

* pago;
* pendente;
* vencido;
* recebido;
* a receber.

Evolução posterior (F11-A / F11-B): implementado na Home sobre o mês de
competência (`situation=settled|open|overdue`). F12-A: o mesmo contrato
vale em Relatórios. Não usar query `status`.

⸻

FILTER-004 — Filtro por categoria

Requisito

Relatórios e visões compatíveis deverão permitir filtrar por categoria.

Evolução posterior (F11-A / F11-B): implementado na Home
(`category=<uuid>` de FinancialCategory.id, match D8). F12-A: o mesmo
contrato vale em Relatórios. Composição por categoria não substitui o filtro.

⸻

FILTER-005 — Período personalizado

Requisito

O usuário deverá conseguir selecionar intervalo inicial e final personalizado.

Critérios de aceite

* datas inválidas são rejeitadas;
* intervalo é aplicado apenas ao tenant atual.

Evolução posterior (F11-A / F12-A): NÃO implementado na Home. Reclassificado
(F11-C). V1 de Relatórios: intervalo De/Até de meses civis (`from`/`to`),
não datas D/M/A soltas. Eixo = `competenceDate`. Não misturar com
`dueDate` nem data de baixa. Não marcar FILTER-005 como implementado na Home.

⸻

5.9 CONSULTOR — Consultor Financeiro Inteligente

Status de implementação: F13 reativo (F13.1–F13.6) IMPLEMENTADA LOCALMENTE — AGUARDANDO HOMOLOGAÇÃO REAL.
CONSULTOR-006 (proatividade) e F14: NÃO iniciadas. Produção NÃO homologada.

CONSULTOR-001 — Acesso permanente

Requisito

O painel do cliente deverá disponibilizar acesso permanente ao Consultor Financeiro.

Interface inicial prevista

Elemento flutuante no canto inferior direito.

Critérios de aceite

* usuário consegue abrir a interface sem sair da dashboard;
* estado de nova mensagem pode ser sinalizado.

⸻

CONSULTOR-002 — Conversa em linguagem natural

Requisito

O usuário deverá conseguir fazer perguntas em linguagem natural sobre a situação financeira da empresa.

Critérios de aceite

* Consultor utiliza apenas dados do tenant atual;
* pergunta sobre dado inexistente não é respondida como fato;
* resposta deve distinguir dados e interpretação.

⸻

CONSULTOR-003 — Contexto financeiro

Requisito

O Consultor deverá receber contexto financeiro preparado pela aplicação.

Contexto poderá conter

* indicadores;
* tendências;
* comparativos;
* dados filtrados;
* histórico relevante;
* ramo da empresa;
* base de conhecimento;
* instruções administrativas.

Critérios de aceite

* contexto é limitado ao tenant;
* dados desnecessários não são enviados por padrão.

⸻

CONSULTOR-004 — Configuração por empresa

Requisito

Cada empresa deverá possuir configuração própria para o Consultor.

Campos previstos

* provider (OPENAI | ANTHROPIC) e model por tenant;
* ramo de atividade;
* descrição do negócio;
* prompt administrativo;
* orientações de comportamento;
* base de conhecimento;
* tom de comunicação quando definido.

O motor do Consultor é único. Provider e model efetivos vêm da configuração do tenant. Credenciais (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`) são da plataforma e não são persistidas. Sem BYOK. Sem fallback cruzado. Sem retry automático de generate.

Rate limit de plataforma: 20 mensagens / 10 min por usuário+tenant e 60 / 10 min por tenant. 429 `RATE_LIMITED` só deste limiter. Limite do vendor não é 429 da plataforma.

Critérios de aceite

* alteração em um tenant não afeta outro;
* alterações são administráveis sem alteração de código;
* operação gera auditoria.

⸻

CONSULTOR-005 — Base de conhecimento

Requisito

O administrador deverá possuir espaço para adicionar conhecimento complementar específico de cada empresa.

Critérios de aceite

* conhecimento é vinculado ao tenant;
* IA utiliza esse conteúdo como contexto adicional;
* conteúdo não concede permissões extras à IA.

⸻

CONSULTOR-006 — Proatividade

F14 — NÃO INICIADA.

Requisito

O Consultor deverá ser capaz de iniciar interações com o usuário quando identificar situações relevantes.

Critérios de aceite

* proatividade é baseada em regra, evento ou análise;
* não depende de atividade manual do usuário;
* mensagem gerada fica vinculada ao tenant;
* origem da análise pode ser rastreada.

⸻

CONSULTOR-007 — Insights persistidos

Requisito

Insights relevantes deverão ser armazenados.

Critérios de aceite

* insight pode ser marcado como lido;
* permanece disponível após recarregar a página;
* possui data e tenant;
* sistema evita perda da análise por ser apenas resposta temporária.

⸻

CONSULTOR-008 — Severidade do insight

Requisito

Insights poderão possuir classificação de importância.

Conceitos previstos

* informativo;
* atenção;
* importante;
* crítico.

A nomenclatura final poderá ser refinada na UX.

⸻

CONSULTOR-009 — Prevenção de alucinação financeira

Requisito

A IA não deverá inventar dados financeiros.

Critérios de aceite

* fatos financeiros precisam estar sustentados por dados disponíveis;
* projeções possuem metodologia definida;
* ausência de dados é explicitada;
* recomendação deve ser apresentada como recomendação, não fato.

⸻

CONSULTOR-010 — Relatórios por IA

Requisito

O Consultor poderá gerar análises estruturadas e relatórios utilizando os dados da empresa.

Critérios de aceite

* relatório respeita tenant;
* dados numéricos usam motor analítico;
* IA é utilizada para interpretação e narrativa, não para inventar números.

⸻

CONSULTOR-011 — Histórico de conversa

Requisito

Conversas deverão possuir histórico vinculado a usuário e tenant.

Critérios de aceite

* usuário não acessa conversas de outro tenant;
* histórico pode ser utilizado como contexto conforme política definida posteriormente.

⸻

CONSULTOR-012 — Estado de nova mensagem

Requisito

Quando o Consultor produzir mensagem proativa, a interface deverá sinalizar que existe conteúdo novo.

Critérios de aceite

* ícone poderá apresentar badge ou indicação equivalente;
* usuário consegue abrir a mensagem;
* leitura atualiza o estado.

⸻

5.10 RULE — Motor de Regras

RULE-001 — Regras de detecção

Requisito

A plataforma deverá possuir mecanismo para avaliar condições financeiras e gerar eventos.

Exemplos

* aumento de inadimplência;
* queda de faturamento;
* aumento de despesa;
* fluxo de caixa negativo;
* vencimentos relevantes;
* comportamento fora do padrão.

⸻

RULE-002 — Regras administrativas futuras

Requisito

A arquitetura deverá permitir que o administrador configure regras personalizadas futuramente.

Critérios de aceite

* MVP não precisa incluir editor visual completo;
* regras não deverão ficar codificadas diretamente na interface.

⸻

RULE-003 — Deduplicação

Requisito

O sistema deverá impedir alertas repetitivos para a mesma situação dentro de uma janela definida.

⸻

RULE-004 — Cooldown

Requisito

Regras proativas deverão poder respeitar período mínimo entre alertas equivalentes.

⸻

5.11 REPORT — Relatórios

REPORT-001 — Relatório PDF

Requisito

O usuário deverá conseguir gerar relatórios em PDF.

Critérios de aceite

* relatório utiliza dados do tenant;
* respeita filtros selecionados quando aplicável;
* valores são coerentes com dashboard.

⸻

REPORT-002 — Relatório Excel

Requisito

O usuário deverá conseguir exportar relatórios em formato compatível com Excel.

Critérios de aceite

* dados estruturados são exportados;
* tenant correto é respeitado;
* filtros são refletidos.

⸻

REPORT-003 — Impressão

Requisito

O sistema deverá possuir experiência apropriada para impressão de relatórios.

⸻

REPORT-004 — Sem compartilhamento público por link

Requisito

O MVP não deverá criar links públicos de relatórios.

⸻

REPORT-005 — Geração assíncrona

Requisito

Relatórios pesados poderão ser gerados em background.

Critérios de aceite

* usuário não precisa manter requisição aberta durante processamento longo;
* falha na geração pode ser diagnosticada.

Evolução F12-A (24/08/2026): a V1 é **síncrona** (`GET /reports/revenue` e
`GET /reports/expenses`). O exemplo `POST /reports` 202 em docs/09.6 §6.6
**não** é o contrato da V1. Job assíncrono só se o intervalo exceder 24
meses ou a exportação item a item estourar HTTP.

⸻

5.12 ADMIN — Administração

ADMIN-001 — Painel administrativo

Requisito

Administradores deverão possuir área separada para gestão da plataforma.

⸻

ADMIN-002 — Gestão de empresas

Requisito

Administrador deverá criar, editar, ativar e desativar empresas.

⸻

ADMIN-003 — Gestão de usuários

Requisito

Administrador deverá gerenciar usuários das empresas.

⸻

ADMIN-004 — Gestão de branding

Requisito

Administrador deverá configurar identidade visual por empresa.

⸻

ADMIN-005 — Gestão Conta Azul

Requisito

Administrador deverá acompanhar e gerenciar conexão da empresa com Conta Azul.

⸻

ADMIN-006 — Gestão do Consultor

Requisito

Administrador deverá configurar comportamento e conhecimento do Consultor por empresa.

⸻

ADMIN-007 — Estado operacional

Requisito

Administrador deverá conseguir visualizar situações operacionais importantes das empresas.

Exemplos

* conexão com erro;
* última sincronização;
* sincronização falhou;
* atenção necessária.

PRE-IA-2 (25/08/2026): recorte mínimo na lista `/empresas` — conexão Conta Azul
(`Integration.status`) e `lastSuccessfulSyncAt`. Não interpreta CONNECTED como
sync saudável. Histórico de sync, falha de SyncRun e dashboard administrativa
permanecem na Fase 17.

⸻

ADMIN-008 — Administração da marca principal

Requisito

Administrador autorizado deverá conseguir configurar a logo padrão da plataforma.

Critérios de aceite

* logo é utilizada na tela de login;
* pode funcionar como fallback.

⸻

5.13 SUPPORT — Superadmin e Suporte

SUPPORT-001 — Superadmin

Requisito

O sistema deverá possuir perfil de superadministrador.

Critérios de aceite

* superadmin pode administrar a plataforma dentro das regras definidas;
* suas operações são auditadas.

⸻

SUPPORT-002 — Modo suporte do superadmin

Requisito

Superadmin deverá conseguir acessar o painel de uma empresa em modo suporte.

⸻

SUPPORT-003 — Modo suporte administrativo

Requisito

Administradores autorizados também poderão acessar empresas em modo suporte.

⸻

SUPPORT-004 — Sem senha do cliente

Requisito

Modo suporte não deverá exigir senha de usuário da empresa.

⸻

SUPPORT-005 — Identidade real

Requisito

Durante modo suporte, o sistema deverá manter a identidade real do operador administrativo.

⸻

SUPPORT-006 — Indicação visual

Requisito

A interface deverá deixar claro quando um operador estiver em modo suporte.

Critérios de aceite

* operador consegue identificar a empresa atual;
* operador sabe que está em sessão especial;
* saída do modo suporte é facilmente acessível.

⸻

SUPPORT-007 — Auditoria

Requisito

Entrada e saída de modo suporte deverão ser auditadas.

⸻

5.14 LOG — Logs e Auditoria

LOG-001 — Logs de sincronização

Requisito

O sistema deverá registrar histórico de sincronizações.

⸻

LOG-002 — Logs técnicos

Requisito

Falhas técnicas relevantes deverão gerar logs para diagnóstico.

⸻

LOG-003 — Separação entre log e auditoria

Requisito

Logs técnicos e registros de auditoria deverão possuir finalidades distintas.

⸻

LOG-004 — Auditoria administrativa

Requisito

Alterações administrativas relevantes deverão ser auditadas.

⸻

LOG-005 — Conteúdo mínimo de auditoria

Quando aplicável, registro deverá permitir identificar

* operador;
* tenant;
* ação;
* data e hora;
* alvo;
* resultado;
* metadados relevantes.

⸻

LOG-006 — Proteção de segredos

Requisito

Logs não poderão armazenar:

* senha;
* access token completo;
* refresh token completo;
* segredo de aplicação;
* chave de API;
* conteúdo confidencial desnecessário.

⸻

5.15 NOTIF — Notificações

NOTIF-001 — Notificações internas

Requisito

A plataforma deverá possuir estrutura para notificações internas.

⸻

NOTIF-002 — Consultor e notificações

Requisito

Insights do Consultor poderão gerar sinalização interna.

⸻

NOTIF-003 — Notificações administrativas futuras

Requisito

A arquitetura deverá permitir que administradores enviem notificações personalizadas futuramente.

⸻

NOTIF-004 — Regras futuras

Requisito

A arquitetura deverá permitir notificações disparadas por regras.

⸻

NOTIF-005 — Push futuro

Requisito

OneSignal e notificações push ficam fora do MVP inicial.

⸻

5.16 MOBILE — Preparação Mobile

MOBILE-001 — Responsividade

Requisito

Todas as telas do MVP deverão ser construídas com comportamento responsivo.

Critérios de aceite

* dashboard não depende exclusivamente de desktop;
* componentes principais se adaptam a larguras menores;
* decisões de layout não impedem PWA futura.

⸻

MOBILE-002 — PWA futura

Requisito

PWA não será implementada obrigatoriamente no MVP.

A arquitetura não deverá criar impedimento desnecessário para implementação futura.

⸻

6. Requisitos Não Funcionais

RNF-001 — Segurança multiempresa

Nenhuma falha de filtro do frontend poderá ser suficiente para expor outro tenant.

⸻

RNF-002 — Segurança de credenciais

Credenciais externas deverão permanecer no backend e ser armazenadas de forma segura.

⸻

RNF-003 — Performance da dashboard

A renderização da dashboard deverá priorizar dados internos e evitar dependência síncrona de serviços externos.

⸻

RNF-004 — Disponibilidade parcial

Falha do provedor de IA não deverá indisponibilizar dashboard e relatórios financeiros.

Falha temporária do Conta Azul não deverá impedir acesso aos dados previamente sincronizados.

⸻

RNF-005 — Escalabilidade

O sistema deverá suportar crescimento no número de empresas sem exigir reestruturação conceitual do modelo multiempresa.

⸻

RNF-006 — Observabilidade

Operações críticas deverão possuir sinais suficientes para diagnóstico.

⸻

RNF-007 — Idempotência

Sincronizações e jobs críticos deverão ser reexecutáveis de forma segura quando aplicável.

⸻

RNF-008 — Consistência analítica

O mesmo indicador deverá utilizar a mesma regra em diferentes módulos.

⸻

RNF-009 — Privacidade da IA

Dados enviados ao provedor de IA deverão ser limitados ao necessário para o caso de uso.

⸻

RNF-010 — Manutenibilidade

Integrações externas deverão ser desacopladas do domínio interno.

⸻

RNF-011 — Auditabilidade

Operações administrativas sensíveis deverão poder ser rastreadas.

⸻

7. Critérios Gerais de Aceite

Uma funcionalidade somente poderá ser considerada concluída quando:

1. respeitar isolamento de tenant;
2. possuir tratamento de erro compatível com sua criticidade;
3. não expuser credenciais;
4. não introduzir acesso direto da interface ao Conta Azul;
5. respeitar regras analíticas centrais;
6. possuir estados de carregamento quando aplicável;
7. possuir estados vazios quando aplicável;
8. possuir estados de erro quando aplicável;
9. funcionar de forma responsiva;
10. respeitar auditoria quando exigida;
11. não quebrar funcionalidades existentes;
12. possuir validação mínima correspondente ao risco;
13. não depender de comportamento não documentado do Conta Azul;
14. não permitir que IA invente fatos financeiros;
15. não implementar funcionalidades futuras fora da fase autorizada.

⸻

8. Critérios Gerais para Dados Financeiros

Todos os indicadores deverão:

* possuir definição objetiva;
* possuir fonte identificável;
* respeitar filtros;
* respeitar tenant;
* possuir tratamento para ausência de dados;
* utilizar precisão numérica adequada;
* utilizar datas no fuso e convenção definidos posteriormente;
* compartilhar regra oficial entre dashboard, relatório e IA quando aplicável.

⸻

9. Critérios Gerais para o Consultor Financeiro

Toda resposta do Consultor deverá respeitar:

1. dados do tenant atual;
2. instruções administrativas autorizadas;
3. base de conhecimento da empresa;
4. limites de segurança da plataforma;
5. ausência de invenção de fatos financeiros;
6. separação entre fato, análise e recomendação.

A IA não poderá:

* alterar dados financeiros;
* aprovar pagamentos;
* executar transferências;
* alterar o Conta Azul;
* acessar outro tenant;
* conceder permissão a si própria.

⸻

10. Critérios Gerais para Sincronização

Toda sincronização deverá:

* identificar tenant;
* identificar fonte;
* ser rastreável;
* evitar duplicidade;
* registrar falhas;
* respeitar limites externos;
* preservar dados válidos existentes em caso de falha parcial;
* permitir diagnóstico administrativo.

⸻

11. Pendências Dependentes da API Conta Azul

Os seguintes pontos permanecem pendentes de verificação oficial:

* endpoints exatos;
* campos disponíveis;
* disponibilidade de faturamento consolidado;
* estrutura de contas a receber;
* estrutura de contas a pagar;
* categorias;
* fluxo de caixa;
* identificação de despesas fixas e variáveis;
* paginação;
* rate limits;
* OAuth;
* refresh token;
* escopos;
* filtros suportados;
* atualização incremental;
* webhooks;
* limites de histórico;
* status dos títulos;
* comportamento de cancelamentos;
* timezone;
* disponibilidade de saldo;
* clientes;
* centros de custo;
* demais indicadores potencialmente disponíveis.

Nenhum comportamento deverá ser inventado antes da análise oficial.

⸻

12. Definição de Pronto do MVP

O MVP poderá ser considerado funcionalmente pronto quando, no mínimo:

* administrador consegue cadastrar empresa;
* empresa possui usuários;
* usuário consegue autenticar;
* empresa consegue conectar Conta Azul;
* sincronização automática funciona;
* dados financeiros são persistidos internamente;
* dashboard exibe os indicadores principais;
* filtros temporais funcionam;
* comparações funcionam;
* relatórios PDF e Excel funcionam;
* Consultor responde perguntas sobre os dados;
* Consultor produz ao menos uma classe de insight proativo;
* administrador configura contexto do Consultor por empresa;
* modo suporte funciona;
* logs de sincronização existem;
* auditoria de operações críticas existe;
* isolamento multiempresa foi validado;
* layout principal é responsivo.

⸻

13. Diretriz Final

Toda funcionalidade deverá contribuir para o objetivo central do Dashboard Economização:

Transformar dados financeiros em entendimento, antecipação e melhores decisões para o empresário.

A plataforma não deverá se limitar a mostrar números.

Ela deverá ajudar o usuário a entender o que os números significam.

⸻

