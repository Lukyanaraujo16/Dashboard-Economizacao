# ADR-048 — Arquitetura de Gestão de Usuários

## Título

Gestão de usuários em dois contextos: Administradores da Plataforma e Usuários da Empresa

## Status

ACEITA

## Data

2026-08-15

## Contexto

A Fase 1.3 encerrou branding. A Fase 1.4 introduz CRUD de usuários. Já existem `User`, `UserCredential`, `UserRole` e `UserStatus`, além da hierarquia congelada em ADR-047 / `docs/15`.

Sem arquitetura prévia, a 1.4 arriscaria misturar listagens de `ADMIN` e `USER`, expor `SUPER_ADMIN` a `ADMIN`, ou reinventar papéis/enums.

Análise completa: `docs/16-arquitetura-usuarios.md`.

## Decisão

1. **Uma tabela `User`**; dois **contextos de UX/API**: (A) Administradores — somente `ADMIN`; (B) Usuários da Empresa — somente `USER` por tenant.

2. **Não misturar** as listas A e B.

3. Herdar ADR-047: `ADMIN` não vê/gerencia `SUPER_ADMIN`; sem `OWNER`/`PRIMARY`; ≥ 1 `ADMIN` com `status = ACTIVE`; `SUPER_ADMIN` não conta.

4. **`UserStatus` existente** (`PENDING`/`ACTIVE`/`BLOCKED`/`DISABLED`); sem enum novo. Só `ACTIVE` autentica no fluxo normal; só `ADMIN`+`ACTIVE` conta como operacional ativo.

5. Senhas: **Argon2id**; reset por token de uso único com expiração (`docs/09.7`); invalidação de sessão após mudança de senha.

6. Autorização por **role** no MVP; sem RBAC granular nesta fase.

7. Execução em subfases: **1.4A** arquitetura → **1.4B** persistência → **1.4C** API → **1.4D** UI → **1.4E** fluxo completo.

## Alternativas consideradas

### A) Tabelas separadas Admin vs TenantUser (rejeitada)

Duplicaria autenticação/credenciais e divergiria do schema atual.

### B) Lista única de “todos os usuários” (rejeitada)

Mistura contextos e aumenta risco de vazar `SUPER_ADMIN` / cruzar tenants.

### C) Modelo adotado (aceito)

Uma entidade, dois contextos, papéis congelados.

## Consequências

### Positivas

- 1.4B–E implementam sem ambiguidade de produto.
- Alinha UI ao hub Empresas (Usuários) e à administração global (Administradores).

### Negativas / trade-offs

- `SUPER_ADMIN` continua fora da gestão comum (bootstrap técnico separado).
- Política fina de exclusão e canal de e-mail do reset ficam para subfases posteriores.

## Conformidade

Implementações 1.4B+ deverão:

- filtrar `SUPER_ADMIN` de toda superfície consumida por `ADMIN`;
- rejeitar criação de `SUPER_ADMIN` por `ADMIN`;
- preservar ≥ 1 `ADMIN` `ACTIVE` com checagem atômica;
- escopar `USER` estritamente por `tenantId`.

## Referências

- `docs/16-arquitetura-usuarios.md`
- `docs/15-arquitetura-papeis-e-usuarios.md`
- `docs/adr/ADR-047-role-hierarchy-platform-tenant.md`
- `docs/09.7-autenticacao.md`
- `docs/03-modelagem-banco.md` §3.2–3.4
