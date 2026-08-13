# ADR-044 — Login Experience Freeze v1

## Título

Login Experience Freeze — primeira versão estabilizada

## Status

ACEITA

## Data

2026-08-13

## Contexto

A Login Experience do Dashboard Economização foi construída na fase 1.1F sobre fundações já estabilizadas:

- **Design System Freeze v1** ([ADR-043](./ADR-043-design-system-freeze.md));
- **Theme Engine** e **Branding Runtime** preparados ([ADR-042](./ADR-042-theming-dark-mode-branding.md));
- **Light / Dark** como temas de primeira classe (conjuntos próprios, não inversão mecânica);
- **Theme Default Economização** como identidade padrão da plataforma (agnóstica nos componentes);
- **Componentes-base existentes** (Typography, Button, Input, PasswordInput, FormField, Card, Divider, Badge, Stack, etc.) — sem primitives novas exclusivamente para o login.

A evolução visual ocorreu em subfases iterativas com revisão humana:

| Subfase | Foco |
|---------|------|
| 1.1F-D.1 | Direção de arte (lobby premium, duas colunas) |
| 1.1F-D.2 | Polish de marca, highlights, accent, respiro |
| 1.1F-D.3 | Pixel polish (headline, alinhamentos, card) |
| 1.1F-D.4 | Large display + placeholder de branding |
| 1.1F-D.5 | Rebalanceamento de composição em large display |
| 1.1F-D.6 | Mobile **Login First** |

Foram validados, em revisões humanas e no preview DEV (`/__dev/login`):

- desktop e large displays;
- mobile;
- Light e Dark.

Sem um freeze explícito da Login Experience, a integração funcional com autenticação tenderia a reabrir polimento infinito ou a redesenhar a tela sob pressão de implementação.

## Decisão

A **Login Experience entra oficialmente em Freeze v1**.

A partir desta ADR:

1. O **layout desktop** fica congelado.
2. O **layout mobile** fica congelado.
3. A **composição visual** (hierarquia, ritmo, proporções de colunas/card) fica congelada.
4. A **copy atual** fica congelada até decisão de produto específica.
5. Mudanças **puramente estéticas** deixam de ser prioridade.

Alterações futuras na Login Experience serão aceitas **somente** quando:

- corrigirem bug;
- corrigirem acessibilidade;
- corrigirem responsividade (regressão real);
- atenderem requisito real de produto;
- integrarem branding oficial **sem quebrar** a composição congelada.

A integração com o backend de autenticação **não** autoriza redesenho da tela.

## Desktop (congelado)

Composição oficial:

- **duas colunas** — Brand Experience à esquerda; Authentication Card à direita;
- **container fluido** com `max-width: 92rem` (~1472px) — presença em telas grandes sem crescimento infinito;
- composição validada conceitualmente para **1440 / 1680 / 1920 / 2560**;
- **headline em duas linhas**: “Inteligência financeira / com silêncio visual.”;
- **highlights institucionais** mantidos (Controle inteligente, Segurança, Performance);
- **Login Card** com largura controlada (não preenche a coluna por “ocupar espaço”);
- **Light e Dark** aprovados como experiências de primeira classe.

Implementação de referência: `frontend/src/login/login-experience.*` (preview DEV em `/__dev/login`).

## Mobile (congelado)

Filosofia oficial: **“Login First”**.

O mobile **não** replica a landing desktop integralmente.

No mobile (`max-width: 767px`, conforme implementação atual):

- branding **compacto** (ícone + Economização + Dashboard financeiro);
- **headline reduzida** (“Inteligência financeira.”);
- **copy reduzida** (“Acesse sua conta para continuar.”);
- **highlights ocultos**;
- **Login Card priorizado** na primeira dobra — o usuário deve poder iniciar o acesso sem percorrer conteúdo institucional longo.

Tablet permanece na experiência de composição próxima ao desktop (highlights visíveis); o corte “Login First” aplica-se ao breakpoint mobile acima.

## Branding

1. **Economização** é o **Theme Default** da plataforma no login (UX-001 / ADR-042).
2. O **cifrão Accent** atual é **placeholder temporário** — não representa o ícone oficial definitivo.
3. A Login Experience está preparada para substituição do símbolo via prop `brandLogoUrl` / asset futuro, **sem redesenho** da composição.
4. Upload de logo, editor de branding e backend de branding **permanecem fora** desta ADR.

## Responsividade

Validados conceitualmente:

**Desktop / large display:** 1440 · 1680 · 1920 · 2560  

**Mobile:** 360 · 375 · 390 · 414 · 430  

A composição usa comportamento responsivo (grid fluido + regras por breakpoint), **sem** layouts de produto duplicados ou páginas separadas por dispositivo.

## Light / Dark

- Light e Dark são experiências de **primeira classe**.
- Dark **não** é inversão automática do Light.
- Componentes consomem **tokens / CSS variables** do tema resolvido.
- Nenhuma lógica de marca específica (Economização ou tenant) deve ser espalhada pelos componentes-base.

## Consequências

### Positivas

- estabilidade visual da porta de entrada da plataforma;
- prevenção de polimento infinito antes da integração funcional;
- autenticação pode ser ligada à UI existente sem redesenho;
- futuras telas reutilizam a mesma linguagem visual;
- branding oficial pode substituir o placeholder sem reabrir a direção de arte.

### Limitações

- ícone definitivo da Economização ainda não existe;
- o placeholder deverá ser substituído quando houver asset aprovado;
- o preview DEV (`/__dev/login`) **não** representa a superfície de produção autenticada;
- **autenticação ainda não está integrada** — esta ADR congela apenas a experiência visual.

## Próxima etapa

A próxima etapa será **exclusivamente funcional**:

integração da Login Experience com o **backend de autenticação existente**.

Essa integração **não deverá redesenhar** a tela; deverá respeitar o Freeze v1 desta ADR e o Design System Freeze (ADR-043).

## Compatibilidade

Esta ADR é compatível e complementar a:

| Referência | Relação |
|------------|---------|
| [ADR-042](./ADR-042-theming-dark-mode-branding.md) | Theming, Dark Mode, Branding por tenant |
| [ADR-043](./ADR-043-design-system-freeze.md) | Design System Freeze v1 (base dos componentes) |
| [`docs/12-design-system.md`](../12-design-system.md) | Contrato de tokens e direção do login |
| [`docs/10-plano-de-execucao.md`](../10-plano-de-execucao.md) | Plano de execução; Freeze como base para integração 1.1F seguinte |

## Regras

- não reabrir polish visual por preferência pessoal;
- não criar variantes paralelas de login “premium” fora desta composição;
- não acoplar componentes-base a cores de marca hardcoded;
- preview DEV permanece ferramenta de desenvolvimento, não produto;
- evolução estrutural da Login Experience (v1.1+) requer ADR ou atualização explícita desta decisão.

## Referências

- `docs/adr/ADR-042-theming-dark-mode-branding.md`
- `docs/adr/ADR-043-design-system-freeze.md`
- `docs/12-design-system.md`
- `docs/10-plano-de-execucao.md`
- `docs/05-ui-ux.md` (área pública / login)
- `docs/09.4-frontend.md`
- `docs/09.23-convencoes-ui.md`
- Implementação: `frontend/src/login/`
- Preview DEV: `/__dev/login`
