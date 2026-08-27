# Dashboard Economização

# Plano Oficial de Execução

Status do Projeto

Fundação:
Concluída

Versão atual:
2.4 — Sincronização automática incremental (homologada)

Último checkpoint:

2.4 — Sincronização automática incremental (homologada com planner SCHEDULED real)

Último commit:

feat(sync): adiciona sincronizacao automatica incremental conta azul

Próxima fase executável:

Fase 13 — Consultor Financeiro Reativo (Fase 12 recorte V1 entregue)

Estado atual

✔ Documentação concluída

✔ Fundação concluída

✔ Frontend inicializado

✔ Backend inicializado

✔ Prisma configurado

✔ PostgreSQL Docker

✔ Redis Docker

✔ Persistência de sessão com Redis

✔ Modelo persistente de autenticação

✔ Login administrativo

✔ Middleware e contexto autenticado

✔ Fundação visual e sistema de temas

✔ Componentes Base, UI Polish e Visual Freeze Candidate

✔ Theme Engine e Branding Runtime mock

✔ Rota /login funcional com sessão baseada em cookie HttpOnly

✔ AuthProvider mínimo, /me e logout funcionais

✔ Proteção de rotas e shell autenticado

✔ Shell autenticado com estrutura definitiva do Dashboard (empty state)

✔ Biblioteca de componentes financeiros reutilizáveis (frontend)

✔ Infraestrutura de autenticação (1.1) — subfases F–G concluídas; plano sincronizado (1.1H)

✔ Fase 1.1 — Infraestrutura de Autenticação encerrada (1.1J)

✔ 1.2A — Arquitetura de Empresas/Tenants concluída (ADR-045)

✔ 1.2B — Persistência e Domínio de Empresas concluída

✔ 1.2C — API Administrativa de Empresas concluída

✔ 1.2D — UI Administrativa de Empresas concluída

✔ 1.2D.1 — Polish Funcional de Empresas concluída

✔ 1.3 — Branding por empresa concluída (1.3A–1.3F)

✔ 1.4A — Arquitetura de Usuários concluída (docs/16, ADR-048)

✔ 1.4B — Persistência e Domínio de Usuários concluída

✔ 1.4C — API Administrativa de Usuários concluída

✔ 1.4D — UI Administrativa de Usuários concluída

✔ 1.4D.1 — Polish UX da Administração de Usuários concluída

✔ 1.4E — Fluxo Completo de Usuários concluída (épico 1.4 Usuários encerrado)

✔ 1.5A — Arquitetura de Branding da Plataforma concluída (docs/17, ADR-049)

✔ 1.5B — Persistência e Domínio de Branding da Plataforma concluída

✔ 1.5C — API Administrativa de Branding da Plataforma concluída

✔ 1.5D — UI Administrativa de Branding da Plataforma concluída

✔ 1.5E — Runtime de Branding da Plataforma concluída

✔ UX.P1 — Modernização da Iconografia concluída

✔ UX.P2 — Refinamento Visual do Shell concluída

✔ UX.P3 — System Bar concluída

✔ UX.P4 — Design Polish concluída

✔ UI.FREEZE — Auditoria Final de Interface concluída

✔ Design System / UI base: **congelado**

✔ 1.6 — Modo Suporte concluída (ADMIN + SUPER_ADMIN, overlay de contexto, `support_sessions`)

✔ F11 — Filtros da Home (F11-A/B) concluída no recorte mensal; F11-C = Relatórios

✔ F12-A — Contrato de Relatórios congelado (24/08/2026)
✔ F12-B — Relatório de Receita IMPLEMENTADA / HOMOLOGADA TECNICAMENTE (24/08/2026)
✔ F12-C — Exportação PDF/XLSX da Receita IMPLEMENTADA / HOMOLOGADA TECNICAMENTE (25/08/2026)
✔ F12-D — Relatório de Despesas IMPLEMENTADA / HOMOLOGADA TECNICAMENTE (25/08/2026)

✔ PRE-IA-4D — PDF profissional de Receita e Despesas IMPLEMENTADA (25/08/2026)
     Camada visual compartilhada. Sem alteração de DTO, filtros, XLSX ou motor.

✔ PRE-IA-1 — Admin shell (landing `/empresas` + sidebar contextual) HOMOLOGADA HUMANAMENTE (25/08/2026)

✔ PRE-IA-2 — Saúde operacional básica na lista de empresas IMPLEMENTADA (25/08/2026)

✔ 2.1 — OAuth Conta Azul concluída (OAuth real homologado; sem consumo financeiro)

✔ 2.2 — Gestão das conexões concluída (identidade/health homologados; sem sync financeira)

✔ 2.3 — Primeira sincronização manual concluída (GET-only homologada; massa DEV preservada)

✔ 2.4 — Sincronização automática incremental concluída (planner SCHEDULED homologado)

✔ Autenticação, sessão, shell autenticado e logout operacionais

✔ Design System Freeze v1 (ADR-043) e Login Experience Freeze v1 (ADR-044)

✔ Isolamento DEV x TEST concluído

✔ Health Checks

✔ Testes

✔ Build

✔ Lint

✔ Typecheck

===========================================================

# REGRAS GERAIS
===========================================================

Toda implementação deverá seguir obrigatoriamente:

docs/00-visao-do-produto.md

docs/01-prd.md

docs/02-arquitetura.md

docs/03-modelagem-banco.md

docs/04-api-conta-azul.md

docs/05-ui-ux.md

docs/06-roadmap.md

docs/07-prompts-cursor.md

docs/08-decisoes-tecnicas.md

docs/09-padroes-de-codigo.md

===========================================================

# CICLO OFICIAL
===========================================================

Toda fase seguirá obrigatoriamente:

Planejamento

↓

Implementação

↓

Auditoria

↓

Review Humana

↓

Commit

↓

Próxima fase

===========================================================

# ÉPICO 1
===========================================================

Administração

Status:

Concluída

Objetivo:

Construir toda infraestrutura administrativa do sistema.

Fases

1.1 Infraestrutura de Autenticação

Status:
Concluída

Fase 1.1 encerrada em 1.1J. Autenticação, sessão server-side (Redis + cookie HttpOnly), AuthProvider,
/me, logout, proteção de rotas e Shell autenticado operacionais. Design System e Login Experience
congelados (ADR-043, ADR-044). Isolamento DEV x TEST validado. Dashboard Foundation (ÉPICO 3) existe
em paralelo, fora do escopo funcional desta fase.

Subfases:

1.1A — Fundação da Autenticação
Status: Concluída

1.1B — Persistência de Sessão com Redis
Status: Concluída

1.1C — Modelo de Autenticação
Status: Concluída

1.1D — Login Administrativo
Status: Concluída

1.1E — Middleware de Autenticação
Status: Concluída

1.1F-A — Fundação Visual
Status: Concluída

1.1F-B — Componentes Base
Status: Concluída

Design System Freeze v1 conforme ADR-043.

Rodadas concluídas:

1.1F-B.1 — UI Polish

1.1F-B.2 — Visual Freeze Candidate

1.1F-C — Theme Engine / Branding Runtime
Status: Concluída

Theme Engine e Branding Runtime mock conforme ADR-042.

1.1F-D — Login Experience
Status: Concluída

Ciclo visual D.1–D.6 concluído e congelado pela ADR-044 (Login Experience Freeze v1).

1.1F-E — Integração Funcional da Autenticação
Status: Concluída

1.1F-E.1 — Auditoria da autenticação existente
Status: Concluída

1.1F-E.2 — Login Funcional no Frontend
Status: Concluída

A rota /login está funcional com sessão baseada em cookie HttpOnly.

1.1F-E.3 — Sessão do Usuário: /me e Logout
Status: Concluída

AuthProvider mínimo implementado, com GET /auth/me e POST /auth/logout funcionais. Login redireciona
para / (Dashboard) após autenticação; logout redireciona para /login. Entrega registrada no commit
86830d2.

1.1F-E.4 — Proteção de Rotas e Shell Autenticado
Status: Concluída

Route group autenticado e RequireSession implementados. Shell autenticado com botão Sair (logout),
controle Light/Dark/System e home autenticada em `/` via DashboardPage (empty state — ÉPICO 3, 3.1).
Entrega registrada no commit e238c3f.

1.1F-E.5 — Hardening da Experiência Autenticada
Status: Concluída

1.1F-E.5.1 — Correção de Regressão Visual / Shell Polish
Status: Concluída

Sidebar desktop consolidada em 220px; header reduzido; gutter/conteúdo refinado;
Theme Control compacto; Light/Dark/System funcionais. Shell aprovado visualmente em
desktop. Mobile atual funcional; futura experiência mobile app-like será tratada em
fase própria.

1.1G — Logout
Status: Concluída

Escopo entregue em 1.1F-E.3 (endpoint, Redis, cookie, idempotência, preservação de outras sessões)
e integrado ao Shell em 1.1F-E.4. Linha mantida por rastreabilidade com o plano original (1.1F Logout).

1.1H — Saneamento do Plano de Execução
Status: Concluída

Sincronização do docs/10 com implementações reais (Login Experience, login funcional, AuthProvider,
/me, logout, shell, Dashboard Foundation 3.1–3.2, biblioteca Financial). Antes rotulada como
"Testes finais"; cobertura de auth/logout/shell permanece nas fases de implementação (1.1F-E.3–E.5.1).

1.1I — Auditoria
Status: Concluída

Auditoria de continuidade realizada antes do saneamento: 1.1G validada como completa no código;
sequência do plano e próxima fase executável identificadas.

1.1J — Checkpoint final da fase
Status: Concluída

Encerramento formal da Fase 1.1 — Infraestrutura de Autenticação. Auditoria final contra código,
testes (86 frontend / 55 backend), documentação (docs/10, docs/11, docs/12) e histórico Git.
Gates format/lint/typecheck/test/build verdes. Nenhuma entrega da 1.1 pendente na working tree.

----------------------------------------

1.2 Empresas (Tenants)

Status:
Em andamento

Decisão arquitetural (ADR-045): Tenant = entidade técnica/domínio/persistência; Empresa = termo de
produto/UX; Workspace não é entidade.

Subfases:

1.2A — Arquitetura de Empresas/Tenants
Status: Concluída

Documentação em docs/13-arquitetura-empresas-workspace.md e ADR-045. Tenant permanece entidade
oficial; Empresa é sinônimo de produto; Workspace restrito a metáfora de UX/layout.

1.2B — Persistência e Domínio de Empresas
Status: Concluída

TenantRepository expandido (create, findById, findByName, existsByName, list, update, disable,
reactivate). name único e normalizado slug-like; displayName normalizado para exibição. Regras
ACTIVE/DISABLED com deactivatedAt coerente. TENANT-003 implementado no login e requireAuthentication.
Migration 20260814100000_tenant_domain_foundation aplicada em DEV/TEST. metadata adiado.

1.2C — API Administrativa de Empresas
Status: Concluída

CRUD administrativo sem DELETE físico (GET/POST/PATCH list/detail/create/update; disable/reactivate).
Guard requirePlatformRole para ADMIN/SUPER_ADMIN; USER recebe 403. DTO público (id, name, displayName,
status, createdAt, updatedAt, deactivatedAt). Listagem com paginação (limit/offset/total/hasMore) e
filtro por status. TENANT-003 integrado via testes (disable/reactivate via API). Erros
400/401/403/404/409/422/500 conforme docs/09.6 e docs/09.10. Sem frontend.

1.2D — UI Administrativa de Empresas
Status: Concluída

Rotas /empresas, /empresas/nova e /empresas/[companyId]/editar. Nav Empresas para ADMIN/SUPER_ADMIN.
Listagem com filtro por status, paginação, criação, edição, disable/reactivate, loading/empty/error.
Serviço HTTP same-origin com credentials. RequirePlatformRole no frontend. Responsividade desktop/mobile.
Light/Dark via tokens existentes.

1.2D.1 — Polish Funcional de Empresas
Status: Concluída

Identificador automático assistido na criação (override manual preservado; edição não renormaliza).
Ações iconográficas na listagem desktop (SVG inline + IconButton). Exclusão permanente com confirmação
forte (digitação do identificador). DELETE /admin/tenants/:tenantId — 204 quando elegível; Tenant com
usuários vinculados → 409 CONFLICT; sem cascade genérico nem migration.

Política atual de exclusão permanente: permitida apenas quando não existem dependências impeditivas.
A política de remoção integral será estendida por domínio conforme novos módulos tenant-scoped forem
implementados.

----------------------------------------

1.3 Branding

Status:
Concluída

Subfases:

1.3A — Arquitetura de Branding por Empresa
Status: Concluída

Documentação em docs/14-arquitetura-branding-tenant.md e ADR-046. TenantBranding separado de Tenant;
overrides limitados; login usa plataforma; USER pós-login usará branding do tenant; assets/storage
adiados.

1.3B — Persistência e Domínio de Branding
Status: Concluída

TenantBranding 1:1 separado de Tenant (lightColors/darkColors JSONB). Allowlist
primary/onPrimary/secondary/accent. Sem defaults persistidos; sem assets/storage. Cascade
exclusivamente Tenant → TenantBranding. Repository find/upsert/delete. Migration
20260814092616_tenant_branding aplicada em DEV/TEST.

1.3C — API Administrativa de Branding
Status: Concluída

GET/PATCH/DELETE `/admin/tenants/:tenantId/branding`. Guard ADMIN/SUPER_ADMIN. PATCH com merge
parcial da allowlist (primary/onPrimary/secondary/accent). GET sem branding retorna light/dark null
sem materializar defaults. DELETE reset idempotente (204); Tenant permanece. Sem upload/storage;
sem frontend.

1.3D — Storage e Upload de Logo
Status: Concluída

Abstração FileStorage + LocalFileStorage MVP. Tabela StoredFile (files) com ownership por tenant.
logoFileId em TenantBranding. Upload multipart PNG/JPEG/WebP (2 MB); SVG fora do MVP; MIME real.
Serving público opaco em GET /files/:fileId. Substitution e cleanup best-effort (DB/storage).
Storage TEST isolado (_test). Validação de dimensões adiada.

1.3E — UI Administrativa de Aparência
Status: Concluída

Tela `/empresas/[companyId]/aparencia` com hub Geral/Aparência. Upload/substituição/remoção de
logo (PNG/JPEG/WebP, 2 MB). Personalização de cores Light/Dark (primary/onPrimary/secondary/accent)
com preview escopado independente do tema global. Validação de contraste WCAG AA (primary↔onPrimary).
Polish visual do canvas autenticado (gutters/max-width) e acabamento da composição Aparência/Empresas.
`allowedDevOrigins` em `next.config.ts` para desenvolvimento via LAN. Runtime pós-login entregue na 1.3F.

1.3F — Runtime de Branding Pós-login
Status: Concluída

`GET /branding/current` resolve branding server-side (role + `tenantId` da sessão; sem `tenantId` no
client). USER → tenant ACTIVE (`Tenant.displayName`, logo `/files/:fileId`, overrides light/dark);
ADMIN/SUPER_ADMIN → plataforma (Economização / Theme Default). Frontend: `getCurrentBranding()`,
`RuntimeThemeProvider` alimenta `ThemeProvider`/`resolveTheme()`; shell com nome/logo; fallback
seguro sem logout; estado só em memória (limpa no logout). Login permanece plataforma (ADR-044).
Sem schema/migration; sem persistência client-side.

----------------------------------------

1.4 Usuários

Status:
Concluída

Arquitetura de papéis (pré-requisito): `docs/15-arquitetura-papeis-e-usuarios.md` e ADR-047.

Subfases:

1.4A — Arquitetura de Usuários
Status: Concluída

Documentação em `docs/16-arquitetura-usuarios.md` e ADR-048. Dois contextos: Administradores
da Plataforma (`ADMIN`) e Usuários da Empresa (`USER` por tenant). Visibilidade de SUPER_ADMIN,
ciclo de vida (`UserStatus` existente), último ADMIN ACTIVE, senhas Argon2id, reset por token,
auditoria e subfases 1.4B–1.4E. Sem código nesta subfase.

1.4B — Persistência de Usuários
Status: Concluída

Evolução do `UserRepository` e domínio auth: list/update/block/unblock/disable/enable,
`existsByEmail`/`existsByTenantId`/`countActiveAdmins`, normalização de nome/e-mail, invariantes
de status↔`deactivatedAt` e preparação da contagem de ADMIN ACTIVE (último ADMIN na 1.4C).
Sem migration (schema já suficiente). Sem API/UI/reset. Login/sessão intactos.

1.4C — API de Usuários
Status: Concluída

Duas famílias: `/admin/administrators` (somente `ADMIN`) e `/admin/tenants/:tenantId/users`
(somente `USER` do tenant). SUPER_ADMIN oculto na superfície de administrators (404 fora do
escopo). Último ADMIN ACTIVE protegido com `SELECT … FOR UPDATE`. Create com senha inicial
Argon2id + status ACTIVE. Sem DELETE, sem reset por token, sem UI. Tenant DISABLED permanece
administrável cadastralmente (login segue TENANT-003).

1.4D — UI de Usuários
Status: Concluída

UI administrativa em dois contextos: `/administradores` (plataforma) e
`/empresas/[companyId]/usuarios` (aba do hub da empresa). Sidebar com Administradores
(somente ADMIN/SUPER_ADMIN). Sem DELETE, sem reset de senha. Backend 1.4C como autoridade.

1.4D.1 — Polish UX da Administração de Usuários
Status: Concluída

Alinhamento visual com Empresas: formCard, toolbar/filtros/empty states, microcopy de
cadastro, reserva de layout para futuro resumo. Sem novas funcionalidades; backend intacto.

1.4E — Fluxo Completo de Usuários
Status: Concluída

Ciclo de vida completo: listar/criar/editar/bloquear/desbloquear/desativar/ativar e
**redefinição administrativa de senha** (ADMIN e USER). Primeiro acesso permanece senha
definida pelo administrador na criação (sem convite/e-mail/magic link). Reset: confirmação
no body, Argon2id via hasher oficial, resposta sem senha; sessões Redis do usuário invalidadas
(docs/16 §10). Independente de ACTIVE/BLOCKED/DISABLED. Sem schema/migration nova.
Épico 1.4 encerrado; próxima fase executável: **1.5 Branding da Plataforma**.

----------------------------------------

1.5 Branding da Plataforma

Status:
Em andamento

Complementa o branding por empresa (1.3): persistência e gestão da identidade visual global
Economização (login / fallback / Theme Default). Platform Branding ≠ Tenant Branding.
Histórico: na 1.3, `platform_branding` ficou fora do escopo (login ADR-044 + Theme Default).

Subfases:

1.5A — Arquitetura
Status: Concluída

Documentação em `docs/17-arquitetura-branding-plataforma.md` e ADR-049. Hierarquia
Platform → Tenant → Theme Default; login só plataforma; ADMIN/SUPER_ADMIN → plataforma;
USER → tenant com fallback plataforma; persistência futura em tabela própria; reuso de
FileStorage; API `/admin/platform/branding`; UI Configurações → Branding da Plataforma.
Sem código, schema ou migration nesta subfase.

1.5B — Persistência
Status: Concluída

Tabela `platform_branding` (singleton via `singleton_key`), extensão de `files`
(`tenant_id` nullable + `PLATFORM_LOGO` / `PLATFORM_FAVICON` + CHECK de ownership),
domínio/repository (`get` / `upsert` / `reset` / attach de referências). Sem API, UI,
runtime, upload ou alteração do Theme Engine / Login. Migrations aplicadas em DEV/TEST.
Sem seed de defaults.

1.5C — API
Status: Concluída

API administrativa global `/admin/platform/branding` (GET/PATCH/DELETE) e
logo/favicon (POST/DELETE). ADMIN/SUPER_ADMIN; USER 403. DTO público sem internals.
Upload reutiliza FileStorage + MIME PNG/JPEG/WebP (favicon sem ICO; máx. 512 KB).
Storage keys `platform/branding/{logo|favicon}/…`. Reset lifecycle-safe. Sem UI/runtime.

1.5D — UI Administrativa
Status: Concluída

Tela `/configuracoes/aparencia` (Aparência da Plataforma) para ADMIN/SUPER_ADMIN:
nome, logo, favicon, cores claro/escuro, preview (incl. login ilustrativo), contraste WCAG,
reset global com confirmação. Sem runtime/login real. Sem alteração de Tenant Branding.

1.5E — Runtime
Status: Concluída

Runtime de Platform Branding: `GET /branding/platform` no login (público),
`RuntimePlatformBrandingProvider` + evolução do `RuntimeThemeProvider`
(ADMIN → admin API; USER → `/branding/current`), título/favicon dinâmicos,
refresh após save na UI de aparência. Sem schema/migration.

----------------------------------------

Checkpoint visual (pós-1.5E)

Status: Concluído — Design System / UI base congelado

Fases:

- UX.P1 — Modernização da Iconografia (Lucide) — concluída
- UX.P2 — Refinamento Visual do Shell — concluída
- UX.P3 — System Bar — concluída
- UX.P4 — Design Polish — concluída
- UI.FREEZE — Auditoria Final de Interface — concluída

Escopo: refinamentos de consistência (tokens, tipografia, botões, tabelas, cards,
empty states, sidebar, system bar, login, light/dark, focus/hover, responsividade).
Sem novas telas de produto, sem mudança de layout estrutural, sem alteração de
regras de negócio / schema / permissões nas fases UX.

----------------------------------------

1.6 Modo Suporte

Status:
Concluída

Anteriormente numerado como 1.5 no plano. Renumerado para 1.6 após a inclusão de
1.5 — Branding da Plataforma. Conteúdo de produto inalterado: modo suporte auditado
(PRD SUPPORT / `docs/09.9`).

SUPER_ADMIN assume temporariamente o contexto visual/operacional de um tenant
ACTIVE, sem impersonar usuário e sem alterar a identidade da sessão
(`role` permanece SUPER_ADMIN; `tenantId` de identidade permanece `null`).
O modo suporte é um overlay de contexto, não um login paralelo.

`support_sessions` representa o lifecycle privilegiado auditável
(operador, tenant, início, fim, IP, User-Agent, `redis_session_id`),
não um audit log genérico. Índice único parcial garante no máximo uma
sessão aberta por cookie Redis.

Contrato:
- `POST /auth/support/enter` e `POST /auth/support/exit` — ADMIN e SUPER_ADMIN
- `GET /auth/me` sempre inclui `support`
- `GET /branding/current` resolve branding do tenant em suporte
- `/admin/*` bloqueado enquanto `support.active`
- USER recebe 403 no enter; sem sessão recebe 401
- SUPER_ADMIN permanece o operador técnico de nível máximo; ADMIN é o administrador operacional
- banner persistente com nome da empresa e saída sem F5
- sidebar: Dashboard/Relatórios só no contexto de tenant (`canUseTenantSurfaces`); itens de plataforma ocultos durante suporte
- landing de plataforma (sem Support Mode): `/empresas`; enter Support Mode → `/`; exit → `/empresas`
- `requireAuthentication` reconcilia Redis ↔ registro aberto no PostgreSQL
- tenant DISABLED/inexistente invalida o suporte na próxima request
- login novo sempre começa na plataforma e encerra sessões abertas do operador
- logout fecha a `support_session` ativa

Multi-aba: session-scoped. Exit em uma aba encerra o suporte server-side
para todas as abas da mesma sessão. Outra aba pode ficar visualmente stale
até revalidação; o backend não continua autorizando. Sem BroadcastChannel.

Expiração: o contexto efetivo de suporte morre com a sessão Redis.
Novo login sempre inicia na plataforma. Um registro `support_sessions`
pode permanecer aberto até a próxima reconciliação/login — risco residual
aceito no MVP. Sem job de cleanup nesta fase.

Homologação manual concluída. 1.6A (Validation & Engineering Review)
aplicou reconciliação, bloqueio de `/admin` no frontend e higiene de build
(`NODE_ENV=production` no `next build`; falha já existia no HEAD base).

Riscos residuais (hardening futuro, não bloqueiam o fechamento):
1. audit órfã possível entre expiração Redis e a próxima reconciliação
2. janela mínima de lost update Redis em concorrência
3. sem sincronização visual cross-tab instantânea

Migration: `20260817131000_support_sessions` (SHA-256
`8cc31aa6bfab1343113f478481749ff4165e07b780af4211eae79d83e96ab176`).
Aplicada em DEV via `prisma migrate deploy`. Sem `migrate reset` / `db push`.

===========================================================

# ÉPICO 2
===========================================================

Conta Azul

Status:

Em andamento

Fases

2.1 OAuth

Status:
Concluída

Authorization Code por tenant, tokens AES-256-GCM, state Redis session-bound,
refresh com `SELECT FOR UPDATE` e rotação do refresh_token. Contrato oficial
2026-08-17 (`login.contaazul.com` / `api-v2.contaazul.com/oauth/token`).
Sem consumo financeiro. Docs: `docs/18`, ADR-050.

Homologação real em 18/08/2026: App de Produção (callback customizado HTTPS);
App de Desenvolvimento usa redirect fixa da Conta Azul e não serve ao callback
do Dashboard. Tokens cifrados; refresh real e rotação do refresh confirmados.
Conexão da conta ERP de homologação removida (disconnect local) após o
fechamento. Não há endpoint de revogação remota no contrato oficial.
Próxima fase: 2.2.

Migration: `20260817214500_conta_azul_oauth` (SHA-256
`9e16a45743a364bbe4a5f33c7a165722a8e1f8a9d9afd5c9c7165ef15e77d715`).
Aplicada em DEV e TEST via `prisma migrate deploy`. Sem `migrate reset` / `db push`.

2.2 Gestão das conexões

Status:
Concluída

Gestão da conexão por tenant — **não** é sincronização financeira.

Escopo:

* `GET https://api-v2.contaazul.com/v1/pessoas/conta-conectada` (Bearer);
* persistência de `IntegrationExternalAccount` (`id_empresa`);
* DTO administrativo enriquecido (identidade, lastError sanitizado,
  `lastSuccessfulSyncAt` sempre null nesta fase);
* UI Empresas → Integrações;
* `POST …/verify` reutiliza o mesmo identity service;
* disconnect remove a conta externa e preserva a Integration;
* identity probe **não** preenche `lastSuccessfulSyncAt` e **não** é sync.

Fora desta fase (2.3+): parcelas, pessoas em lista, categorias, contas,
transações, fila, cron, BullMQ, `sync_runs`, status `SYNCING`/`PENDING`.

Nenhuma fila/cron criada. OAuth 2.1 não foi reaberto.

Homologação real em 18/08/2026: OAuth, callback, identity probe
(`GET /v1/pessoas/conta-conectada` apenas), persistência após reload, verify
idempotente e disconnect. `lastSuccessfulSyncAt` permaneceu NULL. Conta ERP
desconectada no fechamento (Integration DISCONNECTED; 0 credentials; 0 contas
externas). Nenhum endpoint financeiro consumido.

Migration: `20260818120500_conta_azul_connection_management` (SHA-256
`a07932c5c8b1016206a6d198447619f3fea12925983e75a395889bf7d049a1cc`).
Aplicada em DEV e TEST via `prisma migrate deploy`. Sem `migrate reset` / `db push`.

Próxima fase: 2.3.

2.3 Primeira sincronização manual

Status:
Concluída

Primeira carga **manual** e assíncrona do domínio financeiro mínimo.
Não é scheduler (2.4) nem histórico de produto (2.5).

Escopo:

* disparo admin `POST /admin/tenants/:tenantId/integrations/conta-azul/sync` → 202;
* acompanhamento `GET …/sync/current` (run atual/última; sem listagem);
* job único BullMQ `conta-azul-manual-sync` em processo `pnpm worker`;
* `SyncRun` técnico (PENDING/RUNNING/SUCCESS/FAILED);
* lock: unique parcial uma sync ativa por Integration;
* reconciliação oportunística de SyncRun órfão (`sync_stale_run`) sem cron:
  job BullMQ ausente **e** timeout operacional; job waiting sem worker não é órfão;
* timeout efetivo `CONTA_AZUL_SYNC_JOB_TIMEOUT_MS` (30 min) no engine e na reconciliação;
* horizonte civil com clamp (29/02 → último dia válido do mês destino);
* entidades: categorias, contas financeiras, pessoas, contas a receber, contas a pagar;
* paginação `tamanho_pagina=100`; AR/AP por janelas de vencimento de 90 dias;
* horizonte MVP da primeira carga: 5 anos para trás e 2 anos para frente (UTC civil);
* persistência por página; idempotência `(integration_id, external_id)`;
* `lastSuccessfulSyncAt` só no sucesso **total**;
* falha financeira **não** marca Integration `ERROR` (exceto OAuth 2.1);
* disconnect recusado (409) enquanto houver SyncRun ativo;
* disconnect OAuth **não** apaga dados financeiros já sincronizados;
* UI: botão “Sincronizar agora” no card Integrações + polling do run atual.

Fora desta fase: vendas, notas, faturamento, saldo, baixas detalhadas, centros de
custo como cadastro, cron, scheduler, incremental (`data_alteracao_*`), dashboard
financeiro, UI de histórico, 2.4, 2.5.

Homologação real em 18/08/2026 (App de Produção, GET-only, nenhuma mutação ERP):

* OAuth real e identity probe: homologados (2.1/2.2 revalidados nesta conta);
* primeira sync manual: SUCCESS (categorias 48, contas 1, pessoas 0,
  a receber 12, a pagar 1266, ~33 s);
* segunda sync manual: mesmos counts e mesmos hashes de `external_id`;
  zero duplicatas — idempotência real homologada;
* `lastSuccessfulSyncAt` avançou para o `finishedAt` da segunda SUCCESS;
* partial failure: FAILED `sync_invalid_payload` em Pessoas persistiu
  categorias/contas já gravadas e não avançou `lastSuccessfulSyncAt`;
* `GET /v1/pessoas` com `items: null` (sem pessoas) → `[]`; fail-fast
  para os demais shapes; instrumentação sanitizada permanece;
* worker restart/stall e stale run recovery: homologados em preflight/testes;
* disconnect final: Integration `DISCONNECTED`, 0 credentials, 0
  `IntegrationExternalAccount`; dados financeiros preservados como massa DEV.

Horizonte 5+2: operacionalmente **adequado** nesta conta; valores não
alterados. BullMQ mínimo: 1 fila, 1 job type, 1 worker, concurrency 1,
sem scheduler/cron/repeatable. Payload do job sem tokens.

Migration: `20260818140000_conta_azul_first_manual_sync` (SHA-256
`15bcaccc12af51604ca913c208ee56f2570f3d4c7e14b00d9cf5f51c244ce8af`).
Aplicada em DEV e TEST via `prisma migrate deploy`. Sem
`migrate reset` / `db push`.

Worker DEV: `pnpm worker` (processo separado do HTTP). Produção:
`pnpm --filter @dashboard-economizacao/backend worker:start` após o build.

2.4 Sincronização automática

Status:
Concluída

Scheduler global BullMQ 6.1.2 (`upsertJobScheduler`, id estável
`conta-azul-plan-syncs`), tick 1 min. Intervalo:
`CONTA_AZUL_AUTO_SYNC_INTERVAL_MINUTES` (default 60, mínimo 5,
máximo 1440). Jitter determinístico no delay do job (hash do
integrationId, janela ≤ 60s). Sem scheduler por tenant. Sem cron.
Sem `QueueScheduler` legado. Sem backlog temporal: downtime é uma
execução incremental cobrindo o gap (cursor − overlap 2h → now).

Auto = incremental após baseline manual (`lastSuccessfulSyncAt`).
Categorias/contas = full barato. Pessoas = `data_alteracao_de/ate`.
AR/AP = janelas de vencimento 90d + `data_alteracao_de/ate`, chunks
de alteração ≤ 365d. Trigger `SCHEDULED` (não existe `AUTOMATIC`).
Manual permanece FULL. Cursor por recurso = upper bound processado
(`windowTo`); janela vazia avança; não usa `lastSuccessfulSyncAt`
como watermark. Lock único com a 2.3: manual vs scheduled
serializados. Planner skipa se já há run ativa. Worker concurrency 1.
Identity guard: mesmo ERP reutiliza cursor; identidade diferente →
`sync_identity_changed` sem misturar nem apagar financeiro. 401 na
sync: um `forceRefresh` + retry; segundo 401 → FAILED / Integration
ERROR. Delete físico não detectado continua limitação conhecida
(ausência ≠ remoção). Sem UI de histórico (2.5 não iniciada).

Homologação real em 18–19/08/2026 (GET-only, nenhuma mutação ERP):

* planner global real enfileirou `SCHEDULED` incremental (sem FULL
  automática e sem `POST …/sync` manual);
* pessoas incremental + `items:null` compatível; AR/AP aceitaram
  vencimento 90d + `data_alteracao` simultaneamente;
* cursores PEOPLE/RECEIVABLES/PAYABLES avançaram, inclusive em janela
  vazia; overlap 2h reaplicado; `lastSuccessfulSyncAt` só no SUCCESS
  total;
* `not_due` e segunda incremental idempotente (zero duplicatas;
  massa 48/1/0/12/1266 preservada);
* disconnect: Integration `DISCONNECTED`, 0 credential, 0 conta
  externa; financeiro e cursores preservados; cursor sem identidade
  válida não é utilizado.

Observação de homologação (não é comportamento de produção): na
segunda `SCHEDULED` real, a condição de due foi simulada avançando o
relógio da avaliação do planner. `SyncRun.startedAt` refletiu esse
relógio; engine/cursor/`finishedAt` usaram wall-clock. Produção usa
`Date` real.

Migration: `20260818220000_conta_azul_auto_sync_cursors` (SHA-256
`a01c2cb81381f9078dbd0196a90549a61952751723bb05433b19cc64c6dca865`).
Aplicada em DEV e TEST via `prisma migrate deploy`. Sem
`migrate reset` / `db push`.

2.5 Histórico de sincronizações

Status:
Adiada — Fase 17 (decisão aprovada em 19/08/2026)

Decisão: o núcleo técnico de execução (persistência de SyncRun,
lock, diagnóstico mínimo de run atual e `lastSuccessfulSyncAt`) já
existe e é suficiente para o Motor de Sincronização e para o primeiro
Dashboard. O produto de histórico — tela administrativa com listagem
paginada, filtros, detalhe de falha, retenção formal e métricas
operacionais — é escopo da Fase 17 (Logs, Auditoria e
Observabilidade), conforme `docs/06` §21.

Não bloqueia:
- Fase 8 — Modelo Financeiro Normalizado
- Fase 9 — Motor Analítico
- Fase 10 — Dashboard do Cliente

Recorte mensal da Fase 11 (F11-A/B) CONCLUÍDO. F11-B2 HOMOLOGADA.
F11-B3 CONCLUÍDA (24/08/2026). F11-C permanece ADIADA / RECLASSIFICADA
(pouso oficial: Relatórios / F12-A — intervalo De/Até YYYY-MM).
Fase 11 Home: CONCLUÍDA no recorte mensal.
F12-A: CONTRATO CONGELADO (docs/09.6 §17). F12-B: IMPLEMENTADA / HOMOLOGADA TECNICAMENTE (Receita).
10A: CONCLUÍDA. 10B: CONCLUÍDA / HOMOLOGADA. 10C: IMPLEMENTADA / HOMOLOGADA VISUALMENTE.
E1 Pressão de caixa: HOMOLOGADA VISUALMENTE.
E2 composição das despesas: HOMOLOGADA.
Valores a receber por categoria (D8 AR): IMPLEMENTADA / AGUARDANDO HOMOLOGAÇÃO.
E3 leitura executiva: IMPLEMENTADA / AGUARDANDO HOMOLOGAÇÃO.
E4: ADIADA.
Fase 8: CONCLUÍDA. 8B: DESNECESSÁRIA.
9A: CONCLUÍDA. 9B: CONCLUÍDA. 9C: CONCLUÍDA. Grupo A: CONCLUÍDO.
Fase 9: CONCLUÍDA NO RECORTE APROVADO (primeiro Dashboard / Grupo A).
Sem 9D. KPIs residuais não bloqueiam a Fase 10. 2.5: ADIADA PARA FASE 17.

Referências:
- `docs/06` §21 (Fase 17): escopo explícito "histórico de sync"
- `docs/01` LOG-001: requisito de histórico mapeado para Fase 17
- `docs/05` §59: tela administrativa de histórico (Fase 17)
- `docs/18` §8 e schema: SyncRun como lock/diagnóstico técnico

Épico de integração e sincronização Conta Azul encerrado no 2.4.

===========================================================

# FASE 8 — MODELO FINANCEIRO NORMALIZADO
===========================================================

Status: CONCLUÍDA

Recorte: necessidade comprovada de produto (docs/06 §12, docs/11).
8A (read model): CONCLUÍDA.
8B: DESNECESSÁRIA (auditoria 19/08/2026 — sem lacuna estrutural).
Próxima fase: Fase 13 (Consultor). F12-D Relatório de Despesas IMPLEMENTADA / HOMOLOGADA TECNICAMENTE. F12-C PDF/Excel da Receita IMPLEMENTADA / HOMOLOGADA TECNICAMENTE. F12-B Receita IMPLEMENTADA / HOMOLOGADA TECNICAMENTE. F11 Home CONCLUÍDA. F12-A CONGELADA. Fase 12 recorte V1 (Receita+Despesas+export) entregue; Fase 12 completa: NÃO. 10A: CONCLUÍDA. 10B: CONCLUÍDA / HOMOLOGADA. 10C: IMPLEMENTADA / HOMOLOGADA VISUALMENTE. E1: HOMOLOGADA VISUALMENTE. E2 composição das despesas: HOMOLOGADA. Valores a receber por categoria (D8 AR): IMPLEMENTADA / AGUARDANDO HOMOLOGAÇÃO. E3 leitura executiva: IMPLEMENTADA / AGUARDANDO HOMOLOGAÇÃO. E4: ADIADA. 9A/9B/9C: CONCLUÍDAS. Grupo A: CONCLUÍDO. Fase 9: CONCLUÍDA NO RECORTE APROVADO.
2.5: ADIADA PARA FASE 17.

Regras financeiras e recorte: docs/11-regras-analiticas.md

-------------------------------------------------------
Estado do domínio atual (auditoria 19/08/2026)
-------------------------------------------------------

JÁ IMPLEMENTADO (schema + sync operacional):

- FinancialCategory: externalId, name, type (REVENUE/EXPENSE/UNKNOWN),
  parentExternalId, upstreamVersion, syncedAt
- FinancialAccount: externalId, name, type, active, syncedAt
- Party: externalId, name, document?, active, profiles[] (CUSTOMER/SUPPLIER)
- Receivable: externalId, dueDate, competenceDate?, status normalizado,
  upstreamStatus, total/paid/unpaid (Decimal 19,4), partyId?,
  categoryExternalIds[], upstreamCreatedAt/UpdatedAt, syncedAt
- Payable: simetria com Receivable
- Integration.lastSuccessfulSyncAt
- External IDs únicos por integração (idempotência)
- Tenant isolation em todos os índices e queries

NÃO PERTENCE À FASE 8 / CALCULÁVEL NA FASE 9
(conforme docs/11; D1–D9 aprovadas):

- isOverdue → derivado de dueDate + unpaid + hoje (America/Sao_Paulo)
- inadimplência snapshot → calculado sobre campos existentes
- fluxo previsto 90d → calculado sobre unpaid + dueDate; apresentação mensal
- buckets de categoria / cobertura (D8)
- taxa com denominador zero → null (D9); visual na Fase 10

NÃO NECESSÁRIO NO PRIMEIRO RECORTE (adiar):

- paidAt / data efetiva de baixa (exige endpoint de movimentos)
- rateio valorado por categoria (exige /parcelas/{id})
- saldo de conta financeira (exige endpoint de saldo)
- tabela de transações/movimentações (só para fluxo realizado)

-------------------------------------------------------
FASE 8A — Repositórios de leitura

Status: CONCLUÍDA

Módulo: `backend/src/modules/finance/`
Intervalo dueDate: inclusivo `[from, to]`.
Sem Party read repo. Sem FinancialAccount read repo. Sem HTTP.
-------------------------------------------------------

Objetivo:
Expor leitura do modelo já persistido para o Motor Analítico (Fase 9).
NÃO calcular KPI. NÃO derivar overdue. NÃO agregar mês. NÃO aplicar D8.

Schema: NÃO
Migration: NÃO
Conta Azul: NÃO (usar massa já sincronizada)
Frontend / Dashboard / IA / 2.5: NÃO

Backend (módulo financeiro de leitura; nomes ilustrativos):
- ReceivableReadRepository:
  * findActiveByTenant({ tenantId, integrationId? })
    status IN (OPEN, OVERDUE, PARTIALLY_PAID)
  * findActiveByDueDateRange({ tenantId, integrationId?, from, to })
- PayableReadRepository: simétrico
- FinancialCategoryReadRepository:
  * findByTenantAndExternalIds({ tenantId, externalIds })
    (lookup; sem classificar parcela)

Toda query de leitura deve incluir tenantId. Não buscar só por
externalId ou integrationId.

Frontend: NÃO

Testes da 8A:
- isolamento cross-tenant
- exclusão de PAID / LOST / RENEGOTIATED / UNKNOWN nas queries "ativas"
- PARTIALLY_PAID com unpaid residual retorna
- dueDate é Date civil (não Instant de servidor)
- Decimal preservado (sem Number)

Critério de aceite:
- tenantId obrigatório nas leituras
- dados de outro tenant nunca retornam
- sem fórmula de KPI no repositório
- testes da 8A verdes

-------------------------------------------------------
FASE 8B — Hardenings de domínio e documentação

Status: DESNECESSÁRIA (auditoria 19/08/2026)

Não é contrato do PRD. Subdivisão operacional. Sem implementação
pendente antes da Fase 9. Testes residuais de mapper (0/N categorias)
e partyId SetNull são polish opcional, não bloqueiam o Motor Analítico.
Índices da 8A já existem no schema. Limitações conhecidas: docs/11.

Não é a próxima implementação.

-------------------------------------------------------
Testes necessários para fechar Fase 8 (auditoria 19/08/2026)
-------------------------------------------------------

JÁ COBERTO:
- Decimal: parseContaAzulMoney (4 casas, non-finite, tipo inválido)
- dueDate civil sem conversão local
- datas com clamp (29/fev)
- status upstream → interno (OVERDUE, PAGO, ATRASADO, UNKNOWN, etc.)
- mapPartyPage: items null, items inválido, perfis, PII sanitizado
- mapReceivablePage / mapPayablePage: money, categorias, partyId
- idempotência (homologada em prod)
- isolamento de tenant (via test-database-safety e tenant-auth-isolation)

COBERTURA RESIDUAL (não bloqueia encerrar Fase 8):
- mapper 0/N categoryExternalIds (persistência/read já exercitam `[]`)
- Party partyId SetNull
Não executar como 8B. Não bloquear Fase 9.

-------------------------------------------------------
D1–D9: RESOLVIDAS (docs/11 §16). Não reabrir na Fase 8.
-------------------------------------------------------

Fase 9 implementou as fórmulas do Grupo A. Fase 10 implementa visual de
taxa null, copy de empty states e consumo HTTP do motor. Pendências
analíticas residuais: docs/11 §17–§18 (não bloqueiam Fase 10).

-------------------------------------------------------
Caminho até o primeiro Dashboard
-------------------------------------------------------

1. Fase 8 — CONCLUÍDA (8A incluída; 8B desnecessária)
2. Fase 9 — Motor Analítico: CONCLUÍDA NO RECORTE APROVADO
   (9A CONCLUÍDA; 9B CONCLUÍDA; 9C CONCLUÍDA; Grupo A CONCLUÍDO; sem 9D)
3. Fase 10 — Dashboard do Cliente (recorte utilizável entregue)
4. Fase 11 — Filtros da Home (CONCLUÍDA no recorte mensal; F11-C = F12)
5. Fase 12 — Relatórios (F12-A congelada; F12-B/C Receita+PDF homologadas; F12-D Despesas+PDF/XLSX homologada tecnicamente; recorte V1 entregue; Fase 12 completa: NÃO)

10A — facade/API tenant-scoped: CONCLUÍDA
     GET /dashboard/overview (contrato em docs/09.6 §10)
10B — cards + freshness + empty/loading/error: CONCLUÍDA / HOMOLOGADA
10C — próximos vencimentos + fluxo previsto 90 dias: IMPLEMENTADA / HOMOLOGADA VISUALMENTE
E1 — Pressão de caixa 7/15/30 (síntese da mesma janela upcoming): HOMOLOGADA VISUALMENTE
     Default visual 15. Diferença prevista ≠ saldo. Lista detalhada permanece
     provisoriamente na Home até a futura área Financeiro.
E2 — Composição das despesas (AP em aberto / D8 / barras horizontais):
     HOMOLOGADA
     Dívida de apresentação (não E2/E3): tabela do Fluxo previsto parece
     visualmente espremida — não corrigir neste incremento.
Receitas do mês por competência (AR / competenceDate / inclui PAID):
     HOMOLOGADA (M1)
     Query `month=YYYY-MM` opcional; URL `/?month=`; a Home é month-scoped
     (P1.1). Estoque AP/AR do overview NÃO alimenta os cards principais.
     Já recebido = snapshot de paid das receitas do mês, não caixa.
F1-G — Faturamento Gerencial (`monthly-revenue.total`):
     Home visual até CASH-4B. Fórmula de produto SUPERSEDED (ver CASH-3A / §12).
     CASH-4A: infra de caixa na Home sem troca dos cards.
P1-UX — Semântica estoque × mês na Home: SUPERSEDED (rejeitada na homologação humana)
P1.1 — Monthly context: IMPLEMENTADO / AGUARDANDO HOMOLOGAÇÃO
     A receber/pagar/categorias/inadimplência da Home seguem a competência.
     Janelas 7/15/30, forecast 90d, upcoming e E3: só no mês civil atual
     (fórmulas dueDate-from-today preservadas; sem janela inventada no mês selecionado).
P2 — Consolidação Home Executiva: IMPLEMENTADO / AGUARDANDO HOMOLOGAÇÃO
     Home = visão mensal por competência. Até o fim do mês (month-end-cash-pressure)
     substitui pressão 7/15/30 no mês atual. Leitura executiva mensal (executive-insights?month=).
     Categorias: donut Top 5 + Outras. Próximos vencimentos e Alertas placeholder removidos da Home.
     Forecast 90d permanece today-anchored; só visível no mês atual. Upcoming preservado no backend.
V2 — Redesign executivo: IMPLEMENTADO / AGUARDANDO HOMOLOGAÇÃO
     Linguagem visual DARK (ref. canônica) + LIGHT. KPIs densos com sparklines de competência
     (competenceDate / Σ total). Resultado gerencial = receitas − despesas da competência.
     Comparação acumulada, donut+ranking, modal expand, forecast denso.
     Sem caixa diário (L1-B). Sem próximos vencimentos na Home.
V2.1 — Fidelity Pass: IMPLEMENTADO / AGUARDANDO HOMOLOGAÇÃO
     Cabeçalho compacto; títulos dentro dos cards; card inteiro clicável;
     RatioMeter nos KPIs sem série diária; toggle Despesas|Receitas na composição;
     expand com todas as categorias; comparativo mensal (mês × anterior);
     movimentação diária por competência (não caixa); upcoming permanece fora da Home.
V2.2 — Visual Fidelity Pass: IMPLEMENTADO / SUPERSEDED (baseline atual = V2.3.1)
     Cluster seletor + pill de última atualização; 5 KPIs com microviz alinhada;
     `daily.received`/`outstanding` = snapshot por competenceDate (não caixa);
     Resultado com série B assinada; composição Receitas+Despesas simultânea
     (sem toggle primário); grade ~34|40|26; Top 5 CTA centralizado;
     terceira faixa alinhada; comparativo em barras agrupadas; polish DARK/LIGHT.
     Sem L1-B / caixa diário / upcoming na Home / migration / sync Conta Azul.
V2.3 — Home Architecture: HOMOLOGADA
     Remove Top 5 despesas e o dual “Composição por categoria”.
     mainGrid: Receitas × Despesas | Despesas por categoria | Receitas por categoria
     (sectionIds: `receitas-mes` | `despesas-mes` | `receitas-categoria`).
     secondaryGrid: Meta de faturamento (empty “Meta ainda não definida”,
     snapshot=null) | Até o fim (mês atual) | Leitura | Inadimplência.
     Expand só `categories-revenue` / `categories-expense` via clique no card.
     API/persistência de meta na época: NÃO IMPLEMENTADAS.
V2.3.1 — Final Home Polish: HOMOLOGADA — baseline visual/funcional congelado da Home
     Copy comercial da Meta; ícones semânticos na Leitura executiva;
     Comparativo sem colisão de labels + hover/tooltip (card e expand).
     Sem redesign.
F2 — Meta de faturamento: HOMOLOGADA
     Persistência SIM · por tenant SIM · por competência SIM · cadastro SIM ·
     edição SIM · histórico SIM · Meta × Realizado SIM · falta/excesso SIM ·
     competência futura = planejada (F2.0.1).
     `revenue_goals` (uma linha por tenant + competência, sem revisões) +
     `GET`/`PUT /dashboard/revenue-goal` (docs/09.6 §15).
     Realizado vem de monthly-revenue (competência) — fórmula não duplicada.
     Escrita permitida em Support Mode; ADMIN sem suporte recebe 403.
     Widget da Home com CTA e diálogo de meta; layout V2.3.1 preservado.
     IA / sugestão automática de meta: FUTURA / NÃO IMPLEMENTADA.
     Gráfico histórico Meta × Realizado: melhoria futura (fora da F2 homologada).

Sidebar sticky desktop (AppShell): HOMOLOGADA.
L0 — Spike real de baixas Conta Azul (GET-only): PARCIAL / SUFICIENTE PARA L1-A
L1-A / CASH-2 — Persistência/ingestão read-only (`financial_transactions`):
     IMPLEMENTADA no HEAD (CASH-2). Migration `20260826190000_...`.
     Stash L1 histórico permanece como referência; NÃO aplicar.
     Engine busca `/baixa` só para parcelas upsertadas na run com `paid>0`.
     Bootstrap/listPaid existe no ledger-sync; o engine incremental NÃO o chama.
CASH-7 — Backfill/bootstrap explícito do ledger: IMPLEMENTADO LOCALMENTE
     (Clínica Life, 26/08/2026). CLI `scripts/cash7-ledger-backfill.ts`
     exige `--tenant` + `--confirm=LOCAL`; aborta `NODE_ENV=production`
     e banco que não seja `_dev`/`_test`. Não dispara no worker/login.
     Discovery: títulos locais `paid > 0`; skip se Σ gross ACTIVE = paid
     e sem DELETED; senão GET `/baixa`. Idempotente; sem prune (CASH-8).
     Produção: NÃO executar nesta fase (backup → migrate ledger → deploy
     API/worker → backfill por tenant → cobertura → reconciliar → CASH-4B).
CASH-3A — Read model mensal de caixa (`MonthlyCashFlow`): IMPLEMENTADA no domínio.
CASH-3B — `GET /dashboard/monthly-cash-flow`: IMPLEMENTADA (facade + DTO + tipos frontend).
     Sem Home visual. `billing` = monthlyBilling = inflows + expected.receivables.
     `situation` se presente é validada e ignorada (realizado histórico).
CASH-4A — Infra Home para MonthlyCashFlow: IMPLEMENTADA.
     Fetch + cache (month × centro × categoria, sem situation) + view-model.
     KPIs / Meta / gráficos visíveis ainda competência. Falha do cash-flow
     não derruba o overview legado. CASH-4B troca os números. Relatórios/PDF/XLSX intactos.
     HOME CASH NÃO PODE SER LIBERADA AO FELIPE COM NÚMEROS REAIS ANTES
     DO BACKFILL DE PRODUÇÃO + CASH-8 do gap de over-coverage.
CC1 — Centros de custo + alocação + filtro Home:
     HOMOLOGADA (CC1.1 incorporada)
     Sync `cost_centers` + `installment_cost_center_allocations`;
     `GET /dashboard/cost-centers`; query `costCenter` nos GETs de dashboard;
     filtro no header + URL (`?month=&costCenter=`); Meta F2 permanece consolidada
     (company-level; ignora filtro de centro).
     CC1.1 HOMOLOGADA: Conta Azul pode devolver rateio EVENT-scoped em parcelamentos;
     `EVENT_SCOPED_SINGLE_CENTER` → amount = total da parcela;
     multi-centro EVENT-scoped = MULTI_CENTER_UNRESOLVED (protegido; não proporcional);
     NO_ALLOCATION legítimo; Todos pode ser > Σ centros.
CC1.2 — Performance / resiliência do enrichment de centros:
     HOMOLOGADA TECNICAMENTE
     Estado por parcela (`cost_center_detail_status`: UNKNOWN | FETCHED |
     NO_ALLOCATION | UNRESOLVED | ERROR) + `shouldFetchCostCenterDetail`;
     segundo sync/dry-run com upstream estável → 0 GETs de detalhe;
     UNKNOWN processados → NO_ALLOCATION/FETCHED; OVER permanece 0;
     counters no SyncRun; HTTP sequencial (~8 req/s / 125ms); timeout 30 min;
     checkpoint semântico por registro; concorrência 1; eventId NÃO persistido;
     ZERO alteração visual Home V2.3.1; homologação visual NÃO APLICÁVEL nesta fase.
CC1.3 — Cash split por centro + seletor em tabs:
     HOMOLOGADA VISUALMENTE
     Auditoria: Conta Azul NÃO associa baixa↔centro; rateio só no evento/parcela.
     Split híbrido EXACT (sem ledger, sem proporção inventada):
       1 centro (allocation≈total) → received=paid / outstanding=unpaid;
       multi + título 100% quitado → received=allocation.amount;
       multi + paid≈0 → outstanding=allocation.amount;
       multi parcial → UNAVAILABLE (KPI null se qualquer linha do mês for);
     Seletor Home: tabs (Todos|centros), overflow horizontal + setas;
     0 centros → oculto; 1+ → Todos + centros; Meta company-level.
F11-A — Congelamento de escopo da Home: CONCLUÍDA (23/08/2026)
     Home = competência mensal civil (`?month=YYYY-MM`, `competenceDate`,
     `America/Sao_Paulo`). Query params oficiais: `month`, `costCenter`.
     FILTER-001 (hoje/ontem/7d/30d/12 meses/ano) e FILTER-005 (range)
     NÃO na Home — F11-C (reclassificados; não é regressão).
     Centro de custo e `?month=` NÃO são pendências F11.
     Comparação oficial = mês × mês civil anterior (sem seletor de base).
     Meta F2 permanece company-level. Forecast/upcoming/pressão = P1.1
     (hoje + `dueDate`). Ledger L1 FORA da Fase 11.
F11-B — Filtros por situação e categoria no mês: CONCLUÍDA (recorte mensal)
     F11-B1 contrato/backend: CONCLUÍDA.
     F11-B2 frontend: HOMOLOGADA.
     F11-B3 homologação F11-B2: CONCLUÍDA (24/08/2026).
     `situation=settled|open|overdue` (D1 para overdue; sem query `status`).
     `category=<uuid>` de FinancialCategory.id (match D8 preciso; 404
     cross-tenant). GET /dashboard/categories alimenta o picker.
     monthly-revenue/expenses/insights aceitam os dois; forecast/pressão
     aceitam category e ignoram situation válida; meta permanece
     company-level.
F11-C — Períodos rolantes / range: ADIADA / RECLASSIFICADA
     Destino oficial: Relatórios / F12-A (De/Até YYYY-MM de competência).
Fase 11 Home: CONCLUÍDA no recorte mensal.
F12-A — Freeze de Relatórios: CONTRATO CONGELADO (24/08/2026)
     Tipos V1: Receita e Despesas (monthly-revenue / monthly-expenses).
     Contas vencidas = situation=overdue (D1), não taxa de estoque ranged.
     Visualização F12-B/F12-D; PDF/Excel F12-C (Receita) e F12-D (Despesas). Sem ledger, sem caixa realizado,
     sem tenantId em query, sem POST /reports 202 na V1.
     Contrato: docs/09.6 §17. UX: docs/05 §33–35.
F12-B — Relatório de Receita: IMPLEMENTADA / HOMOLOGADA TECNICAMENTE (24/08/2026)
     `GET /reports/revenue?from&to` + página `/relatorios`.
F12-C — Exportação PDF/XLSX da Receita: IMPLEMENTADA / HOMOLOGADA TECNICAMENTE
     (25/08/2026). `GET /reports/revenue?format=pdf|xlsx`. Síncrono. Sem job/202.
     Backend (`pdfkit` + `exceljs`) formata o mesmo `getRevenueReport`. Snapshot
     de filtros na UI (exportação desabilitada se o draft divergir).
F12-D — Relatório de Despesas: IMPLEMENTADA / HOMOLOGADA TECNICAMENTE (25/08/2026)
     `GET /reports/expenses?from&to` (+ `format=pdf|xlsx`). Mesma `/relatorios`
     com tipo funcional. Motor = `getMonthlyCompetenceExpenses`. Semântica HTTP
     `payables`/`paid`. Paridade 1 mês com `GET /dashboard/monthly-expenses`.
     Inadimplência NÃO é terceiro tipo (situation=overdue). Fase 12 completa: NÃO.
L1-B — Semântica oficial do caixa + read model mensal:
     BLOCKED_BY_CASH_SEMANTICS (20/08/2026)
     Doc oficial ValorComposicaoDTO da baixa: 5 campos (valor_bruto required +
     juros/multa/desconto/taxa); valor_liquido NÃO documentado no contrato de
     baixas; sem fórmula “valor efetivamente movimentado”.
     Payload real traz valor_liquido; na massa DEV coincide com valor_bruto
     (componentes zero). Σ valor_bruto == installment.paid (77/77) prova
     reconciliação do título, NÃO o valor de caixa bancário.
     NÃO inventar fórmula. gross/net/componentes permanecem separados.
     API GET /dashboard/monthly-cash-flow: IMPLEMENTADA (CASH-3B).
     Home CASH-4A: fetch/view-model prontos; KPIs visíveis ainda competência.
     UI / Previsto×Realizado: NÃO.
Faturamento Fiscal / meta / fixa×variável / D1 drill-down: NÃO IMPLEMENTADOS.
E4: ADIADA.
E3 — Leitura executiva (insights determinísticos 30d / D8 / 90d):
     IMPLEMENTADA / AGUARDANDO HOMOLOGAÇÃO
E4: ADIADA

Backlog (não 10B/10C/E1/E2): a mesma Integration CONTA_AZUL do tenant deverá
poder ser operada pela área administrativa e, no futuro, pela área do
próprio cliente. Uma conexão; dois contextos de UX. Não implementar agora.

KPIs residuais (meta de faturamento, faturamento fiscal, realizado, saldo,
fixas×variáveis, Receita × Despesa, D1 drill-down) não bloqueiam este caminho. 2.5/Fase 17 e
deploy ficam depois.

===========================================================

# ÉPICO 3
===========================================================

Dashboard

Status:

Em andamento

Fases

3.1 — Estrutura do Dashboard
Status: Concluída

Estrutura definitiva da tela inicial em empty state (boas-vindas, resumo financeiro,
fluxo de caixa, movimentações, alertas e rodapé). Sem dados financeiros, gráficos,
APIs ou valores fictícios.

3.1.1 — Dashboard Empty State Polish
Status: Concluída

Refinamento visual dos painéis empty (alturas, KPIs preparados, ícones neutros,
espaçamentos e rodapé discreto). Sem alteração funcional.

3.2 — Biblioteca de Componentes Financeiros
Status: Concluída

KpiCard, ChartCard, FinancialSection, FinancialGrid, StateWrapper e PanelIcon —
desacoplados de backend/API, orientados por props, reutilizáveis por módulos futuros.

KPIs — Fase 9 CONCLUÍDA NO RECORTE DO GRUPO A.
10A CONCLUÍDA. 10B CONCLUÍDA / HOMOLOGADA. 10C IMPLEMENTADA / HOMOLOGADA VISUALMENTE.
E1 Pressão de caixa HOMOLOGADA VISUALMENTE. E2 composição das despesas HOMOLOGADA. Valores a receber por categoria IMPLEMENTADA / AGUARDANDO HOMOLOGAÇÃO. E3 leitura executiva IMPLEMENTADA / AGUARDANDO HOMOLOGAÇÃO. E4 ADIADA.

Recorte do primeiro Dashboard aprovado (19/08/2026):

GRUPO A — Dados disponíveis, regra aprovada:
- Contas a receber: total em aberto / vencido / a vencer
- Contas a pagar: total em aberto / vencido / a vencer
- Inadimplência (taxa — fórmula em docs/11 §4)
- Próximos vencimentos (AR e AP)
- Fluxo de caixa previsto 90 dias (docs/11 §7)
- Última sincronização (lastSuccessfulSyncAt)

GRUPO B — Extensão analítica (dados parciais; D8). NÃO bloqueia Fase 10:
- Receita por categoria (docs/11 §9, D8)
- Despesa por categoria (docs/11 §10, D8)

GRUPO C/D — Adiados; NÃO bloqueiam Fase 10:
- Receita × Despesa (D7; docs/11 §11)
- Faturamento (docs/11 §12) — fórmula oficial homologada (caixa); Home F1-G até CASH-4B
- Fluxo de caixa realizado / ledger (docs/11 §8)
- Saldo (docs/11 §13)
- Despesas fixas/variáveis (docs/11 §14)
- Rateio valorado (`GET /parcelas/{id}`)

Referência normativa: docs/11-regras-analiticas.md

Indicadores

Gráficos

Filtros

F11-A/B CONCLUÍDAS na Home. F11-C = Relatórios.

Relatórios

F12-A CONTRATO CONGELADO (docs/09.6 §17). F12-B IMPLEMENTADA / HOMOLOGADA TECNICAMENTE (Receita).
F12-C IMPLEMENTADA / HOMOLOGADA TECNICAMENTE (PDF/XLSX da Receita).
F12-D IMPLEMENTADA / HOMOLOGADA TECNICAMENTE (Despesas + PDF/XLSX).
PRE-IA-4D IMPLEMENTADA — PDF profissional (Receita + Despesas), homologação humana pendente.
Tipos V1: Receita e Despesas (entregues). Sidebar real em /relatorios (docs/05 §7).
Fase 12 completa: NÃO (itens históricos do PRD fora da V1: caixa realizado,
inadimplência de estoque ranged, listagens AR/AP).

===========================================================

# ÉPICO 4
===========================================================

Consultor Financeiro IA

Status:

Pendente

Fases

Context Builder

Motor Analítico

Chat

Insights

Alertas

Recomendações

IA Proativa

===========================================================

# ÉPICO 5
===========================================================

Infraestrutura Complementar

Status:

Em andamento (parcialmente entregue)

Fases

Redis — Concluída (sessão, BullMQ, planner)

BullMQ — Concluída (fila manual 2.3, planner global 2.4)

Workers — Concluída (worker separado HTTP; `pnpm worker` / `worker:start`)

Scheduler — Concluído (Job Scheduler global `conta-azul-plan-syncs`, BullMQ 6.1.2)

Notificações — Pendente

OneSignal — Pendente

PWA — Pendente

===========================================================

# CHECKPOINTS
===========================================================

Ao concluir cada subfase deverá ocorrer obrigatoriamente:

Validação

↓

Commit

↓

Atualização deste documento

↓

Próxima subfase

===========================================================

# CONTROLE DE STATUS
===========================================================

Os status válidos são exclusivamente:

Pendente

Próxima

Em andamento

Em revisão

Concluída

Bloqueada

Nunca utilizar outros status.

===========================================================

# PILOT-INFRA-1 — Instalador do Ambiente Piloto Felipe

Status: Em implementação (não homologado em VPS)

Objetivo: wizard `install.sh` para uma VPS única. Não é a Fase 19 completa.

Entregue neste repositório:

* `install.sh` (raiz) e `infrastructure/scripts/install.sh`
* systemd + Nginx templates
* `ALLOW_INSECURE_HTTP_SESSION` (ADR-052)
* `trustProxy` loopback
* `bootstrap:super-admin` (ADR-053; PILOT-INFRA-1.1 — cria SUPER_ADMIN, não ADMIN)
* `docs/19-ambiente-piloto.md`

Fora desta fase: backup/restore validados, Dockerfiles da aplicação, WIP ledger.

SHA de referência do piloto inicial: `fc7f13ab1314123b34844f70be3fc7fb14d014b3`

===========================================================

# PILOT-INFRA-1.1 — Bootstrap SUPER_ADMIN e VPS real

Status: Em implementação (não homologado em VPS)

Corrige o bootstrap da PILOT-INFRA-1: a primeira conta da instalação é `SUPER_ADMIN`, não `ADMIN`. Comando oficial: `bootstrap:super-admin` (ADR-053). O `ADMIN` operacional não é criado nesta etapa.

A VPS real já contratada está registrada em `docs/19-ambiente-piloto.md` (Cloud VPS Plus 6, Ubuntu 24.04 LTS x86_64, 6 vCPU / 12 GB / 300 GB NVMe). O `install.sh` continua detectando hardware em runtime.

===========================================================

# DIRETRIZ FINAL
===========================================================

Nenhuma fase poderá iniciar antes da conclusão da anterior, salvo autorização explícita.

Este documento representa a ordem oficial de execução do Dashboard Economização.
