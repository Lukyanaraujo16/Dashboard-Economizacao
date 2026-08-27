Dashboard Economização

04 — Integração com a API Conta Azul

Status: Levantamento inicial validado em documentação oficial
Projeto: Dashboard Economização
Fonte: Portal oficial de desenvolvedores Conta Azul
Data da validação: 2026-08-11

⸻

1. Objetivo

Este documento registra o contrato de integração entre o Dashboard Economização e a API oficial do Conta Azul.

Seu objetivo é separar:

1. fatos confirmados pela documentação oficial;
2. decisões do Dashboard Economização;
3. itens que ainda dependem de validação técnica;
4. indicadores que poderão ser derivados a partir dos dados disponíveis.

Nenhum comportamento da API deverá ser presumido quando não estiver documentado.

⸻

2. API utilizada

O Dashboard Economização deverá utilizar a API atual do Conta Azul.

A API legada não deverá ser utilizada.

A documentação oficial informa que a API disponibiliza recursos relacionados a:

* gestão financeira;
* contas a pagar;
* contas a receber;
* baixas;
* conciliações;
* cobranças;
* despesas;
* movimentações financeiras;
* clientes;
* fornecedores;
* produtos;
* vendas;
* notas fiscais;
* contratos;
* categorias;
* centros de custo.

Para o Dashboard Economização, inicialmente serão utilizados apenas os recursos necessários para leitura e análise financeira.

⸻

3. Base da API

As chamadas atuais da API utilizam como base:

https://api-v2.contaazul.com

Essa informação deverá ser tratada como configuração da integração e não espalhada pelo código da aplicação.

⸻

4. Autenticação

A API Conta Azul utiliza OAuth 2.0.

O fluxo documentado é:

Authorization Code Flow

Fluxo conceitual:

Empresa
   ↓
Dashboard Economização
   ↓
Tela de autorização Conta Azul
   ↓
Usuário autoriza
   ↓
Authorization Code
   ↓
Backend Dashboard Economização
   ↓
Access Token + Refresh Token

⸻

5. Autorização individual por empresa

Cada cliente Conta Azul deverá autorizar individualmente o Dashboard Economização.

Cada empresa conectada receberá credenciais OAuth próprias.

Portanto:

Tenant A
→ Conta Azul A
→ Tokens A
Tenant B
→ Conta Azul B
→ Tokens B
Tenant C
→ Conta Azul C
→ Tokens C

Tokens nunca deverão ser compartilhados entre tenants.

⸻

6. URL de autorização

A documentação oficial vigente (2026-08-17) utiliza:

https://login.contaazul.com/#/oauth/authorize

(A menção anterior a `https://auth.contaazul.com/login` está superada.)

O fluxo deverá utilizar os parâmetros exigidos pela documentação oficial vigente.

Entre os parâmetros documentados encontram-se:

* response_type;
* client_id;
* redirect_uri;
* state;
* scope.

A implementação deverá utilizar state de forma segura para proteção e associação do fluxo de autorização.

⸻

7. Troca do Authorization Code

O código de autorização deverá ser trocado através de:

POST https://api-v2.contaazul.com/oauth/token

(A menção anterior a `https://auth.contaazul.com/oauth2/token` está superada.)

A autenticação do cliente utiliza conceitualmente:

Authorization: Basic BASE64(client_id:client_secret)

O conteúdo utiliza:

application/x-www-form-urlencoded

⸻

8. Validade do Authorization Code

A documentação oficial atual informa que o Authorization Code possui validade de:

3 minutos.

Portanto, o backend deverá realizar a troca pelo token imediatamente após o callback.

⸻

9. Access Token

A resposta OAuth contém, entre outros:

* access_token;
* refresh_token;
* expires_in;
* token_type.

A documentação atual apresenta:

expires_in = 3600

Portanto, o access token possui duração de aproximadamente:

1 hora.

⸻

10. Refresh Token

Quando o access token expirar, deverá ser utilizado o refresh token.

Endpoint:

POST https://api-v2.contaazul.com/oauth/token

Fluxo:

grant_type=refresh_token

O mecanismo exato deverá seguir sempre a documentação oficial vigente.

⸻

11. Armazenamento dos tokens

Access token e refresh token deverão:

* ser armazenados exclusivamente no backend;
* permanecer associados à integração e ao tenant corretos;
* ser protegidos em armazenamento;
* nunca aparecer no frontend;
* nunca aparecer completos em logs;
* nunca ser compartilhados entre empresas.

⸻

12. Identificação da empresa conectada

A documentação oficial vigente (developers.contaazul.com, consultada em
2026-08-18) define:

`GET https://api-v2.contaazul.com/v1/pessoas/conta-conectada`

Autenticação: `Authorization: Bearer {access_token}`. Sem query e sem body.

A resposta inclui `id_empresa`, `documento`, `razao_social`, `nome_fantasia`,
`email` e `data_fundacao`.

O Dashboard Economização utiliza este endpoint na fase 2.2 para identificar a
conta ERP conectada. Essa chamada é um **probe de identidade/saúde**, não uma
sincronização financeira. `last_successful_sync_at` só avança no SUCCESS
total da sync manual (2.3); o identity probe não o preenche.

O identificador externo não substituirá o ID interno do tenant.

⸻

13. Rate Limit

A documentação oficial atual informa os seguintes limites:

600 chamadas por minuto por conta conectada.

E:

até 10 chamadas por segundo por conta conectada.

Esses limites deverão ser considerados contratos externos e poderão mudar futuramente.

A implementação deverá também observar headers HTTP retornados pela API quando aplicável.

⸻

14. Consequência para o Dashboard Economização

Como os limites são aplicados por conta conectada, cada tenant possui uma janela de consumo própria segundo a documentação atual.

Ainda assim, o Dashboard Economização deverá limitar sua própria concorrência global para evitar sobrecarga interna.

Deverão existir controles conceituais em dois níveis:

Limite Conta Azul por tenant
+
Limite operacional do Dashboard Economização

⸻

15. Webhooks

A documentação oficial atual informa:

Não existe webhook nativo disponível para esses eventos.

A recomendação indicada pela própria documentação é utilizar polling recorrente.

Portanto, o MVP não poderá depender de webhook do Conta Azul para manter os dados atualizados.

⸻

16. Estratégia inicial de sincronização

Diante da ausência atual de webhooks, a estratégia base será:

Scheduler
   ↓
Seleciona tenants elegíveis
   ↓
Fila de sincronização
   ↓
Conta Azul Connector
   ↓
Consulta recursos alterados
   ↓
Normalização
   ↓
Persistência
   ↓
Motor Analítico

A execução deverá ser distribuída ao longo do tempo para evitar picos desnecessários.

⸻

17. Frequência de sincronização

Default operacional da 2.4: 60 minutos, configurável por
`CONTA_AZUL_AUTO_SYNC_INTERVAL_MINUTES` (inteiro, mínimo 5, máximo 1440).
Jitter determinístico no delay do job (0..min(intervalo, 60s)). Tick do
planner global: 1 minuto (`upsertJobScheduler`, id `conta-azul-plan-syncs`).
Não é cron do SO nem scheduler por tenant.

Homologação real 18–19/08/2026: intervalo de 60 min respeitado (`not_due`
no tick seguinte); scheduled incremental ~38 s e ~29 s nesta conta, sem
429.

Ajuste fino futuro ainda pode considerar:

* limite de 600 requisições/minuto;
* limite de 10 requisições/segundo;
* quantidade de endpoints necessários;
* quantidade média de páginas;
* volume de registros das empresas;
* quantidade de tenants;
* tempo médio das requisições;
* custo de processamento;
* necessidade real de atualização.

O objetivo continua sendo manter os dados o mais próximos possível do atual.

⸻

18. Sincronização adaptativa

A arquitetura deverá permitir que tenants possam possuir diferentes necessidades de sincronização.

Exemplo conceitual:

Empresa ativa recentemente
→ maior prioridade
Empresa sem usuários ativos
→ prioridade normal
Empresa com sincronização recente
→ aguarda próximo ciclo

Isso não significa sincronizar somente quando o usuário estiver conectado.

A sincronização automática continuará independente da presença do usuário.

⸻

19. Sincronização oportunista

Ao abrir a dashboard, o backend poderá verificar a idade dos dados.

Exemplo conceitual:

Usuário entra
   ↓
Última sincronização suficientemente recente?
   ├─ SIM → usa dados locais
   └─ NÃO → agenda sincronização em background

A tela nunca deverá ficar bloqueada aguardando o Conta Azul.

⸻

20. Sem chamadas Conta Azul na renderização

Fica explicitamente proibido:

Browser
→ Conta Azul

E também deverá ser evitado:

Abrir dashboard
→ aguardar Conta Azul
→ desenhar dashboard

O fluxo correto será:

Browser
→ API Dashboard Economização
→ Banco interno

Enquanto a sincronização ocorre independentemente.

⸻

21. Ambiente de desenvolvimento Conta Azul

A documentação oficial informa que não existe sandbox independente tradicional.

Há dois tipos de aplicativo no Portal:

* **App de Desenvolvimento** — redirect de testes fixa em `https://www.contaazul.com`.
  Não aceita a Redirect URI do Dashboard. Serve ao onboarding (ERP fictício /
  token de tutorial). Esse token de tutorial **não** deve ser persistido no produto.
* **App de Produção** — o titular cadastra a Redirect URI. Callback customizado
  do Dashboard (incluindo HTTPS de homologação) exige este tipo. A URI no Portal,
  em `CONTA_AZUL_REDIRECT_URI` e no authorize/token exchange deve ser idêntica.

A Conta de Desenvolvimento (ERP fictício, ~30 dias) continua disponível para
dados de teste. Homologação OAuth do Dashboard usa App de Produção.

A documentação atual informa duração inicial de:

30 dias, com possibilidade de extensão quando necessário.

⸻

22. Necessidade antes da implementação

Antes da fase de integração real deverá existir:

* App de Desenvolvimento criado no portal Conta Azul;
* client_id;
* client_secret;
* redirect URI configurada;
* usuário da Conta de Desenvolvimento;
* senha da Conta de Desenvolvimento;
* acesso ao ERP de teste.

Nenhuma credencial real deverá ser armazenada nos documentos versionados pelo Git.

⸻

23. Recursos financeiros confirmados

A API atual possui domínio financeiro capaz de trabalhar com conceitos necessários ao projeto, incluindo:

* contas a receber;
* contas a pagar;
* parcelas;
* contas financeiras;
* saldos;
* categorias financeiras;
* centros de custo;
* baixas;
* movimentações financeiras.

Os endpoints exatos utilizados pelo Dashboard Economização serão definidos na implementação da integração após validação individual de cada operação de leitura.

Fase 2.3 (leitura somente; homologada com conta ERP real em 2026-08-18):

* `GET /v1/categorias` — `pagina`, `tamanho_pagina`, `permite_apenas_filhos=false` (required na doc; valor usado na carga real);
* `GET /v1/conta-financeira` — `pagina`, `tamanho_pagina`;
* `GET /v1/pessoas` — `pagina`, `tamanho_pagina` (`items`/`totalItems`);
* `GET /v1/financeiro/eventos-financeiros/contas-a-receber/buscar` — `pagina`, `tamanho_pagina`, `data_vencimento_de` e `data_vencimento_ate` **obrigatórios**;
* `GET /v1/financeiro/eventos-financeiros/contas-a-pagar/buscar` — o mesmo contrato de janela.

CASH-9C (26/08/2026): `GET /v1/financeiro/transferencias` — transferências
entre contas próprias. Query: `pagina`, `tamanho_pagina`, `data_inicio`,
`data_fim`, `ids_conta_financeira[]` (origem ou destino). Um objeto com
`id`, `valor`, `data`, `origem.conta_financeira`, `destino.conta_financeira`.
Não é o Extrato da UI. Não cria RECEIPT+DISBURSEMENT. Ingestão local
explícita (`scripts/cash9c-transfers-backfill.ts`); fora do worker.

`GET /v1/pessoas` em conta sem cadastro de pessoas retornou `items: null`
(não `[]`). A 2.3 trata **somente** `items === null` como lista vazia.
Fail-fast permanece para `items` de outro tipo, item inválido, `id` inválido
e `nome` inválido. A instrumentação sanitizada
(`conta_azul_sync_payload_invalid`: resource/field/expected/received/page,
sem token e sem payload bruto) permanece.

Tamanho de página da 2.3: 100. Intervalo de vencimento: 90 dias. Horizonte MVP:
5 anos atrás e 2 anos à frente. Fase 2.4 (homologada em 18–19/08/2026):
pessoas e AR/AP enviam `data_alteracao_de` / `data_alteracao_ate` em
`America/Sao_Paulo` (ISO local sem offset), chunks ≤ 365 dias, overlap 2h.
AR/AP **mantêm** janelas de vencimento de 90 dias e somam o filtro de
alteração (API real aceitou a combinação; sem fallback silencioso
5+2 → 90d). Categorias e contas continuam full barato, sem
`data_alteracao`. Ausência de registro não é delete (sem tombstone) —
limitação conhecida. Nenhuma operação de escrita no ERP.

Carga real homologada (duas SUCCESS, mesma identidade): categorias 48,
contas 1, pessoas 0, a receber 12, a pagar 1266; duração ~33 s.
Horizonte 5+2 classificado operacionalmente como **adequado** (sem alteração
automática dos valores). Disconnect OAuth **não** apaga esses dados.

⸻

24. Parcelas financeiras

A documentação disponibiliza consulta detalhada de parcelas de eventos financeiros.

Endpoint confirmado:

GET /v1/financeiro/eventos-financeiros/parcelas/{id}

Uma parcela pode representar evento financeiro relacionado a:

* receita;
* despesa.

Entre os dados documentados encontram-se conceitos como:

* id da parcela;
* status;
* valor pago;
* data de vencimento;
* descrição;
* tipo do evento;
* rateio;
* categoria;
* centro de custo.

⸻

25. Categorias e rateio

O detalhamento de parcela pode fornecer:

* categoria financeira;
* valor associado à categoria;
* rateio;
* centro de custo;
* valor associado ao centro de custo.

Nota CC1.1 (homologado Clinica Life): em determinados parcelamentos,
`evento.rateio[].rateio_centro_custo[].valor` é **EVENT-scoped** (mesmo valor
em todas as parcelas irmãs do evento). O sync local normaliza
`EVENT_SCOPED_SINGLE_CENTER` para `allocation.amount = total da parcela`.
Multi-centro EVENT-scoped permanece unresolved (não ratear proporcionalmente
sem evidência). Não dividir automaticamente por quantidade de parcelas.

Isso possibilita construir análises como:

Receitas por categoria
Despesas por categoria
Receitas por centro de custo
Despesas por centro de custo

quando os dados estiverem preenchidos corretamente no ERP.

⸻

26. Categorias padrão

A API possui recurso documentado para consultar configurações de categorias padrão.

Esse recurso permite identificar associações de categorias utilizadas em operações financeiras específicas.

A utilização exata no Dashboard Economização será determinada durante a implementação do normalizador financeiro.

⸻

27. Contas financeiras e saldo

A API financeira possui recursos relacionados a:

* contas financeiras;
* consulta de saldo.

Esses dados são candidatos para utilização em indicadores como:

* disponibilidade financeira;
* saldo atual;
* composição de caixa.

O significado exato de cada saldo deverá ser validado antes da criação do indicador correspondente.

⸻

28. Faturamento

O Dashboard Economização possui indicador de **Faturamento Gerencial**
(F1-G / docs/11 §12): Σ total dos AR por `competenceDate` do mês
selecionado, via `GET /dashboard/monthly-revenue`.

Não usa vendas, NF-e nem NFS-e neste card.

Faturamento fiscal (NF-e/NFS-e) permanece capacidade futura separada
(auditoria F0 preservada).

Decisão histórica (19/08/2026): faturamento ADIADO do primeiro Dashboard
até definição de fonte — supersedida em 20/08/2026 pela definição
gerencial acima.

⸻

29. Contas a receber

Indicador confirmado como tecnicamente compatível com o domínio disponível.

O modelo interno deverá permitir análises como:

* total;
* aberto;
* vencido;
* recebido;
* futuro;
* por vencimento;
* por categoria;
* por cliente;
* por período.

A disponibilidade exata de cada filtro dependerá dos endpoints utilizados.

⸻

30. Contas a pagar

Indicador confirmado como tecnicamente compatível com o domínio disponível.

O modelo interno deverá permitir análises como:

* total;
* aberto;
* vencido;
* pago;
* futuro;
* por vencimento;
* por categoria;
* por fornecedor;
* por período.

⸻

31. Inadimplência

Não deverá ser procurado obrigatoriamente um campo denominado “inadimplência”.

O Dashboard Economização poderá calcular esse indicador a partir das contas a receber.

Definição conceitual inicial:

Conta a receber
+
vencimento anterior à data de referência
+
saldo ainda em aberto
=
valor inadimplente

Fórmula e decisões D1/D2/D9: fonte normativa `docs/11-regras-analiticas.md` §4.

⸻

32. Receita por categoria

Deverá ser calculada através da associação de receitas às categorias financeiras disponíveis.

Deverá respeitar rateios quando uma movimentação estiver distribuída entre várias categorias.

⸻

33. Despesa por categoria

Deverá ser calculada através da associação de despesas às categorias financeiras disponíveis.

Deverá respeitar rateios quando aplicável.

⸻

34. Despesas fixas e variáveis

Ainda NÃO está confirmado que o Conta Azul forneça uma classificação nativa confiável de:

* despesa fixa;
* despesa variável.

Portanto, o Dashboard Economização não deverá assumir a existência desse dado.

Durante a implementação deverão ser avaliadas alternativas como:

1. classificação disponível diretamente na API;
2. inferência determinística baseada em informação disponível;
3. configuração administrativa;
4. regra própria do Dashboard Economização.

IA não deverá inventar essa classificação.

⸻

35. Fluxo de caixa

O Dashboard Economização deverá construir seu fluxo de caixa através dos dados financeiros normalizados.

Deverá existir distinção entre:

Realizado

Movimentações financeiras efetivamente pagas ou recebidas.

Previsto

Contas a pagar e receber futuras ainda abertas.

A fórmula final deverá ser documentada no Motor Analítico.

⸻

36. Fluxo histórico

O sistema deverá conseguir reconstruir fluxo passado utilizando dados sincronizados correspondentes.

⸻

37. Fluxo atual

Deverá apresentar a situação financeira no período corrente.

⸻

38. Fluxo futuro

Poderá utilizar:

* contas a receber futuras;
* contas a pagar futuras;
* saldo atual quando aplicável.

Esse cálculo deverá ser determinístico.

A IA poderá interpretar a projeção, mas não deverá gerar os números da projeção por conta própria.

⸻

39. Clientes e fornecedores

A API disponibiliza gerenciamento/consulta de pessoas relacionadas à operação.

O Dashboard Economização poderá utilizar essas informações para análises como:

* principais clientes;
* concentração de receita;
* maiores valores em aberto;
* inadimplência por cliente;
* principais fornecedores;
* concentração de despesas.

A implementação dependerá dos dados efetivamente retornados pelos endpoints selecionados.

⸻

40. Vendas

A API disponibiliza recursos relacionados a vendas.

Esses dados deverão ser estudados para definição correta de:

* faturamento;
* ticket médio;
* evolução comercial;
* principais clientes;
* outros indicadores comerciais.

Não será assumido que toda venda equivale automaticamente a receita recebida.

⸻

41. Eventos financeiros versus vendas

O domínio interno deverá manter distinção entre:

evento comercial

e

evento financeiro.

Uma venda realizada não significa necessariamente recebimento financeiro ocorrido.

Essa diferença é essencial para evitar inconsistência entre:

* faturamento;
* receita;
* contas a receber;
* caixa.

⸻

42. Paginação

Todo endpoint de listagem deverá ser analisado quanto a:

* modelo de paginação;
* tamanho máximo de página;
* ordenação;
* filtros;
* continuidade;
* comportamento com registros alterados durante paginação.

O conector deverá encapsular essa lógica.

⸻

43. Atualização incremental

Deverá ser verificado individualmente quais recursos permitem filtro por:

* data de alteração;
* data de criação;
* data de pagamento;
* data de vencimento;
* outros marcadores temporais.

Quando existir filtro confiável por alteração, ele deverá ser priorizado para sincronização incremental.

⸻

44. Reconciliação

Mesmo utilizando sincronização incremental, o sistema deverá possuir capacidade futura de executar reconciliação completa.

Objetivo:

detectar divergência entre:

Conta Azul
x
Dados internos

⸻

45. Exclusões e cancelamentos

Durante implementação de cada recurso deverá ser verificado:

* como exclusões são representadas;
* como cancelamentos aparecem;
* se registros deixam de aparecer nas listagens;
* se existe status específico;
* como alterações retroativas funcionam.

A sincronização não deverá presumir esses comportamentos.

⸻

46. Tratamento de HTTP 429

HTTP 429 deverá ser interpretado como limite de requisição.

O conector deverá possuir estratégia de:

* pausa;
* retry controlado;
* backoff;
* respeito aos headers retornados;
* registro operacional.

Não deverá existir loop de retry imediato.

⸻

47. Falhas transitórias

Erros transitórios deverão possuir retentativa controlada.

Exemplos conceituais:

* timeout;
* erro temporário de rede;
* 429;
* erros 5xx recuperáveis.

⸻

48. Falhas permanentes

Erros como:

* autorização revogada;
* refresh inválido;
* integração não autorizada;

deverão alterar o estado operacional da integração quando aplicável.

O administrador deverá conseguir identificar que a empresa necessita de atenção.

⸻

49. Estado da integração

Estados internos candidatos:

* pending_authorization;
* connected;
* syncing;
* healthy;
* attention_required;
* authentication_error;
* disconnected.

A nomenclatura poderá ser refinada durante implementação.

⸻

50. Dados armazenados

O Dashboard Economização deverá armazenar apenas os dados necessários para:

* dashboard;
* análises;
* relatórios;
* IA;
* comparações;
* histórico operacional;
* sincronização.

Não deverá copiar indiscriminadamente todos os recursos disponíveis na Conta Azul sem necessidade de produto.

⸻

51. Contrato do Connector

A implementação futura deverá encapsular a API em um módulo conceitualmente equivalente a:

ContaAzulConnector

Ele será responsável por:

* OAuth;
* refresh;
* chamadas HTTP;
* paginação;
* rate limiting;
* retries;
* interpretação de erros;
* recuperação de recursos externos.

Ele não será responsável por:

* gráficos;
* KPIs;
* regras de negócio da dashboard;
* prompts de IA;
* relatórios.

⸻

52. Contrato do Normalizer

Após obtenção dos dados:

ContaAzulConnector
        ↓
ContaAzulNormalizer
        ↓
Modelo Financeiro Interno

O normalizador será responsável por converter estruturas externas no domínio do Dashboard Economização.

⸻

53. Segurança multiempresa

Toda chamada à API deverá partir de uma integração já vinculada ao tenant.

Fluxo obrigatório:

tenant_id
   ↓
integration
   ↓
credentials do tenant
   ↓
Conta Azul

Nunca:

token informado pelo frontend
→ Conta Azul

⸻

54. Logs seguros

Logs da integração poderão conter:

* tenant;
* endpoint lógico;
* status HTTP;
* duração;
* tentativa;
* quantidade de registros;
* identificador de correlação.

Não poderão conter:

* access token;
* refresh token;
* client_secret;
* Authorization header completo.

⸻

55. Changelog da API

A Conta Azul mantém changelog da API e continua adicionando e alterando recursos.

Portanto, o Dashboard Economização deverá tratar a integração como dependência externa sujeita a mudanças.

Alterações relevantes deverão ser avaliadas antes de atualização do conector.

⸻

56. Indicadores — Matriz Inicial

Indicador	Fonte candidata	Situação
Faturamento	Vendas / dados financeiros	Requer definição
Contas a receber	Financeiro	Confirmado
Contas a pagar	Financeiro	Confirmado
Inadimplência	Derivado de contas a receber	Derivável
Receita por categoria	Financeiro + categorias/rateio	Derivável
Despesa por categoria	Financeiro + categorias/rateio	Derivável
Despesas fixas	A validar	Pendente
Despesas variáveis	A validar	Pendente
Fluxo de caixa realizado	Movimentações/baixas	Derivável
Fluxo de caixa previsto	Receber + pagar futuros	Derivável
Saldo	Contas financeiras	Candidato confirmado
Receita x despesa	Financeiro	Derivável
Principais clientes	Pessoas + financeiro/vendas	Candidato
Principais fornecedores	Pessoas + financeiro	Candidato
Ticket médio	Vendas	Candidato

⸻

57. Decisões Confirmadas

CAZ-001 — Utilizar somente a API atual do Conta Azul.

CAZ-002 — Cada tenant terá autorização OAuth independente.

CAZ-003 — OAuth utilizará Authorization Code Flow.

CAZ-004 — Access token e refresh token serão armazenados no backend.

CAZ-005 — Access token atual possui validade documentada de 3600 segundos.

CAZ-006 — Authorization Code atual possui validade documentada de 3 minutos.

CAZ-007 — Limite atual documentado é de 600 requisições/minuto por conta conectada.

CAZ-008 — Limite atual documentado é de até 10 requisições/segundo por conta conectada.

CAZ-009 — A API atualmente não oferece webhook nativo para sincronização desses eventos.

CAZ-010 — A estratégia inicial de atualização utilizará polling.

CAZ-011 — A dashboard nunca dependerá de uma chamada direta ao Conta Azul para renderizar.

CAZ-012 — Dados serão normalizados antes de entrarem no domínio interno.

CAZ-013 — O sistema utilizará apenas recursos necessários ao produto.

CAZ-014 — Não haverá escrita financeira no Conta Azul no MVP.

CAZ-015 — Cálculos analíticos não serão responsabilidade do Connector.

⸻

58. Pendências para Spike Técnico

Situação atualizada em 19/08/2026 após homologações reais das fases
2.1 a 2.4. Os itens abaixo foram reclassificados:

HOMOLOGADO com conta ERP real (Fases 2.1–2.4):

1. listagem real de contas a receber — homologada (12 títulos reais);
2. listagem real de contas a pagar — homologada (1266 títulos reais);
3. paginação — homologada (tamanho 100, horizonte 5+2 anos);
4. filtros por alteração (`data_alteracao_de/ate`) — homologados (2.4);
5. filtros por vencimento (`data_vencimento_de/ate`) — homologados (2.3/2.4);
7. consulta de categorias — homologada (48 categorias reais);
10. contas financeiras — homologadas (1 conta real);
12. clientes / fornecedores — homologados em estrutura (0 pessoas
    nesta conta de teste; `items:null` tratado);
15. comportamento dos status — mapeados (OPEN/OVERDUE/PAID/
    PARTIALLY_PAID/LOST/RENEGOTIATED/UNKNOWN);
18. datas e timezone — homologados (`America/Sao_Paulo`, ISO local);
19. comportamento do refresh token — homologado (rotação, refresh lock);
20. headers de rate limit — operacional (~8 req/s sem 429);
21. volume real: ~33 s para 48 cat + 1 conta + 0 pessoas + 12 AR +
    1266 AP; horizonte 5+2 classificado como adequado.

PENDENTE — necessidade condicional ao recorte de produto:

6.  filtros por pagamento (data efetiva de baixa) — client aceita
    `data_pagamento_de/ate` (CASH-2); NÃO usado no engine incremental
    (`paymentDiscoveryWindow: null`). CASH-7 backfill local descobre
    parcelas pelo AR/AP local com `paid > 0` e GET `/parcelas/{id}/baixa`
    nas não cobertas (Σ gross ACTIVE = paid; DELETED não impede skip).
    GET `/parcelas/baixa/{id}` (CASH-8A) distingue 404 de erro operacional.
    R3: missing + GET-por-id 404 + parcela viva + remaining = valor_pago
    → DELETED só com flag true. R4 `[]` = HOLD. Flag default false.
    Não inventa endpoint de estorno. Produção ainda não executada.
    KPI Home visual: CASH-4B.
    CASH-9C: `GET /v1/financeiro/transferencias` persistido em
    `financial_transfers`; ghost ACTIVE excluído do realizado só com
    match 1:1. Ambíguo não exclui. CASH-4B continua bloqueado.
8.  rateios valorados (`categorias` com percentual/valor por parcela)
    — endpoint de detalhe `/parcelas/{id}` documentado; não consumido;
    necessário para KPI de receita/despesa por categoria precisa;
9.  centros de custo — não consumidos; necessário se KPI exigir;
11. saldos — endpoint de saldo documentado; não consumido;
    necessário se saldo for KPI do primeiro Dashboard;
14. vendas — não consumidas; necessárias para definir faturamento
    (ver §28 — fórmula de faturamento pendente de decisão de produto);
16. registros cancelados / exclusões — ausência não é delete;
    reconciliação futura exigirá estratégia (limitação conhecida).

Os itens pendentes não precisam ser consumidos automaticamente.
A decisão de consumi-los é orientada pelo recorte de KPIs do
primeiro Dashboard (Fase 9 e docs/11; Fase 8 já concluída no recorte de produto).

⸻

59. Resultado esperado do Spike

Ao concluir os testes deverão ser conhecidos:

* endpoints exatos utilizados;
* payloads reais relevantes;
* campos necessários;
* paginação;
* estratégia incremental;
* custo aproximado de chamadas por tenant;
* intervalo inicial de polling;
* regras de normalização;
* tratamento de exclusões;
* tratamento de cancelamentos;
* definição final de cada KPI.

Essas informações deverão atualizar este documento antes da implementação definitiva do motor de sincronização.

⸻

60. Diretriz Final

O Dashboard Economização deverá utilizar a Conta Azul como fonte confiável dos dados financeiros, mas deverá manter internamente seu próprio domínio analítico.

A integração deverá ser:

* segura;
* incremental quando possível;
* resiliente;
* rastreável;
* eficiente;
* isolada por empresa;
* desacoplada da interface;
* preparada para mudanças futuras da API.

⸻

