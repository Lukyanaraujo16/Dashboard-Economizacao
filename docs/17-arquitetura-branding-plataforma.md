# Dashboard Economização

# 17 — Arquitetura de Branding da Plataforma

**Status:** Ativo  
**Projeto:** Dashboard Economização  
**Tipo:** Documento arquitetural de referência  
**Fase:** 1.5A — Arquitetura (somente documentação)  
**ADR vinculada:** `docs/adr/ADR-049-platform-branding-architecture.md`  
**Documentos obrigatórios de leitura conjunta:** `docs/14-arquitetura-branding-tenant.md`, `docs/adr/ADR-046-tenant-branding-persistence.md`, `docs/adr/ADR-042-theming-dark-mode-branding.md`, `docs/adr/ADR-043-design-system-freeze.md`, `docs/adr/ADR-044-login-experience-freeze.md`, `docs/03-modelagem-banco.md` (§4), `docs/10-plano-de-execucao.md`, `docs/12-design-system.md`, `docs/15-arquitetura-papeis-e-usuarios.md`

**Fora de escopo deste documento:** implementação, migrations, endpoints, telas, upload, alteração de schema, alteração do Design System ou da Login Experience Freeze.

---

## 1. Objetivo

Definir formalmente a arquitetura de **Branding da Plataforma** (identidade visual Economização) como **primeiro nível visual** do sistema.

Este documento:

- complementa `docs/14` (Branding por Empresa/Tenant) sem substituí-lo;
- formaliza a separação **Platform Branding ≠ Tenant Branding**;
- registra hierarquia, contratos de Login / pós-login, persistência futura, storage, API, UI e runtime;
- prepara as subfases **1.5B–1.5E** sem código nesta fase.

---

## 2. Estado auditado (1.5A)

| Item | Valor |
|---|---|
| Branch | `main` |
| HEAD de referência (1.3 concluída) | `bade0b4` (`feat(branding): conclui runtime e arquitetura de personalização`) |
| HEAD observado na auditoria | `ac40dd7` (1.4C domínio+API; working tree pode conter WIP 1.4D–E) |
| Código alterado nesta tarefa | **não** |
| Schema / migration | **não** |
| Commit / push | **nenhum** |

### 2.1 O que a 1.3 entregou (e o que ficou de fora)

| Área | Estado pós-1.3 |
|---|---|
| Theme Engine / `resolveTheme()` | Implementado |
| `ThemeProvider` / `RuntimeThemeProvider` | Implementado |
| `PlatformBrandMark` | Implementado (logo opcional + placeholder Accent) |
| Login Experience | Congelada (ADR-044); só plataforma; sem tenant |
| `GET /branding/current` | Implementado: USER → tenant; ADMIN/SUPER_ADMIN → resposta `scope: platform` **hardcoded** (“Economização”, sem logo/cores persistidas) |
| `tenant_branding` + logo + API/UI Aparência | Implementado |
| `FileStorage` (filesystem local) | Implementado |
| Tabela / domínio `platform_branding` | **Não implementado** |
| Persistência de logo/cores da plataforma | **Não implementado** (Theme Default em código) |
| Favicon / manifest dinâmicos | **Não implementado** |

**Conclusão da auditoria:** Platform Branding hoje é **Theme Default + nome hardcoded**. A 1.5 formaliza persistência e gestão administrativa dessa identidade, sem reabrir o branding de tenant.

---

## 3. Definição — Platform Branding

**Platform Branding** é a identidade visual **global** da aplicação Economização.

Controla:

| Capacidade | Responsabilidade |
|---|---|
| Nome da plataforma | Sim |
| Logo principal | Sim |
| Ícone / mark | Planejado (MVP: logo; futuro: mark dedicado) |
| Favicon | Planejado (MVP documentado; runtime em 1.5E) |
| Cores institucionais allowlisted | Sim (`primary`, `onPrimary`, `secondary`, `accent`) |
| Branding da tela de **login** | Sim — exclusiva |
| Branding pós-login de **ADMIN** / **SUPER_ADMIN** | Sim |
| Fallback global (USER sem tenant branding / falha) | Sim |
| Branding do **tenant** | **Nunca** |

**Não é:**

- editor do Design System (spacing, radius, tipografia, tokens protegidos);
- substituto de `TenantBranding`;
- metadata bag / settings genérico;
- white-label por hostname no login (fora de escopo, ADR-044).

---

## 4. Hierarquia oficial

### 4.1 Camadas do sistema (ordem estrutural)

```
① Platform Branding     ← identidade global Economização (persistida, 1.5B+)
        ↓
② Tenant Branding       ← overrides por empresa (já 1.3; só contexto USER)
        ↓
③ Theme Default         ← tokens compilados light/dark (código; rede de segurança)
```

- **①** é o primeiro nível visual do produto (login, admin, fallback).
- **②** só entra no pós-login de `USER` (e, no futuro, modo suporte 1.6 — fora desta fase).
- **③** nunca some: completa tokens ausentes e cobre ausência total de ①/②.

### 4.2 Prioridade de resolução — Login (pré-auth)

```
Platform Branding (nome, logo, cores)
  → campos ausentes / registro inexistente
    → Theme Default (código)
```

**Tenant Branding: proibido.**

### 4.3 Prioridade de resolução — Pós-login ADMIN / SUPER_ADMIN

```
Platform Branding
  → Theme Default
```

**Tenant Branding: proibido** (sem exceções nesta arquitetura; modo suporte = 1.6).

### 4.4 Prioridade de resolução — Pós-login USER

```
Tenant Branding (logo / cores / nome cadastral displayName)
  → Platform Branding (fallback global)
    → Theme Default
```

### 4.5 Merge de cores (por token allowlisted)

Para cada scheme (`light` | `dark`) e token (`primary` | `onPrimary` | `secondary` | `accent`):

```
valor no nível ativo da resolução
  → senão próximo nível da cadeia do contexto
    → senão Theme Default do scheme
```

Tokens protegidos (`success`, `danger`, `warning`, `info`, `focus`, fundos estruturais, etc.) **nunca** vêm de Platform nem Tenant Branding (ADR-042 / ADR-046).

---

## 5. Login — contrato oficial

| Regra | Decisão |
|---|---|
| Fonte visual | **Somente** Platform Branding (+ Theme Default) |
| Tenant Branding | **Jamais** |
| Resolução por subdomínio / slug | **Fora de escopo** |
| Login Experience Freeze (ADR-044) | Mantido — integração de logo/cores oficiais **sem redesenho** |
| Endpoint autenticado `/branding/current` | **Não** é chamado no login |

Fundamentação: ADR-042 (“login usa branding da plataforma”), ADR-044, PRD UX-001 / BRAND-002, `docs/14` §5.1.

Wiring futuro (1.5E):

- Login lê Platform Branding público ou embutido no bootstrap da rota `/login` (detalhe de 1.5C/E);
- `PlatformBrandMark` recebe `logoUrl` da plataforma quando existir;
- preferência Light/Dark local na login **não** implica branding de tenant.

---

## 6. Pós-login — contrato oficial

| Papel | Branding |
|---|---|
| `ADMIN` | Platform Branding |
| `SUPER_ADMIN` | Platform Branding |
| `USER` | Tenant Branding → Platform Branding → Theme Default |

**Sem exceções** nesta fase.

`GET /branding/current` (já 1.3F) permanece o contrato de runtime autenticado:

- hoje ADMIN/SUPER_ADMIN → resposta plataforma **estática**;
- após 1.5B–E → resposta plataforma **persistida** (mesmo `scope: 'platform'`).

---

## 7. Relação com Theme Engine

Fluxo inalterado:

```
Design System
  + Theme Preference (light | dark | system)
  + BrandingInput normalizado (platform ou tenant mapeado para o mesmo shape de runtime)
        ↓
resolveTheme()
        ↓
ResolvedTheme → CSS variables + logoUrl + brandName
```

Implementação de referência (não alterar nesta fase):

- `frontend/src/theme/resolver/resolve-theme.ts`
- `frontend/src/theme/branding/normalize-branding.ts`
- `frontend/src/theme/provider/theme-provider.tsx`
- `frontend/src/theme/provider/runtime-theme-provider.tsx`
- `frontend/src/login/platform-brand-mark.tsx`

**Decisão:** reutilizar o shape de overrides já consumido pelo Theme Engine (`name` / `logoUrl` / `light` / `dark` com tokens allowlisted). Platform Branding **não** exige um segundo resolver.

---

## 8. Persistência futura (1.5B)

### 8.1 Opções avaliadas

| Opção | Veredito |
|---|---|
| A) Tabela própria `platform_branding` (singleton) | **Recomendada** |
| B) Reutilizar `tenant_branding` com `tenant_id` nulo | **Rejeitada** — mistura contextos e regras de isolamento |
| C) Settings / metadata JSON genérico | **Rejeitada** — metadata bag |
| D) Hardcode permanente (só Theme Default) | **Rejeitada** — impede gestão administrativa |

### 8.2 Modelo recomendado

```
PlatformBranding (0..1 por ambiente — singleton lógico)
        │
        ├── logo_file_id     → files (asset global)
        └── favicon_file_id  → files (asset global; MVP opcional)
```

**Tabela `platform_branding` (conceitual):**

| Campo | Tipo | Notas |
|---|---|---|
| `id` | UUID PK | |
| `name` | text | Nome exibido da plataforma (default “Economização”) |
| `logo_file_id` | UUID FK nullable | → `files.id` (asset global) |
| `favicon_file_id` | UUID FK nullable | → `files.id`; pode ficar null no MVP de persistência e entrar no runtime 1.5E |
| `light_colors` | JSONB nullable | Partial allowlisted: `primary`, `onPrimary`, `secondary`, `accent` |
| `dark_colors` | JSONB nullable | Idem |
| `created_at` / `updated_at` | timestamptz | `updated_at` para cache/ETag |

**Ausência de registro** = Theme Default (comportamento atual).

**Não** criar segunda linha “ativa” por ambiente: garantir singleton por constraint de aplicação (e, se necessário, tabela com no máximo uma linha / flag `is_active` única). Preferência: **uma linha** criada na primeira escrita administrativa.

### 8.3 Campos MVP

| Campo | MVP 1.5 | Notas |
|---|---|---|
| `name` | **sim** | Nome da plataforma |
| logo | **sim** | Via `logo_file_id` + `FileStorage` |
| favicon | **sim** (persistência) / wiring runtime em 1.5E | Via `favicon_file_id` |
| `primary` | **sim** | Por scheme |
| `onPrimary` | **sim** | Por scheme; derivável se omitido (mesma política 1.3) |
| `secondary` | **sim** (opcional) | Por scheme |
| `accent` | **sim** (opcional) | Por scheme |

### 8.4 Extensão de `files` (necessária na 1.5B)

Hoje `StoredFile.tenantId` é **obrigatório** e `StoredFileType` só tem `TENANT_LOGO`.

Para assets de plataforma:

| Mudança | Motivo |
|---|---|
| `tenant_id` **nullable** | `null` = asset global da plataforma (`docs/03` §4.3) |
| Enum: `PLATFORM_LOGO`, `PLATFORM_FAVICON` | Distinguir tipo e política de acesso |
| Isolamento | Arquivos com `tenant_id` setado **nunca** referenciados por `platform_branding` |

Não duplicar abstração de storage.

### 8.5 Alinhamento com `docs/03`

`docs/03` §4.1 lista campos legados (`button_color`, `background_color`, …). **Prevalece** o contrato semântico do Theme Engine (como em ADR-046):

| Legado docs/03 | MVP Platform Branding |
|---|---|
| cor principal / botões | `primary` / `onPrimary` |
| secundária / destaque | `secondary` / `accent` |
| fundo / texto global | **fora do MVP** (protegidos no DS) |

---

## 9. Futuro (pós-MVP)

Documentar, **não** implementar na 1.5:

| Capacidade | Uso |
|---|---|
| Logos light / dark separados | Contraste real por scheme |
| Mark / símbolo dedicado | Sidebar compacta, mobile |
| Logos responsivas (srcset / variantes) | Densidade de tela |
| Ícones de produto adicionais | App chrome |
| Open Graph image | Compartilhamento social |
| Apple Touch Icon | iOS home screen |
| Web App Manifest (`theme_color`, ícones) | PWA / instalabilidade |

MVP entrega o mínimo para login + shell + favicon; o restante evolui sem mudar a hierarquia.

---

## 10. Arquitetura de módulos (futura)

### 10.1 Backend

| Componente | Responsabilidade |
|---|---|
| `PlatformBrandingRepository` | CRUD singleton; leitura para runtime |
| `PlatformBrandingService` / `AdminPlatformBrandingService` | Validação de cores, upload/remoção de logo/favicon, auditoria |
| Integração `CurrentBrandingService` | ADMIN/SUPER_ADMIN e fallback USER leem plataforma persistida |
| `FileStorage` (existente) | Bytes; sem adapter novo |

### 10.2 Frontend

| Componente | Responsabilidade |
|---|---|
| Service admin Platform Branding | Cliente HTTP `/admin/platform/branding` |
| UI Configurações → Branding da Plataforma | 1.5D |
| `RuntimeThemeProvider` / login bootstrap | Consome plataforma (1.5E) |
| Favicon / título / BrandMark | Aplicam `name` + `logoUrl` + favicon URL |

Não criar Theme Engine paralelo.

### 10.3 Cache / fallback

| Camada | Estratégia |
|---|---|
| Server | Cache em memória TTL curto (ex.: 60s) da linha singleton; bust em `updated_at` após PATCH/upload |
| HTTP | `ETag` / `updatedAt`; `Cache-Control: private` no admin; runtime autenticado alinhado a 1.3F |
| Client | Estado no provider; limpar no logout |
| Falha de fetch | Theme Default; UI utilizável |
| Logo/storage indisponível | `logoUrl: null` → placeholder `PlatformBrandMark`; cores persistidas ainda aplicam |

---

## 11. Storage

**Reutilizar** `FileStorage` da 1.3 (`put` / `get` / `delete`).

| Regra | Valor |
|---|---|
| Adapter MVP | Filesystem local (já existente) |
| Evolução | S3-compatible sem mudar `storage_key` |
| Upload | Browser → backend → validação → storage → FK (mesmo padrão tenant) |
| MIME logo | `image/png`, `image/jpeg`, `image/webp` |
| Tamanho | 2 MB (alinhado a tenant) |
| SVG | Deferido (mesma política 1.3) |
| Substituição | Persistir novo → best-effort delete do anterior |
| Bytes no banco | Proibido |

---

## 12. API futura (1.5C)

Prefixo dedicado — **não** sob `/admin/tenants`:

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/admin/platform/branding` | Lê config + URLs derivadas |
| `PATCH` | `/admin/platform/branding` | Atualiza `name` e/ou cores (parcial) |
| `POST` | `/admin/platform/branding/logo` | Upload multipart do logo |
| `DELETE` | `/admin/platform/branding/logo` | Remove logo → Theme Default / placeholder |
| `POST` | `/admin/platform/branding/favicon` | Upload favicon (se no escopo da 1.5C) |
| `DELETE` | `/admin/platform/branding/favicon` | Remove favicon |

**Autorização:** `ADMIN` | `SUPER_ADMIN` (mesmo guard de plataforma; USER → 403).

**DTO público sugerido:**

```typescript
type PublicPlatformBranding = {
  name: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  light: Partial<AllowedBrandingColors> | null;
  dark: Partial<AllowedBrandingColors> | null;
  updatedAt: string | null;
};
```

Validação de cores: mesma allowlist e contraste WCAG AA de pares críticos da 1.3.

**Runtime autenticado:** continuar em `GET /branding/current` (sem inflar `/auth/me`).

**Login:** endpoint público mínimo **opcional** (`GET /branding/platform` ou embed no SSR da login) — decidir na 1.5C/E; requisito: **nunca** expor dados de tenant.

---

## 13. UI futura (1.5D)

```
Configurações
 └── Branding da Plataforma
```

- rota sugerida: `/configuracoes/branding` (ou equivalente sob área de plataforma);
- conteúdo: nome, upload/remoção de logo, upload/remoção de favicon, cores Light/Dark, preview, reset para Theme Default;
- **não** misturar com hub `/empresas/.../aparencia`;
- **não** implementar nesta fase.

Sidebar: item visível apenas para `ADMIN` / `SUPER_ADMIN`.

---

## 14. Runtime futuro (1.5E)

| Superfície | Comportamento |
|---|---|
| `/login` | Nome + logo + cores da Platform Branding; Freeze ADR-044 intacto |
| Header / Shell | `PlatformBrandMark` + nome resolvido (ADMIN/SUPER_ADMIN) |
| Favicon | `<link rel="icon">` dinâmico quando `faviconUrl` existir |
| Título do documento | Inclui nome da plataforma |
| Manifest | Opcional / futuro se PWA entrar no escopo |
| `GET /branding/current` | `scope: 'platform'` lê persistência; USER mantém tenant + fallback plataforma |

---

## 15. Segurança e isolamento

- Platform Branding **não** altera autorização;
- assets de plataforma (`tenant_id = null`) **não** são servidos como branding de tenant;
- assets de tenant **nunca** alimentam login ou shell de ADMIN;
- fallback **nunca** cruza tenants;
- mutações administrativas geram auditoria (PRD LOG-004);
- validação de MIME/tamanho/contraste no backend (frontend espelha).

---

## 16. Escopo da Fase 1.5 — subfases

| Subfase | Conteúdo | Entregável |
|---|---|---|
| **1.5A** | Arquitetura | Este documento + ADR-049 |
| **1.5B** | Persistência | Prisma `platform_branding`; `files` com assets globais; repositório/domínio |
| **1.5C** | API | Rotas `/admin/platform/branding*`; integração leitura em `/branding/current` |
| **1.5D** | UI administrativa | Configurações → Branding da Plataforma |
| **1.5E** | Runtime | Login, shell, favicon, título, BrandMark |

Dependências: 1.5B → 1.5C → 1.5D/E; storage já existe (reuso).

**Fora desta fase:** Modo Suporte (1.6), Open Graph, PWA completa, logos light/dark separados.

---

## 17. Mapa de código existente (referência — não alterar em 1.5A)

| Área | Caminho |
|---|---|
| Theme Engine | `frontend/src/theme/**` |
| Login / BrandMark | `frontend/src/login/**` |
| Runtime branding | `frontend/src/theme/provider/runtime-theme-provider.tsx` |
| `GET /branding/current` | `backend/src/modules/branding/http/current-branding.routes.ts` |
| Resposta plataforma estática | `toPlatformCurrentBrandingResponse()` |
| Tenant branding admin | `backend/src/modules/branding/**` |
| FileStorage | `backend/src/infrastructure/storage/**` |
| Schema tenant | `prisma/schema.prisma` (`TenantBranding`, `StoredFile`) |
| Theme Default | `frontend/src/theme/light/colors.ts`, `.../dark/colors.ts` |

---

## 18. Diretriz final

> Platform Branding é a identidade Economização gerida e persistida — primeiro nível visual do sistema. Tenant Branding continua sendo overrides por empresa. Theme Default permanece a rede de segurança em código. Login usa somente a plataforma. ADMIN e SUPER_ADMIN usam somente a plataforma. USER usa tenant com fallback na plataforma. Sem misturar tabelas, sem settings bag, sem reutilizar `TenantBranding`.

Implementação inicia na **1.5B**, obedecendo ADR-049 e este documento.
