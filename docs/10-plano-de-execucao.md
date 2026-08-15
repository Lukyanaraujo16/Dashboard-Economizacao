# Dashboard Economização

# Plano Oficial de Execução

Status do Projeto

Fundação:
Concluída

Versão atual:
1.5A

Último checkpoint:

1.5A — Arquitetura de Branding da Plataforma

Último commit:

feat(users): adiciona dominio e api administrativa

Próxima fase executável:

1.5B — Persistência de Branding da Plataforma

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

Em andamento

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
Status: Pendente (próxima)

1.5C — API
Status: Pendente

1.5D — UI Administrativa
Status: Pendente

1.5E — Runtime
Status: Pendente

----------------------------------------

1.6 Modo Suporte

Status:
Pendente

Anteriormente numerado como 1.5 no plano. Renumerado para 1.6 após a inclusão de
1.5 — Branding da Plataforma. Conteúdo de produto inalterado: modo suporte auditado
(PRD SUPPORT / `docs/09.9`). **Não iniciada.**

===========================================================

# ÉPICO 2
===========================================================

Conta Azul

Status:

Pendente

Fases

2.1 OAuth

2.2 Gestão das conexões

2.3 Primeira sincronização manual

2.4 Sincronização automática

2.5 Histórico de sincronizações

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

KPIs

Indicadores

Gráficos

Filtros

Relatórios

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

Pendente

Fases

Redis

BullMQ

Workers

Scheduler

Notificações

OneSignal

PWA

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

# DIRETRIZ FINAL
===========================================================

Nenhuma fase poderá iniciar antes da conclusão da anterior, salvo autorização explícita.

Este documento representa a ordem oficial de execução do Dashboard Economização.
