Dashboard Economização

03 — Modelagem de Dados

Status: Em elaboração
Projeto: Dashboard Economização
Tipo: Modelo conceitual e lógico de dados
Observação: Este documento não define tecnologia de banco, ORM ou sintaxe de migrations.

⸻

1. Objetivo

Este documento define o modelo de dados necessário para suportar os requisitos do Dashboard Economização.

A modelagem deverá respeitar:

* isolamento multiempresa;
* sincronização com fontes externas;
* rastreabilidade;
* consistência analítica;
* auditoria;
* Consultor Financeiro Inteligente;
* relatórios;
* evolução futura para novos ERPs.

A modelagem aqui definida representa o domínio interno da plataforma.

Ela não deverá reproduzir diretamente a estrutura da API do Conta Azul.

⸻

2. Princípios da Modelagem

2.1 Identificador interno

Toda entidade principal deverá possuir identificador interno próprio.

Identificadores externos de ERPs não substituirão identificadores internos da plataforma.

⸻

2.2 Isolamento por tenant

Entidades pertencentes a uma empresa deverão possuir vínculo explícito com o tenant sempre que aplicável.

⸻

2.3 Rastreabilidade externa

Dados sincronizados deverão preservar informações suficientes para identificar sua origem no ERP.

⸻

2.4 Dados importados e dados derivados

A modelagem deverá distinguir:

* dados sincronizados de fonte externa;
* dados calculados internamente;
* dados administrativos;
* dados gerados pelo Consultor Financeiro;
* dados operacionais.

⸻

2.5 Auditoria separada de logs técnicos

Auditoria e logging técnico deverão ser tratados como domínios diferentes.

⸻

3. Núcleo da Plataforma

3.1 tenants

Representa uma empresa cliente do Dashboard Economização.

Campos conceituais:

* id;
* name;
* display_name;
* status;
* created_at;
* updated_at;
* deactivated_at;
* metadata opcional.

Relacionamentos:

* possui usuários;
* possui branding;
* possui integrações;
* possui dados financeiros;
* possui configuração do Consultor;
* possui relatórios;
* possui insights;
* possui regras;
* possui notificações;
* possui auditoria.

⸻

3.2 users

Representa usuários autenticáveis da plataforma.

Campos conceituais:

* id;
* tenant_id, quando usuário pertencer a empresa;
* name;
* email;
* password_hash;
* status;
* user_type;
* last_login_at;
* created_at;
* updated_at.

Tipos conceituais iniciais:

* tenant_user;
* admin;
* superadmin.

Regras:

* usuário comum pertence a um tenant;
* admin e superadmin podem operar fora de um tenant específico;
* senha nunca é armazenada em texto puro.

⸻

3.3 user_sessions

Representa sessões autenticadas.

Campos conceituais:

* id;
* user_id;
* session_identifier;
* created_at;
* expires_at;
* revoked_at;
* last_activity_at;
* metadata de segurança quando necessário.

⸻

3.4 password_reset_tokens

Representa solicitações temporárias de redefinição de senha.

Campos conceituais:

* id;
* user_id;
* token_hash;
* expires_at;
* used_at;
* created_at.

⸻

4. Branding

4.1 platform_branding

Representa a identidade visual padrão da plataforma.

Campos conceituais:

* id;
* logo_file_id;
* primary_color;
* secondary_color;
* background_color;
* text_color;
* button_color;
* highlight_color;
* created_at;
* updated_at.

Deverá existir apenas uma configuração ativa da marca principal por ambiente da plataforma.

⸻

4.2 tenant_branding

Representa identidade visual específica de uma empresa.

Campos conceituais:

* id;
* tenant_id;
* logo_file_id;
* primary_color;
* secondary_color;
* background_color;
* text_color;
* button_color;
* highlight_color;
* created_at;
* updated_at.

Quando um valor estiver ausente, deverá ser aplicado fallback da identidade padrão.

⸻

4.3 files

Representa arquivos gerenciados pela plataforma.

Utilizações iniciais:

* logos;
* relatórios gerados;
* arquivos associados futuramente à base de conhecimento, quando aplicável.

Campos conceituais:

* id;
* tenant_id opcional;
* file_type;
* original_name;
* storage_key;
* mime_type;
* size;
* checksum;
* created_by;
* created_at.

Arquivos globais da plataforma poderão não possuir tenant_id.

⸻

5. Integrações Externas

5.1 integrations

Representa uma integração externa configurada para um tenant.

Campos conceituais:

* id;
* tenant_id;
* provider;
* status;
* connected_at;
* disconnected_at;
* last_successful_sync_at;
* last_error_at;
* created_at;
* updated_at.

Provider inicial:

* conta_azul.

Estrutura deverá permitir outros provedores futuramente.

Na fase 2.3 a linha `integrations` permanece após o disconnect. O disconnect
oficial remove `integration_credentials` e `integration_external_accounts`
e **não** apaga dados financeiros já importados
(`financial_categories`, `financial_accounts`, `parties`, `receivables`,
`payables`). `last_successful_sync_at` permanece o `finished_at` do último
SUCCESS total.

⸻

5.2 integration_credentials

Representa credenciais protegidas de uma integração.

Campos conceituais:

* id;
* integration_id;
* credential_type;
* encrypted_value;
* expires_at;
* created_at;
* updated_at.

Regras:

* credenciais deverão ser criptografadas ou protegidas conforme estratégia técnica posterior;
* valores nunca deverão aparecer em logs;
* valores nunca deverão ser enviados ao frontend.

⸻

5.3 integration_external_accounts

Representa identificadores e informações da conta externa conectada.

Campos conceituais:

* id;
* integration_id;
* external_account_id;
* external_company_name;
* metadata;
* created_at;
* updated_at.

⸻

6. Sincronização

6.1 sync_runs

Representa cada execução de sincronização.

Na fase 2.3 existe um registro **técnico** mínimo (`trigger_type = MANUAL`,
status PENDING/RUNNING/SUCCESS/FAILED, counts sanitizados, error_code
sanitizado). Não é o produto de histórico da fase 2.5: não há UI de listagem,
retenção automática nem scheduler. Homologação real 18/08/2026: sync manual
assíncrona (202 + worker), idempotência por `(integration_id, external_id)`
e preservação dos dados financeiros no disconnect.

Campos conceituais:

* id;
* tenant_id;
* integration_id;
* sync_type;
* trigger_type;
* status;
* started_at;
* finished_at;
* duration_ms;
* records_processed;
* records_created;
* records_updated;
* records_failed;
* attempt_number;
* error_code;
* error_message_sanitized;
* created_at.

Trigger types conceituais:

* scheduled;
* manual;
* webhook;
* stale_data;
* recovery.

Sync types serão definidos conforme os recursos reais da API.

⸻

6.2 sync_cursors

Representa marcadores utilizados para sincronização incremental.

Campos conceituais:

* id;
* tenant_id;
* integration_id;
* resource_type;
* cursor_value;
* last_external_update_at;
* updated_at.

A existência e formato real dependerão dos recursos oferecidos pela API.

⸻

6.3 sync_failures

Representa falhas específicas que exijam rastreamento adicional.

Campos conceituais:

* id;
* sync_run_id;
* resource_type;
* external_id;
* error_code;
* error_message_sanitized;
* retryable;
* created_at.

⸻

7. Modelo Financeiro Normalizado

O domínio financeiro deverá utilizar nomenclatura própria do Dashboard Economização.

A estrutura exata será refinada após análise da API do Conta Azul.

⸻

7.1 financial_accounts

Representa contas financeiras quando disponibilizadas pela fonte.

Campos conceituais:

* id;
* tenant_id;
* integration_id;
* external_id;
* name;
* account_type;
* status;
* current_balance quando disponível;
* external_created_at;
* external_updated_at;
* synced_at.

⸻

7.2 financial_categories

Representa categorias financeiras.

Campos conceituais:

* id;
* tenant_id;
* integration_id;
* external_id;
* parent_id opcional;
* name;
* category_type;
* status;
* external_updated_at;
* synced_at.

Tipos conceituais:

* revenue;
* expense;
* unknown.

⸻

7.3 customers

Representa clientes ou entidades pagadoras quando disponibilizados pela integração.

Na fase 2.3 a persistência usa a tabela única `parties` (cliente e fornecedor
no mesmo cadastro, via `profiles`). Customers/suppliers separados permanecem
conceito analítico, não tabelas distintas nesta fase.

Campos conceituais:

* id;
* tenant_id;
* integration_id;
* external_id;
* name;
* document_identifier quando aplicável;
* status;
* external_updated_at;
* synced_at.

⸻

7.4 suppliers

Representa fornecedores ou entidades recebedoras quando disponibilizados pela integração.

Campos conceituais:

* id;
* tenant_id;
* integration_id;
* external_id;
* name;
* document_identifier quando aplicável;
* status;
* external_updated_at;
* synced_at.

⸻

7.5 receivables

Representa contas a receber.

Campos conceituais:

* id;
* tenant_id;
* integration_id;
* external_id;
* customer_id opcional;
* category_id opcional;
* description;
* issue_date;
* due_date;
* expected_date quando disponível;
* original_amount;
* open_amount;
* received_amount;
* status;
* received_at;
* external_created_at;
* external_updated_at;
* synced_at.

Estados serão normalizados após análise da API oficial.

⸻

7.6 payables

Representa contas a pagar.

Campos conceituais:

* id;
* tenant_id;
* integration_id;
* external_id;
* supplier_id opcional;
* category_id opcional;
* description;
* issue_date;
* due_date;
* expected_date quando disponível;
* original_amount;
* open_amount;
* paid_amount;
* status;
* paid_at;
* external_created_at;
* external_updated_at;
* synced_at.

⸻

7.7 financial_transactions

Representa movimentações financeiras efetivamente realizadas quando a fonte disponibilizar granularidade suficiente.

Campos conceituais:

* id;
* tenant_id;
* integration_id;
* external_id;
* account_id opcional;
* category_id opcional;
* transaction_type;
* transaction_date;
* amount;
* description;
* related_receivable_id opcional;
* related_payable_id opcional;
* external_updated_at;
* synced_at.

⸻

7.8 revenue_records

Representação normalizada de receitas quando necessária para cálculo analítico.

Campos conceituais:

* id;
* tenant_id;
* source_type;
* source_id;
* category_id;
* reference_date;
* amount;
* status;
* created_at;
* updated_at.

A existência desta entidade física deverá ser confirmada na modelagem técnica.

Poderá ser materialização derivada de outras entidades.

⸻

7.9 expense_records

Representação normalizada de despesas quando necessária para cálculo analítico.

Campos conceituais:

* id;
* tenant_id;
* source_type;
* source_id;
* category_id;
* reference_date;
* amount;
* expense_behavior;
* status;
* created_at;
* updated_at.

expense_behavior poderá representar conceitos como:

* fixed;
* variable;
* unknown.

A classificação somente deverá existir quando houver regra confiável.

⸻

8. Dados Analíticos

8.1 metric_definitions

Representa definições oficiais dos indicadores calculados pela plataforma.

Campos conceituais:

* id;
* code;
* name;
* description;
* calculation_version;
* status;
* created_at;
* updated_at.

Exemplos:

* revenue;
* receivables;
* payables;
* delinquency;
* cash_flow.

Essa entidade permite versionamento conceitual das métricas.

⸻

8.2 metric_snapshots

Representa resultados de indicadores previamente calculados quando pré-processamento for vantajoso.

Campos conceituais:

* id;
* tenant_id;
* metric_definition_id;
* period_start;
* period_end;
* dimension_type opcional;
* dimension_value opcional;
* numeric_value;
* metadata;
* calculated_at;
* source_version.

Uso dessa entidade dependerá da estratégia de performance definida posteriormente.

⸻

8.3 analytical_events

Representa eventos detectados pelo motor analítico ou de regras.

Campos conceituais:

* id;
* tenant_id;
* event_type;
* severity;
* period_start;
* period_end;
* source_metric;
* payload estruturado;
* detected_at;
* processed_at;
* status.

Exemplos:

* revenue_drop;
* delinquency_growth;
* expense_spike;
* projected_negative_cash_flow.

⸻

9. Consultor Financeiro

9.1 ai_tenant_settings

Representa configuração do Consultor Financeiro por empresa.

Campos conceituais:

* id;
* tenant_id;
* business_segment;
* business_description;
* admin_prompt;
* tone;
* status;
* created_at;
* updated_at.

⸻

9.2 ai_knowledge_entries

Representa entradas da base de conhecimento específica da empresa.

Campos conceituais:

* id;
* tenant_id;
* title;
* content;
* content_type;
* status;
* created_by;
* created_at;
* updated_at.

No MVP, o conhecimento poderá ser inicialmente textual.

Arquivos ou embeddings dependerão de decisão técnica posterior.

⸻

9.3 ai_conversations

Representa uma conversa com o Consultor.

Campos conceituais:

* id;
* tenant_id;
* user_id;
* status;
* title opcional;
* started_at;
* last_message_at;
* created_at;
* updated_at.

⸻

9.4 ai_messages

Representa mensagens de uma conversa.

Campos conceituais:

* id;
* conversation_id;
* tenant_id;
* sender_type;
* content;
* message_type;
* related_insight_id opcional;
* created_at.

Sender types conceituais:

* user;
* consultant;
* system.

⸻

9.5 ai_insights

Representa insights persistentes gerados pelo sistema ou Consultor.

Campos conceituais:

* id;
* tenant_id;
* analytical_event_id opcional;
* insight_type;
* category;
* title;
* content;
* severity;
* source;
* period_start;
* period_end;
* supporting_data;
* status;
* detected_at;
* created_at;
* updated_at.

Status conceituais:

* unread;
* read;
* dismissed;
* resolved.

⸻

9.6 ai_runs

Representa execuções do provedor de IA para fins operacionais e observabilidade.

Campos conceituais:

* id;
* tenant_id;
* user_id opcional;
* conversation_id opcional;
* insight_id opcional;
* run_type;
* provider;
* model;
* status;
* input_tokens quando disponível;
* output_tokens quando disponível;
* duration_ms;
* error_code;
* created_at;
* finished_at.

Não deverá armazenar segredos.

Política de armazenamento de prompts completos será definida posteriormente considerando privacidade.

⸻

10. Motor de Regras

10.1 rules

Representa regras configuradas ou internas.

Campos conceituais:

* id;
* tenant_id opcional;
* code;
* name;
* description;
* rule_type;
* severity;
* status;
* configuration;
* cooldown_seconds;
* created_by;
* created_at;
* updated_at.

Regras sem tenant poderão representar regras globais da plataforma.

⸻

10.2 rule_executions

Representa avaliações executadas.

Campos conceituais:

* id;
* rule_id;
* tenant_id;
* status;
* evaluated_at;
* condition_met;
* resulting_event_id opcional;
* execution_metadata.

⸻

10.3 rule_alert_states

Representa estado de deduplicação e cooldown.

Campos conceituais:

* id;
* rule_id;
* tenant_id;
* deduplication_key;
* last_triggered_at;
* cooldown_until;
* trigger_count;
* updated_at.

⸻

11. Relatórios

11.1 reports

Representa solicitações e arquivos de relatório.

Campos conceituais:

* id;
* tenant_id;
* requested_by;
* report_type;
* format;
* filter_definition;
* status;
* file_id opcional;
* requested_at;
* started_at;
* completed_at;
* error_message_sanitized.

Formatos iniciais:

* pdf;
* excel.

Impressão poderá utilizar visualização própria sem necessidade de arquivo persistido.

⸻

12. Notificações

12.1 notifications

Representa notificações internas.

Campos conceituais:

* id;
* tenant_id;
* user_id opcional;
* notification_type;
* title;
* content;
* severity;
* source_type;
* source_id;
* read_at;
* created_at;
* expires_at opcional.

⸻

12.2 notification_deliveries

Representa tentativas de entrega por canais externos futuros.

Campos conceituais:

* id;
* notification_id;
* channel;
* provider;
* status;
* attempted_at;
* delivered_at;
* error_code.

No MVP essa entidade poderá permanecer sem uso até implantação de canais externos.

⸻

13. Logs e Auditoria

13.1 audit_logs

Representa eventos administrativos e de segurança auditáveis.

Campos conceituais:

* id;
* tenant_id opcional;
* actor_user_id;
* actor_type;
* action;
* target_type;
* target_id;
* support_session_id opcional;
* before_data sanitizado;
* after_data sanitizado;
* metadata sanitizada;
* ip_address quando permitido;
* user_agent quando aplicável;
* created_at.

Regras:

* registros não deverão ser editáveis por usuários comuns;
* segredos não poderão ser armazenados.

⸻

13.2 application_logs

Logs técnicos serão preferencialmente tratados por mecanismo próprio de observabilidade.

Não deverão ser modelados como uma tabela de negócio obrigatória.

Quando armazenamento persistente interno for necessário, deverá ser definido posteriormente.

⸻

14. Modo Suporte

14.1 support_sessions

Representa sessões de suporte administrativo.

Campos conceituais:

* id;
* operator_user_id;
* tenant_id;
* started_at;
* ended_at;
* reason opcional;
* created_at.

Regras:

* identidade do operador real deve permanecer conhecida;
* todas as ações relevantes podem referenciar a support_session.

⸻

15. Configurações Gerais

15.1 platform_settings

Representa configurações globais da aplicação que não constituem segredos.

Campos conceituais:

* id;
* key;
* value;
* updated_by;
* updated_at.

Segredos de infraestrutura não deverão ser armazenados aqui.

⸻

15.2 tenant_settings

Representa configurações específicas de uma empresa que não pertencem a um domínio mais específico.

Campos conceituais:

* id;
* tenant_id;
* key;
* value;
* updated_by;
* updated_at.

Deverá ser utilizado com cautela para evitar transformar a tabela em armazenamento genérico sem contrato.

⸻

16. Relacionamentos Principais

Fluxo conceitual:

Tenant
├── Users
├── Branding
├── Integrations
│   ├── Credentials
│   ├── External Account
│   └── Sync Runs
├── Financial Data
│   ├── Accounts
│   ├── Categories
│   ├── Customers
│   ├── Suppliers
│   ├── Receivables
│   ├── Payables
│   └── Transactions
├── Analytics
│   ├── Metric Snapshots
│   └── Analytical Events
├── Consultant
│   ├── Settings
│   ├── Knowledge
│   ├── Conversations
│   ├── Messages
│   ├── Insights
│   └── AI Runs
├── Rules
├── Reports
├── Notifications
├── Support Sessions
└── Audit Logs

⸻

17. Restrições de Integridade

A modelagem deverá garantir logicamente que:

* usuário de tenant sempre pertença a tenant válido;
* branding de tenant pertença a apenas uma empresa;
* integração pertença a tenant;
* credencial pertença a integração;
* dado financeiro pertença ao tenant correto;
* external_id seja interpretado sempre dentro do contexto de integração/fonte;
* conversa pertença a tenant;
* mensagem pertença à mesma empresa da conversa;
* insight pertença a tenant;
* relatório pertença a tenant;
* notificação não atravesse tenants;
* regra específica de tenant permaneça isolada;
* support_session registre operador real e tenant alvo.

⸻

18. Unicidade Conceitual

As seguintes combinações deverão possuir unicidade quando aplicável:

* e-mail de usuário conforme regra de autenticação escolhida;
* external_id + integration_id + tipo de recurso;
* uma configuração ativa de branding por tenant;
* uma configuração principal do Consultor por tenant;
* identificadores de deduplicação de regras conforme janela definida.

A implementação exata dos índices será definida posteriormente.

⸻

19. Datas e Valores Financeiros

Datas

Datas deverão ser armazenadas de forma não ambígua.

A estratégia de timezone será definida tecnicamente posteriormente.

Datas financeiras de competência, vencimento e pagamento deverão permanecer semanticamente distintas.

⸻

Valores monetários

Valores financeiros deverão utilizar representação decimal exata adequada para moeda.

Não deverão ser armazenados usando representação binária imprecisa típica de ponto flutuante.

⸻

20. Exclusão de Dados

A política definitiva de exclusão será definida posteriormente.

Como princípio:

* exclusão administrativa não deverá destruir imediatamente informações necessárias para auditoria;
* dados financeiros sincronizados deverão possuir estratégia segura de remoção ou arquivamento;
* desativação deverá ser preferida quando preservação histórica for necessária.

⸻

21. Versionamento de Cálculos

Indicadores financeiros poderão evoluir.

Quando uma alteração de regra puder modificar resultados históricos, a plataforma deverá possuir mecanismo conceitual para identificar a versão da regra utilizada.

Isso poderá ser realizado através de:

* metric_definitions;
* calculation_version;
* metadata de snapshots;
* outras estratégias técnicas aprovadas posteriormente.

⸻

22. Preparação para Novos ERPs

O modelo interno não deverá exigir tabelas inteiramente novas para cada ERP quando os conceitos financeiros forem equivalentes.

Dados externos deverão ser normalizados para o modelo comum.

Quando um ERP possuir informação exclusiva, extensões deverão ser adicionadas sem contaminar os conceitos centrais.

⸻

23. Preparação para Volume

As entidades com maior potencial de crescimento são:

* receivables;
* payables;
* financial_transactions;
* sync_runs;
* ai_messages;
* ai_runs;
* audit_logs;
* notifications;
* analytical_events.

A modelagem física futura deverá considerar índices, paginação e políticas de retenção adequadas.

⸻

24. Entidades que Dependem da Análise da Conta Azul

A modelagem final das seguintes entidades somente poderá ser fechada após estudo oficial da API:

* financial_accounts;
* financial_categories;
* customers;
* suppliers;
* receivables;
* payables;
* financial_transactions;
* revenue_records;
* expense_records.

Campos poderão ser ajustados quando os recursos reais forem documentados.

⸻

25. Entidades que Não Dependem da Conta Azul

As seguintes entidades pertencem ao produto e poderão ser modeladas independentemente da API externa:

* tenants;
* users;
* user_sessions;
* password_reset_tokens;
* platform_branding;
* tenant_branding;
* files;
* integrations;
* integration_credentials;
* sync_runs;
* metric_definitions;
* metric_snapshots;
* analytical_events;
* ai_tenant_settings;
* ai_knowledge_entries;
* ai_conversations;
* ai_messages;
* ai_insights;
* ai_runs;
* rules;
* rule_executions;
* rule_alert_states;
* reports;
* notifications;
* audit_logs;
* support_sessions;
* platform_settings;
* tenant_settings.

⸻

26. Decisões de Modelagem Consolidadas

DATA-001 — Tenant será entidade central do isolamento multiempresa.

DATA-002 — Usuários comuns serão vinculados diretamente a tenant no MVP.

DATA-003 — Identificadores externos não substituirão IDs internos.

DATA-004 — Credenciais externas ficarão separadas dos metadados comuns da integração.

DATA-005 — Sincronizações terão histórico persistente.

DATA-006 — O domínio financeiro será normalizado internamente.

DATA-007 — Contas a receber e contas a pagar serão conceitos distintos.

DATA-008 — Indicadores poderão possuir definição e versão próprias.

DATA-009 — Insights da IA serão persistentes.

DATA-010 — Conversas e mensagens terão isolamento por tenant.

DATA-011 — Execuções de IA possuirão observabilidade própria.

DATA-012 — Regras terão estado de deduplicação/cooldown separado.

DATA-013 — Relatórios serão tratados como jobs/artefatos persistentes quando necessário.

DATA-014 — Notificações internas serão persistidas.

DATA-015 — Auditoria será separada de logging técnico.

DATA-016 — Modo suporte terá entidade própria de sessão.

DATA-017 — Valores financeiros usarão representação decimal exata.

DATA-018 — O modelo será preparado para novos ERPs sem replicar todo o domínio por fornecedor.

⸻

27. Itens Pendentes de Decisão Técnica

Ainda deverão ser definidos:

* banco de dados;
* estratégia de IDs;
* ORM;
* migrations;
* nomes físicos finais;
* índices;
* constraints;
* política de soft delete;
* timezone padrão;
* moeda e eventual suporte multimoeda;
* criptografia das credenciais;
* armazenamento de arquivos;
* retenção de conversas;
* retenção de auditoria;
* retenção de sync_runs;
* retenção de ai_runs;
* particionamento futuro;
* materialização de métricas;
* necessidade real de revenue_records e expense_records;
* política de anonimização ou remoção de dados.

⸻

28. Diretriz Final

O modelo de dados deverá representar o domínio do Dashboard Economização, não o formato de um fornecedor externo.

A API do Conta Azul alimentará o domínio.

Ela não definirá o domínio.

⸻

