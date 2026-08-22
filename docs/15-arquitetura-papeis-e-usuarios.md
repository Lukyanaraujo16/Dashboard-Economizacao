# Arquitetura de Papéis e Usuários

**Status:** ACEITA (pré-1.4)  
**Data:** 2026-08-15  
**ADR vinculada:** `docs/adr/ADR-047-role-hierarchy-platform-tenant.md`  
**Documentos de leitura conjunta:** `docs/01-prd.md` (§5.3 USER, §5.12 ADMIN, §5.13 SUPPORT), `docs/02-arquitetura.md` (§4.4–4.5, §7), `docs/09.7-autenticacao.md`, `docs/09.8-seguranca.md`, `docs/09.9-multiempresa.md`, `docs/10-plano-de-execucao.md`, `docs/13-arquitetura-empresas-workspace.md`, `docs/14-arquitetura-branding-tenant.md`, ADR-045, ADR-046

---

## 1. Objetivo

Formalizar a hierarquia de acesso da plataforma **antes** da Fase 1.4 — Usuários, para que CRUD, listagens e autorização server-side não reinventem papéis nem introduzam privilégios especiais implícitos.

Este documento **não** implementa usuários. Ele congela o modelo de papéis.

---

## 2. Matriz oficial de papéis

Nomenclatura de código / banco: `USER` | `ADMIN` | `SUPER_ADMIN`  
Nomenclatura documental legada (`docs/09.7`): `tenant_user` | `admin` | `superadmin`  
Mapeamento 1:1 já registrado no schema Prisma.

| Papel (código) | Escopo | `tenantId` | Significado de produto |
|---|---|---|---|
| `SUPER_ADMIN` | GLOBAL / TÉCNICO | `null` | Desenvolvedor / responsável técnico; supervisor acima dos ADMINs |
| `ADMIN` | GLOBAL / OPERACIONAL | `null` | Administradores da operação Economização (Felipe, sócios, equipe) |
| `USER` | TENANT | **obrigatório** | Usuário de uma empresa cliente |

### 2.1 SUPER_ADMIN

**Pode (conceitualmente):**

- acessar toda a plataforma;
- executar tudo que `ADMIN` executa no escopo operacional atual;
- supervisionar a administração;
- acessar dados necessários a suporte técnico (modo suporte = Fase 1.5);
- futuramente administrar outros `SUPER_ADMIN` apenas por fluxo técnico específico, se existir.

**Não deve:**

- aparecer na lista administrativa comum de administradores acessível a `ADMIN`;
- ser alterado, bloqueado ou excluído por `ADMIN` via UI/API administrativa comum;
- pertencer a tenant (`tenantId` permanece `null`);
- ser tratado como usuário de empresa.

**Importante:** “oculto da UI administrativa comum” **não** significa oculto de banco, logs ou auditoria. `SUPER_ADMIN` é identidade real, autenticada e rastreável.

### 2.2 ADMIN

**Representa:** Felipe, sócios e demais administradores operacionais da Economização.

**Todos os `ADMIN` possuem o mesmo nível.** Não existem papéis:

- `OWNER`
- `PRIMARY_ADMIN`
- `FELIPE_ADMIN`
- `ADMIN_MASTER`

salvo requisito futuro **explicitamente** aprovado e registrado em nova ADR.

**Pode (escopo operacional de plataforma):**

- Dashboard da plataforma;
- Empresas (criar/editar/desativar);
- Branding por empresa;
- futuramente Usuários, Integrações, Conta Azul, configurações operacionais;
- visualizar e administrar **outros `ADMIN`** (Fase 1.4).

**Não pode:**

- listar `SUPER_ADMIN` na gestão normal;
- consultar, editar, bloquear ou excluir `SUPER_ADMIN` pela API/UI administrativa comum;
- possuir `tenantId` (não é admin de um tenant cliente).

### 2.3 USER

**Pode:**

- acessar somente recursos do próprio tenant;
- Dashboard / módulos tenant-scoped futuros;
- branding do próprio tenant (runtime 1.3F).

**Não pode:**

- acessar Empresas global;
- administrar branding de outras empresas / plataforma;
- listar outros tenants;
- acessar administração global da plataforma.

---

## 3. ADMIN não é admin do tenant

`ADMIN` é administrador **da plataforma Economização**.

- `ADMIN.tenantId = null`
- `SUPER_ADMIN.tenantId = null`
- **Não** modelar `ADMIN → Tenant` como vínculo de pertencimento.

Operações administrativas sobre uma empresa usam `tenantId` **explícito** em rotas `/admin/*` (ou equivalente), nunca tenant implícito da sessão do administrador (`docs/09.9` §3.7, `docs/13` §10).

---

## 4. Felipe e igualdade entre ADMINs

**Decisão de produto:**

- Felipe será um usuário com role `ADMIN`.
- Sócios e equipe administrativa cadastrados também serão `ADMIN`.
- Não há privilégio especial por e-mail, flag `owner`, `isFounder`, `primaryAdmin` ou equivalente.

Narrativa histórica em `docs/02-arquitetura.md` §4.5 (“Fellipe e administradores por ele cadastrados”) descreve **origem operacional**, não um papel distinto.

Se níveis diferentes forem necessários no futuro, exigem decisão explícita + ADR.

---

## 5. Proteção do último ADMIN operacional

**Invariante obrigatória (Fase 1.4):**

> A plataforma **não pode** ficar sem ao menos **um** `ADMIN` operacional ativo/utilizável.

Essa proteção é **independente** da existência de `SUPER_ADMIN`. Acesso técnico **não** justifica zerar a governança operacional.

### 5.1 Contagem

Para a regra “deve existir pelo menos um ADMIN ativo”:

| Conta | Não conta |
|---|---|
| `role = ADMIN` e status efetivamente ativo/utilizável | `SUPER_ADMIN` |
| | `USER` |
| | `ADMIN` não utilizável (ex.: desativado/bloqueado, conforme semântica da 1.4) |

`SUPER_ADMIN` não entra na contagem porque:

- é camada técnica, não operação cotidiana;
- pode não ser conhecido pela equipe administrativa;
- não substitui governança operacional da Economização.

### 5.2 Status de usuário (existente — sem alterar)

Já existe `UserStatus` no schema: `PENDING` | `ACTIVE` | `BLOCKED` | `DISABLED`.

Hoje, autenticação exige `status === ACTIVE` (`requireAuthentication` / login).

A 1.4 deverá definir explicitamente quais status entram na contagem de “ADMIN operacional ativo” (requisito de implementação; **não** criar enum novo nesta consolidação). Diretriz: contar apenas ADMINs **efetivamente utilizáveis** para operar a plataforma.

### 5.3 Operações proibidas quando restaria zero ADMIN ativo

Se, após a operação, a contagem de ADMINs ativos seria `< 1`, o backend **deve rejeitar**:

- exclusão do último ADMIN ativo;
- desativação / bloqueio do último ADMIN ativo;
- conversão de role do último ADMIN ativo para `USER` (ou qualquer role que remova o papel `ADMIN`);
- auto-desativação / auto-exclusão / auto-mudança de role do último ADMIN ativo.

Motivo: evitar **lockout administrativo** da operação da plataforma.

Código HTTP / envelope de erro: definidos na API da 1.4, conforme convenções do projeto (`docs/09.6`, `docs/09.10`).

### 5.4 Múltiplos ADMINs ativos

Com **dois ou mais** ADMINs ativos:

- um ADMIN pode desativar outro ADMIN;
- um ADMIN pode excluir outro ADMIN, **se** a política de exclusão da 1.4 permitir;
- um ADMIN pode editar dados cadastrais de outro ADMIN;
- desde que, **após** a operação, continue existindo ≥ 1 ADMIN ativo.

Não há hierarquia entre ADMINs. Felipe permanece ADMIN comum.

### 5.5 Auto-gestão

ADMIN pode editar seus próprios dados cadastrais.

ADMIN **não** pode executar contra si mesmo uma operação que resulte em zero ADMINs ativos (ex.: único ADMIN ativo tenta desativar a própria conta → rejeitar).

Se existir outro ADMIN ativo, a auto-desativação / auto-exclusão poderá ser permitida conforme política da 1.4 — ainda sujeita à invariante pós-operação.

### 5.6 Atomicidade / corrida

A checagem “quantos ADMINs ativos existem?” e a mutação (desativar / excluir / alterar role) **não** devem ser duas operações inseguras e independentes.

A 1.4 deve usar **atomicidade adequada** (transação / locking / constraint de aplicação) para impedir corrida em que dois ADMINs se removem simultaneamente e a plataforma fica com zero ADMIN ativo.

Não implementar transação nesta tarefa documental.

### 5.7 Criação de SUPER_ADMIN (reafirmação)

`ADMIN` nunca cria `SUPER_ADMIN`. `SUPER_ADMIN` só surge por fluxo técnico controlado (seed / ops / processo seguro futuro). Sem endpoint nesta consolidação.

Comando oficial de ops do piloto: `pnpm --filter @dashboard-economizacao/backend bootstrap:super-admin` (ADR-053). Cria o primeiro `SUPER_ADMIN` ACTIVE sem tenant. Não cria `ADMIN`.

---

## 6. SUPER_ADMIN oculto da gestão normal (obrigatório na 1.4)

Quando `ADMIN` acessar a futura gestão de administradores:

| Listar | Não listar |
|---|---|
| `ADMIN` | `SUPER_ADMIN` |

Regras de autorização (backend, não só UI):

1. listagens administrativas comuns filtram `role !== SUPER_ADMIN` (ou equivalente seguro);
2. GET/PATCH/DELETE de usuário alvo `SUPER_ADMIN` por ator `ADMIN` → rejeitado (`403`/`404` conforme política de não enumeração);
3. criação com `role = SUPER_ADMIN` por ator `ADMIN` → rejeitado;
4. a UI apenas espelha a regra; **a fonte de verdade é o backend** (`docs/09.7` §3.2, `docs/09.8`).

`SUPER_ADMIN` continua existindo no PostgreSQL e deve aparecer em auditoria/logs internos quando o audit log existir.

---

## 7. Autenticação e auditoria

Proibido:

- login invisível;
- backdoor;
- usuário sem registro;
- acesso sem autenticação;
- impersonation sem desenho explícito da Fase 1.5 (modo suporte).

`SUPER_ADMIN` autentica-se pelo mesmo mecanismo de sessão (cookie HttpOnly + Redis). Ações futuras devem ser auditáveis com identidade real (PRD SUPPORT-001, SUPPORT-007; `docs/09.11`).

---

## 8. Branding por papel (confirmação 1.3F)

| Papel | Branding resolvido |
|---|---|
| `SUPER_ADMIN` | Plataforma Economização |
| `ADMIN` | Plataforma Economização |
| `USER` | Tenant associado (`Tenant.displayName` + overrides/logo) |

Alinhado a `docs/14` e ADR-046. Esta auditoria **não altera** o WIP da 1.3F.

---

## 9. Navegação (conceitual)

| Papel | Navegação cotidiana |
|---|---|
| `SUPER_ADMIN` | Módulos globais (mesmo conjunto operacional que `ADMIN` no MVP) |
| `ADMIN` | Mesmos módulos operacionais globais |
| `USER` | Somente módulos tenant-scoped |

A diferença cotidiana SUPER_ADMIN × ADMIN **não** deve ser visualmente enorme. A diferença principal é **autoridade sobre a camada administrativa superior** (gestão de papéis técnicos / invisibilidade do SUPER_ADMIN para ADMIN).

Modo suporte e menus exclusivos de superadmin ficam para a Fase 1.5 / evoluções explícitas (`docs/05-ui-ux.md` §67).

---

## 10. Quem pode criar quem (recomendação formal para 1.4)

| Ator | Pode criar `ADMIN` | Pode criar `USER` | Pode criar `SUPER_ADMIN` |
|---|---|---|---|
| `SUPER_ADMIN` | Sim | Sim (fluxo admin de empresas) | Somente fluxo técnico específico (seed/ops), se existir |
| `ADMIN` | Sim | Sim (vinculado a empresa) | **Não** |
| `USER` | Não | Não no MVP (USER-002); só se regra futura explícita permitir | Não |

Confirmação documental:

- Cadastro de usuários de empresa por administrador: PRD USER-003 / ADMIN-003.
- Existência de superadmin: PRD SUPPORT-001.
- Perfis sem tenant para admin/superadmin: `docs/09.7` §3.3.
- Criação/gestão de `ADMIN` entre pares e ocultação de `SUPER_ADMIN`: **congeladas neste documento** (não estavam detalhadas como regra de listagem na 1.4 até aqui).

---

## 11. Segurança de role

Princípio obrigatório:

> Role (ou qualquer claim de autorização) enviada pelo frontend **nunca** é confiável sem autorização server-side.

Exemplos que o backend da 1.4 deverá rejeitar:

- `ADMIN` cria usuário com `role = SUPER_ADMIN`;
- `ADMIN` altera role de alguém para `SUPER_ADMIN`;
- `USER` tenta criar `ADMIN`;
- payload com `tenantId` arbitrário em rotas de plataforma sem validação do ator.

Espelhar a regra na UI é UX; não é controle de acesso (`docs/09.4`, `docs/09.7`, `docs/09.8`).

---

## 12. Dois contextos de UX na Fase 1.4

Tecnicamente, é **provável e desejável** manter uma única tabela `User` (já existente) com `role` + `tenantId`.

Na UX, separar **dois contextos**:

### A) Administradores da Plataforma

Lista operacional de `ADMIN` (e apenas `ADMIN` para atores `ADMIN`).

Capacidades previstas (sem implementação nesta tarefa):

- listar `ADMIN`;
- criar `ADMIN`;
- editar `ADMIN` (incluindo auto-edição cadastral);
- desativar `ADMIN` (respeitando §5);
- eventualmente excluir `ADMIN` (respeitando §5);
- `SUPER_ADMIN` oculto para `ADMIN`;
- `ADMIN` não cria `SUPER_ADMIN`;
- preservar ao menos um `ADMIN` operacional ativo (§5).

`SUPER_ADMIN` não aparece nessa lista para `ADMIN`.

### B) Usuários das Empresas

Por empresa:

- Empresa A → `USER` / `USER` …
- Empresa B → `USER` / `USER` …

Criação por `ADMIN` / `SUPER_ADMIN`; isolamento por tenant; sem acesso administrativo global.

Não misturar A e B numa única tabela de produto sem diferenciação clara de contexto.

---

## 13. Auditoria da implementação atual (pré-1.4)

Legenda: **A** já correto · **B** parcialmente correto · **C** divergente · **D** ainda não implementado (1.4+)

| Área | Classificação | Notas |
|---|---|---|
| Enum `UserRole` (Prisma) | **A** | `USER` / `ADMIN` / `SUPER_ADMIN` |
| Invariantes `tenantId` | **A** | `assertUserTenantRoleConsistency` |
| `requireAuthentication` | **A** | Revalida role/tenant; USER exige tenant ACTIVE |
| `requirePlatformRole` | **A** | `ADMIN` \| `SUPER_ADMIN` |
| Empresas `/admin/tenants` | **A** | Guard de plataforma; sem tenant implícito |
| Branding admin | **A** | Mesmo guard de plataforma |
| `GET /branding/current` (1.3F) | **A** | USER→tenant; ADMIN/SUPER_ADMIN→plataforma |
| Sidebar / `RequirePlatformRole` | **A** | USER sem Empresas; plataforma vê módulos globais |
| `/auth/me` | **A** | Expõe `role` + `tenantId`; sem branding |
| Lógica especial Felipe/owner | **A** | Ausente (correto) |
| Igualdade ADMIN × SUPER_ADMIN no dia a dia | **B** | Intencional hoje: mesmos módulos; distinção administrativa superior ainda não codificada |
| Ocultação SUPER_ADMIN na gestão de admins | **D** | Fase 1.4 |
| Proteção do último ADMIN operacional | **D** | Fase 1.4 (§5); enum `UserStatus` já existe |
| CRUD usuários / criação de roles | **D** | Fase 1.4 |
| Modo suporte | **D** | Fase 1.5 |
| Audit log de ações de papel | **D** | Evolução de logs/auditoria |

**Divergências C (código):** nenhuma identificada que contradiga esta matriz.

**Nuances documentais (não exigem correção de código agora):**

1. PRD ADMIN-003 fala em gestão de usuários **das empresas**; gestão de pares `ADMIN` e invisibilidade de `SUPER_ADMIN` são esclarecimentos deste documento para a 1.4.
2. `docs/02` §4.5 menciona “Fellipe…” como narrativa; este documento fixa Felipe como `ADMIN` comum.
3. Nomenclatura `tenant_user`/`admin`/`superadmin` vs enum de código — mapeamento já documentado; manter ambos coerentes.

---

## 14. Implicações para a Fase 1.4

A 1.4 deverá:

1. Separar UX **Administradores da Plataforma** × **Usuários da Empresa**.
2. Implementar filtros e guards server-side: `ADMIN` não gerencia `SUPER_ADMIN`.
3. Validar role no backend em create/update (rejeitar `SUPER_ADMIN` criado por `ADMIN`).
4. Preservar invariantes de `tenantId`.
5. **Preservar ≥ 1 ADMIN operacional ativo** (§5); `SUPER_ADMIN` não conta; checagem atômica com a mutação.
6. Definir quais `UserStatus` entram na contagem de ADMIN ativo (sem inventar enum novo).
7. Não introduzir papéis extras nem flags de “fundador”.
8. Não iniciar modo suporte (1.5) sob o pretexto de usuários.
9. Testar isolamento: `ADMIN` A não obtém dados de `SUPER_ADMIN` via API comum; último ADMIN não pode ser removido/desativado/convertido.

---

## 15. Fora de escopo deste documento

- Implementação de CRUD de usuários;
- migration de schema de papéis (desnecessária para esta decisão);
- alteração do WIP 1.3F;
- impersonation / modo suporte;
- permissões internas entre USERs da mesma empresa (permanece USER-002 no MVP).

---

## 16. Referências

- `docs/adr/ADR-047-role-hierarchy-platform-tenant.md`
- `docs/09.7-autenticacao.md` §3.3
- `docs/09.9-multiempresa.md` §3.7
- `docs/13-arquitetura-empresas-workspace.md` §10
- `docs/14-arquitetura-branding-tenant.md` (branding por role)
- PRD §5.3, §5.12, §5.13
