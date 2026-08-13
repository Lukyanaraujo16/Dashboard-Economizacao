# ADR-041 — Stack Oficial

## Título

Stack oficial do Dashboard Economização

## Status

Aprovada

## Contexto

O projeto possui decisões técnicas distribuídas em `docs/08-decisoes-tecnicas.md` (ADR-001 a ADR-040), padrões de desenvolvimento na série 09 e ordem de execução em `docs/10-plano-de-execucao.md`.

Com a fundação concluída (checkpoint 0.5A), tornou-se necessário um documento único e operacional que consolide a stack tecnológica autorizada, seu status e as tecnologias proibidas, para uso por humanos, Cursor e Codex.

Sem esse documento central, há risco de:

- introdução de bibliotecas por sugestão automática;
- divergência entre manifests e ADRs;
- adoção de alternativas já rejeitadas (Express, NestJS, npm/yarn/bun, Turborepo/Nx, Pages Router, etc.);
- implementação de dependências futuras sem registro.

## Decisão

A stack oficial do projeto passa a ser definida exclusivamente pelo documento:

`docs/11-stack-oficial.md`

Registrar que:

1. `docs/11-stack-oficial.md` é a referência normativa da stack tecnológica.
2. Nenhuma biblioteca relevante poderá ser adicionada ao projeto sem atualização desse documento.
3. Decisões arquiteturais novas continuam exigindo ADR (em `docs/08-decisoes-tecnicas.md` e/ou neste diretório `docs/adr/`), além da atualização da stack oficial.
4. Em conflito entre preferência pessoal, sugestão automática e `docs/11-stack-oficial.md`, prevalece a stack oficial.
5. Tecnologias listadas como Descontinuadas em `docs/11-stack-oficial.md` não deverão ser introduzidas sem nova ADR que substitua esta política.

## Consequências

### Positivas

- fonte única de verdade para tecnologias autorizadas;
- alinhamento explícito com ADR-001 a ADR-040;
- redução de dependências especulativas;
- critérios claros para adoção de novas bibliotecas;
- suporte direto ao ciclo do plano de execução (`docs/10`).

### Negativas / custos

- toda dependência relevante exige atualização documental antes da instalação;
- itens Em avaliação (auth, UI, gráficos, storage, modelo de IA, observabilidade SaaS) permanecem bloqueados até decisão formal.

### Neutras

- Redis, BullMQ, Worker e Scheduler permanecem aprovados nas ADRs e listados como Aprovado/Futuro na stack até a execução do Épico 5;
- OneSignal e PWA permanecem Futuro no plano, sem adoção imediata.

## Relação com outros documentos

- `docs/08-decisoes-tecnicas.md` — origem das ADRs;
- `docs/09-padroes-de-codigo.md` — como implementar sobre a stack;
- `docs/10-plano-de-execucao.md` — quando implementar cada parte;
- `docs/11-stack-oficial.md` — o quê está autorizado na stack.
