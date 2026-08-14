# Dashboard Economização

# 13 — Arquitetura de Empresas (Tenants) / Workspace

**Status:** Ativo  
**Projeto:** Dashboard Economização  
**Tipo:** Documento arquitetural de referência  
**Documento normativo:** `docs/13-arquitetura-empresas-workspace.md`  
**ADR vinculada:** `docs/adr/ADR-045-tenant-workspace-context.md`  
**Documentos obrigatórios de leitura conjunta:** `docs/01-prd.md` (§5.2 TENANT, §5.3 USER, §5.12 ADMIN), `docs/02-arquitetura.md`, `docs/03-modelagem-banco.md`, `docs/04-api-conta-azul.md`, `docs/06-roadmap.md`, `docs/09.7-autenticacao.md`, `docs/09.8-seguranca.md`, `docs/09.9-multiempresa.md`, `docs/10-plano-de-execucao.md`, `docs/12-design-system.md`

---

## 1. Objetivo

Este documento define a arquitetura da próxima fase do produto — **Empresas (Tenants)** — antes de qualquer implementação de CRUD, migration, API ou UI.

Ele consolida:

- a decisão **Tenant vs Workspace**;
- o estado atual do modelo e do código;
- o escopo mínimo recomendado para a Fase 1.2;
- princípios de isolamento multiempresa;
- relação com branding, integrações, dashboard e papéis;
- compatibilidade com evoluções futuras (dashboard personalizável, permissões internas).

**Fora de escopo deste documento:** implementação, migrations, endpoints, telas, alteração de autenticação existente.

---

## 2. Decisão arquitetural — Tenant vs Workspace

### 2.1 Alternativa A — Tenant como entidade oficial; Workspace como conceito de produto/UX

| Aspecto | Avaliação |
|---|---|
| Banco | `Tenant` já existe no Prisma; invariantes e repositório mínimos implementados |
| Autenticação | `AuthenticationContext.tenantId`, sessão Redis e `/auth/me` já modelam tenant |
| Relações | `User.tenantId` com invariante `USER` exige tenant; `ADMIN`/`SUPER_ADMIN` exigem `null` |
| Branding | Theme Engine já recebe `TenantBrandingInput`; camada documentada como **Tenant Branding** |
| Integrações | Modelagem prevê `integrations.tenant_id` |
| Dashboard | Componentes financial/dashboard são agnósticos; contexto futuro = tenant resolvido server-side |
| Permissões | Papéis globais (`USER`, `ADMIN`, `SUPER_ADMIN`) já codificados |
| Migração | Nenhuma — decisão preserva código e docs existentes |
| Risco futuro | Baixo — extensões adicionam tabelas filhas de `tenants`, não nova entidade raiz |
| Clareza de produto | **Empresa** na UX; **Tenant** no domínio técnico — padrão já usado em todo o PRD |

### 2.2 Alternativa B — Workspace como entidade de domínio própria

| Aspecto | Avaliação |
|---|---|
| Banco | Exigiria nova tabela ou renomeação de `tenants`; impacto em FKs, índices e migrations |
| Autenticação | Renomear/refatorar `tenantId` → `workspaceId` em sessão, contexto e DTOs |
| Relações | Duplicidade semântica com `Tenant` ou substituição com refactor em massa |
| Branding | Renomear `TenantBrandingInput`, mocks e documentação congelada (ADR-042/043) |
| Integrações | Renomear `tenant_id` em toda modelagem futura |
| Dashboard | Sem ganho funcional — contexto de empresa permanece o mesmo conceito |
| Permissões | Mesma matriz de papéis; apenas nomenclatura diferente |
| Migração | Alta — schema, código auth, testes, docs normativos |
| Risco futuro | Médio/alto — dois termos (`Tenant` legado vs `Workspace` novo) durante transição |
| Clareza de produto | **Workspace** não aparece como entidade em PRD, modelagem ou código; só como pendência em `docs/10` |

### 2.3 Decisão recomendada

**Adotar a Alternativa A.**

- **Tenant** permanece a **entidade de domínio e persistência oficial**.
- **Empresa** permanece o **termo de produto/UX** (sinônimo operacional).
- **Workspace** **não** é entidade de domínio. Uso permitido apenas como:
  - metáfora de UX (*“ambiente de trabalho da empresa”*);
  - nomenclatura de layout no frontend (ex.: área `.workspace` do shell — container visual, não entidade).

Decisão registrada formalmente em `docs/adr/ADR-045-tenant-workspace-context.md`.

---

## 3. Entidade Tenant — estado atual

### 3.1 Modelo implementado (`prisma/schema.prisma`)

| Campo | Tipo | Observação |
|---|---|---|
| `id` | UUID | PK |
| `name` | String | Identificação interna |
| `displayName` | String | Nome de exibição |
| `status` | `TenantStatus` | `ACTIVE` \| `DISABLED` |
| `createdAt` | DateTime | |
| `updatedAt` | DateTime | |
| `deactivatedAt` | DateTime? | Preenchido ao desativar |

**Relação implementada:** `Tenant.users[]` ↔ `User.tenantId?`

**Repositório atual:** `create`, `findById` — sem listagem, update ou desativação.

### 3.2 Invariantes de domínio (`user-invariants.ts`)

| Papel | `tenantId` | Regra |
|---|---|---|
| `USER` | **Obrigatório** | `assertUserTenantRoleConsistency` — `USER_REQUIRES_TENANT` |
| `ADMIN` | **Deve ser null** | `PLATFORM_ROLE_MUST_NOT_HAVE_TENANT` |
| `SUPER_ADMIN` | **Deve ser null** | idem |

### 3.3 Contexto autenticado (`authentication-context.ts`)

Sessão Redis e `AuthenticatedRequestContext` carregam:

- `userId`
- `tenantId` (nullable — null para ADMIN/SUPER_ADMIN)
- `role`

`requireAuthentication` revalida no PostgreSQL que sessão não diverge de `user.role` / `user.tenantId`.

### 3.4 Limitações para a Fase 1.2

| Limitação | Impacto |
|---|---|
| Sem CRUD admin de empresas | TENANT-001/003/004 não operacionais via API/UI |
| Sem `TenantContext` centralizado além de `request.auth` | Rotas futuras precisarão resolver tenant explicitamente |
| Sem bloqueio de USER em tenant `DISABLED` no login/guard | TENANT-003 parcial |
| Sem tabelas filhas (branding, integrations, settings) | Escopo correto das fases 1.3+ |
| `metadata` documentado, não implementado | Opcional — adiar até necessidade comprovada |
| ADMIN/SUPER_ADMIN sem tenant implícito | Correto — exige operação admin explícita ou modo suporte (1.5) |

---

## 4. Empresa como contexto — classificação de capacidades

| Capacidade | Classificação | Fase / observação |
|---|---|---|
| Identificação empresarial (`name`, `displayName`, `status`) | **Núcleo da Empresa** | 1.2 |
| Usuários vinculados à empresa | **Submódulo** (relação existente; gestão admin em 1.4) | 1.2 valida vínculo; 1.4 CRUD usuários |
| Branding (logo, cores Light/Dark) | **Submódulo** separado | 1.3 — tabela `tenant_branding` |
| Integrações externas | **Submódulo** | ÉPICO 2 — tabela `integrations` |
| Conta Azul (OAuth, tokens, sync) | **Futura integração** | ÉPICO 2 — nunca credenciais no `Tenant` |
| Dashboard (KPIs, gráficos, filtros) | **Submódulo** escopado ao tenant | ÉPICO 3 (dados) — consome contexto de tenant |
| Configurações operacionais | **Submódulo** | `tenant_settings` futuro |
| Consultor Financeiro IA | **Submódulo** | ÉPICO 4 — `ai_tenant_settings` |
| Notificações | **Submódulo** | ÉPICO 5 |
| Relatórios | **Submódulo** | pós-dados financeiros |
| Auditoria | **Responsabilidade transversal** | toda mutação relevante |
| Design System / Theme Default | **Plataforma global** | ADR-042/043 — não pertence ao Tenant |
| Login Experience | **Plataforma global** | ADR-044 — branding de plataforma no login |
| Superadmin / operações de plataforma | **Responsabilidade global** | perfis sem tenant próprio |

---

## 5. Escopo mínimo recomendado — Fase 1.2

Alinhado a `docs/06-roadmap.md` §6 (Fase 2 — Multiempresa) e `docs/10-plano-de-execucao.md` §1.2, **sem transformar 1.2 em mega-fase**.

### 5.1 Dentro do escopo mínimo (1.2)

1. **Decisão arquitetural** Tenant vs Workspace — este documento + ADR-045.
2. **Persistência:** manter `Tenant` como entidade raiz; estender repositório (list, update, activate/deactivate) conforme PRD.
3. **API administrativa mínima:** CRUD de empresas em rotas `/admin/*` (criar, listar, editar, ativar/desativar) — escopo ADMIN/SUPER_ADMIN.
4. **Resolução de contexto de tenant:** mecanismo central (`TenantContext` / extensão de `request.auth`) para rotas do painel cliente.
5. **Regra TENANT-003:** usuário `USER` de empresa `DISABLED` não obtém contexto utilizável.
6. **Testes de isolamento:** mínimo dois tenants; tenant A não acessa recursos de tenant B; parâmetro `tenantId` do cliente ignorado.
7. **Auditoria** em create/update/status de empresa (PRD LOG-004).

### 5.2 Fora do escopo mínimo (fases adjacentes)

| Item | Fase |
|---|---|
| Branding persistido, upload de logo | 1.3 |
| CRUD completo de usuários (admin UI) | 1.4 |
| Modo suporte | 1.5 |
| OAuth Conta Azul, sync | ÉPICO 2 |
| KPIs/gráficos com dados reais | ÉPICO 3 (incrementos pós-3.2) |
| Dashboard personalizável (widgets/KPIs configuráveis) | Roadmap futuro — ver §12 |
| Permission system granular | Roadmap §26 |
| Renomear Tenant → Workspace | **Rejeitado** (ADR-045) |

### 5.3 Divisão incremental sugerida (referência — não altera `docs/10` nesta entrega)

A numeração oficial em `docs/10` permanece **1.2 Empresas (Tenants)** sem subfases numeradas. Para planejamento interno:

| Entrega incremental | Conteúdo |
|---|---|
| **1.2A — Arquitetura** | Este documento + ADR-045 (análise, sem código) |
| **1.2 — Modelo e persistência** | Extensão de repositório; campos atuais; regras de status |
| **1.2 — API administrativa** | Endpoints `/admin/tenants` (ou `/admin/companies` na UX) |
| **1.2 — Resolução de contexto** | `TenantContext`, guard de tenant ativo para `USER` |
| **1.2 — UI admin mínima** | Listagem/cadastro/edição (pode ser último incremento da 1.2) |
| **1.2 — Testes de isolamento** | Cobertura TENANT-002 |

A ordem exata de implementação deverá respeitar dependências: persistência → API → contexto → testes → UI.

---

## 6. Campos de empresa — primeiro corte

### 6.1 Obrigatórios agora (já no schema / PRD TENANT-001)

| Campo | Finalidade |
|---|---|
| `id` | Identificador interno UUID |
| `name` | Identificação interna (slug-like, único operacional) |
| `displayName` | Nome de exibição na UI |
| `status` | `ACTIVE` \| `DISABLED` |
| `createdAt`, `updatedAt` | Auditoria temporal |
| `deactivatedAt` | Marca desativação (TENANT-003) |

### 6.2 Opcionais agora

| Campo | Decisão |
|---|---|
| `metadata` (JSON) | **Adiar** — documentado em `docs/03` como opcional; introduzir somente com caso de uso concreto |

### 6.3 Futuros (PRD explícito — não inventar)

| Campo | Fonte |
|---|---|
| Dados de contato | PRD TENANT-001 — *"quando definidos posteriormente"* |
| Documentos fiscais (CNPJ, IE, etc.) | **Não incluir** sem requisito documentado |

### 6.4 Derivados de integração (nunca no Tenant)

| Dado | Onde |
|---|---|
| Tokens OAuth Conta Azul | `integration_credentials` |
| `id_empresa` externo | `integration_external_accounts` |
| Status de sync | `integrations` + `sync_runs` |

---

## 7. Branding

### 7.1 Arquitetura congelada (ADR-042, `docs/12-design-system.md`)

```
Design System (estrutura, spacing, tipografia)
    +
Theme (Light | Dark | System)
    +
Tenant Branding (overrides validados por empresa)
        ↓
Resolved Theme → Componentes
```

### 7.2 Onde branding pertence

| Camada | Persistência | Fase |
|---|---|---|
| Platform Theme | `platform_branding` | 1.3 |
| Tenant Branding | `tenant_branding` (FK `tenant_id`) | 1.3 |
| Valores visuais | **Nunca** colunas soltas em `tenants` | — |

### 7.3 Regras

- Domínio de **empresa** (`tenants`) ≠ valores visuais (`tenant_branding`).
- Light/Dark: overrides por scheme em `tenant_branding` (campos `light` / `dark`), conforme Theme Engine existente.
- Logo/ícone: `logoUrl` no input de branding — upload e persistência na fase 1.3.
- Login: branding de **plataforma** (UX-001); tenant branding só após autenticação (UX-002).
- Fallback: tenant ausente → platform → tokens seguros do Design System (BRAND-003).

---

## 8. Integrações

### 8.1 Modelo conceitual

```
Tenant (1) ──< Integration (N) ──< IntegrationCredential
                      │
                      └──< IntegrationExternalAccount
```

### 8.2 Princípios

- **Uma autorização OAuth por tenant** (PRD CA-001, `docs/04-api-conta-azul.md`).
- Credenciais **nunca** em `tenants` nem expostas ao frontend.
- `integrations.tenant_id` + `provider` (ex.: `conta_azul`) identificam a conexão.
- Tokens rotacionáveis em `integration_credentials`; dashboard nunca chama Conta Azul diretamente.
- Abstração mínima: enum `provider` + tabelas genéricas — sem framework de plugins prematuro.

---

## 9. Dashboard e contexto de empresa

### 9.1 Estado atual (ÉPICO 3 — 3.1/3.2)

- `/` renderiza `DashboardPage` em **empty state** via componentes financial reutilizáveis.
- Sem seletor de empresa, sem dados financeiros, sem fetch.

### 9.2 Resolução futura de contexto

| Papel | Contexto de dashboard |
|---|---|
| `USER` | Tenant = `user.tenantId` (server-side); dashboard escopado automaticamente |
| `ADMIN` / `SUPER_ADMIN` | Sem tenant implícito; acesso ao dashboard **financeiro** de uma empresa somente via modo suporte (1.5) ou evolução explícita |
| Branding | `ThemeProvider` receberá `tenant_branding` resolvido após autenticação |

### 9.3 Evolução (sem implementar agora)

- Cabeçalho do painel cliente: `displayName`, logo, última sincronização.
- Filtros e KPIs sempre filtrados pelo tenant do contexto.
- Seletor de empresa: **não** no MVP para `USER` (vínculo 1:1); admin usa painel administrativo separado.

---

## 10. Papéis — ADMIN / SUPER_ADMIN / USER

| Pergunta | Resposta |
|---|---|
| Quem cria Empresa? | `ADMIN` e `SUPER_ADMIN` (PRD ADMIN-002) |
| Quem edita Empresa? | `ADMIN` e `SUPER_ADMIN` |
| Quem visualiza todas? | `ADMIN` / `SUPER_ADMIN` — listagem cadastral/operacional; **sem** dados financeiros agregados sem necessidade |
| Quem acessa somente uma? | `USER` — exclusivamente seu `tenantId` |
| ADMIN global é coerente? | Sim — `tenantId = null` é operação de **plataforma**, não acesso implícito a dados financeiros (`docs/09.9` §3.7) |
| USER continua 1:1 com tenant? | Sim, no MVP (USER-001, USER-002) |

**Distinção crítica (`docs/09.9` §3.7):**

- **Operação de plataforma:** cadastro, status, branding, integração — `tenantId` explícito em `/admin/*`.
- **Acesso a dados financeiros:** somente via painel do cliente com contexto de tenant ou modo suporte auditado.

---

## 11. Isolamento multiempresa — princípios obrigatórios

Para toda implementação futura da 1.2 em diante:

1. **`tenantId` nunca é confiável quando enviado pelo cliente** em rotas do painel do cliente.
2. **Contexto resolvido server-side** — derivado de `request.auth` + regras de papel.
3. **Consultas de negócio incluem `tenantId` do contexto** — PK isolada proibida.
4. **Nenhuma leitura cruza tenant** — divergência → 404 (não 403).
5. **Cache inclui `tenantId` na chave** — nunca compartilhar entre empresas.
6. **Branding nunca vaza** — resolved theme por tenant; descarte de estado ao trocar contexto.
7. **Integrações nunca vazam credenciais** — escopo por `integration.tenant_id`.
8. **Jobs revalidam tenant** no início da execução — payload não confiável.
9. **Mutations gravam `tenantId` do contexto** — nunca do body; `tenantId` imutável em registros existentes.
10. **Empresa inativa** → usuários `USER` sem contexto utilizável.

Referência normativa completa: `docs/09.9-multiempresa.md`.

---

## 12. Dashboard personalizável — roadmap futuro (não MVP)

Futuramente, uma empresa poderá configurar:

- quais KPIs aparecem;
- quais widgets aparecem;
- ordem dos widgets;
- layout salvo por tenant.

**Não implementar na 1.2.**

### 12.1 Compatibilidade arquitetural

A decisão **Tenant como entidade raiz** suporta personalização futura **sem refatoração grande**:

- Tabela futura `tenant_dashboard_layout` ou `tenant_settings` com FK `tenant_id`.
- Componentes financial existentes (`KpiCard`, `ChartCard`, `FinancialGrid`) já são props-driven — composição controlada por configuração persistida por tenant.
- Workspace como entidade separada **não agregaria valor** — personalização é atributo do tenant, não de um container paralelo.

---

## 13. Referências de código auditado

| Área | Caminho |
|---|---|
| Schema | `prisma/schema.prisma` |
| Domínio auth | `backend/src/modules/auth/domain/*` |
| Repositórios | `backend/src/modules/auth/repositories/*` |
| HTTP / guards | `backend/src/modules/auth/http/*` |
| Frontend auth | `frontend/src/auth/*` |
| Theme / branding mock | `frontend/src/theme/*` |
| Dashboard (empty) | `frontend/src/components/dashboard/*` |
| Financial library | `frontend/src/components/financial/*` |

---

## 14. Próxima fase executável

Conforme `docs/10-plano-de-execucao.md`:

**1.2 — Empresas (Tenants)** — implementação incremental iniciando por persistência, API admin e resolução de contexto, conforme §5 deste documento.

---

## 15. Histórico

| Versão | Data | Descrição |
|---|---|---|
| 1.0 | 2026-08-14 | Documento inicial — Fase 1.2A (arquitetura, sem implementação) |
