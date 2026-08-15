# Arquitetura de Usuários — Fase 1.4

**Status:** ACEITA (1.4A)  
**Data:** 2026-08-15  
**ADR vinculada:** `docs/adr/ADR-048-user-management-architecture.md`  
**Pré-requisitos de papéis:** `docs/15-arquitetura-papeis-e-usuarios.md`, ADR-047  
**Documentos de leitura conjunta:** `docs/01-prd.md` (§5.3 USER, §5.12 ADMIN), `docs/09.7-autenticacao.md`, `docs/09.8-seguranca.md`, `docs/09.9-multiempresa.md`, `docs/03-modelagem-banco.md` (§3.2–3.4), `docs/10-plano-de-execucao.md`, `docs/13-arquitetura-empresas-workspace.md`

---

## 1. Objetivo

Definir a arquitetura completa da **Fase 1.4 — Usuários** antes de qualquer implementação:

- gestão de administradores da plataforma (`ADMIN`);
- gestão de usuários das empresas (`USER`);
- autenticação / lifecycle / isolamento / governança;
- subfases de execução (1.4B–1.4E).

Este documento **não** altera código, Prisma, APIs ou UI.

---

## 2. Papéis (herdados e congelados)

| Papel | Escopo | `tenantId` | Produto |
|---|---|---|---|
| `SUPER_ADMIN` | Global técnico | `null` | Dev / responsável técnico; oculto para `ADMIN` |
| `ADMIN` | Global operacional | `null` | Felipe, sócios, equipe Economização — todos iguais |
| `USER` | Tenant | **obrigatório** | Usuário de uma empresa cliente |

**Proibido:** `OWNER`, `PRIMARY_ADMIN`, `FELIPE_ADMIN`, `ADMIN_MASTER` ou equivalente.

Detalhes e proteção do último ADMIN: `docs/15` + ADR-047.

---

## 3. Persistência existente (baseline)

Já existem (não reinventar na arquitetura):

| Artefato | Uso |
|---|---|
| `User` | Identidade: `name`, `email`, `role`, `status`, `tenantId?`, lockout, timestamps |
| `UserCredential` | Hash de senha 1:1 (`passwordHash`); usuário `PENDING` pode existir sem credencial |
| `UserRole` | `USER` \| `ADMIN` \| `SUPER_ADMIN` |
| `UserStatus` | `PENDING` \| `ACTIVE` \| `BLOCKED` \| `DISABLED` |

Modelagem documental adicional (`docs/03`): `password_reset_tokens` — prevista; implementação fica para subfase de persistência/API conforme necessidade.

**Decisão:** uma única tabela `User` com `role` + `tenantId`. A UX separa dois contextos; o domínio não duplica entidades “Admin” e “TenantUser”.

---

## 4. Dois contextos de gestão (obrigatório)

### 4.1 Área A — Administradores da Plataforma

- **Gerencia apenas** `role = ADMIN`.
- Rotas/UI sob administração global (ex.: `/administradores` ou equivalente).
- Lista, CRUD e contadores **nunca** incluem `SUPER_ADMIN`.

### 4.2 Área B — Usuários da Empresa

- **Gerencia apenas** `role = USER` do `tenantId` da empresa em contexto.
- UI sob hub da empresa (junto a Geral / Aparência).
- Sempre escopado a um tenant explícito nas rotas `/admin/tenants/:tenantId/...`.

**Regra:** jamais misturar as duas listas numa única grade sem diferenciação de contexto.

---

## 5. CRUD futuro (responsabilidades)

Tudo abaixo é **arquitetural**; HTTP, payloads e telas vêm nas subfases 1.4C–1.4E.

### 5.1 Administradores (`ADMIN`)

| Operação | Notas |
|---|---|
| Listar | Somente `ADMIN`; filtros por status/nome/e-mail |
| Criar | `role` fixo `ADMIN`; `tenantId = null`; senha inicial ou convite/`PENDING` |
| Editar | Dados cadastrais (nome, e-mail conforme política); auto-edição cadastral permitida |
| Bloquear | `BLOCKED` (temporário ou administrativo) |
| Desativar | `DISABLED` (+ coerência com `deactivatedAt` se adotada na 1.4B) |
| Excluir | Política futura; só se invariante do último ADMIN for preservada |

Toda mutação que remova capacidade operacional de um `ADMIN` passa pela **proteção do último ADMIN** (`docs/15` §5) com atomicidade.

### 5.2 Usuários de empresa (`USER`)

| Operação | Notas |
|---|---|
| Listar | Somente `USER` do tenant; isolamento absoluto |
| Criar | `tenantId` da empresa; `role = USER` |
| Editar | Dados cadastrais do usuário daquele tenant |
| Bloquear | `BLOCKED` |
| Desativar | `DISABLED` (USER-004); não é exclusão |
| Redefinir senha | Fluxo admin-initiated e/ou self-service (ver §11) |
| Excluir | Remoção permanente sob política da 1.4 (dependências, auditoria) |

---

## 6. Regras de criação

| Ator | Pode criar `ADMIN` | Pode criar `USER` | Pode criar `SUPER_ADMIN` |
|---|---|---|---|
| `SUPER_ADMIN` | Sim | Sim | Somente fluxo técnico (seed/ops), fora da gestão comum |
| `ADMIN` | Sim | Sim (vinculado a empresa) | **Nunca** |
| `USER` | Não | Não | Não |

Role no payload do cliente **nunca** é confiável sem validação server-side (ADR-047).

---

## 7. Visibilidade

### 7.1 Para `ADMIN`

`ADMIN` **nunca** vê `SUPER_ADMIN` em:

- listagens administrativas comuns;
- detalhe / edição;
- contadores (“N administradores”);
- auditoria **operacional** da gestão de usuários (feed que o ADMIN consome).

Tentativas de acesso direto por ID a um `SUPER_ADMIN` → rejeitar com política de não enumeração (`403`/`404` conforme `docs/09.6` / `docs/09.10`).

### 7.2 Para `SUPER_ADMIN`

`SUPER_ADMIN` pode ver e operar sobre `ADMIN` e `USER` nos mesmos fluxos administrativos (e fluxos técnicos próprios quando existirem).

### 7.3 Auditoria técnica

Ações de `SUPER_ADMIN` permanecem **rastreáveis** no sistema (logs/auditoria interna). Isso **não** implica expor identidades `SUPER_ADMIN` na UI operacional de `ADMIN`.

---

## 8. Isolamento e `tenantId`

| Papel | `tenantId` |
|---|---|
| `USER` | Exatamente um tenant; obrigatório |
| `ADMIN` | Sempre `null` |
| `SUPER_ADMIN` | Sempre `null` |

- Rotas de usuários de empresa: `tenantId` vem do path/contexto administrativo validado, **não** do body do cliente como fonte de verdade.
- `USER` nunca lista/altera usuários de outro tenant.
- `ADMIN`/`SUPER_ADMIN` não “pertencem” a empresa; operam sobre empresa por rotas `/admin/tenants/:tenantId/...`.

Referência normativa: `docs/09.9-multiempresa.md`.

---

## 9. Ciclo de vida — `UserStatus` (enum existente)

**Não criar enum novo.** Usar: `PENDING` | `ACTIVE` | `BLOCKED` | `DISABLED`.

| Status | Significado de produto (1.4) | Autenticação / sessão |
|---|---|---|
| `PENDING` | Conta criada, ainda não apta ao uso normal (ex.: senha não configurada / convite) | **Não** autentica |
| `ACTIVE` | Conta utilizável | **Autentica** (se credencial válida e demais regras) |
| `BLOCKED` | Bloqueio (admin ou lockout); pode incluir `lockedUntil` já existente | **Não** autentica enquanto bloqueado (recovery de lockout temporário segue auth atual) |
| `DISABLED` | Desativado administrativamente; dados preservados | **Não** autentica; sessões devem ser invalidadas |

Regras herdadas (`docs/09.7` §3.11):

- desativar ≠ excluir;
- desativação deve ter efeito prático sem depender só da expiração natural da sessão;
- `USER` de tenant `DISABLED` não obtém contexto utilizável (TENANT-003).

### 9.1 “ADMIN operacional ativo” (invariante)

Para a regra “≥ 1 ADMIN operacional ativo” (`docs/15` §5):

> Conta como **ADMIN operacional ativo** somente: `role = ADMIN` **e** `status = ACTIVE`.

Não contam: `SUPER_ADMIN`; `ADMIN` em `PENDING` / `BLOCKED` / `DISABLED`; qualquer `USER`.

Mutações (disable / block / delete / change role) que deixariam a contagem em zero → rejeitadas no backend, com checagem **atômica** junto à mutação.

---

## 10. Autenticação e senhas

Continuidade com a fundação 1.1 / `docs/09.7`:

- login por e-mail + senha;
- sessão server-side (Redis + cookie HttpOnly);
- hashing **Argon2id** (já adotado); **nunca** plaintext; **nunca** criptografia reversível;
- senha / hash / salt / tokens nunca em resposta, log ou auditoria;
- alteração ou redefinição de senha **invalida sessões** ativas do usuário;
- comprimento mínimo ≥ 10; validação no backend.

Criação de usuário pode:

- definir senha inicial (hash imediato + `ACTIVE` ou fluxo equivalente), **ou**
- criar `PENDING` sem credencial e completar via convite/primeiro acesso / reset.

Escolha operacional detalhada fica para 1.4B/1.4C; a arquitetura exige apenas conformidade com `docs/09.7`.

---

## 11. Reset de senha (arquitetura futura)

Alinhado a `docs/09.7` §3.10 e modelagem `password_reset_tokens` (`docs/03`):

1. **Solicitação** (público ou admin-initiated) → resposta sempre equivalente (anti-enumeração no fluxo público).
2. **Token** temporário, aleatório, uso único, vinculado ao usuário.
3. **Expiração** curta; token usado/expirado/inválido não redefine.
4. Armazenamento do token de forma que vazamento da base não permita uso direto (hash do token).
5. **Nova senha** → hash Argon2id; invalidação de sessões; auditoria.
6. Rate limit (`docs/09.8`).

Canal de entrega da mensagem: decisão pendente já registrada em `docs/09.7` (não bloquear desenho da API).

**Admin “redefinir senha”** (Área B / A): pode ser (a) disparo do mesmo fluxo de token, ou (b) definição de senha temporária com troca obrigatória — detalhe de 1.4C; ambos devem invalidar sessões e auditar.

---

## 12. Auditoria (eventos)

Registrar eventos relevantes (storage/formato = fase futura / `docs/09.11`):

Exemplos mínimos:

- `ADMIN` criado / editado / bloqueado / desbloqueado / desativado / excluído;
- `USER` criado / editado / bloqueado / desbloqueado / desativado / excluído;
- senha redefinida (self ou admin);
- tentativa rejeitada por último ADMIN;
- tentativa rejeitada de `ADMIN` criar/ver `SUPER_ADMIN`.

Payload de auditoria: ator real, alvo, tenant (quando aplicável), resultado — **sem** segredos.

---

## 13. Permissões

- **Role** permanece o mecanismo principal de autorização no MVP da 1.4.
- **Não** introduzir RBAC granular (matriz de permissões por ação) nesta fase.
- Permissões finas (ex.: “só leitura de usuários”) ficam para fase futura explícita.
- Frontend (`RequirePlatformRole`, menus) é UX; autorização real é sempre backend.

---

## 14. UI futura (planejamento — sem telas nesta subfase)

### 14.1 Administração da plataforma

```
Administração
├── Empresas          (já existe)
├── Administradores   (Área A — somente ADMIN)
└── …                 (módulos futuros)
```

### 14.2 Hub da empresa

```
Empresa /:companyId
├── Geral             (já existe)
├── Aparência         (já existe)
├── Usuários          (Área B — somente USER daquele tenant)
└── …                 (integrações, etc.)
```

Navegação: `ADMIN` e `SUPER_ADMIN` veem Administração; `USER` não. Diferença cotidiana SUPER_ADMIN × ADMIN continua discreta; ocultação de SUPER_ADMIN é na **gestão de administradores**, não necessariamente em menus globais.

---

## 15. API (diretrizes para 1.4C)

Conceitual — não implementar agora:

| Contexto | Prefixo sugerido | Guard |
|---|---|---|
| Administradores | `/admin/administrators` (ou `/admin/users?scope=platform`) | Plataforma; filtro `role=ADMIN` para ator `ADMIN` |
| Usuários da empresa | `/admin/tenants/:tenantId/users` | Plataforma + tenant existe |

Regras transversais:

- `requireAuthentication` + `requirePlatformRole` para mutações administrativas;
- rejeitar `role=SUPER_ADMIN` em create/update por `ADMIN`;
- invariante último ADMIN em toda mutação que afete contagem ACTIVE;
- DTOs públicos sem `passwordHash`, tokens, storage keys;
- não inflar `/auth/me` com listas de usuários.

---

## 16. Divisão da Fase 1.4

| Subfase | Conteúdo | Entregável |
|---|---|---|
| **1.4A** | Arquitetura | Este documento + ADR-048 |
| **1.4B** | Persistência / domínio | Repositórios, invariantes de status, tokens de reset se necessários, testes de domínio — **sem** UI |
| **1.4C** | API | Rotas admin de ADMIN e USER; guards; últimos ADMIN; testes HTTP |
| **1.4D** | UI | Telas Administradores + Usuários da empresa |
| **1.4E** | Fluxo completo | Integração ponta a ponta, polish, gates, encerramento da 1.4 |

Dependências: 1.4A → 1.4B → 1.4C → 1.4D → 1.4E.  
Fora de escopo da 1.4: modo suporte (1.5), RBAC granular, OAuth Conta Azul.

---

## 17. Fora de escopo desta subfase (1.4A)

- Qualquer alteração de código, Prisma, migration, frontend ou backend;
- endpoints, seeds ou telas;
- implementação da proteção do último ADMIN (apenas arquitetura);
- commit / push.

---

## 18. Referências

- `docs/adr/ADR-048-user-management-architecture.md`
- `docs/15-arquitetura-papeis-e-usuarios.md` / ADR-047
- `docs/09.7-autenticacao.md`
- `docs/09.9-multiempresa.md`
- `docs/03-modelagem-banco.md` §3.2–3.4
- PRD §5.3, §5.12
