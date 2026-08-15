# ADR-047 — Hierarquia de Papéis: Plataforma e Tenant

## Título

SUPER_ADMIN (global técnico), ADMIN (global operacional), USER (tenant-scoped)

## Status

ACEITA

## Data

2026-08-15

## Contexto

Antes da Fase 1.4 — Usuários, a plataforma já possui três papéis no enum `UserRole` (`USER`, `ADMIN`, `SUPER_ADMIN`), invariantes de `tenantId` e guards de plataforma. Faltava congelar a interpretação de produto:

- Felipe e sócios são `ADMIN` com o **mesmo** nível;
- `SUPER_ADMIN` é autoridade técnica, permanece no banco e na auditoria, mas **não** entra na gestão administrativa comum acessível a `ADMIN`;
- `ADMIN` não pertence a tenant.

Sem essa decisão, a 1.4 arriscaria criar papéis especiais, listar superadmins para admins operacionais ou tratar admin como usuário de empresa.

Análise completa: `docs/15-arquitetura-papeis-e-usuarios.md`.

## Decisão

1. **`SUPER_ADMIN`** = escopo global **técnico/supervisor**; `tenantId = null`; autenticação normal; auditável; **não** gerenciável por `ADMIN` na UI/API administrativa comum.

2. **`ADMIN`** = escopo global **operacional** da Economização; `tenantId = null`; todos os `ADMIN` são iguais entre si (Felipe incluído); podem gerenciar outros `ADMIN` e usuários de empresas na 1.4.

3. **`USER`** = escopo **tenant**; `tenantId` obrigatório; sem administração global.

4. **`ADMIN` não gerencia `SUPER_ADMIN`.** Listagem/consulta/edição/bloqueio/exclusão e criação de `SUPER_ADMIN` por ator `ADMIN` são proibidas no backend.

5. **Não** criar roles `OWNER` / `PRIMARY_ADMIN` / equivalentes nem lógica por e-mail de fundador.

6. Role enviada pelo cliente **nunca** autoriza sozinha — validação server-side obrigatória.

7. A plataforma deve preservar ao menos **um `ADMIN` operacional ativo**. `SUPER_ADMIN` **não** satisfaz essa invariante (não conta na contagem; ver `docs/15` §5).

## Alternativas consideradas

### A) Hierarquia com ADMIN de tenant (rejeitada)

Misturaria administrador da plataforma com usuário de empresa e quebraria `docs/09.9` / invariantes atuais.

### B) Felipe como SUPER_ADMIN permanente (rejeitada)

Confunde operação do negócio com acesso técnico; impediria gestão paritária de sócios como `ADMIN`.

### C) Modelo adotado (aceito)

Três papéis existentes; distinção operacional vs técnica; ocultação administrativa do SUPER_ADMIN para ADMIN.

## Consequências

### Positivas

- 1.4 pode desenhar UX “Administradores” × “Usuários da Empresa” sem ambiguidade.
- Segurança de role fica explícita antes do CRUD.
- Alinha código atual (invariantes, `requirePlatformRole`, branding por role) ao produto.

### Negativas / trade-offs

- `ADMIN` e `SUPER_ADMIN` continuam com UX cotidiana similar até haver telas/fluxos técnicos específicos.
- Bootstrap inicial de `SUPER_ADMIN` permanece procedimento técnico (seed/ops), fora da gestão comum.

## Conformidade

Implementações da Fase 1.4 e posteriores deverão:

- preservar `tenantId = null` para `ADMIN` e `SUPER_ADMIN`;
- filtrar `SUPER_ADMIN` das listagens administrativas comuns de `ADMIN`;
- rejeitar no backend tentativas de `ADMIN` criar/alterar para `SUPER_ADMIN`;
- rejeitar mutações que deixariam a plataforma com zero `ADMIN` operacional ativo (`SUPER_ADMIN` não conta);
- não introduzir privilégio especial por identidade de fundador.

## Referências

- `docs/15-arquitetura-papeis-e-usuarios.md`
- `docs/09.7-autenticacao.md` §3.3
- `docs/09.9-multiempresa.md`
- `docs/13-arquitetura-empresas-workspace.md` §10
- `docs/01-prd.md` §5.3, §5.12, §5.13
- ADR-045
