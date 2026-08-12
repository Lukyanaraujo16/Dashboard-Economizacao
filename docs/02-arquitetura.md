Dashboard Economização

02 — Arquitetura

Status: Em elaboração
Projeto: Dashboard Economização
Tipo: Plataforma SaaS multiempresa de inteligência financeira
Fonte de dados inicial: Conta Azul

⸻

1. Objetivo

Este documento define os princípios e contratos arquiteturais do Dashboard Economização.

A arquitetura deverá permitir que o sistema opere como uma plataforma SaaS multiempresa, sincronize informações financeiras de fontes externas, transforme os dados em informações analíticas e permita que um Consultor Financeiro Inteligente utilize essas informações de forma segura.

Este documento define responsabilidades, limites entre módulos e decisões que deverão orientar toda implementação futura.

Detalhes específicos de tecnologias, bibliotecas, provedores, infraestrutura e implementação deverão ser definidos posteriormente, sem violar os contratos estabelecidos neste documento.

⸻

2. Princípios Arquiteturais

A arquitetura deverá seguir os seguintes princípios.

2.1 Isolamento entre empresas

Cada empresa será considerada um tenant independente.

Todos os dados relacionados a uma empresa deverão possuir vínculo explícito com seu tenant.

Nenhuma operação deverá depender apenas de informações fornecidas pelo frontend para determinar qual empresa pode ser acessada.

O backend deverá validar o contexto de tenant em toda operação protegida.

⸻

2.2 Segurança por padrão

Toda operação deverá assumir ausência de permissão até que a autorização seja validada.

Dados financeiros deverão ser tratados como informações sensíveis de negócio.

Credenciais, tokens e segredos de integrações externas nunca deverão ser enviados para o frontend.

⸻

2.3 Desacoplamento da Conta Azul

A aplicação não deverá ser construída como uma reprodução direta da estrutura da API do Conta Azul.

O Conta Azul será tratado como uma fonte externa de dados.

O Dashboard Economização deverá possuir um modelo interno próprio.

O módulo de integração será responsável por traduzir os dados externos para o modelo de domínio interno.

⸻

2.4 Dashboard desacoplada da integração

A renderização da dashboard não poderá depender de chamadas síncronas à API do Conta Azul.

O painel deverá consumir informações armazenadas e processadas internamente pela plataforma.

Falhas temporárias do Conta Azul não deverão tornar indisponíveis os dados previamente sincronizados.

⸻

2.5 Processamento assíncrono

Operações que não precisam bloquear uma requisição do usuário deverão, sempre que adequado, ser processadas de forma assíncrona.

Entre elas poderão estar:

* sincronizações;
* geração de relatórios;
* análises da IA;
* criação de insights;
* processamento de regras;
* notificações;
* tarefas de manutenção.

⸻

2.6 Rastreamento de operações críticas

Operações importantes deverão ser rastreáveis.

Deverá ser possível identificar, quando aplicável:

* qual empresa foi afetada;
* qual usuário realizou a operação;
* qual administrador realizou a operação;
* horário;
* origem;
* resultado;
* alterações relevantes.

⸻

2.7 Evolução sem sobrecarregar o MVP

A arquitetura deverá permitir evolução futura, mas não deverá implementar antecipadamente complexidade sem necessidade para o MVP.

Preparar para expansão não significa construir funcionalidades futuras antes de elas fazerem parte do escopo.

⸻

3. Visão Geral da Arquitetura

A arquitetura lógica do Dashboard Economização será formada pelas seguintes áreas principais:

1. Interface do usuário.
2. Camada de aplicação/API.
3. Autenticação e autorização.
4. Gestão de tenants.
5. Motor de integração.
6. Motor de sincronização.
7. Armazenamento interno.
8. Motor analítico.
9. Consultor Financeiro Inteligente.
10. Motor de relatórios.
11. Motor de regras.
12. Motor de notificações.
13. Logs e observabilidade.
14. Auditoria.
15. Cache.
16. Processamento assíncrono.

Fluxo conceitual principal:

Conta Azul
→ Motor de Integração
→ Motor de Sincronização
→ Banco de Dados Interno
→ Motor Analítico
→ Dashboard / Relatórios / Consultor Financeiro

O Consultor Financeiro não deverá acessar diretamente o Conta Azul.

A dashboard também não deverá acessar diretamente o Conta Azul.

⸻

4. Arquitetura Multiempresa

4.1 Tenant

Cada empresa cliente será representada internamente como um tenant.

O tenant será a principal fronteira de isolamento lógico da aplicação.

⸻

4.2 Dados vinculados ao tenant

Informações pertencentes a empresas deverão possuir relacionamento explícito com o tenant correspondente sempre que aplicável.

Entre elas:

* usuários;
* configurações;
* identidade visual;
* integrações;
* dados financeiros;
* categorias;
* sincronizações;
* indicadores;
* configurações da IA;
* conhecimento da IA;
* insights;
* relatórios;
* regras;
* notificações;
* logs relacionados à empresa;
* auditoria relacionada à empresa.

⸻

4.3 Contexto de tenant

Após a autenticação, o sistema deverá determinar o tenant autorizado para aquele usuário.

Esse contexto deverá acompanhar todas as operações protegidas.

A API não deverá confiar em tenantId, companyId ou equivalente recebido livremente do frontend sem validar se o usuário possui autorização para aquele tenant.

⸻

4.4 Superadmin

O superadministrador opera acima da fronteira dos tenants.

Esse perfil deverá existir para suporte técnico e administração da plataforma.

Operações de superadmin deverão possuir controles e auditoria específicos.

⸻

4.5 Administradores da plataforma

Fellipe e administradores por ele cadastrados poderão administrar as empresas clientes conforme as permissões administrativas que forem definidas no PRD.

O modelo deverá permitir evolução futura para restrição de administradores a grupos específicos de empresas, mesmo que isso não seja necessário no MVP.

⸻

5. Camadas da Aplicação

A implementação deverá preservar separação clara entre responsabilidades.

5.1 Camada de Interface

Responsável pela experiência do usuário.

Não deverá conter regras críticas de autorização ou isolamento de dados.

⸻

5.2 Camada de Aplicação

Responsável por coordenar casos de uso.

Exemplos:

* autenticar usuário;
* criar empresa;
* configurar branding;
* solicitar relatório;
* consultar indicadores;
* iniciar sincronização administrativa;
* consultar insights;
* conversar com o Consultor Financeiro.

⸻

5.3 Camada de Domínio

Responsável por regras de negócio independentes da interface e das integrações externas.

⸻

5.4 Camada de Persistência

Responsável pelo armazenamento e leitura dos dados internos da plataforma.

⸻

5.5 Camada de Integrações

Responsável pela comunicação com sistemas externos.

Inicialmente, o principal conector será o Conta Azul.

⸻

5.6 Camada de Processamento Assíncrono

Responsável por tarefas que deverão ocorrer fora do ciclo imediato de requisição do usuário.

⸻

6. Autenticação

O sistema deverá possuir autenticação própria.

A autenticação de usuários do Dashboard Economização será independente da autenticação OAuth utilizada para conectar uma empresa ao Conta Azul.

São dois contextos distintos:

Autenticação da plataforma: identifica quem está utilizando o Dashboard Economização.

Autorização Conta Azul: autoriza o Dashboard Economização a acessar dados do ERP daquela empresa.

Esses conceitos não deverão ser misturados na implementação.

⸻

7. Autorização

No MVP deverão existir, no mínimo, os conceitos:

* usuário de empresa;
* administrador da plataforma;
* superadministrador.

Uma empresa poderá possuir múltiplos usuários.

Inicialmente, usuários da mesma empresa não possuirão diferentes níveis internos de permissão.

A arquitetura deverá permitir que permissões internas sejam adicionadas futuramente sem reconstrução do modelo de autenticação.

⸻

8. Painel Administrativo

A área administrativa será uma aplicação funcionalmente distinta do painel financeiro dos clientes, ainda que possa compartilhar componentes técnicos.

Ela deverá concentrar funções como:

* gestão de empresas;
* gestão de usuários;
* gestão de administradores;
* branding;
* integração com Conta Azul;
* estado das sincronizações;
* configurações do Consultor Financeiro;
* base de conhecimento;
* regras;
* notificações futuras;
* logs administrativos;
* auditoria;
* modo suporte.

⸻

9. Painel do Cliente

O painel do cliente deverá ser orientado à compreensão financeira da empresa.

O backend deverá fornecer dados já isolados, normalizados e preparados para análise.

A interface deverá consumir informações do modelo interno do Dashboard Economização.

Ela nunca deverá conhecer tokens do Conta Azul nem detalhes internos da integração.

⸻

10. Motor de Integração

O Motor de Integração será responsável por toda comunicação com sistemas externos de origem financeira.

Cada ERP deverá possuir um conector isolado.

Inicialmente:

ContaAzulConnector

No futuro poderão existir outros conectores sem necessidade de alterar o restante da aplicação.

Responsabilidades do conector:

* autorização;
* renovação de credenciais quando aplicável;
* chamadas à API;
* paginação;
* interpretação das respostas;
* tratamento de erros externos;
* controle dos limites conhecidos da API;
* tradução inicial do formato externo.

O conector não deverá possuir regras de dashboard.

O conector não deverá gerar KPIs.

O conector não deverá executar análise financeira.

⸻

11. Camada de Normalização

Entre a API externa e o domínio interno deverá existir uma camada de tradução.

Exemplo conceitual:

Conta Azul
→ Dados externos
→ Adapter/Normalizer
→ Modelo interno Dashboard Economização

Essa camada deverá impedir que nomes de campos, estruturas e particularidades específicas do Conta Azul se espalhem pelo restante da aplicação.

⸻

12. Motor de Sincronização

O Motor de Sincronização será responsável por manter os dados internos atualizados.

A sincronização deverá ser automática.

A frequência exata será definida após análise dos limites e recursos oficialmente disponibilizados pelo Conta Azul.

O objetivo é manter os dados o mais próximos possível da situação atual sem comprometer:

* limites da API;
* estabilidade;
* escalabilidade;
* processamento;
* custos;
* segurança.

⸻

13. Estratégia de Sincronização

A arquitetura deverá permitir mais de um mecanismo de disparo.

Possibilidades:

* sincronização periódica;
* sincronização baseada em eventos externos quando suportado;
* sincronização administrativa manual;
* sincronização oportunista quando os dados estiverem desatualizados.

A existência desses mecanismos não significa que todos serão implementados no MVP.

A estratégia final deverá ser definida no documento específico da integração com Conta Azul.

⸻

14. Sincronização Incremental

Sempre que a API externa permitir identificação confiável de alterações, a plataforma deverá priorizar sincronizações incrementais em vez de realizar cargas completas desnecessariamente.

Carga completa deverá ser utilizada quando necessária para:

* primeira conexão;
* recuperação;
* reconciliação;
* correção de inconsistências;
* limitações da própria API.

⸻

15. Idempotência

A sincronização deverá ser idempotente.

Executar novamente uma sincronização sobre os mesmos dados não deverá produzir duplicidades ou resultados inconsistentes.

Registros externos deverão possuir mecanismos de identificação que permitam atualização segura no modelo interno.

⸻

16. Concorrência de Sincronizações

O sistema deverá impedir que múltiplas sincronizações incompatíveis da mesma empresa sejam executadas simultaneamente quando isso puder causar inconsistência.

Deverá existir mecanismo de coordenação por tenant e por tipo de sincronização quando necessário.

⸻

17. Estado da Sincronização

A plataforma deverá conseguir registrar informações como:

* empresa;
* tipo;
* início;
* conclusão;
* status;
* quantidade processada;
* quantidade criada;
* quantidade atualizada;
* erro, quando houver;
* origem do disparo;
* tentativa;
* duração.

Essas informações deverão ser utilizadas para suporte e observabilidade.

⸻

18. Dados Externos e Dados Internos

A plataforma deverá distinguir:

Dados externos normalizados: representação das informações recebidas do ERP.

Dados derivados: informações calculadas pela própria plataforma.

Exemplos de dados derivados:

* indicadores;
* comparativos;
* tendências;
* agregações;
* métricas;
* projeções;
* insights.

Dados derivados deverão poder ser recalculados quando necessário sem alterar a fonte financeira original.

⸻

19. Motor Analítico

O Motor Analítico será responsável por transformar os dados financeiros normalizados em informações consumíveis pela plataforma.

Ele deverá ser independente da interface.

Entre suas responsabilidades poderão estar:

* cálculo de indicadores;
* agregações;
* comparações entre períodos;
* evolução temporal;
* agrupamento por categoria;
* classificação;
* cálculo de inadimplência;
* fluxo de caixa;
* projeções;
* preparação de dados para gráficos;
* preparação de dados para relatórios;
* preparação de contexto numérico para a IA.

⸻

20. Fonte Única para Indicadores

Dashboard, relatórios e Consultor Financeiro deverão, sempre que possível, utilizar as mesmas regras analíticas.

Não deverão existir três cálculos diferentes para o mesmo indicador em três partes da aplicação.

Exemplo:

Se “inadimplência” possuir uma regra oficial, essa regra deverá ser compartilhada pelo:

* card da dashboard;
* relatório;
* análise do Consultor Financeiro.

⸻

21. Filtros

Filtros deverão ser tratados como parte da camada analítica, e não apenas como comportamento visual.

A API deverá compreender intervalos e critérios de consulta de forma consistente.

Filtros poderão incluir:

* períodos predefinidos;
* intervalos personalizados;
* categorias;
* situação financeira;
* vencimento;
* pagamento;
* recebimento;
* outros filtros definidos posteriormente.

⸻

22. Períodos

O sistema deverá suportar análise de períodos passados, presentes e futuros quando o tipo de dado permitir.

Exemplos:

* títulos vencidos;
* títulos futuros;
* mês atual;
* mês anterior;
* períodos comparativos;
* acumulado anual;
* ano anterior;
* intervalo personalizado.

⸻

23. Consultor Financeiro Inteligente

O Consultor Financeiro Inteligente será um módulo independente da dashboard.

Ele utilizará dados internos já autorizados e processados pela plataforma.

Ele não deverá possuir acesso livre ao banco.

O módulo deverá receber apenas o contexto necessário para executar cada análise.

⸻

24. Escopo de Dados da IA

Toda execução do Consultor Financeiro deverá possuir um tenant definido.

Uma solicitação da IA nunca poderá acessar dados pertencentes a outro tenant.

Esse isolamento deverá ser aplicado antes da composição do contexto enviado ao modelo de inteligência artificial.

O modelo de IA nunca deverá ser responsável por decidir quais empresas pode acessar.

Essa autorização pertence à aplicação.

⸻

25. Contexto do Consultor

O contexto poderá combinar:

* dados financeiros;
* indicadores;
* comparativos;
* tendências;
* ramo da empresa;
* informações administrativas;
* prompt configurado;
* base de conhecimento;
* histórico relevante da conversa;
* regras da plataforma.

A composição do contexto deverá possuir limites claros para evitar envio desnecessário de dados.

⸻

26. Configuração por Empresa

Cada tenant poderá possuir uma configuração própria para o Consultor Financeiro.

Essa configuração deverá ser administrável sem alteração de código.

A configuração poderá evoluir para contemplar:

* ramo;
* descrição do negócio;
* comportamento;
* instruções;
* tom;
* prompt adicional;
* base de conhecimento;
* regras específicas.

⸻

27. IA Reativa

O usuário poderá iniciar conversas com o Consultor Financeiro através da interface.

A IA deverá responder utilizando os dados autorizados disponíveis.

Perguntas que dependam de informações inexistentes na plataforma deverão ser tratadas como falta de informação, e não respondidas por invenção.

⸻

28. IA Proativa

O Consultor Financeiro também poderá produzir interações sem pergunta inicial do usuário.

A proatividade deverá surgir de eventos ou regras do sistema.

Fluxo conceitual:

Nova sincronização
→ Dados atualizados
→ Motor Analítico
→ Motor de Regras
→ Evento relevante identificado
→ Criação de insight
→ Consultor Financeiro
→ Mensagem ou alerta para o usuário

⸻

29. Insights

Insights proativos deverão ser persistidos.

Eles não deverão existir somente como resposta temporária de um modelo de IA.

Um insight poderá possuir informações como:

* tenant;
* categoria;
* título;
* descrição;
* severidade;
* origem;
* dados utilizados;
* período analisado;
* momento da detecção;
* status;
* lido;
* descartado;
* resolvido.

A modelagem final será definida no documento de banco de dados.

⸻

30. Motor de Regras

O sistema deverá possuir uma abstração para regras que possam gerar eventos.

Exemplos:

* inadimplência acima de determinado valor;
* crescimento de despesa;
* queda de receita;
* conta relevante próxima do vencimento;
* projeção negativa de caixa;
* variação fora de padrão.

A criação visual e personalizada dessas regras pelo administrador poderá ser implementada em fase posterior.

A arquitetura, entretanto, deverá permitir que regras existam sem ficarem acopladas diretamente à interface.

⸻

31. Proteção contra excesso de alertas

Regras proativas deverão possuir mecanismos para evitar repetição excessiva.

A plataforma deverá ser preparada para conceitos como:

* deduplicação;
* cooldown;
* prioridade;
* severidade;
* janela de tempo;
* reconhecimento do usuário.

O objetivo é evitar que o Consultor Financeiro se transforme em uma fonte de notificações repetitivas.

⸻

32. Conversas

As conversas com o Consultor Financeiro deverão ser vinculadas ao tenant e ao usuário.

O histórico deverá respeitar isolamento entre empresas.

A política de retenção será definida posteriormente.

⸻

33. Motor de Relatórios

A geração de relatórios deverá utilizar o mesmo domínio analítico usado pela dashboard.

Formatos previstos:

* PDF;
* Excel;
* impressão.

Relatórios mais pesados poderão ser gerados assincronamente.

⸻

34. Motor de Notificações

A arquitetura deverá prever um módulo independente para entrega de notificações.

No MVP poderá existir apenas notificação interna.

Canais futuros poderão incluir:

* push;
* OneSignal;
* e-mail;
* outros canais definidos posteriormente.

As regras de negócio não deverão chamar diretamente um provedor externo de notificações.

Fluxo recomendado:

Regra ou evento
→ Notification Service
→ Canal apropriado

⸻

35. Notificação Interna

O sistema deverá permitir persistir notificações internas.

Isso possibilitará comportamentos como:

* indicador de mensagem nova no Consultor;
* central de notificações;
* alertas;
* mensagens administrativas.

⸻

36. Notificações Administrativas

A arquitetura deverá permitir futuramente que administradores enviem notificações personalizadas para:

* uma empresa;
* múltiplas empresas;
* todos os clientes;
* usuários específicos, quando aplicável.

A implementação dessa funcionalidade ficará condicionada ao roadmap.

⸻

37. PWA e Push

PWA e notificações push não fazem parte do MVP inicial.

Entretanto, a interface deverá ser construída de forma responsiva e o módulo de notificações deverá evitar dependências que impeçam futura integração com OneSignal.

⸻

38. Logs Técnicos

O sistema deverá produzir logs adequados para diagnóstico técnico.

Eles deverão permitir investigação de:

* falhas;
* integrações;
* sincronizações;
* filas;
* jobs;
* geração de relatórios;
* IA;
* erros inesperados.

Logs técnicos não são substitutos da auditoria.

⸻

39. Auditoria

Eventos de negócio e administrativos relevantes deverão gerar registros de auditoria.

Exemplos:

* criação de empresa;
* alteração de empresa;
* criação de usuário;
* alteração de branding;
* alteração da configuração da IA;
* conexão ou desconexão de ERP;
* acesso em modo suporte;
* ações de superadmin;
* alterações administrativas críticas.

⸻

40. Imutabilidade lógica da auditoria

Registros de auditoria não deverão ser editáveis pelos usuários comuns.

Mecanismos administrativos de retenção ou expurgo, caso existam futuramente, deverão ser explicitamente definidos.

⸻

41. Modo Suporte

Administradores autorizados e superadministradores poderão acessar a experiência de um tenant em modo suporte.

Esse fluxo não deverá exigir compartilhamento ou conhecimento da senha do cliente.

⸻

42. Identificação do Modo Suporte

Durante uma sessão em modo suporte, o sistema deverá manter informação explícita sobre:

* identidade real do operador;
* empresa sendo acessada;
* início da sessão;
* término da sessão.

O backend não deverá tratar o operador como se fosse literalmente o usuário cliente.

⸻

43. Auditoria do Modo Suporte

Toda entrada e saída de modo suporte deverá gerar auditoria.

Ações críticas realizadas durante esse modo deverão permitir rastrear o operador real.

⸻

44. Cache

Cache poderá ser utilizado para reduzir processamento e melhorar tempo de resposta.

O cache nunca deverá ser a única fonte persistente de dados financeiros.

O sistema deverá continuar íntegro caso o cache seja perdido.

⸻

45. Cache e Tenant

Toda chave ou estrutura de cache que contenha dados específicos de empresa deverá possuir isolamento por tenant.

Uma falha de chave de cache não poderá expor dados de outra empresa.

⸻

46. Filas e Jobs

A arquitetura deverá possuir capacidade de processamento em background.

Entre os possíveis jobs:

* sincronização;
* atualização analítica;
* geração de insights;
* geração de relatórios;
* processamento de regras;
* entrega de notificações;
* tarefas de manutenção.

A tecnologia de filas será escolhida posteriormente.

⸻

47. Idempotência de Jobs

Jobs críticos deverão poder ser reexecutados de forma segura sempre que tecnicamente possível.

Falhas temporárias não deverão necessariamente exigir intervenção manual.

⸻

48. Retentativas

Integrações externas deverão possuir política controlada de retentativas para falhas transitórias.

Retentativas não poderão criar loops infinitos.

Falhas permanentes deverão ser identificadas e registradas.

⸻

49. Observabilidade

A plataforma deverá ser preparada para responder perguntas operacionais como:

* quantas sincronizações falharam;
* quais empresas estão sem sincronizar;
* quando cada empresa sincronizou pela última vez;
* quanto tempo uma sincronização demora;
* quais jobs falharam;
* quais integrações apresentam erro;
* quais chamadas de IA falharam;
* quanto tempo operações importantes levam.

⸻

50. Estado Operacional da Integração

Cada conexão com ERP deverá possuir estado operacional identificável.

Exemplos conceituais:

* conectada;
* aguardando autorização;
* token expirado;
* erro;
* sincronizando;
* saudável;
* atenção necessária.

A nomenclatura final será definida no PRD.

⸻

51. Branding

Branding deverá ser armazenado como configuração do tenant.

A interface deverá consumir um tema resolvido pela aplicação.

O sistema não deverá exigir código específico para cada empresa.

⸻

52. Branding Fallback

Quando um tenant não possuir determinada configuração visual, a plataforma deverá utilizar valores padrão do Dashboard Economização.

A logo da própria plataforma deverá servir como fallback quando aplicável.

⸻

53. Estrutura para Novos ERPs

Toda integração de origem financeira deverá implementar um contrato interno comum.

Conceitualmente:

ExternalERPConnector

Possíveis implementações futuras:

* Conta Azul;
* ERP B;
* ERP C.

O restante da aplicação deverá consumir dados normalizados, não implementações específicas de ERP.

⸻

54. Identificadores Externos

Registros provenientes de sistemas externos deverão preservar identificadores suficientes para:

* sincronização;
* atualização;
* rastreamento;
* diagnóstico;
* reconciliação.

Esses identificadores não deverão substituir os identificadores internos da plataforma.

⸻

55. Segurança de Credenciais

Tokens OAuth, refresh tokens, chaves de API e credenciais externas deverão ser armazenados de maneira segura.

Nenhuma credencial deverá ser registrada em logs de aplicação.

Nenhuma credencial deverá ser retornada para o frontend.

⸻

56. OAuth Conta Azul

A integração com Conta Azul utilizará o mecanismo oficialmente disponibilizado pelo fornecedor.

Detalhes como:

* fluxo;
* expiração;
* renovação;
* escopos;
* revogação;
* limites;
* webhooks;

serão documentados apenas após verificação da documentação oficial atualizada.

Nenhuma dessas características deverá ser presumida nesta arquitetura.

⸻

57. Segurança da IA

O sistema deverá tratar todo conteúdo administrativo e de usuário como entrada potencialmente não confiável.

A configuração da IA não poderá substituir as regras de autorização da aplicação.

A IA não poderá ampliar o próprio nível de acesso por meio de instruções presentes em prompts ou bases de conhecimento.

⸻

58. Proteção contra vazamento entre tenants

A composição de contexto para IA deverá ser realizada somente após o tenant ter sido validado pelo backend.

Nunca deverá ser enviado um conjunto global de dados de múltiplas empresas para que o modelo “escolha” qual utilizar.

⸻

59. Dados enviados para IA

O sistema deverá enviar ao provedor de IA apenas as informações necessárias para a tarefa.

Quando possível, deverão ser priorizados:

* agregados;
* indicadores;
* dados relevantes para a pergunta;
* contexto mínimo necessário.

A política específica de privacidade e retenção dependerá do provedor escolhido.

⸻

60. Respostas Financeiras da IA

O Consultor Financeiro deverá diferenciar:

* fatos derivados dos dados;
* interpretações;
* estimativas;
* recomendações.

A IA não deverá apresentar como fato uma informação que não possa ser sustentada pelos dados disponíveis.

⸻

61. Projeções

Projeções financeiras deverão possuir metodologia identificável.

A IA não deverá simplesmente inventar uma projeção.

Quando projeções forem implementadas, deverão ser produzidas por regra ou modelo analítico definido pela plataforma e depois interpretadas pela IA.

⸻

62. Responsividade

Mesmo que PWA não faça parte do MVP inicial, novas telas deverão ser construídas considerando comportamento responsivo desde sua criação.

Não deverá existir uma segunda aplicação independente exclusivamente para mobile.

⸻

63. Performance

O sistema deverá priorizar respostas rápidas nas telas analíticas.

Operações pesadas deverão ser pré-processadas, agregadas, armazenadas ou executadas assincronamente quando isso trouxer benefício mensurável.

⸻

64. Escalabilidade

A arquitetura deverá permitir crescimento horizontal de componentes que se tornem gargalos.

Especial atenção deverá ser dada a:

* sincronizações;
* jobs;
* geração de relatórios;
* consultas analíticas;
* execução de IA.

Isso não obriga implantação distribuída no MVP.

⸻

65. Falhas de Serviços Externos

Falha temporária de:

* Conta Azul;
* provedor de IA;
* provedor de notificações;

não deverá corromper dados internos.

Cada integração deverá possuir tratamento independente de falhas.

⸻

66. Degradação Controlada

Sempre que possível, o sistema deverá continuar oferecendo funcionalidades não afetadas pela falha de um serviço externo.

Exemplo:

Se o provedor de IA estiver indisponível, a dashboard financeira deverá continuar funcionando.

Se o Conta Azul estiver temporariamente indisponível, os dados previamente sincronizados deverão continuar disponíveis.

⸻

67. Fonte da Verdade

Para dados financeiros importados, a fonte de verdade de negócio continuará sendo o ERP de origem.

O banco do Dashboard Economização armazenará uma representação sincronizada destinada a análise, histórico operacional e experiência da plataforma.

⸻

68. Escrita no ERP

O Dashboard Economização não realizará inicialmente alterações financeiras no Conta Azul.

A integração será tratada como leitura/importação para os casos de uso financeiros do MVP.

Qualquer capacidade futura de escrita deverá exigir decisão arquitetural e de produto explícita.

⸻

69. Decisões Arquiteturais Consolidadas

As seguintes decisões ficam estabelecidas:

ARQ-001 — O Dashboard Economização será multiempresa desde a origem.

ARQ-002 — Toda informação de negócio pertencente a uma empresa deverá possuir isolamento por tenant.

ARQ-003 — A dashboard não consultará diretamente o Conta Azul para renderizar telas.

ARQ-004 — Dados serão sincronizados e armazenados internamente.

ARQ-005 — A arquitetura interna não reproduzirá diretamente a estrutura da API do Conta Azul.

ARQ-006 — Haverá uma camada de normalização entre ERP e domínio interno.

ARQ-007 — A integração deverá permitir outros ERPs futuramente.

ARQ-008 — Sincronizações deverão ser executáveis de forma assíncrona.

ARQ-009 — Sincronizações deverão ser idempotentes.

ARQ-010 — O Motor Analítico será responsável pelas regras oficiais dos indicadores.

ARQ-011 — Dashboard, relatórios e IA deverão reutilizar as mesmas regras analíticas sempre que aplicável.

ARQ-012 — O Consultor Financeiro não acessará diretamente a API do Conta Azul.

ARQ-013 — O Consultor Financeiro não decidirá autorização de acesso a dados.

ARQ-014 — Toda execução de IA será vinculada explicitamente a um tenant.

ARQ-015 — A IA poderá operar de forma reativa e proativa.

ARQ-016 — Insights proativos relevantes serão persistidos.

ARQ-017 — Existirá abstração de motor de regras.

ARQ-018 — Existirá abstração de motor de notificações independente de canais externos.

ARQ-019 — Operações críticas deverão possuir auditoria.

ARQ-020 — Acesso em modo suporte deverá manter a identidade do operador real.

ARQ-021 — Acesso em modo suporte deverá gerar auditoria.

ARQ-022 — Credenciais externas nunca serão expostas ao frontend.

ARQ-023 — Falhas de serviços externos não deverão corromper dados internos.

ARQ-024 — Cache não será fonte definitiva de dados.

ARQ-025 — PWA e push não serão exigidos no MVP, mas a interface será responsiva desde o início.

ARQ-026 — Nenhuma tecnologia específica será considerada obrigatória até que seja formalmente registrada.

⸻

70. Restrições Arquiteturais

A implementação não deverá:

* acoplar gráficos diretamente à estrutura do Conta Azul;
* realizar chamadas ao Conta Azul diretamente do frontend;
* expor tokens externos ao navegador;
* permitir consultas sem isolamento por tenant;
* deixar que a IA defina autorização;
* misturar dados de empresas no contexto da IA;
* executar sincronizações pesadas no ciclo da renderização da tela;
* depender do provedor de IA para cálculos financeiros determinísticos;
* utilizar cache como fonte definitiva de dados;
* ocultar a identidade real de operadores em modo suporte;
* executar escrita financeira no Conta Azul no MVP;
* implementar funcionalidades futuras apenas por especulação.

⸻

71. Itens Pendentes de Decisão Técnica

Os seguintes itens deverão ser definidos posteriormente:

* stack frontend;
* stack backend;
* banco de dados;
* mecanismo de cache;
* tecnologia de filas;
* infraestrutura;
* estratégia de deploy;
* provedor de IA;
* mecanismo de autenticação;
* armazenamento de arquivos;
* geração de PDF;
* geração de Excel;
* observabilidade;
* política de backup;
* política de retenção de logs;
* política de retenção das conversas;
* frequência de sincronização;
* estratégia de sincronização incremental;
* recursos e limites reais do Conta Azul;
* disponibilidade e estratégia de webhooks;
* política de custos de IA.

Nenhum desses itens deverá ser presumido antes de decisão explícita.

⸻

72. Contrato Final da Arquitetura

Toda implementação futura deverá respeitar este fluxo conceitual:

ERP externo
    ↓
Conector
    ↓
Normalização
    ↓
Sincronização
    ↓
Modelo interno
    ↓
Motor Analítico
    ↓
┌───────────────────────────────────────┐
│ Dashboard                             │
│ Relatórios                            │
│ Motor de Regras                       │
│ Consultor Financeiro Inteligente      │
└───────────────────────────────────────┘
    ↓
Insights / Eventos
    ↓
Motor de Notificações
    ↓
Usuário

Autenticação, autorização, isolamento por tenant, auditoria e observabilidade deverão atuar transversalmente em toda a arquitetura.

⸻

73. Diretriz Principal

A arquitetura deverá permitir que o Dashboard Economização transforme dados financeiros externos em uma experiência interna segura, rápida, analítica e inteligente, sem tornar o produto dependente da estrutura técnica de um único ERP ou de um único provedor de inteligência artificial.

⸻
