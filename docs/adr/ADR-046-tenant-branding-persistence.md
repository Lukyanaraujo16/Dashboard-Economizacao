# ADR-046 — Persistência e Escopo de Branding por Tenant

## Título

Persistência de Branding por Tenant, escopo de overrides e referência de assets

## Status

ACEITA

## Data

2026-08-14

## Contexto

A Fase 1.2 encerrou o cadastro administrativo de Empresas (Tenants). A Fase 1.3 introduz **Branding real por empresa**.

O Theme Engine já implementa a camada de runtime (`TenantBrandingInput`, `resolveTheme`, allowlist de tokens) conforme ADR-042. O Prisma ainda **não** persiste branding. `docs/03-modelagem-banco.md` e `docs/13-arquitetura-empresas-workspace.md` já apontam tabelas `tenant_branding`, `platform_branding` e `files`, mas sem decisão formal de formato alinhado ao código existente.

Surge a necessidade de registrar decisões fundamentais **antes** de migrations, API, storage ou UI.

## Decisão

1. **Branding de tenant não vive em `tenants`.** Persistência em relação **1 ── 0..1** `TenantBranding` (`tenant_id` único, FK obrigatória).

2. **Branding de plataforma permanece separado** (`platform_branding` ou equivalente futuro). Login e fallback usam identidade da plataforma (ADR-042, ADR-044).

3. **Overrides de cor no MVP** limitam-se aos tokens já allowlisted no Theme Engine: `primary`, `onPrimary`, `secondary`, `accent` — por scheme (`light` / `dark`). Tokens protegidos (`success`, `danger`, `warning`, `info`, `focus`, etc.) **não** são configuráveis pelo tenant.

4. **Assets de logo** referenciam a tabela genérica `files` via FK (`logo_file_id`). O banco persiste **metadados e `storage_key`**, nunca caminho físico de servidor nem URL assinada temporária. URL pública é **derivada** em runtime pela abstração de storage (ADR-029).

5. **Upload no MVP** segue fluxo **browser → backend → validação → storage → persistência**. Upload direto com URL pré-assinada fica fora do escopo inicial.

6. **Resolução pós-login:** branding do tenant é obtido por endpoint dedicado (`GET /branding/current`), resolvido server-side a partir da sessão — **sem** inflar `GET /auth/me`.

7. **Login permanece congelado (ADR-044):** somente branding da plataforma; sem resolução por subdomínio ou tenant desconhecido.

## Consequências

### Positivas

- Alinhamento direto com `TenantBrandingInput` e `normalizeBrandingInput` existentes;
- separação clara entre cadastro empresarial (1.2) e aparência (1.3);
- evolução de campos de cor/assets sem alterar núcleo de `Tenant`;
- isolamento multiempresa preservado; fallback nunca cruza tenants.

### Negativas / custos

- JOIN ou segunda query ao carregar branding;
- tabela `files` + abstração de storage antes de logo real;
- reconciliação entre PRD (campos legados como `button_color`) e contrato semântico atual do Theme Engine.

### Neutras

- `platform_branding` pode ser implementado na mesma fase ou imediatamente após `tenant_branding`;
- cache e CDN são camadas posteriores sobre o contrato de `storage_key`.

## Alternativas consideradas

| Alternativa | Motivo da rejeição |
|---|---|
| Colunas de branding em `tenants` | Mistura domínio cadastral com configuração visual; dificulta evolução e upload |
| JSON genérico (`metadata`, `settings`) | Vira “metadata bag”; validação fraca; risco de escopo creep |
| URL externa persistida sem `files` | Sem controle de tipo/tamanho/isolamento; quebra política de upload (`docs/09.8`) |
| Bytes/base64 no PostgreSQL | Backup pesado, sem CDN, antipadrão para logos |
| Inflar `GET /auth/me` com branding | `/me` é identidade de sessão; branding muda por regras distintas e pode ser cacheado separadamente |
| Branding por subdomínio no login | Sem requisito de produto documentado; congelamento da Login Experience |

## Regras

- branding nunca altera autorização;
- fallback nunca usa branding de outro tenant;
- valores inválidos → fallback seguro (Theme Default / plataforma);
- exclusão de empresa remove registro de branding; assets seguem política de limpeza definida em `docs/14-arquitetura-branding-tenant.md`;
- toda mutação administrativa de branding gera auditoria (PRD LOG-004).

## Relação com outros documentos

- `docs/14-arquitetura-branding-tenant.md` — arquitetura detalhada da Fase 1.3;
- `docs/adr/ADR-042-theming-dark-mode-branding.md` — camadas Theme / Branding;
- `docs/adr/ADR-044-login-experience-freeze.md` — login só plataforma;
- `docs/13-arquitetura-empresas-workspace.md` — §7 Branding;
- `docs/03-modelagem-banco.md` — §4 Branding, §4.3 files;
- `docs/09.8-seguranca.md` — validação de cores, URLs e uploads.
