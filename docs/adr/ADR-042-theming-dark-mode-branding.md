# ADR-042 — Theming, Dark Mode e Branding por Tenant

## Título

Theming, Dark Mode e Branding por Tenant

## Status

Aprovada

## Data

2026-08-13

## Contexto

O Dashboard Economização é uma plataforma multiempresa. Cada tenant poderá possuir identidade visual própria (PRD BRAND-001), enquanto a plataforma mantém identidade padrão usada no login e como fallback (PRD BRAND-002 / BRAND-003, UX-001 / UX-002).

A aplicação também precisa de modos claro e escuro. Em `docs/05-ui-ux.md` §94 e `docs/09.23-convencoes-ui.md`, o Dark Mode ainda figurava como item visual pendente, com a obrigação de que o tema resolvido permitisse sua introdução sem reescrita de componentes. Tornou-se necessário elevar o Dark Mode a requisito oficial e registrar a arquitetura de tokens antes da implementação de telas (incluindo autenticação).

Implementar estilos diretamente por marca (Economização, cliente A, cliente B) criaria:

- acoplamento de componentes a cores de marca;
- duplicação Light/Dark e por tenant;
- risco de vazamento visual entre tenants;
- dificuldade de manutenção e de acessibilidade.

`docs/05-ui-ux.md` §85 e `docs/09.23` §3.9 já exigem tema centralizado:

```text
Platform Theme + Tenant Overrides → Resolved Theme → Componentes
```

Esta ADR formaliza essa direção e a divide em camadas explícitas no contrato visual `docs/12-design-system.md`.

## Decisão

1. A UI utilizará **Design Tokens semânticos**.
2. A arquitetura visual será dividida em:
   - **Design System** (estrutura, spacing, tipografia, componentes, motion, a11y);
   - **Theme** (tokens Light / Dark / System resolvido);
   - **Tenant Branding** (overrides validados em runtime).
3. Light e Dark utilizarão **conjuntos próprios de tokens** — não inversão mecânica de cores.
4. Branding será carregado em **runtime**, sem recompilação por cliente.
5. Componentes **não conhecerão marcas específicas** (nem Economização como hardcode).
6. A identidade Economização existe apenas como **tema/fallback padrão da plataforma**.
7. Dark Mode passa a ser **requisito oficial** da plataforma.
8. O contrato normativo de detalhe visual é `docs/12-design-system.md`.

## Consequências

### Positivas

- personalização por tenant sem recompilação;
- suporte multiempresa alinhado ao PRD;
- Dark Mode consistente e evolutivo;
- menor duplicação de componentes;
- manutenção simplificada;
- evolução de branding sem reescrever UI;
- alinhamento com validação de branding em `docs/09.8-seguranca.md`.

### Negativas / custos

- disciplina obrigatória no uso de tokens;
- editor de branding deverá validar contraste e limites semânticos;
- componentes e gráficos precisam consumir tokens semânticos desde o início;
- maior cuidado na resolução runtime do tema (cache por tenant, fallback seguro).

### Neutras

- biblioteca concreta de UI / estilização permanece Em avaliação em `docs/11-stack-oficial.md`;
- preferência Light / Dark / System por usuário será definida na implementação futura;
- tela de login e painel de branding administrativo permanecem fora desta ADR (somente contrato).

## Regras

- sem CSS arbitrário por tenant;
- sem JS/HTML customizado de branding;
- sem componentes duplicados por tema ou por tenant;
- sem hardcode de cores de marca em componentes;
- branding nunca altera autorização;
- fallback nunca usa branding de outro tenant;
- login usa branding da plataforma; branding do tenant após autenticação;
- `success` / `warning` / `danger` / `info` permanecem semânticos protegidos;
- gráficos usam tokens; não recebem cores de marca hardcoded;
- uploads de logo seguem política de segurança quando implementados.

## Alternativas consideradas

| Alternativa | Motivo da rejeição |
|---|---|
| CSS/JS livre por tenant | Risco de XSS, quebra de isolamento e inconsistência |
| Temas compilados por cliente | Impede runtime multiempresa e aumenta custo operacional |
| Componentes duplicados Light/Dark | Explosão de manutenção |
| Cores de Economização hardcoded | Acopla o produto a uma marca e impede white-label seguro |
| Dark Mode por inversão simples | Contraste e hierarquia inadequados |

## Relação com outros documentos

- `docs/12-design-system.md` — contrato visual detalhado;
- `docs/01-prd.md` — BRAND-001 a BRAND-003;
- `docs/05-ui-ux.md` — blueprint UX e tema §85;
- `docs/09.4-frontend.md` — aplicação de tema no frontend;
- `docs/09.8-seguranca.md` — validação de branding;
- `docs/09.9-multiempresa.md` — isolamento de tenant;
- `docs/09.23-convencoes-ui.md` — convenções de UI e tema resolvido;
- `docs/11-stack-oficial.md` / `docs/adr/ADR-041-stack-oficial.md` — stack; UI lib ainda em avaliação.

## Nota de prevalência

Esta ADR não altera arquivos `docs/00`–`docs/11`. Onde `docs/05` §94 ou `docs/09.23` ainda listam Dark Mode como pendência de design visual, prevalece esta ADR quanto ao **status de requisito oficial**; a implementação continua sujeita ao plano de execução e à escolha formal de biblioteca de UI.
