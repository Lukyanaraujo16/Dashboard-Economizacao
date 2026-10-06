# Trilha de resultado analítico

Esta trilha mede se a Lia conseguiu responder a pergunta. Ela não implementa um agente e não muda o texto das respostas já homologadas.

## Status técnico e resultado analítico

`ai_runs.status` continua sendo o resultado técnico do provedor:

- `SUCCEEDED` significa que o provedor concluiu a geração;
- `FAILED` e `TIMEOUT` significam falha técnica do provedor;
- `LIMIT_BLOCKED` continua exclusivo do limite da plataforma.

`ai_analytical_results.outcome` é o resultado analítico para o usuário. Um run pode ficar `SUCCEEDED` com outcome `UNSUPPORTED` ou `TOOL_ERROR` quando a geração terminou e nenhum fato fechou a pergunta.

Os fast-paths determinísticos não criam `ai_runs`. Eles gravam a trilha com `run_id` nulo e outcome próprio. O texto da resposta não é reclassificado.

## Outcomes

O outcome é um enum fechado. Ele não é escolhido lendo a prosa final.

| Outcome | Sinal estruturado |
|---|---|
| `ANSWERED` | Fato fechado com status positivo, ou tool com status de sucesso |
| `PARTIAL` | Fato parcial, ou sucesso misturado com falha ou ausência |
| `CLARIFICATION_REQUIRED` | Ambiguidade explícita de entidade, dia ou centro |
| `UNSUPPORTED` | Nenhuma capability, operação não suportada, ou provider concluiu sem fato |
| `NO_DATA` | População vazia ou entidade ausente comprovada pelo status da tool ou do fato |
| `TOOL_ERROR` | Timeout, execução, argumentos inválidos, tool desconhecida ou indisponibilidade sem fato |
| `PROVIDER_ERROR` | A geração do provedor falhou. O status técnico permanece `FAILED` ou `TIMEOUT` |

`answer_source` indica a origem estruturada: faturamento, série, planejamento, movimento diário, contraparte, centro de custo, nominal, comparação, snapshot, breakdown, linhas, capability negada ou provider. Conhecimento documental continua anexado só no caminho do provider; a origem desse caminho é `PROVIDER`.

## Tool trace

Cada tool executada no loop, e o preload que alimenta o composer, gera uma linha em `ai_analytical_tool_traces`: nome, rodada, se a tool é conhecida, status, motivo, duração quando medida e cardinalidade. O payload financeiro, o SQL e o prompt não são gravados.

`UNAVAILABLE` deixa de ser um motivo único. Quando o JSON já emitido pela tool permite distinguir, o motivo é um destes: `UNKNOWN_TOOL`, `INVALID_ARGUMENTS`, `CAPABILITY_DENIED`, `ENTITY_NOT_FOUND`, `ENTITY_AMBIGUOUS`, `NO_DATA`, `TOOL_TIMEOUT`, `TOOL_EXECUTION_ERROR`, `UNSUPPORTED_OPERATION`. Se a camada inferior não distingue, o motivo é `UNKNOWN`.

## Resolução de entidades

O resolvedor em `resolve-analytical-entity` compara uma menção com um catálogo já limitado ao tenant. Ele não escolhe tenant, não lê a prosa do modelo e não calcula valor financeiro. O catálogo inicial é o de centros de custo ativos (`loadAnalyticalCostCenterCatalog`). O mesmo contrato aceita categoria, contraparte e conta financeira quando houver um carregador do runtime.

A correspondência é determinística: nome ou código normalizado exato, nome oficial contido na menção e, por último, tokens que identificam uma única entidade. Acento, caixa, pontuação e espaços são normalizados. Vários candidatos plausíveis ficam `AMBIGUOUS`. Nenhuma correspondência fica `NOT_FOUND`, com a menção preservada.

`RESOLVED` devolve id, dimensão, nome oficial e código. Falha vira sinal `ENTITY_NOT_FOUND` ou `ENTITY_AMBIGUOUS` para a trilha já existente. Isso não altera `ai_runs.status` e ainda não escolhe capability nem compara períodos. Uma pergunta que só teve as entidades resolvidas pode continuar `UNSUPPORTED` até existir planner.

## Vínculo e consulta

Cada pergunta persistida tem no máximo uma trilha. A linha aponta para a mensagem do usuário, a resposta do consultor quando ela existe, a conversa, o tenant e o `ai_run` quando o provider foi chamado. A pergunta e a resposta continuam nas mensagens; a trilha não duplica o texto.

A leitura administrativa é `GET /admin/operations/analytical-results`, com o mesmo guarda de `/admin/operations/ai-runs`. Não há dashboard nesta fase. `USER` não acessa. O modo suporte não eleva papel. A listagem devolve identificadores, outcome, origem, contagens, tokens já existentes no run e o rastro das tools. Não devolve conteúdo de mensagem, prompt, SQL nem valor financeiro.

O tenant da gravação é o tenant da execução. A tool não escolhe tenant. A listagem filtrada por tenant não mistura empresas.

## Privacidade

Não são persistidos prompt completo, credencial, SQL nem payload financeiro da tool. O nome de entidade não resolvida, quando houver, fica limitado a 80 caracteres e só nos motivos de entidade ausente ou ambígua.
