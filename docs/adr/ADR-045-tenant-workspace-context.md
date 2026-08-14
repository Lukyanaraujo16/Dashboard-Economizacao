# ADR-045 — Tenant como Entidade de Contexto; Workspace como Termo de UX

## Título

Tenant permanece entidade oficial de domínio; Workspace não é entidade

## Status

ACEITA

## Data

2026-08-14

## Contexto

A Fase 1.1 (Autenticação) foi encerrada. A próxima fase executável é **1.2 — Empresas (Tenants)** (`docs/10-plano-de-execucao.md`).

O projeto já possui:

- model `Tenant` no Prisma com relação `User.tenantId`;
- invariantes de domínio (`USER` exige tenant; `ADMIN`/`SUPER_ADMIN` proíbem tenant);
- sessão Redis e `AuthenticatedRequestContext` com `tenantId`;
- documentação normativa extensa usando **Tenant** como fronteira de isolamento (`docs/09.9-multiempresa.md`, `docs/03-modelagem-banco.md`);
- Theme Engine com **Tenant Branding** (`docs/12-design-system.md`, ADR-042);
- termo **Empresa** como sinônimo de produto no PRD (§5.2 TENANT — Empresas).

`docs/10-plano-de-execucao.md` registrou pendência:

> *"Decisão arquitetural sobre nomenclatura Workspace vs Tenant será analisada na 1.2."*

Surge a dúvida se **Workspace** deveria substituir ou envolver **Tenant** como entidade de domínio.

Análise detalhada em `docs/13-arquitetura-empresas-workspace.md`.

## Decisão

1. **Tenant** permanece a **única entidade de domínio e persistência** para representar uma empresa cliente.
2. **Empresa** permanece o **termo de produto/UX** — sinônimo operacional de Tenant, sem segunda entidade.
3. **Workspace** **não** é entidade de domínio, tabela ou identificador técnico.
4. Uso permitido de "workspace":
   - linguagem de produto (*ambiente de trabalho da empresa*);
   - nomenclatura de layout UI (ex.: container `.workspace` no shell autenticado).
5. **Não** renomear `Tenant` → `Workspace` em schema, código, sessão, APIs ou documentação normativa existente.
6. Extensões futuras (branding, integrações, dashboard layout, IA) vinculam-se a `tenant_id`, não a uma entidade Workspace.

## Alternativas consideradas

### A) Tenant oficial; Workspace = UX (adotada)

Preserva código, docs, ADRs congeladas e modelagem. Zero custo de migração.

### B) Workspace como entidade própria (rejeitada)

Exigiria refactor de schema, autenticação, Theme Engine, testes e documentação — sem ganho funcional comprovado. Introduziria ambiguidade entre Tenant legado e Workspace novo durante transição.

## Consequências

### Positivas

- Continuidade imediata com Fase 1.2 sem refactor prematuro.
- Alinhamento com PRD, modelagem, `docs/09.9` e código auth existente.
- Branding e integrações futuras seguem modelo `tenant_id` já documentado.
- Dashboard personalizável futuro pode usar configuração escopada por tenant.

### Negativas / trade-offs

- Equipe de produto deverá internalizar: **Empresa** (UX) = **Tenant** (domínio).
- Termo "Workspace" não estará disponível como nome de entidade se surgir requisito de multi-workspace por empresa — cenário **não documentado** no PRD atual; exigiria nova ADR.

## Conformidade

Implementações da Fase 1.2 e posteriores deverão:

- usar `Tenant` / `tenantId` / `tenant_id` em código e banco;
- expor "Empresa" na UI administrativa quando aplicável;
- não introduzir tabela, DTO ou rota com identificador `workspace` como entidade de negócio.

## Referências

- `docs/13-arquitetura-empresas-workspace.md`
- `docs/01-prd.md` §5.2 TENANT
- `docs/03-modelagem-banco.md` §3.1
- `docs/09.9-multiempresa.md`
- `docs/10-plano-de-execucao.md` §1.2
- ADR-042, ADR-043, ADR-044
