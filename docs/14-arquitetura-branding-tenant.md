# Dashboard Economização

# 14 — Arquitetura de Branding por Empresa (Tenant)

**Status:** Ativo  
**Projeto:** Dashboard Economização  
**Tipo:** Documento arquitetural de referência  
**Fase:** 1.3A — Arquitetura (somente documentação)  
**ADR vinculada:** `docs/adr/ADR-046-tenant-branding-persistence.md`  
**Documentos obrigatórios de leitura conjunta:** `docs/01-prd.md` (§5.4 BRAND), `docs/03-modelagem-banco.md` (§4), `docs/09.4-frontend.md` (§4.14), `docs/09.8-seguranca.md` (§3.6, §3.12), `docs/10-plano-de-execucao.md`, `docs/12-design-system.md`, `docs/13-arquitetura-empresas-workspace.md`, `docs/adr/ADR-042-theming-dark-mode-branding.md`, `docs/adr/ADR-043-design-system-freeze.md`, `docs/adr/ADR-044-login-experience-freeze.md`, `docs/adr/ADR-045-tenant-workspace-context.md`

**Fora de escopo deste documento:** implementação, migrations, endpoints, telas, upload, storage instalado, alteração do Design System ou da Login Experience.

---

## 1. Objetivo

Definir formalmente a arquitetura de **Branding real por Empresa/Tenant** antes de persistência, upload ou UI administrativa.

Este documento consolida:

- estado atual do Theme Engine e da UI;
- separação **Plataforma vs Tenant**;
- contrato Login vs pós-login;
- modelo de persistência recomendado;
- campos MVP vs futuro;
- política de cores, assets, storage, upload e exclusão;
- API futura, resolução no frontend, cache e acessibilidade;
- divisão incremental da Fase 1.3.

---

## 2. Estado inicial verificado (1.3A)

| Item | Valor |
|---|---|
| Branch | `main` |
| HEAD | `b04fb3c` |
| Working tree | limpa |
| Código alterado nesta tarefa | não |
| Commit / push | nenhum |

---

## 3. Branding atual — como funciona hoje

### 3.1 Fluxo oficial (implementado no Theme Engine)

```
Design System (tokens estruturais, componentes, a11y)
        +
Theme Preference (light | dark | system → scheme resolvido)
        +
Tenant Branding (TenantBrandingInput normalizado)
        ↓
resolveTheme()
        ↓
ResolvedTheme (CSS variables + logoUrl + brandName)
        ↓
Componentes (via tokens semânticos)
```

Implementação de referência:

- `frontend/src/theme/resolver/resolve-theme.ts`
- `frontend/src/theme/branding/normalize-branding.ts`
- `frontend/src/theme/provider/theme-provider.tsx`

Regra central: **spacing, radius, duration, z-index, opacity nunca vêm do branding.**

### 3.2 Tipos atuais

```typescript
// frontend/src/theme/types/theme.ts
type TenantBrandingInput = {
  name?: string | null;
  logoUrl?: string | null;
  light?: Partial<ColorTokens>;
  dark?: Partial<ColorTokens>;
};
```

Tokens de cor **permitidos** ao branding (runtime):

- `primary`, `onPrimary`, `secondary`, `accent`

Tokens **protegidos** (ignorados se enviados):

- `success`, `warning`, `danger`, `onDanger`, `info`, `focus`, `disabled`

Definição: `frontend/src/theme/branding/allowed-color-overrides.ts`, `frontend/src/theme/types/colors.ts`.

### 3.3 Mocks atuais

- `frontend/src/theme/branding/mocks/mock-tenant-brandings.ts` — cenários locais (`default`, `azul`, `verde`, `roxo`, `vermelho`);
- preview DEV: `frontend/src/dev/dev-branding-preview.tsx`;
- **sem backend, sem API, sem persistência.**

### 3.4 Runtime resolver

1. `normalizeBrandingInput()` — sanitiza texto, filtra tokens não allowlisted, input vazio → `null`;
2. seleciona base `lightTheme` ou `darkTheme`;
3. aplica overrides do scheme (`branding.light` ou `branding.dark`) via `mergeBrandingColors()`;
4. expõe `logoUrl`, `brandName` e `colors` no `ResolvedTheme`.

Branding parcial **completa** com Theme Default; nunca quebra layout.

### 3.5 `logoUrl` / `brandLogoUrl`

| Contexto | Campo | Comportamento atual |
|---|---|---|
| Theme Engine | `TenantBrandingInput.logoUrl` → `ResolvedTheme.logoUrl` | URL sanitizada; `null` = sem logo de tenant |
| Login Experience | prop `brandLogoUrl` → `PlatformBrandMark.logoUrl` | Default `null`; placeholder Accent (SVG inline) |
| Shell (`AppSidebar`) | `PlatformBrandMark` sem `logoUrl` | Sempre placeholder; texto fixo “Economização” |
| Asset estático plataforma | `frontend/public/brand/economizacao-mark.svg` | Existe; **não wired** automaticamente no runtime |

### 3.6 Fallback da plataforma

- **Cores:** `frontend/src/theme/light/colors.ts` e `frontend/src/theme/dark/colors.ts` (Theme Default Economização);
- **Logo:** placeholder em `PlatformBrandMark` até asset oficial da plataforma ser configurado;
- **Nome:** “Economização” hardcoded no Login e no Shell (não lê `brandName` do tema).

### 3.7 Wiring atual de providers

- `frontend/app/providers.tsx` — `ThemeProvider` **sem** prop `branding` (sempre plataforma);
- Login cria `ThemeProvider` próprio com preferência local Light/Dark, **sem** tenant branding;
- área autenticada usa o provider global — tenant branding **ainda não conectado**.

### 3.8 Backend / Prisma

- `prisma/schema.prisma` — apenas `Tenant` cadastral; **sem** branding;
- `backend/src/modules/tenant/**` — CRUD admin de empresas; **zero** referência a branding.

---

## 4. Plataforma vs Tenant

| Dimensão | Branding de **Plataforma** | Branding de **Tenant** |
|---|---|---|
| Propósito | Identidade Economização; login; fallback global | Identidade da empresa cliente após autenticação |
| Persistência futura | `platform_branding` (+ `files` globais) | `tenant_branding` 1:1 com `tenants` |
| Runtime input | Theme Default (+ overrides de plataforma futuros) | `TenantBrandingInput` por `tenantId` |
| Login (pré-auth) | **Sim** — única fonte permitida | **Não** |
| Shell pós-login USER | Fallback se tenant sem config | **Sim** — primary source |
| Shell pós-login ADMIN/SUPER_ADMIN | **Sim** — `tenantId === null` | **Não** (até modo suporte 1.5) |
| Alteração | SUPER_ADMIN / operação de plataforma (futuro) | ADMIN / SUPER_ADMIN via `/admin/*` |
| Isolamento | Global | Escopado a `tenantId`; nunca vaza entre empresas |

**Regra:** Tenant Branding é camada **limitada de overrides** sobre tokens permitidos — **não** é editor do Design System (ADR-042, ADR-043).

---

## 5. Login vs pós-login — contrato oficial

### 5.1 Login (antes da autenticação)

**Decisão:** usar exclusivamente **branding global da plataforma**.

Fundamentação:

- ADR-042 §Regras: *“login usa branding da plataforma”*;
- ADR-044: Login Experience **congelada** — integração de branding oficial **sem quebrar composição**;
- PRD UX-001 / BRAND-002: identidade da plataforma na entrada;
- **Não existe** requisito documentado de resolução por subdomínio, domínio customizado ou slug na URL de login.

Comportamento:

- `ThemeProvider` na login **sem** `TenantBrandingInput`;
- `PlatformBrandMark` recebe `brandLogoUrl` da **plataforma** quando `platform_branding` existir; até lá, placeholder;
- copy, headline e layout permanecem congelados;
- preferência Light/Dark local na login **não** implica branding de tenant.

**Explicitamente fora de escopo:** white-label por hostname no login (registrar como evolução futura apenas se PRD passar a exigir).

### 5.2 Pós-login

| Papel | `tenantId` | Branding resolvido |
|---|---|---|
| `USER` | obrigatório (sessão) | `tenant_branding` do tenant da sessão → fallback plataforma |
| `ADMIN` | `null` | plataforma |
| `SUPER_ADMIN` | `null` | plataforma |

**Nome exibido no shell:**

- primário: `Tenant.displayName` (já persistido em 1.2);
- `TenantBrandingInput.name` no Theme Engine é **opcional** — se ausente, UI usa `displayName`;
- não duplicar `displayName` em `tenant_branding` no MVP salvo necessidade futura de nome de marca distinto do nome cadastral.

**Modo suporte (1.5):** quando existir, branding do tenant **visualizado** poderá ser aplicado temporariamente; detalhes ficam para a fase 1.5 — nesta arquitetura, registrar apenas que **não** altera a regra default de ADMIN sem suporte.

---

## 6. Modelo de persistência recomendado

### 6.1 Opções avaliadas

| Opção | Prós | Contras | Veredito |
|---|---|---|---|
| **A) Campos em `tenants`** | Query única | Mistura cadastro e visual; migration inchada; upload acoplado | **Rejeitada** |
| **B) Tabela 1:1 `TenantBranding`** | Separação clara; alinha `docs/13` e `docs/03`; evolução independente | JOIN extra | **Recomendada** |
| **C) JSON genérico (`settings`)** | Flexível | Metadata bag; validação fraca; escopo creep | **Rejeitada** |

### 6.2 Decisão (ADR-046)

```
Tenant (1) ── (0..1) TenantBranding
                         │
                         └── logo_file_id → File (0..1)
```

**Tabela `tenant_branding` (conceitual):**

| Campo | Tipo | Notas |
|---|---|---|
| `id` | UUID PK | |
| `tenant_id` | UUID FK UNIQUE | `ON DELETE CASCADE` |
| `logo_file_id` | UUID FK nullable | → `files.id` |
| `light_colors` | JSONB nullable | Partial allowlisted tokens |
| `dark_colors` | JSONB nullable | Partial allowlisted tokens |
| `created_at` / `updated_at` | timestamptz | `updated_at` útil para cache/ETag |

**Ausência de registro** = tenant sem branding customizado (fallback plataforma).

**Mapeamento PRD → Theme Engine:** campos legados de `docs/03` (`button_color`, `highlight_color`, `background_color`, `text_color`) **não** são colunas separadas no MVP. Mapeamento semântico futuro:

| PRD / docs/03 legado | Token Theme Engine MVP |
|---|---|
| cor principal | `primary` |
| cor secundária | `secondary` |
| cor dos botões | `primary` / `onPrimary` |
| cor de destaque | `accent` |
| fundo / textos | **futuro** (tokens estruturais protegidos no MVP) |

### 6.3 Tabela `files` (já prevista em `docs/03`)

Reutilizar modelo conceitual existente:

| Campo | Notas |
|---|---|
| `id` | UUID |
| `tenant_id` | nullable — `null` = asset global da plataforma |
| `file_type` | enum ex.: `TENANT_LOGO`, `PLATFORM_LOGO`, … |
| `storage_key` | identificador opaco na abstração de storage |
| `mime_type`, `size`, `checksum` | validação e auditoria |
| `created_by`, `created_at` | trilha administrativa |

### 6.4 `platform_branding`

Singleton por ambiente (como `docs/03` §4.1). Pode ser entregue na mesma fase 1.3 ou imediatamente após `tenant_branding`. Login e fallback dependem dela para logo/cores oficiais da Economização.

---

## 7. Campos de branding — classificação

| Campo / capacidade | MVP 1.3 | Futuro | Não recomendado |
|---|---|---|---|
| Nome exibido | via `Tenant.displayName` (1.2) | override de marca distinto | — |
| Logo principal | **sim** | — | — |
| Mark / símbolo separado | — | **sim** (sidebar compacta, favicon source) | — |
| Favicon | — | **sim** | — |
| `primary` | **sim** | — | — |
| `onPrimary` | **sim** (auto-derivável) | — | — |
| `secondary` | **sim** (opcional) | — | — |
| `accent` | **sim** (opcional) | — | — |
| Overrides `background` / `surface` / textos | — | avaliar com a11y estrita | livre no MVP |
| Assets Light/Dark separados | — | **sim** | — |
| `radius` | — | improvável | **sim** — quebra DS |
| Tipografia custom | — | improvável | **sim** — quebra DS |
| CSS / JS / HTML livre | — | — | **sim** — proibido |
| Editor completo de DS | — | — | **sim** — proibido |

**Princípio:** Branding de tenant = **camada fina** sobre tokens allowlisted; consistência visual do produto preservada (ADR-042, `docs/12` §25).

---

## 8. Cores — política arquitetural

### 8.1 Escopo MVP

- Admin configura paleta **semântica limitada**, não cores arbitrárias por componente;
- Persistência **por scheme** (`light_colors`, `dark_colors`), alinhada ao Theme Engine;
- UX administrativa pode começar pedindo **cor principal** (+ opcionais secundária/accent) e gerar variantes Dark com validação — persistência continua separada por scheme.

### 8.2 Formato armazenado

- String hexadecimal: `#RRGGBB` (aceitar `#RGB` normalizado para 6 dígitos);
- rejeitar: `rgb()`, `hsl()`, nomes CSS, `url()`, valores com `;`, gradientes.

### 8.3 Validação (backend obrigatório, frontend espelha)

1. regex / parser estrito de hex;
2. token allowlisted apenas;
3. checagem de contraste mínimo para pares críticos (`primary`/`onPrimary`, texto sobre `primary` em botões);
4. se `onPrimary` omitido, **derivar** automaticamente (`#FFFFFF` ou `#141452`) quando contraste falhar;
5. config inválida → rejeitar save **ou** descartar token inválido (preferir rejeitar save com erro claro na UI admin).

### 8.4 Fallback por token

Para cada scheme resolvido:

```
valor em tenant_branding.{scheme}_colors[token]
  → senão Theme Default do scheme
    → senão platform_branding (futuro)
      → tokens seguros do Design System
```

### 8.5 Limites

- tenant **não** controla `success` / `danger` / `warning` / `info` / `focus`;
- tenant **não** controla fundo global no MVP (evita Dark quebrado e texto ilegível);
- combinações que falham WCAG AA em pares obrigatórios são **bloqueadas** no save.

---

## 9. Logos / assets

### 9.1 Semântica MVP

| Asset | MVP | Uso runtime |
|---|---|---|
| Logo principal | **sim** | `ResolvedTheme.logoUrl` → `PlatformBrandMark` / futuro componente de shell |
| Mark / símbolo | futuro | sidebar colapsada, mobile compacto |
| Favicon | futuro | `<link rel="icon">` dinâmico pós-login |

### 9.2 Light / Dark

- **MVP:** um único arquivo de logo por tenant (funciona em ambos os schemes);
- **Futuro:** `logo_light_file_id` / `logo_dark_file_id` ou variantes em `files` — somente se contraste real exigir.

### 9.3 O que o código suporta hoje

- apenas **uma** URL de logo (`logoUrl`);
- componente único `PlatformBrandMark` aceita imagem raster/SVG via `<img src>`;
- sem distinção mark vs logotype no tipo — **não criar** tipos extras no MVP.

---

## 10. Storage — recomendação conceitual

Comparativo (ADR-029 pendente de implementação):

| Estratégia | Deploy VPS | Backup | Escala multi-instância | Segurança | CDN | Veredito |
|---|---|---|---|---|---|---|
| **A) Filesystem local** | simples | volume backup | **ruim** (instâncias divergentes) | médio | manual | **MVP single-node** |
| **B) Object storage S3-compatible** | env vars | nativo | **bom** | alto | sim | **produção / multi-instância** |
| **C) Bytes no banco** | simples | pesado | ruim | médio | não | **rejeitado** |
| **D) URL externa apenas** | n/a | n/a | n/a | baixo | n/a | **rejeitado** (sem validação/isolamento) |

**Recomendação:**

1. Introduzir abstração `FileStorage` (`put`, `getStream`, `delete`, `getPublicUrl`) — conforme `docs/09.3-backend.md`;
2. **MVP self-hosted:** adapter filesystem em volume persistente (`/var/app/storage` ou similar);
3. **Evolução:** adapter S3-compatible (MinIO, R2, S3, etc.) **sem alterar** contrato de `storage_key`;
4. Servir assets via rota autenticada ou CDN com URL pública derivada — **URL não autoriza** acesso a tenant errado (`docs/09.8`).

Nenhum fornecedor comercial é obrigatório; contrato **S3-compatible** quando object storage for adotado.

---

## 11. Referência de asset no banco

**Persistir:**

- `files.storage_key` (opaco, gerado pela aplicação);
- `mime_type`, `size`, `checksum`;
- `tenant_id`, `file_type`;
- FK `tenant_branding.logo_file_id`.

**Não persistir:**

- caminho absoluto do servidor (`/uploads/...`);
- URL assinada temporária;
- nome original como chave de storage.

**URL pública:** derivada em runtime (`getPublicUrl(storage_key)`) ou rota proxy `GET /assets/:fileId` com autorização — decisão de implementação na 1.3D, preferindo proxy quando assets não forem 100% públicos.

---

## 12. Upload — arquitetura futura (não implementar agora)

### 12.1 Fluxo MVP recomendado

```
Browser (multipart/form-data)
  → POST /admin/tenants/:tenantId/branding/logo
  → Backend: auth ADMIN/SUPER_ADMIN + tenant exists
  → Validar MIME real, tamanho, dimensões
  → Gerar storage_key
  → FileStorage.put()
  → Criar/atualizar files + tenant_branding.logo_file_id
  → Remover asset anterior (best-effort)
  → Auditoria
```

Upload direto com pre-signed URL: **fora do MVP** (complexidade de segurança e rollback); reconsiderar se volume ou tamanho justificar.

### 12.2 Política de arquivos

| Regra | Valor recomendado |
|---|---|
| MIME permitidos | `image/png`, `image/jpeg`, `image/webp` |
| SVG | **deferido no MVP** — se aceito depois: sanitização obrigatória ou servir como `Content-Disposition: attachment` sem inline |
| Tamanho máximo | 2 MB (logo) |
| Dimensões | min 64×64 px; max 2048×2048 px |
| Nome de storage | UUID + extensão derivada do MIME real |
| Substituição | após persistência bem-sucedida, deletar `storage_key` anterior |
| Sanitização | strip EXIF quando aplicável; re-encode raster opcional |

Riscos SVG ativo: script embutido, `foreignObject`, event handlers — tratar conforme `docs/09.8` §3.6.

---

## 13. Exclusão de empresa e assets

Conectar à política 1.2D.1 (DELETE permanente sem usuários vinculados).

### 13.1 Ordem recomendada na exclusão de tenant

1. Carregar `tenant_branding` e `files` associados;
2. Deletar objetos no storage (**best-effort**, com log em falha);
3. Deletar registros `files` e `tenant_branding` (CASCADE a partir de `tenants` quando FK configurada);
4. Deletar `tenants`.

### 13.2 FKs

| Relação | onDelete |
|---|---|
| `tenant_branding.tenant_id` → `tenants` | **Cascade** |
| `tenant_branding.logo_file_id` → `files` | **Set Null** ou Restrict + delete explícito de file antes |
| `files.tenant_id` → `tenants` | **Cascade** |

### 13.3 Arquivos órfãos

- falha de storage na exclusão → registrar evento + job de limpeza periódica (scan `storage_key` sem FK);
- **não** bloquear exclusão de tenant por falha de storage após tentativa — preferir consistência cadastral + cleanup assíncrono (alinhado a operação irreversível já aceita em 1.2).

### 13.4 Escopo

- cascade **apenas** domínios implementados (branding/files na 1.3);
- sem cascade genérico para integrações, IA, relatórios futuros.

---

## 14. API futura — contrato mínimo

Seguir convenções de `backend/src/modules/tenant/http/admin-tenant.routes.ts`:

- prefixo `/admin/tenants/:tenantId/...`;
- guard: `requireAuthentication` + `requirePlatformRole` (ADMIN | SUPER_ADMIN);
- DTO público validado com schemas dedicados;
- erros de domínio mapeados como em `map-tenant-domain-error.ts`.

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/admin/tenants/:tenantId/branding` | Lê config + URL derivada do logo |
| `PUT` | `/admin/tenants/:tenantId/branding` | Atualiza cores (parcial); reset parcial |
| `POST` | `/admin/tenants/:tenantId/branding/logo` | Upload multipart |
| `DELETE` | `/admin/tenants/:tenantId/branding/logo` | Remove logo; fallback plataforma |

**USER:** sem mutação nesta fase.

Resposta pública alinhada ao runtime:

```typescript
type PublicTenantBranding = {
  tenantId: string;
  logoUrl: string | null;
  light: Partial<AllowedBrandingColors> | null;
  dark: Partial<AllowedBrandingColors> | null;
  updatedAt: string;
};
```

(`name` omitido — usar `Tenant.displayName` do cadastro.)

---

## 15. Branding resolvido para o usuário autenticado

### 15.1 Opções avaliadas

| Opção | Avaliação |
|---|---|
| A) Expandir `GET /auth/me` | Rejeitada — `/me` é identidade; inflaciona contrato estável |
| B) `GET /branding/current` | **Recomendada** — sessão resolve tenant; USER recebe seu tenant; ADMIN recebe plataforma |
| C) Bootstrap `/auth/context` | Válida, mas mistura concerns; preferir endpoint focado |
| D) Server Component only | Complementar no Next.js futuro; ainda precisa de contrato HTTP para CSR/hidratação |

### 15.2 Contrato recomendado

**`GET /branding/current`** (autenticado)

- `USER`: resolve `tenantId` da sessão → carrega `tenant_branding` + `displayName` do tenant;
- `ADMIN` / `SUPER_ADMIN`: retorna `platform_branding` (ou null → Theme Default);
- resposta mapeada para `TenantBrandingInput` + metadados (`updatedAt`).

Frontend:

1. `AuthProvider` conclui `/auth/me`;
2. se autenticado, fetch `/branding/current`;
3. passa resultado ao `ThemeProvider` na área autenticada;
4. Shell lê `theme.logoUrl`, `theme.brandName` / `displayName`.

Login **não** chama este endpoint.

---

## 16. Cache / invalidação

Branding muda pouco; estratégia em camadas:

| Camada | Estratégia |
|---|---|
| Client (React) | Estado em contexto; chave `tenantId` + `updatedAt`; limpar no logout |
| HTTP | `Cache-Control: private, max-age=60` opcional; `ETag`/`updatedAt` |
| Server | Map em memória por `tenantId` com TTL curto (ex.: 60s) — **sem Redis novo no MVP** |
| Após edição admin | `updated_at` bump → client refetch na próxima navegação ou invalidação explícita na UI de branding |
| Falha de fetch | Usar Theme Default plataforma; log warning; UI utilizável |

Regras `docs/12` §27: cache sempre escopado por `tenantId`; nunca servir branding de outro tenant.

---

## 17. Fallbacks — comportamento determinístico

| Situação | Comportamento |
|---|---|
| Tenant sem registro `tenant_branding` | Theme Default plataforma |
| Logo ausente | `logoUrl: null` → `PlatformBrandMark` placeholder / mark plataforma |
| Cor ausente por token | Theme Default do scheme para aquele token |
| JSON inválido no banco | Tratar como null no token; se grave, fallback total + alerta operacional |
| Storage indisponível na leitura | `logoUrl: null`; cores persistidas ainda aplicadas |
| Storage indisponível no upload | 503 operacional; **não** persistir referência quebrada |
| Config inválida no save | 400 com detalhes; não grava |

**Nunca:** branding de outro tenant; tela sem CSS variables aplicadas.

---

## 18. A11y / contraste

Limites de customização:

1. Apenas tokens allowlisted;
2. Validação WCAG AA mínima em pares obrigatórios no save;
3. Tenant **não** altera `focus`, `danger`, `success`, etc.;
4. Tenant **não** altera fundo/texto global no MVP;
5. Logo decorativa pode usar `alt=""` quando acompanhada de nome textual visível (shell já exibe nome);
6. Accent amarelo default da plataforma permanece restrito a superfícies não textuais quando necessário (`docs/12` §5).

Editor admin futuro: preview Light + Dark antes de salvar (`docs/12` §25).

---

## 19. UI administrativa futura

Hub da empresa (evolução natural pós-1.2D):

```
/empresas/:companyId
├── Geral          → /empresas/:companyId/editar (existente)
└── Aparência      → /empresas/:companyId/aparencia   (nova, 1.3E)
```

**Não criar** nesta fase: Usuários, Integrações, Financeiro, IA, Logs — aguardam fases próprias.

Conteúdo da seção Aparência (1.3E):

- upload/remoção de logo;
- cor principal (+ secundária/accent opcionais);
- preview Light/Dark (reutilizar padrão `dev-branding-preview`);
- reset para padrão da plataforma;
- validação inline de contraste.

Navegação: sub-nav horizontal ou tabs dentro do hub; manter listagem `/empresas` intacta.

---

## 20. Escopo mínimo da Fase 1.3 — subfases recomendadas

`docs/10` registra **1.3 Branding** sem subfases numeradas. Para execução incremental (**não alterar docs/10 nesta tarefa**):

| Subfase | Conteúdo | Entregável |
|---|---|---|
| **1.3A** | Arquitetura | Este documento + ADR-046 |
| **1.3B** | Persistência | Prisma: `files`, `tenant_branding`, (`platform_branding`); domínio + repositório |
| **1.3C** | API admin | Rotas GET/PUT/POST/DELETE branding; schemas; testes |
| **1.3D** | Storage + upload | Abstração `FileStorage`, adapter local, pipeline de upload seguro |
| **1.3E** | UI admin | `/empresas/:id/aparencia` |
| **1.3F** | Runtime pós-login | `GET /branding/current`, wiring `ThemeProvider`, Shell com logo/nome resolvidos |

Dependências: 1.3B → 1.3C; 1.3D paralelo após 1.3B; 1.3E após 1.3C+1.3D; 1.3F após 1.3C (logo opcional sem 1.3D usando só cores).

---

## 21. Mapa de código existente (referência)

| Área | Caminho |
|---|---|
| Theme Engine | `frontend/src/theme/**` |
| Login (plataforma) | `frontend/src/login/**` |
| Shell | `frontend/src/components/layout/app-sidebar.tsx` |
| Asset plataforma | `frontend/public/brand/economizacao-mark.svg` |
| Tenant admin API | `backend/src/modules/tenant/**` |
| Schema | `prisma/schema.prisma` |

---

## 22. Documentos relacionados consultados

- `docs/05-ui-ux.md` §85 — fluxo Platform + Tenant → Resolved Theme
- `docs/06-roadmap.md` — Fase 4 Branding (roadmap macro)
- `docs/09.2-convencoes-typescript.md` — `UpdateTenantBrandingInput` (exemplo parcial)
- `docs/09.5-banco-de-dados.md` — entidades globais `platform_branding`
- `docs/09.8-seguranca.md` — uploads e validação de branding
- `docs/11-stack-oficial.md` — storage em avaliação (ADR-029)

---

## 23. Diretriz final

> A mesma aplicação, os mesmos componentes e o mesmo Theme Engine assumem identidade por tenant **apenas** via configuração persistida, validada e isolada — sem recompilação, sem CSS livre e sem quebrar a Login Experience congelada.

Implementação inicia na **1.3B**, obedecendo ADR-046 e este documento.
