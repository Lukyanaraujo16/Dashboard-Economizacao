# ADR-051 — Consultor em modo agente

**Status:** aceito (2026-11-04)
**Substitui parcialmente:** a regra "o modelo não escolhe período" da camada de IA (`docs/09.24-convencoes-ia.md`) para o modo agente.

## Contexto

O Consultor decidia a maior parte das respostas com classificadores determinísticos (regex) antes do LLM:
período, continuidade, centro de custo, entidade nominal, pending actions. Cada frase não prevista
virava "Não consegui identificar o que alterar na consulta anterior" (ex.: "e desse mês?").
Em três meses, a maioria dos commits do módulo foi correção de frase por frase. A conversa não era fluida
e o consultor não conseguia combinar dados para perguntas de decisão ("posso comprar computadores?").

## Decisão

Novo modo `agent` (default, `ADVISOR_MODE=agent`), com o pipeline antigo preservado em `ADVISOR_MODE=legacy`.

- O LLM recebe o **histórico real** da conversa (até 20 turnos user/assistant) e interpreta a pergunta,
  inclusive continuações e nomes de centros de custo.
- O LLM escolhe as **tools** e seus argumentos (mês, janela, centro, limite). Até 8 rodadas por resposta.
- **Todo número vem de serviço oficial**: `MonthlyCashFlow` (`monthlyBilling`, `monthlyExpenses`),
  `FinancialStockSnapshot`, capability registry e as tools analíticas já homologadas. Nenhuma fórmula muda.
- O LLM pode fazer contas simples sobre valores retornados (soma, média, percentual) e deve dizer que é cálculo.
- **Tenant continua vindo só do runtime.** Tools ignoram tenant em argumentos. Sem SQL livre.
- Argumentos inválidos voltam ao modelo como erro legível para ele se corrigir.

Arquivos: `services/run-advisor-agent.ts` (loop), `domain/advisor-agent-tools.ts` (tools novas),
`domain/advisor-agent-instructions.ts` (instruções), ramo `answerWithAdvisorAgent` em `send-advisor-message.ts`.

## Consequências

- Perguntas abertas, continuações e consultoria passam a funcionar sem regra nova por frase.
- Qualidade depende do modelo: `gpt-4o-mini` é fraco para várias etapas; preferir `gpt-5.4-mini` ou `claude-sonnet-5`.
- Custo por resposta sobe (mais tokens e rodadas).
- Leitura completa da Dashboard e Relatórios: `domain/advisor-dashboard-tools.ts` espelha cada rota GET
  (mesmos parsers e `DashboardOverviewFacade`, montada por `buildDashboardOverviewFacade`), incluindo saldo bancário,
  projeção, metas, teto, títulos e lançamentos por dia. Escritas (metas/teto) não são expostas ao agente.
  Rota GET nova da Dashboard deve ganhar a tool correspondente nessa tabela.
- Reverter: `ADVISOR_MODE=legacy`.
