# Dashboard Economização

Plataforma SaaS multiempresa de inteligência financeira integrada inicialmente ao Conta Azul.

## Status do projeto

Fase 0 — Fundação em andamento.

## Arquitetura prevista

- Next.js + TypeScript;
- Fastify + TypeScript;
- PostgreSQL;
- Prisma;
- Redis;
- BullMQ;
- Worker independente;
- Scheduler independente;
- Nginx;
- Docker;
- Docker Compose;
- VPS Linux.

## Estrutura do repositório

- `frontend/`: aplicação de interface.
- `backend/`: API e regras de backend.
- `worker/`: processamento assíncrono independente.
- `packages/`: pacotes compartilhados de código, tipos, configuração e UI.
- `infrastructure/`: recursos futuros de Docker, Nginx, scripts e composição de serviços.
- `prisma/`: recursos futuros do Prisma e do banco de dados.
- `docs/`: documentação oficial do projeto.
- `.github/`: configurações futuras relacionadas ao GitHub.

## Documentação

A documentação oficial está disponível em [`docs/`](docs/).

## Desenvolvimento local

O projeto utiliza Node.js LTS como runtime esperado e pnpm como gerenciador oficial de pacotes,
em um workspace simples com pnpm.

As instruções de execução dos aplicativos serão adicionadas nas próximas subfases.

## Segurança

Segredos reais nunca deverão ser versionados.

## Estado atual

A fundação do workspace está configurada e o frontend Next.js foi inicializado. Ainda não existe
funcionalidade de produto; o desenvolvimento da fundação está em andamento. Backend e worker ainda
não foram inicializados.
