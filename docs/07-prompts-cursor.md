Dashboard Economização

07 — Padrão de Prompts para Cursor/Codex

Status: Ativo
Projeto: Dashboard Economização
Tipo: Contrato operacional de execução

⸻

1. Objetivo

Este documento define o padrão obrigatório para prompts de implementação, manutenção, correção e validação executados pelo Cursor/Codex no projeto Dashboard Economização.

O objetivo é reduzir interpretações livres, evitar expansão indevida de escopo e garantir que cada execução possua:

* contexto;
* objetivo;
* limites;
* arquivos permitidos;
* critérios de aceite;
* validações;
* relatório final.

⸻

2. Papel do Cursor/Codex

O Cursor/Codex atua como executor técnico.

Ele não é responsável por redefinir o produto.

Ele não deverá:

* inventar funcionalidades;
* ampliar escopo;
* substituir requisitos;
* escolher comportamentos de produto não documentados;
* implementar fases futuras antecipadamente;
* alterar documentação sem autorização;
* fazer commit sem autorização;
* fazer push sem autorização.

⸻

3. Fontes de Verdade

Antes de implementar qualquer fase, o Cursor/Codex deverá considerar os documentos aplicáveis:

* docs/00-visao-do-produto.md
* docs/01-prd.md
* docs/02-arquitetura.md
* docs/03-modelagem-banco.md
* docs/04-api-conta-azul.md
* docs/05-ui-ux.md
* docs/06-roadmap.md
* docs/07-prompts-cursor.md

Documentos futuros poderão complementar essa lista.

⸻

4. Regra de Conflito

Quando houver conflito entre:

* código existente;
* implementação proposta;
* documentação vigente;

o Cursor/Codex não deverá escolher sozinho qual comportamento prevalecer.

Ele deverá:

1. identificar o conflito;
2. interromper apenas a parte conflitante;
3. registrar a pendência;
4. não inventar resolução.

⸻

5. Estrutura Obrigatória de Todo Prompt

Todo prompt futuro deverá conter, sempre que aplicável:

PROJETO
FASE
OBJETIVO
CONTEXTO
DOCUMENTOS DE REFERÊNCIA
REQUISITOS RELACIONADOS
ESCOPO AUTORIZADO
FORA DO ESCOPO
ARQUIVOS PERMITIDOS
ARQUIVOS PROIBIDOS
REGRAS DE IMPLEMENTAÇÃO
CRITÉRIOS DE ACEITE
VALIDAÇÕES OBRIGATÓRIAS
RESTRIÇÕES DE GIT
RELATÓRIO FINAL

⸻

6. Identificação do Projeto

Todo prompt de implementação deverá iniciar informando:

Projeto: Dashboard Economização

Isso evita execução fora de contexto.

⸻

7. Identificação da Fase

Toda execução deverá indicar explicitamente a fase.

Exemplo:

Fase atual:
Fase 3 — Administração

O Cursor/Codex não deverá implementar itens de fases posteriores.

⸻

8. Objetivo

O prompt deverá possuir um objetivo curto e verificável.

Exemplo:

Objetivo:
Implementar cadastro, edição e ativação/desativação de empresas no painel administrativo.

Evitar objetivos vagos como:

melhorar o sistema

ou:

criar o admin.

⸻

9. Contexto

O contexto deverá explicar apenas o necessário para executar a fase.

Não deverá ser utilizado para conceder liberdade de criação ao executor.

⸻

10. Documentos de Referência

O prompt deverá citar os documentos que precisam ser lidos.

Exemplo:

Leia antes de implementar:
docs/01-prd.md
docs/02-arquitetura.md
docs/03-modelagem-banco.md
docs/06-roadmap.md

⸻

11. Requisitos Relacionados

Quando a fase corresponder a requisitos formais, seus IDs deverão ser informados.

Exemplo:

Requisitos:
TENANT-001
TENANT-003
TENANT-004
ADMIN-002

⸻

12. Escopo Autorizado

O prompt deverá listar claramente o que pode ser implementado.

Exemplo:

Pode implementar:
- listagem de empresas;
- cadastro;
- edição;
- ativação;
- desativação.

⸻

13. Fora do Escopo

Todo prompt deverá declarar funcionalidades próximas que não podem ser implementadas ainda.

Exemplo:

Não implementar nesta fase:
- Conta Azul;
- branding;
- Consultor Financeiro;
- dashboard do cliente;
- relatórios.

⸻

14. Arquivos Permitidos

Quando possível, o prompt deverá limitar o conjunto de arquivos que podem ser alterados.

Exemplo:

Arquivos permitidos:
src/modules/tenants/**
src/modules/admin/**
tests/tenants/**

Caso os arquivos ainda não sejam conhecidos, deverá ser definido o escopo por diretório ou responsabilidade.

⸻

15. Arquivos Proibidos

Arquivos sensíveis poderão ser explicitamente bloqueados.

Exemplo:

Não alterar:
docs/**
.env
arquivos de integração Conta Azul
módulo do Consultor Financeiro

⸻

16. Leitura Antes da Alteração

Antes de modificar um módulo existente, o Cursor/Codex deverá ler o código relacionado.

Não deverá substituir uma implementação existente sem compreender:

* dependências;
* testes;
* padrões;
* contratos;
* efeitos colaterais.

⸻

17. Menor Mudança Coerente

O executor deverá preferir a menor mudança que cumpra integralmente a fase.

Não deverá realizar refatorações amplas sem necessidade direta.

⸻

18. Proibição de Refatoração Paralela

Não realizar, sem autorização:

* renomeação em massa;
* troca de bibliotecas;
* mudança de arquitetura;
* reorganização ampla de pastas;
* alteração de estilo geral;
* atualização de dependências;
* reformatação desnecessária de arquivos não relacionados.

⸻

19. Dependências

Não instalar dependência nova automaticamente apenas por conveniência.

Quando uma dependência nova for estritamente necessária e o prompt não a tiver autorizado:

* registrar necessidade;
* não instalar;
* aguardar decisão.

Uma fase poderá autorizar explicitamente dependências específicas.

⸻

20. Banco de Dados

Quando uma fase exigir banco:

* utilizar apenas entidades aprovadas;
* não inventar tabelas de negócio;
* migrations devem ser incrementais;
* migrations existentes não deverão ser reescritas sem autorização;
* rollback deverá ser considerado quando a tecnologia permitir.

⸻

21. Multiempresa

Toda implementação envolvendo dados de cliente deverá validar tenant no backend.

É proibido considerar um filtro de frontend como mecanismo suficiente de isolamento.

⸻

22. Identificadores

IDs enviados pelo frontend nunca deverão implicar autorização por si mesmos.

O backend deverá verificar relacionamento e permissão.

⸻

23. Conta Azul

É proibido:

* chamar Conta Azul diretamente do frontend;
* expor token;
* presumir endpoint;
* presumir campo;
* presumir limite;
* inventar webhook;
* criar comportamento não validado.

A documentação 04-api-conta-azul.md deverá ser respeitada.

⸻

24. Inteligência Artificial

O Cursor/Codex não deverá utilizar LLM para substituir cálculos financeiros determinísticos.

Fluxo obrigatório:

dados
↓
regra analítica
↓
resultado
↓
IA interpreta

Nunca:

dados crus
↓
IA inventa cálculo

⸻

25. Segurança da IA

Toda composição de contexto deverá ocorrer após resolução do tenant.

Nunca enviar dados de múltiplos tenants ao modelo para que ele escolha o que utilizar.

⸻

26. Prompt Administrativo

Conteúdo configurado pelo administrador não poderá:

* conceder novas permissões;
* alterar tenant;
* acessar segredos;
* ignorar regras da plataforma.

⸻

27. Logs

Não registrar:

* senhas;
* access tokens;
* refresh tokens;
* client secrets;
* chaves privadas;
* Authorization headers completos.

⸻

28. Auditoria

Sempre que o PRD exigir auditoria, a implementação correspondente deverá ocorrer na mesma fase funcional ou em fase explicitamente definida pelo roadmap.

Não criar auditoria fictícia apenas no frontend.

⸻

29. Tratamento de Erros

Erros deverão ser tratados na camada adequada.

Não utilizar catch vazio.

Não ocultar erro crítico silenciosamente.

Erros técnicos poderão ser registrados de forma sanitizada.

Mensagens internas não deverão ser expostas diretamente ao usuário final.

⸻

30. Estados da Interface

Toda tela assíncrona deverá considerar, quando aplicável:

* loading;
* sucesso;
* vazio;
* erro.

⸻

31. Dados Fictícios

Dados mockados poderão ser utilizados somente quando explicitamente autorizados para desenvolvimento ou teste.

Não deverão permanecer em fluxos de produção como fallback silencioso.

⸻

32. Responsividade

Toda nova interface do MVP deverá ser implementada considerando desktop e larguras menores.

Não deixar adaptação mobile integralmente para o final.

⸻

33. Testes

Cada fase deverá adicionar ou atualizar testes compatíveis com o risco da mudança.

Prioridade máxima para:

* isolamento de tenant;
* autenticação;
* autorização;
* cálculos;
* sincronização;
* relatórios;
* segurança de IA.

⸻

34. Testes de Regressão

Antes de encerrar fase, deverão ser executados os testes relevantes existentes.

Uma nova funcionalidade não poderá ser considerada pronta se quebrar testes anteriores sem justificativa aprovada.

⸻

35. Lint

Quando configurado no projeto, lint deverá ser executado antes da conclusão da fase.

⸻

36. Typecheck

Quando a stack possuir verificação estática de tipos, typecheck deverá ser executado antes da conclusão.

⸻

37. Build

Build deverá ser executado quando tecnicamente aplicável à fase.

⸻

38. Testes Manuais

Quando determinada funcionalidade não puder ser adequadamente coberta apenas por teste automatizado, o relatório deverá fornecer roteiro objetivo de validação manual.

⸻

39. Proibição de Commit Automático

Por padrão:

NÃO FAZER COMMIT
NÃO FAZER PUSH

Commit somente será permitido quando o prompt disser explicitamente.

⸻

40. Commits Separados

Quando autorizado, um commit deverá representar uma unidade coerente.

Não misturar:

* documentação;
* refatoração não relacionada;
* funcionalidade;
* correção aleatória;

no mesmo commit sem necessidade.

⸻

41. Push

Push nunca deverá ser inferido a partir de autorização de commit.

São permissões independentes.

Exemplo:

Pode fazer commit não significa pode fazer push.

⸻

42. Estado do Git

Antes de alterações relevantes, o executor deverá identificar:

* branch atual;
* working tree;
* alterações pré-existentes.

Não deverá sobrescrever trabalho anterior do usuário.

⸻

43. Alterações Pré-existentes

Se houver arquivos já modificados antes da tarefa:

* preservar;
* não resetar;
* não apagar;
* não incluir na tarefa sem necessidade;
* informar no relatório.

⸻

44. Comandos Proibidos sem Autorização

Não executar automaticamente:

* git reset –hard;
* git clean destrutivo;
* git rebase;
* git push –force;
* git checkout descartando alterações;
* remoção massiva de arquivos;
* operações destrutivas no banco.

⸻

45. Critério de Parada

Caso uma fase dependa de informação material ausente e não exista forma segura de derivá-la da documentação ou código:

o executor deverá parar apenas naquele ponto.

Deverá registrar:

BLOQUEIO
O que falta:
...
Por que é necessário:
...
O que foi concluído sem essa decisão:
...

Não inventar resposta para remover o bloqueio.

⸻

46. Critérios de Aceite

Todo prompt deverá possuir critérios verificáveis.

Evitar:

deixar funcionando corretamente

Preferir:

- usuário do tenant A recebe 404/403 ao tentar acessar recurso do tenant B;
- admin consegue criar tenant;
- tenant criado aparece na listagem;
- operação gera auditoria.

⸻

47. Validações Obrigatórias

Todo prompt de implementação deverá listar comandos ou categorias de validação esperadas.

Modelo:

Executar:
- testes relevantes;
- lint;
- typecheck;
- build.
Se algum comando não existir no projeto, informar.

⸻

48. Relatório Final Obrigatório

Ao concluir uma execução, responder com:

## Relatório
### Fase
...
### Objetivo
...
### Arquivos criados
...
### Arquivos alterados
...
### Banco/Migrations
...
### Implementação realizada
...
### Testes executados
...
### Lint
...
### Typecheck
...
### Build
...
### Critérios de aceite
...
### Pendências
...
### Riscos/observações
...
### Git
- Commit: não realizado / hash
- Push: não realizado / realizado
### Confirmação de escopo
Nenhuma funcionalidade da próxima fase foi implementada.

⸻

49. Relatório sem Marketing

O relatório deverá ser factual.

Evitar frases vagas como:

* implementação robusta;
* arquitetura moderna;
* solução premium;
* experiência incrível.

Informar concretamente o que foi feito e o que foi validado.

⸻

50. Template Base de Prompt

Todo novo prompt poderá utilizar a estrutura abaixo.

Execute esta tarefa no Codex.
Projeto:
Dashboard Economização
Fase:
[FASE]
Objetivo:
[OBJETIVO]
Leia antes de alterar qualquer código:
[DOCUMENTOS]
Requisitos relacionados:
[REQUISITOS]
Escopo autorizado:
[ESCOPO]
Não implementar:
[FORA DO ESCOPO]
Arquivos/diretórios permitidos:
[PERMITIDOS]
Não alterar:
[PROIBIDOS]
Regras:
[REGRAS ESPECÍFICAS]
Critérios de aceite:
[CRITÉRIOS]
Validação obrigatória:
[TESTES / LINT / TYPECHECK / BUILD]
Git:
Não fazer commit.
Não fazer push.
Ao concluir, entregue o relatório no padrão definido em:
docs/07-prompts-cursor.md
Não continue para a próxima fase.

⸻

51. Template de Prompt de Auditoria

Execute uma auditoria somente de leitura.
Não altere arquivos.
Não corrija nada.
Não faça commit.
Não faça push.
Objetivo:
[OBJETIVO]
Analise:
[ESCOPO]
Leia:
[DOCUMENTOS]
Entregue:
1. situação atual;
2. arquivos envolvidos;
3. divergências da documentação;
4. bugs confirmados;
5. riscos;
6. recomendações;
7. proposta de correção dividida em fases.
Não implemente as correções.

⸻

52. Template de Prompt de Correção

Execute exclusivamente a correção descrita abaixo.
Bug confirmado:
[BUG]
Comportamento esperado:
[ESPERADO]
Arquivos relacionados:
[ARQUIVOS]
Não alterar:
[FORA DO ESCOPO]
Critérios de aceite:
[CRITÉRIOS]
Adicione teste de regressão quando aplicável.
Execute:
- testes;
- lint;
- typecheck;
- build.
Não fazer commit.
Não fazer push.
Não realizar refatoração paralela.

⸻

53. Template de Commit

Commit deverá ser solicitado em prompt separado.

Execute somente a publicação local da alteração já validada.
Antes:
1. verifique branch;
2. verifique git status;
3. confirme que apenas arquivos da fase estão incluídos;
4. execute novamente validações necessárias se o estado mudou.
Crie commit:
[MENSAGEM]
Não faça amend.
Não faça rebase.
Não faça merge.
Não faça reset.
Não faça push.
Ao finalizar, informe:
- branch;
- hash;
- mensagem;
- arquivos incluídos;
- working tree.

⸻

54. Template de Push

Push deverá ser solicitado separadamente.

Execute somente o push do commit já aprovado.
Antes:
1. confirme branch;
2. confirme HEAD;
3. confirme origin;
4. confirme ahead/behind;
5. confirme working tree.
Não crie novo commit.
Não faça amend.
Não faça rebase.
Não faça merge.
Não faça force push.
Faça push somente se o histórico permitir atualização segura.
Ao finalizar informe:
- branch;
- HEAD;
- origin;
- resultado do push.

⸻

55. Controle de Mudança de Documentação

Documentação não deverá ser alterada silenciosamente durante implementação.

Se a implementação revelar necessidade de mudança de contrato:

1. interromper a decisão correspondente;
2. apontar documento afetado;
3. explicar necessidade;
4. aguardar atualização formal do documento;
5. só então continuar implementação.

⸻

56. Novas Funcionalidades Sugeridas pelo Executor

Caso o Cursor/Codex identifique melhoria não solicitada:

não implementar.

Registrar opcionalmente em:

Sugestões não implementadas

no relatório.

A sugestão não passa a fazer parte do escopo automaticamente.

⸻

57. Princípio Final de Execução

O Cursor/Codex deverá seguir a ordem:

DOCUMENTAÇÃO
↓
REQUISITO
↓
FASE
↓
PROMPT
↓
IMPLEMENTAÇÃO
↓
TESTE
↓
VALIDAÇÃO HUMANA
↓
COMMIT
↓
PUSH

Nunca:

IDEIA
↓
IMPLEMENTAÇÃO AUTOMÁTICA

⸻

58. Diretriz Final

No Dashboard Economização:

O Cursor/Codex executa decisões. Ele não substitui o processo de decisão do produto.

Qualquer expansão de escopo deverá ser decidida antes de ser implementada.

⸻

