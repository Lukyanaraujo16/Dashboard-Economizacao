# ADR-049 — Arquitetura de Branding da Plataforma

## Título

Platform Branding como primeiro nível visual (separado de Tenant Branding)

## Status

ACEITA

## Data

2026-08-15

## Contexto

A Fase 1.3 entregou branding **por empresa** (`tenant_branding`, upload de logo, UI Aparência, `GET /branding/current`). Login e fallback de ADMIN/SUPER_ADMIN continuam no **Theme Default** em código e nome hardcoded (“Economização”), sem tabela `platform_branding`.

`docs/14` e ADR-046 já reservaram Platform Branding como entidade separada; a 1.3 **não** a implementou. Sem ADR própria, a 1.5 arriscaria:

- reutilizar `tenant_branding` / settings genéricos;
- misturar identidade Economização com overrides de cliente;
- violar ADR-044 (login só plataforma);
- duplicar `FileStorage` ou o Theme Engine.

Análise completa: `docs/17-arquitetura-branding-plataforma.md`.

## Decisão

1. **Platform Branding ≠ Tenant Branding.** Tabela própria `platform_branding` (singleton lógico por ambiente). **Não** reutilizar `TenantBranding`, **não** settings/metadata bag.

2. **Hierarquia estrutural:** Platform Branding → Tenant Branding → Theme Default. Theme Default (tokens compilados) permanece rede de segurança.

3. **Login** usa **somente** Platform Branding (+ Theme Default). **Jamais** Tenant Branding. Sem white-label por hostname nesta arquitetura.

4. **Pós-login:** `ADMIN` / `SUPER_ADMIN` → Platform Branding; `USER` → Tenant Branding com fallback Platform → Theme Default. **Sem exceções** nesta fase (Modo Suporte = 1.6).

5. **MVP de campos:** `name`, logo, favicon, cores allowlisted por scheme (`primary`, `onPrimary`, `secondary`, `accent`) — alinhados ao Theme Engine / ADR-046.

6. **Assets** via tabela `files` com `tenant_id` nullable e tipos `PLATFORM_LOGO` / `PLATFORM_FAVICON`. **Reutilizar** `FileStorage` da 1.3.

7. **API admin** sob `/admin/platform/branding` (GET/PATCH + POST/DELETE logo; favicon análogo). Runtime autenticado continua em `GET /branding/current` (sem inflar `/auth/me`).

8. **UI** futura: Configurações → Branding da Plataforma (1.5D). **Não** misturar com `/empresas/.../aparencia`.

9. Execução: **1.5A** arquitetura → **1.5B** persistência → **1.5C** API → **1.5D** UI → **1.5E** runtime.

## Alternativas consideradas

| Alternativa | Motivo da rejeição |
|---|---|
| Colunas de branding em tabela `settings` | Metadata bag; validação fraca |
| Reutilizar `tenant_branding` com `tenant_id` nulo | Mistura isolamento multiempresa com identidade global |
| Hardcode permanente (só Theme Default) | Impede gestão administrativa e logo oficial |
| Inflar `/auth/me` com branding de plataforma | `/me` é identidade de sessão |
| Branding de tenant no login | Viola ADR-042 / ADR-044 |

## Consequências

### Positivas

- Login e shell de plataforma passam a ter identidade persistida e editável;
- fronteira clara com 1.3; Theme Engine único;
- fallback determinístico para USER sem branding e para falhas de storage.

### Negativas / trade-offs

- Migration em 1.5B (nova tabela + enum/`tenant_id` nullable em `files`);
- singleton exige disciplina de escrita (uma config ativa);
- favicon/manifest/Open Graph completos ficam parcialmente no futuro.

## Conformidade

Implementações 1.5B+ deverão:

- manter login **sem** tenant branding;
- servir Platform Branding a ADMIN/SUPER_ADMIN via `/branding/current`;
- aplicar fallback Platform → Theme Default no USER;
- validar cores allowlisted e contraste como na 1.3;
- auditar mutações administrativas.

## Referências

- `docs/17-arquitetura-branding-plataforma.md`
- `docs/14-arquitetura-branding-tenant.md`
- `docs/adr/ADR-046-tenant-branding-persistence.md`
- `docs/adr/ADR-042-theming-dark-mode-branding.md`
- `docs/adr/ADR-044-login-experience-freeze.md`
- `docs/03-modelagem-banco.md` §4.1 / §4.3
- `docs/10-plano-de-execucao.md`
